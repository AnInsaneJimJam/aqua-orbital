import type pg from 'pg';
import type {BlockHeader,Cursor} from './reorg.js';

export type DeploymentScope={chainId:number;id:string;aqua:string;router:string;payments:string;usdc:string;startBlock:bigint;identity:object};
export type RawEvent={txHash:string;logIndex:number;emitter:string;topic:string;payload:unknown};
type EventIdentity={entityId:string;maker:string;txHash:string;logIndex:number};
export type ProjectionEvent=EventIdentity&(
 {kind:'strategy_activated';configHash:string;config:object;makerNonce:string;tokens:readonly string[]}|
 {kind:'strategy_retired';version:string}|
 {kind:'strategy_swap';taker:string;recipient:string;tokenInIndex:number;tokenOutIndex:number;grossInputRaw:string;netInputRaw:string;feeRaw:string;amountOutRaw:string;version:string;crossedTickKeys:readonly string[];crossedInward:readonly boolean[]}|
 {kind:'invoice_created';amountDueRaw:string;expiresAt:string;recipients:readonly {address:string;bps:number}[];memoHash:string}|
 {kind:'invoice_cancelled'}|
 {kind:'invoice_paid';payer:string;tokenIn:string;inputRaw:string;receivedRaw:string;refundRaw:string;routeHash:string}
);
export async function deploymentCursor(pool:pg.Pool,scope:DeploymentScope):Promise<Cursor|null>{
 const result=await pool.query(`SELECT d.identity=$3::jsonb AS matches,c.height,c.hash FROM deployments d LEFT JOIN deployment_cursor c USING(chain_id,deployment_id)
  WHERE d.chain_id=$1 AND d.deployment_id=$2`,[scope.chainId,scope.id,JSON.stringify(scope.identity)]);
 const row=result.rows[0];
 if(row&&!row.matches)throw Error('DEPLOYMENT_CONFIGURATION_CHANGED');
 return row?.height!==undefined&&row.height!==null?{height:BigInt(row.height),hash:row.hash}:null;
}

