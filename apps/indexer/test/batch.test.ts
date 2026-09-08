import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,getAddress,type AbiEvent,type Hex} from 'viem';
import {buildOrder,hashOrder,hashConfig,invoiceId,lifecycleAbi,lifecycleEventsAbi,paymentsEventsAbi,type Config} from '@orbital/sdk';
import {indexerSnapshot} from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncDeploymentOnce,type MaterializationRpc} from '../src/materializer.js';

const address=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'1',tokens:[{address:address(1),symbol:'USDC',decimals:6,mock:true},{address:address(2),symbol:'oUSD18',decimals:18,mock:true}]};
const maker=address(20),config:Config={schemaVersion:1,chainId:31337n,router:manifest.router,maker,makerNonce:0n,tokens:[address(1),address(2)],decimals:[6,18],tickKeys:[(1n<<64n)-1n],radiiInternal:[4n*10n**18n*(1n<<64n)],feePpm:500,initialAmountsRaw:[1_171_573n,1_171_572_875_253_809_903n]};
const orderHash=hashOrder(buildOrder(config)),id=invoiceId(31337n,manifest.payments,maker,0n);
const due=9_007_199_254_740_993n;
function header(n:number,branch=0){return {number:BigInt(n),hash:hash(branch*1000+n),parentHash:hash((n===8?0:branch)*1000+n-1),transactions:[hash(branch*1000+n+100)]};}
function event(block:ReturnType<typeof header>,index:number,name:string,args:Record<string,unknown>,emitter=manifest.payments){
 const entry=([...lifecycleEventsAbi,...paymentsEventsAbi] as readonly AbiEvent[]).find(item=>item.name===name)!;
 return {blockNumber:block.number,blockHash:block.hash,transactionHash:block.transactions[0]!,transactionIndex:0,logIndex:index,address:emitter,
  topics:encodeEventTopics({abi:[entry],eventName:name,args} as never) as Hex[],data:encodeAbiParameters(entry.inputs.filter(input=>!input.indexed),entry.inputs.filter(input=>!input.indexed).map(input=>args[input.name!]))};
}
function source(){
 let branch=0,active=0,maximum=0,chainReads=0,headReads=0;const logReads:bigint[]=[],hydrations:Hex[]=[];
 const block=(n:bigint)=>header(Number(n),n>=8n?branch:0);
 const logs=(b:ReturnType<typeof header>)=>b.number===1n?[
  event(b,0,'StrategyActivated',{maker,orderHash,configHash:hashConfig(config)},manifest.router),
  event(b,1,'InvoiceCreated',{invoiceId:id,merchant:maker,amountDueRaw:due,expiresAt:999999,recipients:[maker,address(21)],bps:[9000,1000],memoHash:hash(99)})
 ]:b.number===16n?[
  event(b,0,'StrategyRetired',{maker,orderHash,version:2n},manifest.router),
  branch?event(b,1,'InvoiceCancelled',{invoiceId:id,merchant:maker}):event(b,1,'InvoicePaid',{invoiceId:id,merchant:maker,payer:address(22),tokenIn:manifest.usdc,amountInRaw:due,receivedRaw:due,refundRaw:0n,routeHash:hash(0)})
 ]:[];
 async function measured<T>(read:()=>T,n=0):Promise<T>{active++;maximum=Math.max(maximum,active);try{await new Promise(resolve=>setTimeout(resolve,1+(n%3)));return read();}finally{active--;}}
 const rpc:MaterializationRpc={
  getChainId:()=>measured(()=>{chainReads++;return 31337;}),getBlockNumber:()=>measured(()=>{headReads++;return 20n;}),
  getBlock:n=>measured(()=>block(n),Number(n)),
  getLogs:(n,emitters,pin)=>measured(()=>{logReads.push(n);const b=block(n);assert.equal(pin,b.hash);assert.deepEqual(emitters,[manifest.aqua,manifest.router,manifest.payments].map(a=>a.toLowerCase()));return logs(b);},Number(n)),
  call:(request,pin)=>measured(()=>{const decoded=decodeFunctionData({abi:lifecycleAbi,data:request.data});assert.equal(decoded.functionName,'getStrategyConfig');assert.equal(decoded.args[0],orderHash);assert.equal(request.to.toLowerCase(),manifest.router.toLowerCase());assert.equal(pin.requireCanonical,true);assert.equal(pin.blockHash,block(1n).hash);hydrations.push(pin.blockHash);return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:config});}),
 };
 return {rpc,block,logs,fork:()=>{branch=1;},stats:()=>({active,maximum,chainReads,headReads,logReads,hydrations})};
}

