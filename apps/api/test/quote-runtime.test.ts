import test from 'node:test';
import assert from 'node:assert/strict';
import {address,hash,manifest} from './strategies-fixture.js';
import {quoteRuntimeFixture as fixture} from './quote-runtime-fixture.js';
const intent={kind:'swap' as const,wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'1000000',slippageBps:50,maxCrossings:16};
test('internal production runtime obtains canonical swap and adapter quote observations through native HTTP batches',async()=>{
 const f=await fixture();try{assert.equal(typeof (f.runtime as any).observeQuote,'function');const result=await (f.runtime as any).observeQuote(f.configured,intent);assert.equal(result.status,'observed');assert.equal(result.financialExecutionEnabled,false);assert.equal(result.data.counts.quoted,6);assert.equal(result.data.best.expiresAt,(f.timestamp+20n).toString());assert.deepEqual(f.requests.map(b=>b.length),[3,8,8,2,6,3]);
  assert.ok(f.requests.flat().filter(c=>c.method==='eth_call').every(c=>c.params[0].from===address(22).toLowerCase()));assert.ok(f.requests.flat().every(c=>!/^eth_(send|sign)/.test(c.method)));
  f.requests.length=0;const payment=await (f.runtime as any).observeQuote(f.configured,{kind:'payment',payer:address(22),tokenIn:address(3),amountInRaw:'1000000000000000000',minimumOutRaw:'1234567',invoiceExpiresAt:(f.timestamp+10n).toString(),maxCrossings:16});assert.equal(payment.status,'observed');assert.equal(payment.data.best.payer,address(22).toLowerCase());assert.equal(payment.data.best.caller,manifest.payments.toLowerCase());assert.equal(payment.data.best.minimumOutRaw,'1234567');assert.equal(payment.data.best.expiresAt,(f.timestamp+10n).toString());assert.ok(f.requests.flat().filter(c=>c.method==='eth_call').every(c=>c.params[0].from===manifest.payments.toLowerCase()));
 }finally{await f.close();}
});
test('runtime bounds admitted quote services and shares eight logical RPC slots with existing readers',async()=>{
 let release!:()=>void,reached!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{reached=resolve;});
 const f=await fixture(async batch=>{if(batch.length===8){reached();await barrier;}});
 try{assert.equal(typeof (f.runtime as any).observeQuote,'function');const first=(f.runtime as any).observeQuote(f.configured,intent);await arrived;
  await assert.rejects(()=>f.runtime.metricsDependencies.readRpc(f.configured,[{height:'3',hash:hash(3)}]),/RPC_CAPACITY/);
  const second=(f.runtime as any).observeQuote(f.configured,intent),third=await (f.runtime as any).observeQuote(f.configured,intent);assert.equal(third.code,'QUOTE_CAPACITY');assert.equal(third.data,null);assert.equal((await second).data,null);release();assert.equal((await first).status,'observed');
  assert.equal((await (f.runtime as any).observeQuote(f.configured,intent)).status,'observed');
 }finally{release();await f.close();}
});
test('runtime shutdown cancels the active batch and never starts later quote work',async()=>{
 let release!:()=>void,reached!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{reached=resolve;});
 const f=await fixture(async batch=>{if(batch.length===8){reached();await barrier;}});
 try{assert.equal(typeof (f.runtime as any).observeQuote,'function');const pending=(f.runtime as any).observeQuote(f.configured,intent);await arrived;await f.runtime.close();const result=await pending;assert.equal(result.code,'QUOTE_CANCELLED');assert.equal(result.data,null);assert.equal(f.requests.length,2);release();
 }finally{release();await f.close();}
});
test('timed-out service admission remains occupied until its pending database transaction has settled',async()=>{
 const f=await fixture(),lock=await f.f.db.pool.connect();try{assert.equal(typeof (f.runtime as any).observeQuote,'function');await lock.query('BEGIN');await lock.query('LOCK TABLE indexer_cursor IN ACCESS EXCLUSIVE MODE');
  const first=(f.runtime as any).observeQuote(f.configured,intent,{timeoutMs:50}),second=(f.runtime as any).observeQuote(f.configured,intent,{timeoutMs:50});assert.equal((await first).code,'QUOTE_TIMEOUT');assert.equal((await second).code,'QUOTE_TIMEOUT');
  const third=await (f.runtime as any).observeQuote(f.configured,intent,{timeoutMs:50});assert.equal(third.code,'QUOTE_CAPACITY');assert.equal(f.requests.length,0);await lock.query('ROLLBACK');
  let recovered:any;for(let i=0;i<30;i++){recovered=await (f.runtime as any).observeQuote(f.configured,intent);if(recovered.code!=='QUOTE_CAPACITY')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(recovered.status,'observed');
 }finally{await lock.query('ROLLBACK');lock.release();await f.close();}
});
