import pg from 'pg';
export * from './reorg.js';
export * from './materialization.js';
export * from './metrics.js';
export * from './invoice-reads.js';
export * from './strategy-reads.js';
export * as materializedSchema from './materializationSchema.js';
export function database(url:string){return new pg.Pool({connectionString:url,max:8});}
export async function atomicBlock(pool:pg.Pool,chainId:number,block:{number:bigint;hash:string;parentHash:string},events:{txHash:string;logIndex:number;emitter:string;topic:string;payload:unknown}[]){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)',[chainId]);
  const state=await client.query('SELECT status FROM indexer_state WHERE chain_id=$1',[chainId]);
  if(state.rows[0]?.status==='resync_required')throw Error('RESYNC_REQUIRED');
  const cursor=await client.query('SELECT height,hash FROM indexer_cursor WHERE chain_id=$1 FOR UPDATE',[chainId]);
  const prior=cursor.rows[0];
  if(prior&&BigInt(prior.height)===block.number&&prior.hash===block.hash){await client.query('COMMIT');return;}
  if(prior&&(BigInt(prior.height)+1n!==block.number||prior.hash!==block.parentHash))throw Error('REORG_REQUIRES_REPLAY');
  await client.query('INSERT INTO indexed_blocks(chain_id,height,hash,parent_hash) VALUES($1,$2,$3,$4)',[chainId,block.number.toString(),block.hash,block.parentHash]);
  for(const e of events)await client.query('INSERT INTO chain_events(chain_id,block_hash,tx_hash,log_index,emitter,topic,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[chainId,block.hash,e.txHash,e.logIndex,e.emitter,e.topic,JSON.stringify(e.payload)]);
  await client.query('INSERT INTO indexer_cursor(chain_id,height,hash) VALUES($1,$2,$3) ON CONFLICT(chain_id) DO UPDATE SET height=excluded.height,hash=excluded.hash',[chainId,block.number.toString(),block.hash]);
  await client.query("INSERT INTO indexer_state(chain_id,status) VALUES($1,'indexing') ON CONFLICT(chain_id) DO UPDATE SET updated_at=now()",[chainId]);
  await client.query("SELECT pg_notify('orbital_blocks',$1)",[JSON.stringify({chainId,block:block.number.toString(),hash:block.hash})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export * from './shipment-reads.js';
