import test from 'node:test';
import assert from 'node:assert/strict';
import {requestUntilBarrier,awaitServiceBarrier} from './http-barrier.js';
import Fastify from 'fastify';
import {decodePaymentQuoteObservation} from '@orbital/sdk';
import {registerPaymentQuotes} from '../src/payment-http.js';
import {registerSwapQuotes,createSwapQuoteLimiter} from '../src/quote-http.js';
import {observePaymentQuote} from '../src/payment-service.js';
import {paymentServiceFixture as fixture} from './payment-service-fixture.js';
import {paymentRuntimeFixture} from './payment-runtime-fixture.js';
import {createServer} from '../src/server.js';

async function setup(f=fixture()){
 const app=Fastify({logger:false});let loads=0,observations=0;
 const loader={value:async()=>{loads++;return f.input.manifest;}};
 registerPaymentQuotes(app,()=>loader.value(),async(m,r,o)=>{observations++;return observePaymentQuote(m,r,f.deps,{...o,now:()=>f.now});},()=>f.now);
 return {app,f,loader,loads:()=>loads,observations:()=>observations};
}
test('both public aliases expose validated direct/swap observations with exact unsigned review plans',async()=>{
 for(const direct of [false,true]){const {app,f}=await setup(fixture(direct));try{
  for(const url of ['/quotes/payment','/api/v1/quotes/payment']){const response=await app.inject({method:'POST',url,payload:f.input.request});assert.equal(response.statusCode,200,response.body);assert.equal(response.headers['cache-control'],'no-store');
   const decoded=decodePaymentQuoteObservation(response.json(),200,f.input.manifest,f.input.request,f.now+1000);assert.equal(decoded.status,'observed');if(decoded.status==='observed'){assert.equal(decoded.data.amountInRaw,direct?'100':'134');assert.equal(decoded.data.reviewOnly,true);assert.equal(decoded.financialExecutionEnabled,false);assert.equal('httpStatus' in decoded,false);}}
 }finally{await app.close();}}
});
test('invalid public fields and query parameters fail before discovery or wallet/contract reads',async()=>{
 const f=await setup();try{
  for(const request of [{url:'/quotes/payment?block=3',payload:f.f.input.request},{url:'/quotes/payment',payload:{...f.f.input.request,minimumOutRaw:'1'}},{url:'/api/v1/quotes/payment',payload:{...f.f.input.request,signer:'private'}}]){const response=await f.app.inject({method:'POST',...request});assert.equal(response.statusCode,400);assert.equal(response.json().financialExecutionEnabled,false);}
  assert.equal(f.loads(),0);assert.equal(f.observations(),0);
 }finally{await f.app.close();}
});
test('canonical absence retains verified scope while funding failure uses a bounded unavailable envelope',async()=>{
 const absent=fixture();absent.invoices.items=[];const a=await setup(absent);try{const response=await a.app.inject({method:'POST',url:'/quotes/payment',payload:absent.input.request});assert.equal(response.statusCode,404);assert.equal(decodePaymentQuoteObservation(response.json(),404,absent.input.manifest,absent.input.request,absent.now+1000).canonicalVerification,'verified_at_pin');assert.equal(a.loads(),2);}finally{await a.app.close();}
 const empty=fixture(true);empty.context.balanceRaw=99n;const b=await setup(empty);try{const response=await b.app.inject({method:'POST',url:'/quotes/payment',payload:empty.input.request});assert.equal(response.statusCode,422);assert.equal(response.json().code,'PAYMENT_BALANCE_INSUFFICIENT');assert.equal(decodePaymentQuoteObservation(response.json(),422,empty.input.manifest,empty.input.request,empty.now+1000).data,null);}finally{await b.app.close();}
});
test('final deployment replacement or clock expiry cannot publish a completed observation',async()=>{
 for(const mode of ['manifest','clock']){const f=await setup(fixture(true));let reads=0;f.loader.value=async()=>{if(++reads===2){if(mode==='manifest')return {...f.f.input.manifest,verified:false};f.f.now+=21000;}return f.f.input.manifest;};try{
  const response=await f.app.inject({method:'POST',url:'/quotes/payment',payload:f.f.input.request});assert.equal(response.statusCode,503);assert.equal(response.json().data,null);
 }finally{await f.app.close();}}
});
test('malformed service plans are rejected by the HTTP/SDK boundary before publication',async()=>{
 const f=fixture(true),app=Fastify({logger:false});registerPaymentQuotes(app,async()=>f.input.manifest,async(m,r,o)=>{const result=await observePaymentQuote(m,r,f.deps,{...o,now:()=>f.now});if(result.status==='observed')result.data.plan.data+='00';return result;},()=>f.now);
 try{const response=await app.inject({method:'POST',url:'/quotes/payment',payload:f.input.request});assert.equal(response.statusCode,503);assert.equal(response.json().data,null);}finally{await app.close();}
});
test('all swap/payment aliases consume one per-IP rate budget',async()=>{
 const f=fixture(true),app=Fastify({logger:false}),limit=createSwapQuoteLimiter(()=>0);
 registerSwapQuotes(app,async()=>null,undefined,undefined,limit);
 registerPaymentQuotes(app,async()=>null,undefined,undefined,limit);
 try{for(let i=0;i<5;i++){const response=await app.inject({method:'POST',url:i%2?'/api/v1/quotes/payment':'/quotes/swap',payload:{}});assert.equal(response.statusCode,400);}
  for(const url of ['/quotes/payment','/api/v1/quotes/swap']){const response=await app.inject({method:'POST',url,payload:f.input.request});assert.equal(response.statusCode,429);assert.equal(response.headers['retry-after'],'2');}
 }finally{await app.close();}
});
test('real native RPC and PostgreSQL payment runtime is compatible with both public response and SDK validation',async()=>{
 const f=await paymentRuntimeFixture(),app=Fastify({logger:false});
 try{registerPaymentQuotes(app,async()=>f.configured,f.runtime.observePaymentQuote);const response=await app.inject({method:'POST',url:'/api/v1/quotes/payment',payload:f.request});assert.equal(response.statusCode,200,response.body);assert.equal(decodePaymentQuoteObservation(response.json(),200,f.configured,f.request).status,'observed');assert.ok(f.batches.length>4);}finally{await app.close();await f.close();}
});
test('production registration supplies both aliases and structured no-store body-limit failures',async()=>{
 const app=await createServer({logger:false});try{
  const f=fixture();for(const url of ['/quotes/payment','/api/v1/quotes/payment']){const response=await app.inject({method:'POST',url,payload:f.input.request});assert.equal(response.statusCode,503);assert.equal(response.json().code,'PAYMENT_DEPLOYMENT_UNAVAILABLE');assert.equal(response.headers['cache-control'],'no-store');}
  const large=await app.inject({method:'POST',url:'/quotes/payment',payload:{large:'x'.repeat(20000)}});assert.equal(large.statusCode,413);assert.equal(large.json().code,'PAYMENT_BODY_TOO_LARGE');assert.equal(large.json().paymentEligibilityVerified,false);
 }finally{await app.close();}
});
test('the total HTTP deadline bounds both initial and final manifest reads',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const blockedRead of [1,2]){
  const f=fixture(true),app=Fastify({logger:false});let reached!:()=>void,reads=0;
  const arrived=new Promise<void>(resolve=>{reached=resolve;});
  registerPaymentQuotes(app,async()=>{if(++reads===blockedRead){reached();return new Promise(()=>{});}return f.input.manifest;},async(m,r,o)=>observePaymentQuote(m,r,f.deps,{...o,now:()=>f.now}),()=>f.now);
  try{const pending=app.inject({method:'POST',url:'/quotes/payment',payload:f.input.request});await awaitServiceBarrier(arrived,pending);t.mock.timers.tick(20000);const response=await pending;
   assert.equal(response.statusCode,504,response.body);assert.equal(response.json().code,'PAYMENT_HTTP_TIMEOUT');assert.equal(response.json().data,null);assert.equal(reads,blockedRead);
  }finally{await app.close();}
 }
});
test('a real client disconnect aborts payment reads and subsequent requests recover shared capacity',async()=>{
 let release!:()=>void,reached!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{reached=resolve;});let hold=true;
 const f=await paymentRuntimeFixture(async batch=>{if(hold&&batch.length===8){reached();await barrier;}}),app=Fastify({logger:false});
 try{registerPaymentQuotes(app,async()=>f.configured,f.runtime.observePaymentQuote);const base=await app.listen({host:'127.0.0.1',port:0});
  const req=await requestUntilBarrier(`${base}/quotes/payment`,f.request,arrived);req.destroy();
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(f.batches.length,2);hold=false;release();
  const recovered=await app.inject({method:'POST',url:'/api/v1/quotes/payment',payload:f.request});assert.equal(recovered.statusCode,200,recovered.body);assert.equal(decodePaymentQuoteObservation(recovered.json(),200,f.configured,f.request).status,'observed');
 }finally{release();await app.close();await f.close();}
});
test('a response before the expected RPC barrier fails with its bounded status/body instead of hanging',async()=>{
 const app=Fastify({logger:false});registerPaymentQuotes(app,async()=>null,undefined);
 try{const base=await app.listen({host:'127.0.0.1',port:0});await assert.rejects(requestUntilBarrier(`${base}/quotes/payment`,fixture().input.request,new Promise(()=>{})),/503.*PAYMENT_DEPLOYMENT_UNAVAILABLE/s);}finally{await app.close();}
});
