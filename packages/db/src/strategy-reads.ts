import type pg from 'pg';
import type {DeploymentScope} from './materialization.js';
import type {MetricsBlock} from './metrics.js';
export type StrategyPosition={blockNumber:string;logIndex:number;orderHash:string};
export type StrategyFilters={maker?:string;tokenIn?:string;tokenOut?:string;status:'all'|'active'|'retired'};
export type StrategyReadQuery=({kind:'detail';hash:string}|{kind:'list';filters:StrategyFilters;limit:number;after?:StrategyPosition}|{kind:'candidates';tokenIn:string;tokenOut:string})&{pin?:MetricsBlock};
export type StrategySource={blockNumber:string;blockHash:string;txHash:string;logIndex:number;event:'StrategyActivated'|'StrategyRetired'|'OrbitalSwapExecuted'};
export type StrategyRecord={orderHash:string;router:string;maker:string;configHash:string;config:unknown;lifecycle:'active'|'retired';version:string;activated:StrategySource;updated:StrategySource;feeTotals:{token:string;amountRaw:string}[]};
export type StrategyTopics={activated:string;retired:string;swap:string};
export type StrategyReadSnapshot={code:string;chainId:number;deploymentId:string;currentCursor:MetricsBlock|null;asOf:MetricsBlock|null;indexedAt:string|null;
 coverage:{fromBlock:string;toBlock:string|null;expectedBlocks:string;canonicalBlocks:string;coveredBlocks:string};items:StrategyRecord[]|null;hasMore:boolean};
