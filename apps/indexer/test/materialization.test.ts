import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,getAddress,type AbiEvent,type Hex} from 'viem';
import {buildOrder,hashOrder,hashConfig,invoiceId,lifecycleAbi,lifecycleEventsAbi,paymentsEventsAbi,type Config} from '@orbital/sdk';
import {indexerSnapshot} from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncDeploymentOnce,deploymentScope,type MaterializationRpc} from '../src/materializer.js';

const address=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'1',tokens:[{address:address(1),symbol:'USDC',decimals:6,mock:true},{address:address(2),symbol:'oUSD18',decimals:18,mock:true}]};
const maker=address(20),payer=address(21);
const config:Config={schemaVersion:1,chainId:31337n,router:manifest.router,maker,makerNonce:0n,tokens:[address(1),address(2)],decimals:[6,18],tickKeys:[(1n<<64n)-1n],radiiInternal:[4n*10n**18n*(1n<<64n)],feePpm:500,initialAmountsRaw:[1_171_573n,1_171_572_875_253_809_903n]};
const orderHash=hashOrder(buildOrder(config));
const id=invoiceId(31337n,manifest.payments,maker,0n);
const due=9_007_199_254_740_993n;
function header(height:number,branch=0,parentBranch=branch){return {number:BigInt(height),hash:hash(branch*1000+height),parentHash:hash(parentBranch*1000+height-1),transactions:[hash(branch*1000+height+100)]};}
function event(block:ReturnType<typeof header>,logIndex:number,name:string,args:Record<string,unknown>,emitter=manifest.payments){
 const abi=[...lifecycleEventsAbi,...paymentsEventsAbi] as readonly AbiEvent[];
 const entry=abi.find(item=>item.name===name)!;
 return {blockNumber:block.number,blockHash:block.hash,transactionHash:block.transactions[0]!,transactionIndex:0,logIndex,address:emitter,
  topics:encodeEventTopics({abi:[entry],eventName:name,args} as never) as Hex[],
  data:encodeAbiParameters(entry.inputs.filter(input=>!input.indexed),entry.inputs.filter(input=>!input.indexed).map(input=>args[input.name!]))};
}
const activation=(b:ReturnType<typeof header>,c=config)=>event(b,0,'StrategyActivated',{maker:c.maker,orderHash:hashOrder(buildOrder(c)),configHash:hashConfig(c)},c.router);
const created=(b:ReturnType<typeof header>,logIndex=1,invoice=id)=>event(b,logIndex,'InvoiceCreated',{invoiceId:invoice,merchant:maker,amountDueRaw:due,expiresAt:999999,recipients:[maker,address(22)],bps:[9000,1000],memoHash:hash(99)});
const paid=(b:ReturnType<typeof header>,logIndex=2)=>event(b,logIndex,'InvoicePaid',{invoiceId:id,merchant:maker,payer,tokenIn:manifest.usdc,amountInRaw:due,receivedRaw:due,refundRaw:0n,routeHash:hash(0)});
function fixture(blocks:ReturnType<typeof header>[],logs:Map<bigint,ReturnType<typeof event>[]>,configs=new Map([[orderHash,config]])){
 const byNumber=new Map(blocks.map(block=>[block.number,block]));let calls=0;
 const rpc:MaterializationRpc={
  async getChainId(){return 31337;},async getBlockNumber(){return blocks.at(-1)!.number;},
  async getBlock(number){const result=byNumber.get(number);if(!result)throw Error('RPC_BLOCK_UNAVAILABLE');return result;},
  async getLogs(number,emitters){return (logs.get(number)??[]).filter(log=>emitters.some(emitter=>emitter.toLowerCase()===log.address.toLowerCase()));},
  async call(request,block){calls++;assert.equal(block.requireCanonical,true);assert.ok(blocks.some(item=>item.hash===block.blockHash));
   const decoded=decodeFunctionData({abi:lifecycleAbi,data:request.data});assert.equal(decoded.functionName,'getStrategyConfig');
   const c=configs.get(decoded.args[0] as Hex);assert.ok(c);assert.equal(request.to.toLowerCase(),c.router.toLowerCase());
   return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:c});},
 };
 return {rpc,calls:()=>calls};
}

