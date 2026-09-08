import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentRuntimeFixture as fixture} from './payment-runtime-fixture.js';
import {address,hash} from './strategies-fixture.js';
import type {PaymentQuoteRequest} from '@orbital/shared';
import type {PaymentQuoteObservation,PaymentQuoteUnavailable} from '../src/payment-service.js';
import type {QuoteOptions} from '../src/quote-service.js';

const read=(f:Awaited<ReturnType<typeof fixture>>,request=f.request,options?:QuoteOptions)=>(f.runtime as typeof f.runtime&{observePaymentQuote:(manifest:typeof f.configured,request:PaymentQuoteRequest,options?:QuoteOptions)=>Promise<PaymentQuoteObservation|PaymentQuoteUnavailable>}).observePaymentQuote(f.configured,request,options);
const swap={kind:'swap' as const,wallet:address(22),recipient:address(23),tokenIn:address(2),tokenOut:address(1),amountInRaw:'200',slippageBps:50,maxCrossings:16};

test('production payment runtime composes canonical PostgreSQL records and complete native RPC batches for direct and swap funding',async()=>{
 const f=await fixture();try{
  const direct=await read(f,{...f.request,tokenIn:f.configured.usdc});assert.equal(direct.status,'observed');if(direct.status==='observed')assert.equal(direct.data.amountInRaw,'100');assert.deepEqual(f.batches.map(b=>b.length),[3,7,7,3]);
  f.batches.length=0;const routed=await read(f);assert.equal(routed.status,'observed');if(routed.status!=='observed')return;
  assert.equal(routed.data.amountInRaw,'134');assert.equal(routed.data.work.logicalMembers,f.batches.flat().length);assert.equal(routed.data.work.nativeBatches,f.batches.length);
  for(const call of f.batches.flat()){assert.ok(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_call'].includes(call.method));if(call.method==='eth_call'){assert.equal(call.params[0].from,call.id.toString().includes('getStrategy')||call.id.toString().endsWith(':quote')?f.configured.payments.toLowerCase():f.request.payer.toLowerCase());}}
 }finally{await f.close();}
});

test('payment and swap share two admission slots until cancelled PostgreSQL work releases its clients',async()=>{
 const f=await fixture(),lock=await f.db.pool.connect();try{
  await lock.query('BEGIN');await lock.query('LOCK TABLE indexer_cursor IN ACCESS EXCLUSIVE MODE');
  const payment=read(f,f.request,{timeoutMs:50}),trading=f.runtime.observeQuote(f.configured,swap,{timeoutMs:50});
  assert.equal((await payment).code,'PAYMENT_QUOTE_TIMEOUT');assert.equal((await trading).code,'QUOTE_TIMEOUT');
  assert.equal((await read(f)).code,'PAYMENT_QUOTE_CAPACITY');assert.equal((await f.runtime.observeQuote(f.configured,swap)).code,'QUOTE_CAPACITY');assert.equal(f.batches.length,0);
  await lock.query('ROLLBACK');let result:Awaited<ReturnType<typeof read>>|undefined;
  for(let i=0;i<30;i++){result=await read(f);if(result.code!=='PAYMENT_QUOTE_CAPACITY')break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(result?.status,'observed');
 }finally{await lock.query('ROLLBACK');lock.release();await f.close();}
});

test('payment context shares the eight weighted RPC slots with other readers and releases them for recovery',async()=>{
 let reached!:()=>void,release!:()=>void;const arrived=new Promise<void>(resolve=>{reached=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
 const f=await fixture(async batch=>{if(batch.length===8){reached();await barrier;}});try{
  const pending=read(f);await arrived;await assert.rejects(f.runtime.metricsDependencies.readRpc(f.configured,[{height:'3',hash:hash(3)}]),/RPC_CAPACITY/);
  const second=await read(f);assert.equal(second.code,'PAYMENT_QUOTE_CAPACITY');assert.equal(second.httpStatus,429);release();assert.equal((await pending).status,'observed');assert.equal((await read(f)).status,'observed');
 }finally{release();await f.close();}
});

test('runtime shutdown cancels a payment context and starts no later search batches',async()=>{
 let reached!:()=>void,release!:()=>void;const arrived=new Promise<void>(resolve=>{reached=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
 const f=await fixture(async batch=>{if(batch.length===8){reached();await barrier;}});try{
  const pending=read(f);await arrived;await f.runtime.close();const result=await pending;assert.equal(result.code,'PAYMENT_QUOTE_CANCELLED');assert.equal(result.data,null);assert.equal(f.batches.length,2);
 }finally{release();await f.close();}
});
