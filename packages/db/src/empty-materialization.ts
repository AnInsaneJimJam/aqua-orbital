import type pg from 'pg';
import type {BlockHeader} from './reorg.js';
import type {DeploymentScope} from './materialization.js';

/** The caller authenticates the complete scoped log range as empty against a
 * fresh canonical tip. Persist every header and coverage row in one transaction;
 * never infer emptiness from a missing database row or skip canonical history. */
export async function atomicEmptyDeploymentBlocks(pool:pg.Pool,scope:DeploymentScope,blocks:readonly BlockHeader[]){
 if(blocks.length<1||blocks.length>64)throw Error('INVALID_EMPTY_RANGE');
 const first=blocks[0]!,last=blocks.at(-1)!;
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i]!;
  if(block.number<0n||block.number>=(1n<<256n)||!/^0x[0-9a-f]{64}$/.test(block.hash)||!/^0x[0-9a-f]{64}$/.test(block.parentHash))throw Error('INVALID_EMPTY_RANGE');
  if(i&&(block.number!==blocks[i-1]!.number+1n||block.parentHash!==blocks[i-1]!.hash))throw Error('REORG_REQUIRES_REPLAY');
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[scope.chainId]);
  if((await client.query('SELECT status FROM indexer_state WHERE chain_id=$1',[scope.chainId])).rows[0]?.status==='resync_required')throw Error('RESYNC_REQUIRED');
  await client.query(`INSERT INTO deployments(chain_id,deployment_id,aqua,router,payments,usdc,start_block,identity,verified)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING`,[scope.chainId,scope.id,scope.aqua,scope.router,scope.payments,scope.usdc,scope.startBlock.toString(),JSON.stringify(scope.identity)]);
  if(!(await client.query('SELECT identity=$3::jsonb AS matches FROM deployments WHERE chain_id=$1 AND deployment_id=$2',[scope.chainId,scope.id,JSON.stringify(scope.identity)])).rows[0]?.matches)throw Error('DEPLOYMENT_CONFIGURATION_CHANGED');
  const cursor=(await client.query('SELECT height,hash FROM deployment_cursor WHERE chain_id=$1 AND deployment_id=$2 FOR UPDATE',[scope.chainId,scope.id])).rows[0];
  const replay=!!cursor&&BigInt(cursor.height)===last.number&&cursor.hash===last.hash;
  if(!replay&&(cursor?(BigInt(cursor.height)+1n!==first.number||cursor.hash!==first.parentHash):first.number!==scope.startBlock))throw Error('REORG_REQUIRES_REPLAY');
  const chain=(await client.query('SELECT height,hash FROM indexer_cursor WHERE chain_id=$1 FOR UPDATE',[scope.chainId])).rows[0];
  if(chain){
   const height=BigInt(chain.height);
   if(height<first.number&&(height+1n!==first.number||chain.hash!==first.parentHash))throw Error('REORG_REQUIRES_REPLAY');
   if(height>=first.number&&height<=last.number&&blocks[Number(height-first.number)]!.hash!==chain.hash)throw Error('REORG_REQUIRES_REPLAY');
  }else if(cursor)throw Error('REORG_REQUIRES_REPLAY');
  const neighbors=(await client.query('SELECT height,hash,parent_hash FROM indexed_blocks WHERE chain_id=$1 AND height BETWEEN $2 AND $3',[scope.chainId,(first.number===0n?0n:first.number-1n).toString(),(last.number+1n).toString()])).rows;
  let retained=0;
  for(const row of neighbors){
   const height=BigInt(row.height);
   if(height>=first.number&&height<=last.number){
    const expected=blocks[Number(height-first.number)]!;retained++;
    if(row.hash!==expected.hash||row.parent_hash!==expected.parentHash)throw Error('REORG_REQUIRES_REPLAY');
   }else if((height===first.number-1n&&row.hash!==first.parentHash)||(height===last.number+1n&&row.parent_hash!==last.hash))throw Error('REORG_REQUIRES_REPLAY');
  }
  // Another deployment can share any of these emitters. Its retained raw logs
  // contradict an empty-range claim even when our coverage is already present.
  if((await client.query(`SELECT 1 FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
   WHERE e.chain_id=$1 AND b.height BETWEEN $2 AND $3 AND e.emitter=ANY($4::text[]) LIMIT 1`,[scope.chainId,first.number.toString(),last.number.toString(),[scope.aqua,scope.router,scope.payments]])).rowCount)throw Error('EMPTY_RANGE_HAS_EVENTS');
  const coverage=(await client.query('SELECT height,block_hash,projection_version,swap_projection_version FROM deployment_blocks WHERE chain_id=$1 AND deployment_id=$2 AND height BETWEEN $3 AND $4',[scope.chainId,scope.id,first.number.toString(),last.number.toString()])).rows;
  if(replay){
   if(retained!==blocks.length||coverage.length!==blocks.length||coverage.some(row=>row.block_hash!==blocks[Number(BigInt(row.height)-first.number)]!.hash||row.projection_version!==1||row.swap_projection_version!==1))throw Error('REORG_REQUIRES_REPLAY');
   // Idempotent replay does not refresh readiness timestamps.
   await client.query('COMMIT');return;
  }
  if(coverage.length)throw Error('REORG_REQUIRES_REPLAY');
  const heights=blocks.map(block=>block.number.toString()),hashes=blocks.map(block=>block.hash),parents=blocks.map(block=>block.parentHash);
  await client.query(`INSERT INTO indexed_blocks(chain_id,height,hash,parent_hash)
   SELECT $1,height,hash,parent FROM unnest($2::numeric[],$3::text[],$4::text[]) AS value(height,hash,parent) ON CONFLICT DO NOTHING`,[scope.chainId,heights,hashes,parents]);
  await client.query(`INSERT INTO deployment_blocks(chain_id,deployment_id,height,block_hash,projection_version,swap_projection_version)
   SELECT $1,$2,height,hash,1,1 FROM unnest($3::numeric[],$4::text[]) AS value(height,hash)`,[scope.chainId,scope.id,heights,hashes]);
  await client.query(`INSERT INTO deployment_cursor(chain_id,deployment_id,height,hash) VALUES($1,$2,$3,$4)
   ON CONFLICT(chain_id,deployment_id) DO UPDATE SET height=excluded.height,hash=excluded.hash,updated_at=now()`,[scope.chainId,scope.id,last.number.toString(),last.hash]);
  if(!chain||last.number>BigInt(chain.height))await client.query('INSERT INTO indexer_cursor(chain_id,height,hash) VALUES($1,$2,$3) ON CONFLICT(chain_id) DO UPDATE SET height=excluded.height,hash=excluded.hash',[scope.chainId,last.number.toString(),last.hash]);
  await client.query("INSERT INTO indexer_state(chain_id,status) VALUES($1,'indexing') ON CONFLICT(chain_id) DO UPDATE SET updated_at=now()",[scope.chainId]);
  await client.query("SELECT pg_notify('orbital_blocks',payload) FROM unnest($1::text[]) AS value(payload)",[blocks.map(block=>JSON.stringify({type:'block',chainId:scope.chainId,deploymentId:scope.id,block:block.number.toString(),hash:block.hash}))]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