test('bounded batch prefetches concurrently and commits lifecycle/invoice transitions in order through the confirmed head',async()=>{
 const db=await isolatedDatabase();try{
  const s=source();const result=await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16});
  assert.equal(result.status,'indexed');assert.equal(result.block,16n);assert.equal(result.logs,4);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.height,16n);
  assert.equal((await db.pool.query('SELECT lifecycle,version FROM strategies')).rows[0].lifecycle,'retired');
  assert.equal((await db.pool.query('SELECT status,amount_due_raw FROM invoices')).rows[0].status,'paid');
  assert.equal((await db.pool.query('SELECT input_raw FROM invoice_payments')).rows[0].input_raw,due.toString());
  assert.equal((await db.pool.query('SELECT count(*) FROM deployment_blocks')).rows[0].count,'16');
  const measured=s.stats();assert.equal(measured.maximum,8);assert.equal(measured.active,0);assert.equal(measured.chainReads,1);assert.equal(measured.headReads,1);assert.equal(measured.logReads.length,16);assert.equal(measured.hydrations.length,1);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).block,18n);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).status,'idle');
  assert.equal((await db.pool.query('SELECT count(*) FROM indexed_blocks')).rows[0].count,'18');
  assert.equal((await db.pool.query('SELECT count(*) FROM invoice_payments')).rows[0].count,'1');
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:65}),/INVALID_BLOCK_BATCH/);
 }finally{await db.close();}
});

test('a discontinuous prefetched parent chain or changed final canonical tip commits no batch blocks',async()=>{
 const db=await isolatedDatabase();try{
  const s=source(),read=s.rpc.getBlock;
  s.rpc.getBlock=async n=>n===8n?{...await read(n),parentHash:hash(99999)}:read(n);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).status,'retry');
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor,null);assert.equal(s.stats().logReads.length,0);
  s.rpc.getBlock=async n=>n===16n&&s.stats().logReads.length===16?header(16,1):read(n);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).status,'retry');
  for(const table of ['indexed_blocks','chain_events','strategy_snapshots','invoice_snapshots','deployment_cursor'])assert.equal((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'0',table);
  s.rpc.getBlock=read;
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).block,16n);
 }finally{await db.close();}
});

test('a failed middle block preserves only the committed prefix and resumes without duplicate events',async()=>{
 const db=await isolatedDatabase();try{
  const s=source(),read=s.rpc.getLogs;
  s.rpc.getLogs=async(n,...args)=>n===8n?[event(s.block(n),0,'InvoiceCancelled',{invoiceId:hash(999),merchant:maker})]:read(n,...args);
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16}),/INVALID_INVOICE_TRANSITION/);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.height,7n);
  assert.equal((await db.pool.query('SELECT height FROM deployment_cursor')).rows[0].height,'7');
  assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'unpaid');
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'2');
  s.rpc.getLogs=read;
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).block,18n);
  assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'paid');
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'4');
 }finally{await db.close();}
});

test('a completed batch still rolls back to the common ancestor and replays the replacement branch',async()=>{
 const db=await isolatedDatabase();try{
  const s=source();await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16});s.fork();
  const result=await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16});
  assert.equal(result.status,'rolled_back');assert.equal(result.block,7n);assert.equal(result.removedBlocks,9);
  assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'unpaid');
  assert.equal((await db.pool.query('SELECT lifecycle FROM strategies')).rows[0].lifecycle,'active');
  assert.equal((await syncDeploymentOnce(db.pool,manifest,s.rpc,{maxBlocks:16})).block,18n);
  assert.equal((await db.pool.query('SELECT status FROM invoices')).rows[0].status,'cancelled');
  assert.equal((await db.pool.query('SELECT count(*) FROM invoice_payments')).rows[0].count,'0');
  assert.equal((await db.pool.query('SELECT created_hash FROM invoices')).rows[0].created_hash,s.block(1n).hash);
  assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.hash,s.block(18n).hash);
 }finally{await db.close();}
});
