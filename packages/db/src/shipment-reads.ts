import type pg from 'pg';
import type {DeploymentScope} from './materialization.js';
export type ShipmentPosition={height:string;logIndex:number;hash:string};
export async function readShipmentEvents(pool:pg.Pool,scope:DeploymentScope,pin:{height:string;hash:string},maker:string,topics:{shipped:string;docked:string},limit:number,after?:ShipmentPosition){
 // Aqua events are already retained by the canonical indexer, including blocks
 // before this read feature existed. No synthetic config or new write projection.
 const prefix='0x'+'0'.repeat(24)+maker.slice(2)+'0'.repeat(24)+scope.router.slice(2);
 const rows=(await pool.query(`WITH shipments AS (
  SELECT e.*,b.height AS height,'0x'||substring(e.payload->>'data' FROM 131 FOR 64) AS strategy_hash
  FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
  WHERE e.chain_id=$1 AND e.emitter=$3 AND e.topic=$4 AND b.height BETWEEN $6::numeric AND $7::numeric
   AND left(e.payload->>'data',130)=$8)
 SELECT s.*,d.payload AS dock_payload,d.block_hash AS dock_block_hash,d.tx_hash AS dock_tx_hash,d.log_index AS dock_log_index,d.height AS dock_height
 FROM shipments s LEFT JOIN LATERAL (
  SELECT e.*,b.height FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
  WHERE e.chain_id=$1 AND e.emitter=$3 AND e.topic=$5 AND b.height BETWEEN s.height AND $7::numeric
   AND left(e.payload->>'data',194)=left(s.payload->>'data',194)
  ORDER BY b.height DESC,e.log_index DESC LIMIT 1) d ON true
 WHERE NOT EXISTS(SELECT 1 FROM strategy_snapshots r WHERE r.chain_id=$1 AND r.deployment_id=$2 AND r.order_hash=s.strategy_hash AND r.block_number<=$7::numeric)
  AND ($9::numeric IS NULL OR (s.height,s.log_index,s.strategy_hash)<($9::numeric,$10::integer,$11::text))
  AND EXISTS(SELECT 1 FROM indexed_blocks WHERE chain_id=$1 AND height=$7::numeric AND hash=$12)
 ORDER BY s.height DESC,s.log_index DESC,s.strategy_hash DESC LIMIT $13`,
 [scope.chainId,scope.id,scope.aqua,topics.shipped,topics.docked,scope.startBlock.toString(),pin.height,prefix,after?.height??null,after?.logIndex??null,after?.hash??null,pin.hash,limit+1])).rows;
 return {rows:rows.slice(0,limit),hasMore:rows.length>limit};
}
