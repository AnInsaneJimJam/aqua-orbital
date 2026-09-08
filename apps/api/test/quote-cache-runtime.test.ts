import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePaymentQuoteObservation} from '@orbital/sdk';
import {quoteRuntimeFixture} from './quote-runtime-fixture.js';
import {paymentRuntimeFixture} from './payment-runtime-fixture.js';
import {address} from './strategies-fixture.js';
const swap={kind:'swap' as const,wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'1000000',slippageBps:50,maxCrossings:16};
const quoteCount=(batches:any[][])=>batches.flat().filter(c=>String(c.id).endsWith(':quote')).length;
test('runtime retains quote batches across observations but repeats all identity and inspection reads',async()=>{
 const f=await quoteRuntimeFixture();try{const first=await f.runtime.observeQuote(f.configured,swap);assert.equal(first.status,'observed');assert.equal(quoteCount(f.requests),6);
  f.requests.length=0;const second=await f.runtime.observeQuote(f.configured,swap);assert.equal(second.status,'observed');if(first.status==='observed'&&second.status==='observed')assert.deepEqual(second.data,first.data);
  assert.equal(quoteCount(f.requests),0);assert.deepEqual(f.requests.map(b=>b.length),[3,8,8,2,3]);
 }finally{await f.close();}
});
test('payment cache hits preserve exact plans and report actual native work while payer context stays fresh',async()=>{
 const f=await paymentRuntimeFixture();try{
  const cold=await f.runtime.observePaymentQuote(f.configured,f.request);assert.equal(cold.status,'observed');if(cold.status!=='observed')return;const coldBatches=f.batches.length;
  f.batches.length=0;const warm=await f.runtime.observePaymentQuote(f.configured,f.request);assert.equal(warm.status,'observed');if(warm.status!=='observed')return;
  assert.deepEqual(warm.data.plan,cold.data.plan);assert.deepEqual(warm.data.search,cold.data.search);assert.equal(quoteCount(f.batches),0);
  const w=warm.data.work as typeof warm.data.work&{cacheHitMembers:number;cacheHitBatches:number};assert.equal(w.nativeBatches,f.batches.length);assert.equal(w.nativeBatches+w.cacheHitBatches,coldBatches);assert.equal(w.logicalMembers-w.cacheHitMembers,f.batches.flat().length);assert.equal(w.cacheHitMembers,w.quoteMembers);
  const {httpStatus,...body}=warm;assert.equal(decodePaymentQuoteObservation({...body,requestId:'cache-test',router:f.configured.router,adapter:f.configured.payments,deploymentStartBlock:f.configured.startBlock},httpStatus,f.configured,f.request).status,'observed');
  f.f.context.allowanceRaw=1000n;f.batches.length=0;const approved=await f.runtime.observePaymentQuote(f.configured,f.request);assert.equal(approved.status,'observed');if(approved.status==='observed')assert.equal(approved.data.approval,null);assert.equal(quoteCount(f.batches),0);assert.ok(f.batches.flat().some(c=>String(c.id).includes('allowance')));
  f.f.context.balanceRaw=133n;const unfunded=await f.runtime.observePaymentQuote(f.configured,f.request);assert.equal(unfunded.status,'unavailable');assert.equal(unfunded.data,null);
 }finally{await f.close();}
});
test('warm quotes cannot bypass final canonical identity or resync-required database coverage',async()=>{
 let corrupt=false,identities=0;const f=await quoteRuntimeFixture(async batch=>{if(corrupt&&batch.some(c=>c.method==='eth_chainId')&&++identities===2){batch.find(c=>c.method==='eth_getBlockByNumber').params[0]='0x4';}});
 try{const primed=await f.runtime.observeQuote(f.configured,swap);assert.equal(primed.status,'observed',JSON.stringify(primed));f.requests.length=0;corrupt=true;
  const orphan=await f.runtime.observeQuote(f.configured,swap);assert.equal(orphan.status,'unavailable');assert.equal(orphan.data,null);assert.equal(quoteCount(f.requests),0);assert.equal(identities,2);
  corrupt=false;f.requests.length=0;await f.f.db.pool.query("UPDATE indexer_state SET status='resync_required'");const resync=await f.runtime.observeQuote(f.configured,swap);assert.equal(resync.status,'unavailable');assert.equal(resync.data,null);assert.equal(f.requests.length,0);
 }finally{await f.close();}
});