export async function atomicDeploymentBlock(pool:pg.Pool,scope:DeploymentScope,block:BlockHeader,events:readonly RawEvent[],projections:readonly ProjectionEvent[]){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[scope.chainId]);
  if((await client.query('SELECT status FROM indexer_state WHERE chain_id=$1',[scope.chainId])).rows[0]?.status==='resync_required')throw Error('RESYNC_REQUIRED');
  await client.query(`INSERT INTO deployments(chain_id,deployment_id,aqua,router,payments,usdc,start_block,identity,verified)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING`,[scope.chainId,scope.id,scope.aqua,scope.router,scope.payments,scope.usdc,scope.startBlock.toString(),JSON.stringify(scope.identity)]);
  const identity=await client.query('SELECT identity=$3::jsonb AS matches FROM deployments WHERE chain_id=$1 AND deployment_id=$2',[scope.chainId,scope.id,JSON.stringify(scope.identity)]);
  if(!identity.rows[0]?.matches)throw Error('DEPLOYMENT_CONFIGURATION_CHANGED');
  const cursor=(await client.query('SELECT height,hash FROM deployment_cursor WHERE chain_id=$1 AND deployment_id=$2 FOR UPDATE',[scope.chainId,scope.id])).rows[0];
  if(cursor&&BigInt(cursor.height)===block.number&&cursor.hash===block.hash){await client.query('COMMIT');return;}
  if(cursor?(BigInt(cursor.height)+1n!==block.number||cursor.hash!==block.parentHash):block.number!==scope.startBlock)throw Error('REORG_REQUIRES_REPLAY');
  const chain=(await client.query('SELECT height,hash FROM indexer_cursor WHERE chain_id=$1 FOR UPDATE',[scope.chainId])).rows[0];
  if(chain&&block.number>BigInt(chain.height)&&(BigInt(chain.height)+1n!==block.number||chain.hash!==block.parentHash))throw Error('REORG_REQUIRES_REPLAY');
  const neighboring=await client.query('SELECT height,hash,parent_hash FROM indexed_blocks WHERE chain_id=$1 AND height BETWEEN $2 AND $3',[scope.chainId,(block.number===0n?0n:block.number-1n).toString(),(block.number+1n).toString()]);
  for(const row of neighboring.rows){const height=BigInt(row.height);
   if((height===block.number&&(row.hash!==block.hash||row.parent_hash!==block.parentHash))||(height===block.number-1n&&row.hash!==block.parentHash)||(height===block.number+1n&&row.parent_hash!==block.hash))throw Error('REORG_REQUIRES_REPLAY');
  }
  await client.query('INSERT INTO indexed_blocks(chain_id,height,hash,parent_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[scope.chainId,block.number.toString(),block.hash,block.parentHash]);
  const sources=new Map(events.map(event=>[`${event.txHash}:${event.logIndex}`,event]));
  const decoded=new Map(projections.map(event=>[`${event.txHash}:${event.logIndex}`,event]));
  for(const event of events){
   const projection=decoded.get(`${event.txHash}:${event.logIndex}`);
   const inserted=await client.query(`INSERT INTO chain_events(chain_id,block_hash,tx_hash,log_index,emitter,topic,payload,decoded_version,decoded_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(chain_id,block_hash,tx_hash,log_index) DO UPDATE SET decoded_version=COALESCE(chain_events.decoded_version,excluded.decoded_version),decoded_payload=COALESCE(chain_events.decoded_payload,excluded.decoded_payload)
    WHERE chain_events.emitter=excluded.emitter AND chain_events.topic=excluded.topic AND chain_events.payload=excluded.payload
     AND (chain_events.decoded_payload IS NULL OR excluded.decoded_payload IS NULL OR chain_events.decoded_payload=excluded.decoded_payload) RETURNING log_index`,
   [scope.chainId,block.hash,event.txHash,event.logIndex,event.emitter,event.topic,JSON.stringify(event.payload),projection?1:null,projection?JSON.stringify(projection):null]);
   if(!inserted.rowCount)throw Error('CONFLICTING_CANONICAL_LOG');
  }
  for(const event of projections){
   const source=sources.get(`${event.txHash}:${event.logIndex}`);
   if(!source||source.emitter!==(event.kind.startsWith('strategy_')?scope.router:scope.payments))throw Error('PROJECTION_WITHOUT_CANONICAL_SOURCE');
   if(event.kind.startsWith('strategy_'))await strategyEvent(client,scope,block,event);
   else await invoiceEvent(client,scope,block,event);
   await notifyProjection(client,scope,block,event);
  }
  await client.query('INSERT INTO deployment_blocks(chain_id,deployment_id,height,block_hash,projection_version,swap_projection_version) VALUES($1,$2,$3,$4,1,1)',[scope.chainId,scope.id,block.number.toString(),block.hash]);
  await client.query(`INSERT INTO deployment_cursor(chain_id,deployment_id,height,hash) VALUES($1,$2,$3,$4)
   ON CONFLICT(chain_id,deployment_id) DO UPDATE SET height=excluded.height,hash=excluded.hash,updated_at=now()`,[scope.chainId,scope.id,block.number.toString(),block.hash]);
  if(!chain||block.number>BigInt(chain.height))await client.query('INSERT INTO indexer_cursor(chain_id,height,hash) VALUES($1,$2,$3) ON CONFLICT(chain_id) DO UPDATE SET height=excluded.height,hash=excluded.hash',[scope.chainId,block.number.toString(),block.hash]);
  await client.query("INSERT INTO indexer_state(chain_id,status) VALUES($1,'indexing') ON CONFLICT(chain_id) DO UPDATE SET updated_at=now()",[scope.chainId]);
  await client.query("SELECT pg_notify('orbital_blocks',$1)",[JSON.stringify({type:'block',chainId:scope.chainId,deploymentId:scope.id,block:block.number.toString(),hash:block.hash})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function strategyEvent(client:pg.PoolClient,scope:DeploymentScope,block:BlockHeader,event:ProjectionEvent){
 // A latest-state view could already contain a later retirement during backfill.
 const prior=(await client.query(`SELECT * FROM strategy_snapshots WHERE chain_id=$1 AND deployment_id=$2 AND order_hash=$3
  AND (block_number<$4 OR (block_number=$4 AND log_index<$5)) ORDER BY block_number DESC,log_index DESC LIMIT 1`,[scope.chainId,scope.id,event.entityId,block.number.toString(),event.logIndex])).rows[0];
 let value:{configHash:string;config:object;makerNonce:string;tokens:readonly string[];lifecycle:string;version:string};
 if(event.kind==='strategy_activated'){
  if(prior)throw Error('INVALID_STRATEGY_TRANSITION');
  value={...event,lifecycle:'active',version:'1'};
 }else if(event.kind==='strategy_retired'){
  if(!prior||prior.lifecycle!=='active'||prior.maker!==event.maker||uint(event.version,64)!==BigInt(prior.version)+1n)throw Error('INVALID_STRATEGY_TRANSITION');
  value={configHash:prior.config_hash,config:prior.config,makerNonce:prior.maker_nonce,tokens:prior.tokens,lifecycle:'retired',version:event.version};
 }else if(event.kind==='strategy_swap'){
  await swapEvent(client,scope,block,event,prior);
  value={configHash:prior.config_hash,config:prior.config,makerNonce:prior.maker_nonce,tokens:prior.tokens,lifecycle:'active',version:event.version};
 }else throw Error('INVALID_PROJECTION_KIND');
 await client.query(`INSERT INTO strategy_snapshots(chain_id,deployment_id,router,order_hash,maker,config_hash,config,maker_nonce,tokens,lifecycle,version,block_number,block_hash,tx_hash,log_index)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  ON CONFLICT DO NOTHING`,[scope.chainId,scope.id,scope.router,event.entityId,event.maker,value.configHash,JSON.stringify(value.config),value.makerNonce,JSON.stringify(value.tokens),value.lifecycle,value.version,block.number.toString(),block.hash,event.txHash,event.logIndex]);
 const stored=await client.query(`SELECT 1 FROM strategy_snapshots WHERE chain_id=$1 AND deployment_id=$2 AND order_hash=$3 AND block_hash=$4 AND tx_hash=$5 AND log_index=$6
  AND maker=$7 AND router=$8 AND config_hash=$9 AND config=$10::jsonb AND maker_nonce=$11 AND tokens=$12::jsonb AND lifecycle=$13 AND version=$14 AND block_number=$15`,
 [scope.chainId,scope.id,event.entityId,block.hash,event.txHash,event.logIndex,event.maker,scope.router,value.configHash,JSON.stringify(value.config),value.makerNonce,JSON.stringify(value.tokens),value.lifecycle,value.version,block.number.toString()]);
 if(!stored.rowCount)throw Error('CONFLICTING_STRATEGY_SNAPSHOT');
}

function uint(value:string,bits:number):bigint{
 if(!/^(0|[1-9][0-9]*)$/.test(value))throw Error('INVALID_SWAP_TRANSITION');
 const parsed=BigInt(value);if(parsed>=(1n<<BigInt(bits)))throw Error('INVALID_SWAP_TRANSITION');return parsed;
}
async function swapEvent(client:pg.PoolClient,scope:DeploymentScope,block:BlockHeader,event:Extract<ProjectionEvent,{kind:'strategy_swap'}>,prior:any){
 const fail=()=>{throw Error('INVALID_SWAP_TRANSITION');};
 if(!prior||prior.lifecycle!=='active'||prior.maker!==event.maker||uint(event.version,64)!==BigInt(prior.version)+1n)fail();
 const c=prior.config;const input=event.tokenInIndex,output=event.tokenOutIndex;
 if(!Number.isInteger(input)||!Number.isInteger(output)||input<0||output<0||input===output||input>=c.tokens.length||output>=c.tokens.length||![100,500,1000].includes(c.feePpm))fail();
 const nonzero=(value:string)=>/^0x[0-9a-f]{40}$/.test(value)&&BigInt(value)!==0n;
 if(!nonzero(event.taker)||!nonzero(event.recipient)||[event.maker,scope.router,scope.aqua].includes(event.taker)||[event.maker,scope.router,scope.aqua].includes(event.recipient))fail();
 const gross=uint(event.grossInputRaw,256),net=uint(event.netInputRaw,256),fee=uint(event.feeRaw,256),out=uint(event.amountOutRaw,256);
 if(gross===0n||net===0n||out===0n||fee===0n||net+fee!==gross||fee!==(gross*BigInt(c.feePpm)+999999n)/1000000n)fail();
 const keys=event.crossedTickKeys,directions=event.crossedInward,ordinary=(c.tickKeys as string[]).slice(0,-1);
 if(!Array.isArray(keys)||!Array.isArray(directions)||keys.length!==directions.length||keys.length>16)fail();
 let prefix:number|undefined;
 for(let i=0;i<keys.length;i++){
  uint(keys[i]!,64);const keyIndex=ordinary.indexOf(keys[i]!);const inward=directions[i];
  if(keyIndex<0||typeof inward!=='boolean')fail();
  // Only sequence-local adjacency is known. No reserve state or first prefix
  // is invented from receipt fields; the onchain engine proves the full path.
  if(prefix!==undefined&&keyIndex!==(inward?prefix-1:prefix))fail();
  prefix=inward?keyIndex:keyIndex+1;
 }
 await client.query(`INSERT INTO swap_receipts(chain_id,deployment_id,router,order_hash,maker,taker,recipient,token_in_index,token_out_index,token_in,token_out,input_decimals,output_decimals,fee_ppm,gross_input_raw,net_input_raw,fee_raw,amount_out_raw,version,crossed_tick_keys,crossed_inward,block_number,block_hash,tx_hash,log_index)
  VALUES(${Array.from({length:25},(_,i)=>`$${i+1}`).join(',')})`,
 [scope.chainId,scope.id,scope.router,event.entityId,event.maker,event.taker,event.recipient,input,output,c.tokens[input].toLowerCase(),c.tokens[output].toLowerCase(),c.decimals[input],c.decimals[output],c.feePpm,event.grossInputRaw,event.netInputRaw,event.feeRaw,event.amountOutRaw,event.version,JSON.stringify(keys),JSON.stringify(directions),block.number.toString(),block.hash,event.txHash,event.logIndex]);
}
async function notifyProjection(client:pg.PoolClient,scope:DeploymentScope,block:BlockHeader,event:ProjectionEvent){
 const version=event.kind==='strategy_retired'||event.kind==='strategy_swap'?event.version:event.kind.endsWith('_created')||event.kind==='strategy_activated'?'1':'2';
 await client.query("SELECT pg_notify('orbital_blocks',$1)",[JSON.stringify({type:'entity',chainId:scope.chainId,deploymentId:scope.id,block:block.number.toString(),hash:block.hash,entityKind:event.kind.startsWith('strategy_')?'strategy':'invoice',entityId:event.entityId,version})]);
}

/** Canonical retained router logs only; no RPC state getter is needed for backfill. */
export async function pendingSwapBackfill(pool:pg.Pool,scope:DeploymentScope){
 const row=(await pool.query(`SELECT b.height,b.block_hash,i.parent_hash FROM deployment_blocks b JOIN indexed_blocks i ON i.chain_id=b.chain_id AND i.hash=b.block_hash
  WHERE b.chain_id=$1 AND b.deployment_id=$2 AND b.swap_projection_version=0 ORDER BY b.height LIMIT 1`,[scope.chainId,scope.id])).rows[0];
 if(!row)return null;
 const events=(await pool.query('SELECT tx_hash,log_index,emitter,topic,payload FROM chain_events WHERE chain_id=$1 AND block_hash=$2 AND emitter=$3 ORDER BY log_index',[scope.chainId,row.block_hash,scope.router])).rows.map(e=>({txHash:e.tx_hash,logIndex:e.log_index,emitter:e.emitter,topic:e.topic,payload:e.payload} as RawEvent));
 const configs=(await pool.query("SELECT order_hash,config FROM strategy_snapshots WHERE chain_id=$1 AND deployment_id=$2 AND block_hash=$3 AND version=1 AND lifecycle='active'",[scope.chainId,scope.id,row.block_hash])).rows;
 return {block:{number:BigInt(row.height),hash:row.block_hash,parentHash:row.parent_hash} as BlockHeader,events,configs};
}
export async function atomicSwapBackfill(pool:pg.Pool,scope:DeploymentScope,block:BlockHeader,events:readonly RawEvent[],projections:readonly ProjectionEvent[]){
 const client=await pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[scope.chainId]);
  if((await client.query('SELECT status FROM indexer_state WHERE chain_id=$1',[scope.chainId])).rows[0]?.status==='resync_required')throw Error('RESYNC_REQUIRED');
  const identity=(await client.query('SELECT identity=$3::jsonb AS matches FROM deployments WHERE chain_id=$1 AND deployment_id=$2',[scope.chainId,scope.id,JSON.stringify(scope.identity)])).rows[0];
  if(!identity?.matches)throw Error('DEPLOYMENT_CONFIGURATION_CHANGED');
  const next=(await client.query('SELECT height,block_hash FROM deployment_blocks WHERE chain_id=$1 AND deployment_id=$2 AND swap_projection_version=0 ORDER BY height LIMIT 1 FOR UPDATE',[scope.chainId,scope.id])).rows[0];
  if(!next||BigInt(next.height)!==block.number||next.block_hash!==block.hash)throw Error('REORG_REQUIRES_REPLAY');
  // Other deployment scopes may share a router. A prior read is not complete
  // evidence if another writer extended this canonical log set before our lock.
  const complete=(await client.query(`SELECT COALESCE(jsonb_agg(jsonb_build_object('txHash',tx_hash,'logIndex',log_index,'emitter',emitter,'topic',topic,'payload',payload) ORDER BY log_index),'[]'::jsonb)=$4::jsonb AS matches
   FROM chain_events WHERE chain_id=$1 AND block_hash=$2 AND emitter=$3`,[scope.chainId,block.hash,scope.router,JSON.stringify(events)])).rows[0];
  if(!complete?.matches)throw Error('BACKFILL_SOURCE_CHANGED');
  const sources=new Map(events.map(event=>[`${event.txHash}:${event.logIndex}`,event]));
  for(const event of projections){
   const source=sources.get(`${event.txHash}:${event.logIndex}`);
   if(!source||source.emitter!==scope.router||!event.kind.startsWith('strategy_'))throw Error('PROJECTION_WITHOUT_CANONICAL_SOURCE');
   const updated=await client.query(`UPDATE chain_events SET decoded_version=COALESCE(decoded_version,1),decoded_payload=COALESCE(decoded_payload,$7::jsonb)
    WHERE chain_id=$1 AND block_hash=$2 AND tx_hash=$3 AND log_index=$4 AND emitter=$5 AND payload=$6::jsonb
    AND (decoded_payload IS NULL OR decoded_payload=$7::jsonb) RETURNING log_index`,
   [scope.chainId,block.hash,event.txHash,event.logIndex,scope.router,JSON.stringify(source.payload),JSON.stringify(event)]);
   if(!updated.rowCount)throw Error('CONFLICTING_CANONICAL_LOG');
   await strategyEvent(client,scope,block,event);
   if(event.kind==='strategy_swap')await notifyProjection(client,scope,block,event);
  }
  await client.query('UPDATE deployment_blocks SET swap_projection_version=1 WHERE chain_id=$1 AND deployment_id=$2 AND height=$3',[scope.chainId,scope.id,block.number.toString()]);
  // No cursor or readiness timestamp is advanced by historical receipt decoding.
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function invoiceEvent(client:pg.PoolClient,scope:DeploymentScope,block:BlockHeader,event:ProjectionEvent){
 const prior=(await client.query('SELECT * FROM invoices WHERE chain_id=$1 AND deployment_id=$2 AND invoice_id=$3',[scope.chainId,scope.id,event.entityId])).rows[0];
 const source=[block.number.toString(),block.hash,event.txHash,event.logIndex];
 let terms:unknown[],state:unknown[],created:unknown[];
 if(event.kind==='invoice_created'){
  if(prior)throw Error('INVALID_INVOICE_TRANSITION');
  terms=[event.amountDueRaw,event.expiresAt,JSON.stringify(event.recipients),event.memoHash];created=source;
  state=['unpaid','1',null,null,null,null,null,null];
 }else{
  if(!prior||prior.status!=='unpaid'||prior.merchant!==event.maker)throw Error('INVALID_INVOICE_TRANSITION');
  terms=[prior.amount_due_raw,prior.expires_at,JSON.stringify(prior.recipients),prior.memo_hash];created=[prior.created_block,prior.created_hash,prior.created_tx,prior.created_log];
  if(event.kind==='invoice_paid'){
   if(BigInt(event.inputRaw)<=0n||BigInt(event.receivedRaw)<BigInt(prior.amount_due_raw)||BigInt(event.receivedRaw)-BigInt(event.refundRaw)!==BigInt(prior.amount_due_raw))throw Error('INVALID_INVOICE_TRANSITION');
   state=['paid','2',event.payer,event.tokenIn,event.inputRaw,event.receivedRaw,event.refundRaw,event.routeHash];
  }else if(event.kind==='invoice_cancelled')state=['cancelled','2',null,null,null,null,null,null];
  else throw Error('INVALID_PROJECTION_KIND');
 }
 await client.query(`INSERT INTO invoice_snapshots(chain_id,deployment_id,adapter,invoice_id,merchant,amount_due_raw,expires_at,recipients,memo_hash,status,version,payer,token_in,input_raw,received_raw,refund_raw,route_hash,created_block,created_hash,created_tx,created_log,block_number,block_hash,tx_hash,log_index)
  VALUES(${Array.from({length:25},(_,index)=>`$${index+1}`).join(',')})`,[scope.chainId,scope.id,scope.payments,event.entityId,event.maker,...terms,...state,...created,...source]);
}

/** Call after canonical block FK cascades, within the same locked transaction. */
export async function rollbackDeploymentCursors(client:pg.PoolClient,chainId:number,ancestor:string){
 await client.query(`DELETE FROM deployment_cursor c WHERE c.chain_id=$1 AND c.height>$2 AND NOT EXISTS
  (SELECT 1 FROM deployment_blocks b WHERE b.chain_id=c.chain_id AND b.deployment_id=c.deployment_id)`,[chainId,ancestor]);
 await client.query(`UPDATE deployment_cursor c SET (height,hash,updated_at)=
  (SELECT b.height,b.block_hash,now() FROM deployment_blocks b WHERE b.chain_id=c.chain_id AND b.deployment_id=c.deployment_id ORDER BY b.height DESC LIMIT 1)
  WHERE c.chain_id=$1 AND c.height>$2`,[chainId,ancestor]);
}