test('compiled lifecycle and invoice logs materialize atomically with exact amounts and same-block ordering',async()=>{
 const db=await isolatedDatabase();try{
  const block=header(1);const source=fixture([block,header(2),header(3)],new Map([[1n,[paid(block),created(block),activation(block),activation(block)]]]));
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'indexed');
  const strategy=(await db.pool.query('SELECT * FROM strategies')).rows[0];assert.equal(strategy.order_hash,orderHash);assert.equal(strategy.lifecycle,'active');assert.equal(strategy.version,'1');assert.equal(strategy.config.initialAmountsRaw[1],config.initialAmountsRaw[1]!.toString());
  const invoice=(await db.pool.query('SELECT * FROM invoices')).rows[0];assert.equal(invoice.status,'paid');assert.equal(invoice.amount_due_raw,due.toString());assert.equal(invoice.version,'2');
  assert.equal((await db.pool.query('SELECT * FROM invoice_recipients ORDER BY recipient_index')).rows.length,2);
  assert.equal((await db.pool.query('SELECT input_raw FROM invoice_payments')).rows[0].input_raw,due.toString());
  assert.equal((await db.pool.query("SELECT decoded_payload->>'amountDueRaw' AS amount FROM chain_events WHERE decoded_payload->>'kind'='invoice_created'")).rows[0].amount,due.toString());
  assert.equal((await db.pool.query('SELECT sum(amount_raw)::text AS total FROM invoice_recipients')).rows[0].total,due.toString());
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'3');assert.equal(source.calls(),1);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'idle');assert.equal((await db.pool.query('SELECT count(*) FROM invoice_payments')).rows[0].count,'1');
 }finally{await db.close();}
});
test('materialization delete failure rolls back reorg logs, snapshots and deployment cursor together',async()=>{
 const db=await isolatedDatabase();try{
  const b1=header(1),b2=header(2);const source=fixture([b1,b2,header(3),header(4)],new Map([[1n,[created(b1)]],[2n,[paid(b2)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);await syncDeploymentOnce(db.pool,manifest,source.rpc);
  await db.pool.query(`CREATE FUNCTION refuse_projection_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_PROJECTION_ROLLBACK_FAILURE'; END $$;
   CREATE TRIGGER refuse_projection_delete BEFORE DELETE ON invoice_snapshots FOR EACH ROW EXECUTE FUNCTION refuse_projection_delete()`);
  const fork=fixture([b1,header(2,1,0),header(3,1),header(4,1)],new Map());
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,fork.rpc),/TEST_PROJECTION_ROLLBACK_FAILURE/);
  assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'paid');
  assert.equal((await db.pool.query('SELECT height FROM deployment_cursor')).rows[0].height,'2');
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.height,2n);
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'2');
 }finally{await db.close();}
});
test('only committed projections publish invalidations; unknown events remain raw without swap metrics',async()=>{
 const db=await isolatedDatabase();const listener=await db.pool.connect();const notices:Record<string,unknown>[]=[];
 listener.on('notification',message=>{if(message.payload){const value=JSON.parse(message.payload);if(value.deploymentId===deploymentScope(manifest).id)notices.push(value);}});
 try{
  await listener.query('LISTEN orbital_blocks');
  const b=header(1);const bad=event(b,2,'InvoiceCancelled',{invoiceId:hash(444),merchant:maker});
  const source=fixture([b,header(2),header(3)],new Map([[1n,[created(b),bad]]]));
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/INVALID_INVOICE_TRANSITION/);
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(notices.length,0);
  source.rpc.getLogs=async()=>[created(b),{...activation(b),logIndex:3,topics:[hash(888)],data:'0x'}];
  await syncDeploymentOnce(db.pool,manifest,source.rpc);
  for(let i=0;i<50&&notices.length<2;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(notices.length,2);const entity=notices.find(value=>value.type==='entity')!;
  assert.equal(entity.entityKind,'invoice');assert.equal(entity.entityId,id);assert.equal(entity.version,'1');assert.equal(entity.hash,b.hash);assert.equal(entity.block,'1');
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'2');assert.equal((await db.pool.query('SELECT count(*) FROM strategy_snapshots')).rows[0].count,'0');
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'0');
 }finally{await listener.query('UNLISTEN *');listener.release();await db.close();}
});
test('activation hydration is capped per block and uses at most four simultaneous calls',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1),configs=new Map<Hex,Config>();
  const logs=Array.from({length:8},(_,index)=>{const c={...config,makerNonce:BigInt(index)};configs.set(hashOrder(buildOrder(c)),c);return {...activation(b,c),logIndex:index};});
  const source=fixture([b,header(2),header(3)],new Map([[1n,logs]]),configs);const call=source.rpc.call;let active=0,maximum=0;
  source.rpc.call=async(...args)=>{active++;maximum=Math.max(maximum,active);try{await new Promise(resolve=>setTimeout(resolve,5));return await call(...args);}finally{active--;}};
  await syncDeploymentOnce(db.pool,manifest,source.rpc);assert.equal(maximum,4);assert.equal((await db.pool.query('SELECT count(*) FROM strategies')).rows[0].count,'8');
  const other={...manifest,router:address(50)};const many=fixture([b,header(2),header(3)],new Map());
  many.rpc.getLogs=async()=>Array.from({length:33},(_,index)=>({...activation(b,{...config,router:other.router}),logIndex:index}));
  await assert.rejects(()=>syncDeploymentOnce(db.pool,other,many.rpc),/BLOCK_HYDRATION_LIMIT/);assert.equal(many.calls(),0);
 }finally{await db.close();}
});
test('reorg restores prior lifecycle/invoice snapshot and deployment cursor, then replay replaces orphan status',async()=>{
 const db=await isolatedDatabase();try{
  const b1=header(1),b2=header(2);const retired=event(b2,0,'StrategyRetired',{maker,orderHash,version:2n},manifest.router);
  const original=fixture([b1,b2,header(3),header(4)],new Map([[1n,[activation(b1),created(b1)]],[2n,[retired,paid(b2,1)]]]));
  await syncDeploymentOnce(db.pool,manifest,original.rpc);await syncDeploymentOnce(db.pool,manifest,original.rpc);
  assert.equal((await db.pool.query('SELECT lifecycle FROM strategies')).rows[0].lifecycle,'retired');
  const fork=header(2,1,0);const alternate=fixture([b1,fork,header(3,1),header(4,1)],new Map([[2n,[event(fork,0,'InvoiceCancelled',{invoiceId:id,merchant:maker})]]]));
  assert.equal((await syncDeploymentOnce(db.pool,manifest,alternate.rpc)).status,'rolled_back');
  assert.equal((await db.pool.query('SELECT lifecycle FROM strategies')).rows[0].lifecycle,'active');assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'unpaid');
  assert.equal((await db.pool.query('SELECT height FROM deployment_cursor')).rows[0].height,'1');assert.equal((await db.pool.query('SELECT count(*) FROM invoice_payments')).rows[0].count,'0');
  assert.equal((await syncDeploymentOnce(db.pool,manifest,alternate.rpc)).status,'indexed');assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'cancelled');
 }finally{await db.close();}
});
test('orphaning a deployment first block removes its projection cursor and restart begins at its own start',async()=>{
 const db=await isolatedDatabase();try{
  const blocks=[header(1),header(2),header(3),header(4)];const base=fixture(blocks,new Map());
  await syncDeploymentOnce(db.pool,manifest,base.rpc);await syncDeploymentOnce(db.pool,manifest,base.rpc);
  const later={...manifest,router:address(40),payments:address(41),startBlock:'2'};const laterId=invoiceId(31337n,later.payments,maker,0n);
  const create=(b:ReturnType<typeof header>)=>event(b,1,'InvoiceCreated',{invoiceId:laterId,merchant:maker,amountDueRaw:due,expiresAt:999999,recipients:[maker],bps:[10000],memoHash:hash(99)},later.payments);
  const source=fixture(blocks,new Map([[2n,[create(blocks[1]!)]]]));await syncDeploymentOnce(db.pool,later,source.rpc);
  const fork=[header(1),header(2,1,0),header(3,1),header(4,1)];const alternate=fixture(fork,new Map([[2n,[create(fork[1]!)]]]));
  assert.equal((await syncDeploymentOnce(db.pool,later,alternate.rpc)).status,'rolled_back');
  assert.equal((await db.pool.query('SELECT count(*) FROM invoice_snapshots')).rows[0].count,'0');
  assert.equal((await db.pool.query('SELECT count(*) FROM deployment_cursor WHERE deployment_id=$1',[deploymentScope(later).id])).rows[0].count,'0');
  assert.equal((await syncDeploymentOnce(db.pool,later,alternate.rpc)).block,2n);
  assert.equal((await db.pool.query('SELECT created_hash FROM invoices')).rows[0].created_hash,fork[1]!.hash);
 }finally{await db.close();}
});
test('a second deployment backfills its own cursor without borrowing the first deployment materialization',async()=>{
 const db=await isolatedDatabase();try{
  const blocks=[header(1),header(2),header(3),header(4)];const first=fixture(blocks,new Map([[1n,[activation(blocks[0]!)]]]));
  await syncDeploymentOnce(db.pool,manifest,first.rpc);await syncDeploymentOnce(db.pool,manifest,first.rpc);
  const secondManifest={...manifest,aqua:address(30),router:address(31),payments:address(32)};const secondConfig={...config,router:secondManifest.router};const secondHash=hashOrder(buildOrder(secondConfig));
  const second=fixture(blocks,new Map([[1n,[{...activation(blocks[0]!,secondConfig),logIndex:1}]]]),new Map([[secondHash,secondConfig]]));
  assert.equal((await syncDeploymentOnce(db.pool,secondManifest,second.rpc)).block,1n);
  assert.equal((await db.pool.query('SELECT count(*) FROM strategies')).rows[0].count,'2');
  assert.deepEqual((await db.pool.query('SELECT height FROM deployment_cursor ORDER BY height')).rows.map(row=>row.height),['1','2']);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.height,2n);
  await assert.rejects(()=>syncDeploymentOnce(db.pool,{...secondManifest,startBlock:'2'},second.rpc),/DEPLOYMENT_CONFIGURATION_CHANGED/);
 }finally{await db.close();}
});
test('bad decoded transition rolls back raw logs, snapshots and both cursors for the whole block',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const bad=event(b,2,'InvoicePaid',{invoiceId:id,merchant:address(999),payer,tokenIn:manifest.usdc,amountInRaw:due,receivedRaw:due,refundRaw:0n,routeHash:hash(0)});
  const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),created(b),bad]]]));
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/INVALID_INVOICE_TRANSITION/);
  for(const table of ['indexed_blocks','chain_events','strategy_snapshots','invoice_snapshots','deployment_cursor'])assert.equal((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'0',table);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor,null);
 }finally{await db.close();}
});
test('hash-pinned hydration mismatch, invalid log identity and malformed ABI fail before materialization',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const good=activation(b);const source=fixture([b,header(2),header(3)],new Map([[1n,[good]]]));
  const read=source.rpc.call;source.rpc.call=async()=>encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:{...config,makerNonce:1n}});
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/ACTIVATION_CONFIG_MISMATCH/);source.rpc.call=read;
  for(const bad of [{...good,transactionHash:hash(999)}, {...good,transactionIndex:1},{...good,blockHash:hash(777)},{...good,data:'0x00' as Hex}]){
   source.rpc.getLogs=async()=>[bad];await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/RPC_INVALID_BLOCK_LOG|INVALID_EVENT_ABI/);
  }
  source.rpc.getLogs=async()=>[good,{...good,data:'0x00' as Hex}];await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/CONFLICTING_BLOCK_LOG/);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor,null);
 }finally{await db.close();}
});
test('unverified deployment, wrong chain, missing historic call and branch change cannot commit',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b)]]]));
  await assert.rejects(()=>syncDeploymentOnce(db.pool,{...manifest,verified:false},source.rpc),/DEPLOYMENT_NOT_VERIFIED/);
  source.rpc.getChainId=async()=>1;await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/RPC_CHAIN_MISMATCH/);source.rpc.getChainId=async()=>31337;
  const call=source.rpc.call;source.rpc.call=async()=>{throw Error('HISTORICAL_STATE_UNAVAILABLE');};await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/HISTORICAL_STATE_UNAVAILABLE/);source.rpc.call=call;
  const getBlock=source.rpc.getBlock;let reads=0;source.rpc.getBlock=async n=>n===1n&&++reads>1?header(1,1):getBlock(n);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'retry');assert.equal((await indexerSnapshot(db.pool,31337)).cursor,null);
 }finally{await db.close();}
});

test('large invoice recipient floors use exact integer division and the final recipient receives the remainder',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1),amount=70_000_000_000_000_001n;
  const invoice=event(b,0,'InvoiceCreated',{invoiceId:id,merchant:maker,amountDueRaw:amount,expiresAt:999999,recipients:[maker,address(22)],bps:[9000,1000],memoHash:hash(99)});
  const source=fixture([b,header(2),header(3)],new Map([[1n,[invoice]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);
  const rows=(await db.pool.query('SELECT amount_raw FROM invoice_recipients ORDER BY recipient_index')).rows;
  assert.deepEqual(rows.map(row=>row.amount_raw),['63000000000000000','7000000000000001']);
  assert.equal(rows.reduce((sum,row)=>sum+BigInt(row.amount_raw),0n),amount);
 }finally{await db.close();}
});