export async function readStrategies(pool:pg.Pool,scope:DeploymentScope,topics:StrategyTopics,query:StrategyReadQuery):Promise<StrategyReadSnapshot>{
 const result:StrategyReadSnapshot={code:'INDEXER_NOT_STARTED',chainId:scope.chainId,deploymentId:scope.id,currentCursor:null,asOf:null,indexedAt:null,
  coverage:{fromBlock:scope.startBlock.toString(),toBlock:null,expectedBlocks:'0',canonicalBlocks:'0',coveredBlocks:'0'},items:null,hasMore:false};
 if(query.kind==='candidates'&&(!/^0x[0-9a-f]{40}$/.test(query.tokenIn)||!/^0x[0-9a-f]{40}$/.test(query.tokenOut)
  ||/^0x0{40}$/.test(query.tokenIn)||/^0x0{40}$/.test(query.tokenOut)||query.tokenIn===query.tokenOut))throw Error('INVALID_CANDIDATE_PAIR');
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const row=(await client.query(`SELECT c.height,c.hash,s.status,s.updated_at,b.hash IS NOT NULL AS canonical,
   d.deployment_id,d.verified AND d.identity=$3::jsonb AND d.aqua=$4 AND d.router=$5 AND d.payments=$6 AND d.usdc=$7 AND d.start_block=$8::numeric AS identity_matches,
   p.height AS projection_height,p.hash AS projection_hash,p.updated_at AS projection_updated_at,
   pb.hash IS NOT NULL AND m.projection_version=1 AND m.swap_projection_version=1 AS projection_canonical
   FROM indexer_cursor c JOIN indexer_state s ON s.chain_id=c.chain_id
   LEFT JOIN indexed_blocks b ON b.chain_id=c.chain_id AND b.height=c.height AND b.hash=c.hash
   LEFT JOIN deployments d ON d.chain_id=c.chain_id AND d.deployment_id=$2
   LEFT JOIN deployment_cursor p ON p.chain_id=d.chain_id AND p.deployment_id=d.deployment_id
   LEFT JOIN deployment_blocks m ON m.chain_id=p.chain_id AND m.deployment_id=p.deployment_id AND m.height=p.height AND m.block_hash=p.hash
   LEFT JOIN indexed_blocks pb ON pb.chain_id=m.chain_id AND pb.height=m.height AND pb.hash=m.block_hash
   WHERE c.chain_id=$1`,[scope.chainId,scope.id,JSON.stringify(scope.identity),scope.aqua,scope.router,scope.payments,scope.usdc,scope.startBlock.toString()])).rows[0];
  if(!row)return result;
  if(row.status!=='indexing'){result.code='RESYNC_REQUIRED';return result;}
  if(!row.canonical){result.code='INDEXER_ORPHANED';return result;}
  if(!row.deployment_id||row.projection_height===null){result.code='MATERIALIZATION_NOT_STARTED';return result;}
  if(!row.identity_matches){result.code='MATERIALIZATION_DEPLOYMENT_MISMATCH';return result;}
  if(!row.projection_canonical){result.code='MATERIALIZATION_ORPHANED';return result;}
  if(row.height!==row.projection_height||row.hash!==row.projection_hash){result.code='MATERIALIZATION_BEHIND';return result;}
  result.currentCursor={height:row.height,hash:row.hash};
  result.indexedAt=new Date(Math.min(new Date(row.updated_at).getTime(),new Date(row.projection_updated_at).getTime())).toISOString();
  const pin=query.pin??result.currentCursor;
  const pinned=(await client.query('SELECT hash FROM indexed_blocks WHERE chain_id=$1 AND height=$2 AND hash=$3',[scope.chainId,pin.height,pin.hash])).rowCount;
  if(!pinned||BigInt(pin.height)<scope.startBlock||BigInt(pin.height)>BigInt(row.height)){result.code='STRATEGY_CURSOR_ORPHANED';return result;}
  result.asOf=pin;result.coverage.toBlock=pin.height;result.coverage.expectedBlocks=(BigInt(pin.height)-scope.startBlock+1n).toString();
  const range=[scope.chainId,scope.id,scope.startBlock.toString(),pin.height];
  const coverage=(await client.query(`SELECT count(*)::text AS canonical_blocks,count(*) FILTER(WHERE m.projection_version=1 AND m.swap_projection_version=1)::text AS covered_blocks
   FROM indexed_blocks b LEFT JOIN deployment_blocks m ON m.chain_id=b.chain_id AND m.deployment_id=$2 AND m.height=b.height AND m.block_hash=b.hash
   WHERE b.chain_id=$1 AND b.height BETWEEN $3::numeric AND $4::numeric`,range)).rows[0];
  result.coverage.canonicalBlocks=coverage.canonical_blocks;result.coverage.coveredBlocks=coverage.covered_blocks;
  if(coverage.canonical_blocks!==result.coverage.expectedBlocks||coverage.covered_blocks!==result.coverage.expectedBlocks){result.code='STRATEGY_COVERAGE_INCOMPLETE';return result;}
  // Each activation, swap and retirement has a versioned snapshot. Bind every
  // snapshot to its unique raw source and the immutable activation record;
  // equal counts exclude both missing projections and extra detached records.
  const bindings=(await client.query(`SELECT
   (SELECT count(*)::text FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
    WHERE e.chain_id=$1 AND e.emitter=$3 AND e.topic IN($4,$5,$6) AND b.height BETWEEN $7::numeric AND $8::numeric) AS raw_count,
   count(*)::text AS snapshot_count,
   count(*) FILTER(WHERE s.router=$3 AND b.height=s.block_number AND e.emitter=$3 AND e.decoded_version=1
    AND e.decoded_payload->>'entityId'=s.order_hash AND e.decoded_payload->>'maker'=s.maker
    AND a.router=s.router AND a.maker=s.maker AND a.config_hash=s.config_hash AND a.config=s.config AND a.maker_nonce=s.maker_nonce AND a.tokens=s.tokens
    AND a.lifecycle='active' AND a.version=1 AND (a.block_number,a.log_index)<=(s.block_number,s.log_index)
    AND ae.emitter=$3 AND ae.topic=$4 AND ae.decoded_version=1 AND ae.decoded_payload->>'kind'='strategy_activated'
    AND ae.decoded_payload->>'entityId'=a.order_hash AND ae.decoded_payload->>'maker'=a.maker
    AND ae.decoded_payload->>'configHash'=a.config_hash AND ae.decoded_payload->'config'=a.config
    AND ae.decoded_payload->>'makerNonce'=a.maker_nonce::text AND ae.decoded_payload->'tokens'=a.tokens
    AND ((e.topic=$4 AND e.decoded_payload->>'kind'='strategy_activated' AND s.version=1 AND s.lifecycle='active')
     OR (e.topic=$5 AND e.decoded_payload->>'kind'='strategy_retired' AND s.version::text=e.decoded_payload->>'version' AND s.lifecycle='retired')
     OR (e.topic=$6 AND e.decoded_payload->>'kind'='strategy_swap' AND s.version::text=e.decoded_payload->>'version' AND s.lifecycle='active'
      AND r.router=s.router AND r.order_hash=s.order_hash AND r.maker=s.maker AND r.version=s.version AND r.block_number=s.block_number
      AND r.taker=e.decoded_payload->>'taker' AND r.recipient=e.decoded_payload->>'recipient'
      AND r.token_in_index::text=e.decoded_payload->>'tokenInIndex' AND r.token_out_index::text=e.decoded_payload->>'tokenOutIndex'
      AND r.gross_input_raw::text=e.decoded_payload->>'grossInputRaw' AND r.net_input_raw::text=e.decoded_payload->>'netInputRaw'
      AND r.fee_raw::text=e.decoded_payload->>'feeRaw' AND r.amount_out_raw::text=e.decoded_payload->>'amountOutRaw'
      AND r.crossed_tick_keys=e.decoded_payload->'crossedTickKeys' AND r.crossed_inward=e.decoded_payload->'crossedInward'
      AND r.token_in=lower(s.config->'tokens'->>r.token_in_index) AND r.token_out=lower(s.config->'tokens'->>r.token_out_index)
      AND r.input_decimals::text=s.config->'decimals'->>r.token_in_index AND r.output_decimals::text=s.config->'decimals'->>r.token_out_index
      AND r.fee_ppm::text=s.config->>'feePpm')))::text AS bound_count,
   count(*) FILTER(WHERE e.topic=$6)::text AS snapshot_swaps,
   (SELECT count(*)::text FROM swap_receipts r WHERE r.chain_id=$1 AND r.deployment_id=$2 AND r.block_number BETWEEN $7::numeric AND $8::numeric) AS receipt_count
   FROM strategy_snapshots s LEFT JOIN indexed_blocks b ON b.chain_id=s.chain_id AND b.hash=s.block_hash
   LEFT JOIN chain_events e ON e.chain_id=s.chain_id AND e.block_hash=s.block_hash AND e.tx_hash=s.tx_hash AND e.log_index=s.log_index
   LEFT JOIN strategy_snapshots a ON a.chain_id=s.chain_id AND a.deployment_id=s.deployment_id AND a.order_hash=s.order_hash AND a.version=1
   LEFT JOIN chain_events ae ON ae.chain_id=a.chain_id AND ae.block_hash=a.block_hash AND ae.tx_hash=a.tx_hash AND ae.log_index=a.log_index
   LEFT JOIN swap_receipts r ON r.chain_id=s.chain_id AND r.deployment_id=s.deployment_id AND r.block_hash=s.block_hash AND r.tx_hash=s.tx_hash AND r.log_index=s.log_index
   WHERE s.chain_id=$1 AND s.deployment_id=$2 AND s.block_number BETWEEN $7::numeric AND $8::numeric`,
   [scope.chainId,scope.id,scope.router,topics.activated,topics.retired,topics.swap,scope.startBlock.toString(),pin.height])).rows[0];
  if(bindings.raw_count!==bindings.snapshot_count||bindings.bound_count!==bindings.snapshot_count||bindings.snapshot_swaps!==bindings.receipt_count){result.code='STRATEGY_SOURCE_COVERAGE_MISMATCH';return result;}
  const latest=`WITH latest AS (SELECT DISTINCT ON(s.order_hash) s.*,e.decoded_payload->>'kind' AS event_kind
   FROM strategy_snapshots s JOIN indexed_blocks b ON b.chain_id=s.chain_id AND b.hash=s.block_hash AND b.height=s.block_number
   JOIN chain_events e ON e.chain_id=s.chain_id AND e.block_hash=s.block_hash AND e.tx_hash=s.tx_hash AND e.log_index=s.log_index
   WHERE s.chain_id=$1 AND s.deployment_id=$2 AND s.block_number BETWEEN $3::numeric AND $4::numeric
   ORDER BY s.order_hash,s.block_number DESC,s.log_index DESC)`;
  const filters=query.kind==='list'?query.filters:query.kind==='candidates'?{status:'active' as const,tokenIn:query.tokenIn,tokenOut:query.tokenOut}:{status:'all' as const};
  const filtered=`($5::text IS NULL OR maker=$5) AND ($6::text IS NULL OR tokens ? $6) AND ($7::text IS NULL OR tokens ? $7) AND ($8='all' OR lifecycle=$8)`;
  const params=[...range,filters.maker??null,filters.tokenIn??null,filters.tokenOut??null,filters.status];
  if(query.kind==='list'&&query.after){const a=query.after;const exists=await client.query(`${latest} SELECT 1 FROM latest WHERE ${filtered} AND (block_number,log_index,order_hash)=($9::numeric,$10::integer,$11::text)`,[...params,a.blockNumber,a.logIndex,a.orderHash]);
   if(!exists.rowCount){result.code='INVALID_STRATEGY_CURSOR';return result;}}
  const selected=query.kind==='detail'
   ?(await client.query(`${latest} SELECT * FROM latest WHERE order_hash=$5`,[...range,query.hash])).rows
   :query.kind==='candidates'?(await client.query(`${latest} SELECT *,count(*) OVER()>200 AS candidates_truncated FROM latest WHERE ${filtered}
     ORDER BY block_number DESC,log_index DESC,(config->>'feePpm')::integer ASC,order_hash ASC LIMIT 200`,params)).rows
   :(await client.query(`${latest} SELECT * FROM latest WHERE ${filtered}
     AND ($9::numeric IS NULL OR (block_number,log_index,order_hash)<($9::numeric,$10::integer,$11::text))
     ORDER BY block_number DESC,log_index DESC,order_hash DESC LIMIT $12`,[...params,query.after?.blockNumber??null,query.after?.logIndex??null,query.after?.orderHash??null,query.limit+1])).rows;
  result.hasMore=query.kind==='candidates'?selected[0]?.candidates_truncated===true:query.kind==='list'&&selected.length>query.limit;
  const rows=selected.slice(0,query.kind==='list'?query.limit:query.kind==='candidates'?200:1),hashes=rows.map(r=>r.order_hash);
  const activations=(await client.query('SELECT * FROM strategy_snapshots WHERE chain_id=$1 AND deployment_id=$2 AND version=1 AND order_hash=ANY($3::text[])',[scope.chainId,scope.id,hashes])).rows;
  const fees=query.kind!=='list'?(await client.query(`SELECT order_hash,token_in,sum(fee_raw)::text AS amount_raw FROM swap_receipts
   WHERE chain_id=$1 AND deployment_id=$2 AND block_number BETWEEN $3::numeric AND $4::numeric AND order_hash=ANY($5::text[])
   GROUP BY order_hash,token_in ORDER BY order_hash,token_in`,[...range,hashes])).rows:[];
  const receipt=(s:any,event:StrategySource['event']):StrategySource=>({blockNumber:s.block_number,blockHash:s.block_hash,txHash:s.tx_hash,logIndex:s.log_index,event});
  result.items=rows.map(s=>({orderHash:s.order_hash,router:s.router,maker:s.maker,configHash:s.config_hash,config:s.config,lifecycle:s.lifecycle,version:s.version,
   activated:receipt(activations.find(a=>a.order_hash===s.order_hash)!,'StrategyActivated'),
   updated:receipt(s,s.event_kind==='strategy_activated'?'StrategyActivated':s.event_kind==='strategy_retired'?'StrategyRetired':'OrbitalSwapExecuted'),
   feeTotals:fees.filter(f=>f.order_hash===s.order_hash).map(f=>({token:f.token_in,amountRaw:f.amount_raw})),}));
  result.code='STRATEGIES_COMPLETE';return result;
 }finally{try{await client.query('ROLLBACK');}finally{client.release();}}
}
