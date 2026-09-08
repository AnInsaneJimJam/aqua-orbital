import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import Fastify from 'fastify';
import {writeFile} from 'node:fs/promises';
import {createServer} from '../src/server.js';
import {createSwapQuoteLimiter,registerSwapQuotes} from '../src/quote-http.js';
import {swapQuoteObservationSchema} from '@orbital/shared';
import {decodeSwapQuoteObservation} from '@orbital/sdk';
import {quoteRuntimeFixture} from './quote-runtime-fixture.js';
import {address} from './strategies-fixture.js';
import {swapQuoteWireFixture} from './quote-http-fixture.js';
const body={wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'1000000',slippageBps:50,maxCrossings:16};
test('swap HTTP aliases expose only strict canonical non-executable observations through real runtime',async()=>{
 const f=await quoteRuntimeFixture(),app=await createServer({manifestPath:f.manifestPath,databaseUrl:f.f.db.pool.options.connectionString,logger:false});
 const handles:{request:import('node:http').IncomingMessage;response:import('node:http').ServerResponse;aborted:number;closed:number}[]=[];
 app.addHook('onRequest',async(req,reply)=>{handles.push({request:req.raw,response:reply.raw,aborted:req.raw.listenerCount('aborted'),closed:reply.raw.listenerCount('close')});});
 try{for(const prefix of ['', '/api/v1']){const r=await app.inject({method:'POST',url:`${prefix}/quotes/swap`,payload:body});assert.equal(r.statusCode,200);const result=r.json();assert.equal(swapQuoteObservationSchema.safeParse(result).success,true);assert.deepEqual(decodeSwapQuoteObservation(result,r.statusCode,f.configured,body),result);assert.equal(result.data.counts.quoted,6);assert.equal(result.data.best.config.router.toLowerCase(),f.configured.router.toLowerCase());assert.equal(result.financialExecutionEnabled,false);assert.equal(r.headers['cache-control'],'no-store');assert.ok(result.requestId);}
  assert.equal((await app.inject({method:'POST',url:'/quotes/payment',payload:{}})).statusCode,400);
  for(const h of handles){assert.ok(h.request.listenerCount('aborted')<=h.aborted);assert.ok(h.response.listenerCount('close')<=h.closed);}
 }finally{await app.close();await f.close();}
});
test('swap HTTP validates strict body/query/size and unavailable deployment with structured no-store errors',async()=>{
 const app=await createServer({logger:false});try{for(const [url,payload,status] of [['/quotes/swap',{...body,rpcUrl:'http://private.invalid'},400],['/api/v1/quotes/swap?blockTimestamp=1',body,400],['/quotes/swap',{...body,amountInRaw:'1e18'},400],['/quotes/swap',body,503]] as const){const r=await app.inject({method:'POST',url,payload});assert.equal(r.statusCode,status);assert.equal(r.headers['cache-control'],'no-store');assert.equal(swapQuoteObservationSchema.safeParse(r.json()).success,true);assert.equal(r.json().data,null);assert.ok(r.json().requestId);assert.doesNotMatch(r.body,/private\.invalid|postgresql:/);}
  const r=await app.inject({method:'POST',url:'/api/v1/quotes/swap',headers:{'content-type':'application/json'},payload:JSON.stringify({text:'x'.repeat(17000)})});assert.equal(r.statusCode,413);assert.equal(r.json().data,null);assert.equal(r.headers['cache-control'],'no-store');
 }finally{await app.close();}
});
test('both HTTP aliases share burst admission and do not create a second quote budget',async()=>{
 const app=await createServer({logger:false});try{for(let i=0;i<5;i++)assert.equal((await app.inject({method:'POST',url:i%2?'/api/v1/quotes/swap':'/quotes/swap',headers:{'x-forwarded-for':`192.0.2.${i+1}`},payload:body})).statusCode,503);
  const blocked=await app.inject({method:'POST',url:'/api/v1/quotes/swap',headers:{'x-forwarded-for':'192.0.2.99'},payload:body});assert.equal(blocked.statusCode,429);assert.equal(blocked.json().data,null);assert.equal(blocked.json().retryable,true);assert.equal(blocked.headers['cache-control'],'no-store');
 }finally{await app.close();}
});
test('admission retains bounded IP state, rolling30 and burst5 with monotonic refill and idle expiry',()=>{
 let time=0;const limit=createSwapQuoteLimiter(()=>time,2);for(let i=0;i<5;i++)assert.equal(limit('a').allowed,true);assert.equal(limit('a').allowed,false);time=2000;assert.equal(limit('a').allowed,true);
 assert.equal(limit('b').allowed,true);assert.equal(limit('c').allowed,false);time=61000;assert.equal(limit('c').allowed,false);time=62000;assert.equal(limit('c').allowed,true);
 time=0;const rolling=createSwapQuoteLimiter(()=>time);for(let i=0;i<5;i++)assert.equal(rolling('a').allowed,true);for(let i=1;i<=25;i++){time=i*2000;assert.equal(rolling('a').allowed,true);}time=52000;assert.equal(rolling('a').allowed,false);time=60000;assert.equal(rolling('a').allowed,true);
});
test('deployment replacement during quote work discards an otherwise completed observation',async()=>{
 let identity=0;const f=await quoteRuntimeFixture(async batch=>{if(batch.length===3&&++identity===2)await writeFile(f.manifestPath,JSON.stringify({...f.configured,verified:false}));}),app=await createServer({manifestPath:f.manifestPath,databaseUrl:f.f.db.pool.options.connectionString,logger:false});
 try{const r=await app.inject({method:'POST',url:'/quotes/swap',payload:body});assert.equal(r.statusCode,503);assert.equal(r.json().data,null);assert.equal(r.json().code,'QUOTE_DEPLOYMENT_CHANGED');}finally{await app.close();await f.close();}
});
test('a malformed canonical identity response through real HTTP cannot expose partial quote data',async()=>{
 let wrong=false;const f=await quoteRuntimeFixture(async batch=>{if(wrong){const header=batch.find(r=>r.method==='eth_getBlockByNumber');if(header)header.params[0]='0x4';}}),app=await createServer({manifestPath:f.manifestPath,databaseUrl:f.f.db.pool.options.connectionString,logger:false});
 try{assert.equal((await app.inject({method:'POST',url:'/quotes/swap',payload:body})).statusCode,200);wrong=true;f.requests.length=0;const result=await app.inject({method:'POST',url:'/api/v1/quotes/swap',payload:body});assert.equal(result.statusCode,503);assert.equal(result.json().data,null);assert.equal(result.json().code,'QUOTE_RPC_UNAVAILABLE');assert.equal(f.requests.length,1);assert.equal(swapQuoteObservationSchema.safeParse(result.json()).success,true);}finally{await app.close();await f.close();}
});
test('actual client disconnect cancels the active RPC group without starting quote batches and later requests recover',async()=>{
 let release!:()=>void,reached!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{reached=resolve;});let hold=false;
 const f=await quoteRuntimeFixture(async batch=>{if(hold&&batch.length===8){reached();await barrier;}}),app=await createServer({manifestPath:f.manifestPath,databaseUrl:f.f.db.pool.options.connectionString,logger:false});
 try{assert.equal((await app.inject({method:'POST',url:'/quotes/swap',payload:body})).statusCode,200);f.requests.length=0;hold=true;const base=await app.listen({host:'127.0.0.1',port:0});
  const req=httpRequest(`${base}/api/v1/quotes/swap`,{method:'POST',headers:{'content-type':'application/json'}},()=>{});req.on('error',()=>{});req.end(JSON.stringify(body));await arrived;req.destroy();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(f.requests.length,2);hold=false;release();
  const recovered=await app.inject({method:'POST',url:'/quotes/swap',payload:body});assert.equal(recovered.statusCode,200);assert.equal(recovered.json().financialExecutionEnabled,false);
 }finally{release();await app.close();await f.close();}
});
test('final manifest reread cannot send an observation that expired or became stale after the service completed',async()=>{
 for(const [elapsed,code] of [[11000,'QUOTE_INDEXER_STALE'],[21000,'QUOTE_EXPIRED']] as const){const f=swapQuoteWireFixture(),app=Fastify({logger:false});let now=1700000003200,reads=0;
  registerSwapQuotes(app,async()=>{if(++reads===2)now+=elapsed;return f.manifest;},async()=>f.observed as any,()=>now);
  try{const r=await app.inject({method:'POST',url:'/quotes/swap',payload:f.request});assert.equal(r.statusCode,503);assert.equal(r.json().code,code);assert.equal(r.json().data,null);assert.equal(reads,2);}finally{await app.close();}
 }
});
