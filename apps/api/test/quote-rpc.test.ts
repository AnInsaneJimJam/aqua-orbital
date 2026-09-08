import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {readQuoteIdentity,readQuoteBatch,type QuoteRpcOptions,type QuoteRpcPhase} from '../src/quote-rpc.js';
import {prepareRouting,prepareWholeSizeQuotes,type StaticReadCall,type StaticReadResult} from '../src/route-selection.js';
import {routingFixture} from './route-selection-fixture.js';
import {manifest,hash,address} from './strategies-fixture.js';

type Call={jsonrpc:'2.0';id:string|number;method:string;params:unknown[]};
const pin={height:'3',hash:hash(3)},MAX=256*1024;
const identity=(call:Call)=>call.method==='eth_chainId'?'0x7a69':call.method==='eth_blockNumber'?'0x5':{number:'0x3',hash:pin.hash,timestamp:'0x6553f103'};
const ok=(c:Call,result:unknown)=>({jsonrpc:'2.0',id:c.id,result});
const response=(calls:Call[],value:(c:Call)=>unknown=identity)=>new Response(JSON.stringify(calls.map(c=>ok(c,value(c))).reverse()));
function setup(handler:(calls:Call[],signal:AbortSignal)=>Promise<Response>=async calls=>response(calls)){
 let active=0,releases=0;const weights:number[]=[],calls:Call[][]=[],signals:AbortSignal[]=[],shutdown=new AbortController(),cancel=new AbortController();
 const options:QuoteRpcOptions={shutdownSignal:shutdown.signal,signal:cancel.signal,reserve(weight){weights.push(weight);if(active+weight>8)throw Error('RPC_CAPACITY');active+=weight;return()=>{active-=weight;releases++;};},fetcher:async(url,init)=>{
  assert.equal(String(url),manifest.rpcUrl);assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');
  const batch=JSON.parse(String(init?.body)) as Call[];assert.ok(Array.isArray(batch));assert.equal(active,batch.length);assert.ok(batch.length<=8);calls.push(batch);signals.push(init!.signal!);return handler(batch,init!.signal!);
 }};
 return {options,calls,signals,weights,shutdown,cancel,active:()=>active,releases:()=>releases};
}
function readOnly(calls:Call[]){assert.ok(calls.every(c=>['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_call'].includes(c.method)));}
function rawResults(rows:StaticReadResult[]){return new Map(rows.map(r=>[r.request.id,r.status==='fulfilled'?r.data:'0x']));}

test('identity is one reserved native three-read batch with mandatory canonical timestamp',async()=>{
 const f=setup(),r=await readQuoteIdentity(manifest,pin,f.options);
 assert.deepEqual(r,{chainId:31337,head:5n,block:{...pin,timestamp:1700000003n}});assert.deepEqual(f.weights,[3]);assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0]!.map(c=>c.method),['eth_chainId','eth_blockNumber','eth_getBlockByNumber']);assert.deepEqual(f.calls[0]![2]!.params,['0x3',false]);
 readOnly(f.calls[0]!);assert.equal(f.active(),0);assert.equal(f.releases(),1);assert.equal(getEventListeners(f.shutdown.signal,'abort').length,0);assert.equal(getEventListeners(f.cancel.signal,'abort').length,0);
});
test('inspection batches are regenerated, bounded to eight, hash pinned and returned in planned order',async()=>{
 const fixture=routingFixture(3),plan=prepareRouting(fixture.input),data=rawResults(fixture.inspections(plan.inspectionCalls));
 const f=setup(async calls=>response(calls,c=>data.get(String(c.id))));
 const first=await readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:0},f.options),last=await readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:1},f.options);
 assert.deepEqual(first,fixture.inspections(plan.batches[0]!));assert.deepEqual(last,fixture.inspections(plan.batches[1]!));assert.deepEqual(f.weights,[8,1]);assert.equal(f.releases(),2);
 for(const batch of f.calls)for(const c of batch){assert.equal(c.method,'eth_call');assert.deepEqual(c.params[1],{blockHash:pin.hash,requireCanonical:true});assert.equal((c.params[0] as {to:string}).to,manifest.router.toLowerCase());}
});
test('quote phase regenerates complete calldata from inspected state and preserves payment adapter caller',async()=>{
 const fixture=routingFixture(2);fixture.input.intent={kind:'payment',payer:address(22),tokenIn:address(3),amountInRaw:'9007199254740993',minimumOutRaw:'1',invoiceExpiresAt:'1700001000',maxCrossings:16};
 const inspections=fixture.inspections(prepareRouting(fixture.input).inspectionCalls),plan=prepareWholeSizeQuotes(fixture.input,inspections),rows=fixture.quotes(plan.quoteCalls),data=rawResults(rows);
 const f=setup(async calls=>response(calls,c=>data.get(String(c.id)))),r=await readQuoteBatch(fixture.input,{kind:'quote',batchIndex:0,observations:inspections},f.options);
 assert.deepEqual(r,rows);assert.deepEqual(f.weights,[2]);for(const c of f.calls[0]!){assert.equal((c.params[0] as {from:string}).from,manifest.payments.toLowerCase());assert.equal(c.method,'eth_call');}
});
test('invalid input, phase, pin, configuration and cancelled work never reserve or fetch',async()=>{
 const fixture=routingFixture();
 for(const phase of [{kind:'inspection',batchIndex:-1},{kind:'inspection',batchIndex:999},{kind:'inspection',batchIndex:0.5},{kind:'inspection',batchIndex:0,request:{to:address(99)}},{kind:'other',batchIndex:0}]){
  const f=setup();await assert.rejects(readQuoteBatch(fixture.input,phase as QuoteRpcPhase,f.options));assert.deepEqual(f.weights,[]);assert.equal(f.calls.length,0);
 }
 for(const [m,p] of [[{...manifest,verified:false},pin],[{...manifest,rpcUrl:'ftp://example.invalid'},pin],[manifest,{...pin,height:'03'}],[manifest,{...pin,height:'0'}],[manifest,{...pin,hash:'0x12'}]]){
  const f=setup();await assert.rejects(readQuoteIdentity(m as typeof manifest,p as typeof pin,f.options));assert.deepEqual(f.weights,[]);
 }
 for(const key of ['shutdown','cancel'] as const){const f=setup();f[key].abort();await assert.rejects(readQuoteIdentity(manifest,pin,f.options));assert.deepEqual(f.weights,[]);}
 const f=setup(),bad=fixture.inspections(prepareRouting(fixture.input).inspectionCalls);bad[0]!.request.params[0].to=address(99);
 await assert.rejects(readQuoteBatch(fixture.input,{kind:'quote',batchIndex:0,observations:bad},f.options));assert.deepEqual(f.weights,[]);
});
test('reservation failure makes no request and does not release capacity it never acquired',async()=>{
 const f=setup();f.options.reserve=()=>{throw Error('RPC_CAPACITY');};await assert.rejects(readQuoteIdentity(manifest,pin,f.options),/RPC_CAPACITY/);assert.equal(f.calls.length,0);assert.equal(f.releases(),0);
});
test('wrong chain, noncanonical quantities, missing timestamp, wrong hash and shallow head fail closed',async()=>{
 for(const mutate of [(c:Call)=>c.method==='eth_chainId'?'0x1':identity(c),(c:Call)=>c.method==='eth_blockNumber'?'0x05':identity(c),(c:Call)=>c.method==='eth_blockNumber'?'0x4':identity(c),
  (c:Call)=>c.method==='eth_getBlockByNumber'?{number:'0x3',hash:pin.hash}:identity(c),(c:Call)=>c.method==='eth_getBlockByNumber'?{number:'0x2',hash:pin.hash,timestamp:'0x1'}:identity(c),
  (c:Call)=>c.method==='eth_getBlockByNumber'?{number:'0x3',hash:hash(99),timestamp:'0x1'}:identity(c)]){
  const f=setup(async calls=>response(calls,mutate));await assert.rejects(readQuoteIdentity(manifest,pin,f.options));assert.equal(f.releases(),1);assert.equal(f.calls.length,1);
 }
});
test('missing, duplicate, unknown and mistyped IDs or malformed envelopes reject the whole batch without retry',async()=>{
 for(const mode of ['missing','duplicate','unknown','typed','single','both','version'] as const){
  const f=setup(async calls=>{let rows:unknown=calls.map(c=>ok(c,identity(c)));const list=rows as Record<string,unknown>[];
   if(mode==='missing')list.pop();if(mode==='duplicate')list[1]=list[0]!;if(mode==='unknown')list[0]!.id='unknown';if(mode==='typed')list[0]!.id=String(list[0]!.id);if(mode==='single')rows=list[0];if(mode==='both')list[0]!.error={code:3,message:'execution reverted',data:'0x'};if(mode==='version')list[0]!.jsonrpc='1.0';return new Response(JSON.stringify(rows));});
  await assert.rejects(readQuoteIdentity(manifest,pin,f.options));assert.equal(f.calls.length,1);assert.equal(f.releases(),1);
 }
});
test('only explicit EVM reverts are per-call failures, with no remote error details returned',async()=>{
 const fixture=routingFixture(1),plan=prepareRouting(fixture.input),data=rawResults(fixture.inspections(plan.inspectionCalls));
 for(const code of [3,-32000]){const f=setup(async calls=>new Response(JSON.stringify(calls.map((c,i)=>i===1?{jsonrpc:'2.0',id:c.id,error:{code,message:'execution reverted: sensitive detail',data:'0x08c379a0'}}:ok(c,data.get(String(c.id)))))));
  const r=await readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:0},f.options);assert.deepEqual(r[1],{request:plan.inspectionCalls[1],status:'rejected',reason:'revert'});assert.equal(r[0]!.status,'fulfilled');assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(r).includes('sensitive'));
 }
 for(const error of [{code:-32601,message:'unsupported method',data:'0x'},{code:-32000,message:'header not found',data:'0x'},{code:-32000,message:'execution reverted'},{code:3,message:'execution reverted',data:{data:'0x'}},{code:3,message:'execution reverted',data:'0x1'}]){
  const f=setup(async calls=>new Response(JSON.stringify(calls.map(c=>({jsonrpc:'2.0',id:c.id,error})))));await assert.rejects(readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:0},f.options));assert.equal(f.calls.length,1);assert.equal(f.releases(),1);
 }
});
test('nonhex, odd hex, malformed JSON and invalid UTF8 never become partial observations',async()=>{
 const fixture=routingFixture(1);
 for(const data of ['0x1','xyz',null]){const f=setup(async calls=>response(calls,()=>data));await assert.rejects(readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:0},f.options));assert.equal(f.releases(),1);}
 for(const value of ['{not-json',new Uint8Array([0xff])]){const f=setup(async()=>new Response(value));await assert.rejects(readQuoteIdentity(manifest,pin,f.options));assert.equal(f.releases(),1);}
});
test('aggregate stream and per-result byte limits reject oversized responses before observations escape',async()=>{
 const fixture=routingFixture(3);
 for(const kind of ['announced','stream','member'] as const){const f=setup(async calls=>kind==='announced'?new Response('[]',{headers:{'content-length':String(8*MAX+1)}}):kind==='stream'?new Response(' '.repeat(8*MAX+1)):response(calls,c=>c===calls[0]?'0x'+'00'.repeat(MAX):'0x'));
  await assert.rejects(readQuoteBatch(fixture.input,{kind:'inspection',batchIndex:0},f.options));assert.equal(f.releases(),1);assert.equal(f.calls.length,1);
 }
});
test('only transport failures retry twice under one reservation and native batch identity is stable',async()=>{
 let attempt=0;const f=setup(async calls=>{if(++attempt===1)return new Response('private provider detail',{status:503});if(attempt===2)throw Error('private endpoint token');return response(calls);});
 const started=performance.now();await readQuoteIdentity(manifest,pin,f.options);assert.equal(attempt,3);assert.ok(performance.now()-started>=950);assert.deepEqual(f.weights,[3]);assert.equal(f.releases(),1);assert.deepEqual(f.calls[0],f.calls[2]);
});
test('stalled fetch and streamed body deadlines abort native work and always release capacity',async()=>{
 for(const stage of ['fetch','body']){let cancelled=false;const f=setup(async(_calls,signal)=>{signal.addEventListener('abort',()=>{cancelled=true;},{once:true});return stage==='fetch'?new Promise<Response>(()=>{}):new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('['));}}));});
  const started=performance.now();await assert.rejects(readQuoteIdentity(manifest,pin,{...f.options,timeoutMs:30}));assert.ok(performance.now()-started<1000);assert.equal(cancelled,true);assert.equal(f.releases(),1);assert.equal(f.active(),0);
 }
});
test('caller and shutdown cancellation interrupt retries and remove listeners for later work',async()=>{
 for(const source of ['shutdown','cancel'] as const){const f=setup(async()=>new Response('busy',{status:429})),pending=readQuoteIdentity(manifest,pin,f.options);setTimeout(()=>f[source].abort(),25);await assert.rejects(pending);assert.equal(f.calls.length,1);assert.equal(f.releases(),1);assert.equal(getEventListeners(f.shutdown.signal,'abort').length,0);assert.equal(getEventListeners(f.cancel.signal,'abort').length,0);}
});
test('ready empty chunks cannot starve the monotonic body deadline',async()=>{
 let chunks=0;const f=setup(async()=>new Response(new ReadableStream({pull(c){if(++chunks===50000)c.close();else c.enqueue(new Uint8Array());}})));
 await assert.rejects(readQuoteIdentity(manifest,pin,{...f.options,timeoutMs:5}));assert.ok(chunks<50000);assert.equal(f.releases(),1);
});
test('one short total timeout also covers retry wait and rejects invalid deadlines before reservation',async()=>{
 const f=setup(async()=>new Response('busy',{status:503}));await assert.rejects(readQuoteIdentity(manifest,pin,{...f.options,timeoutMs:30}));assert.equal(f.calls.length,1);assert.equal(f.releases(),1);
 for(const timeoutMs of [0,8001,1.5,NaN]){const f=setup();await assert.rejects(readQuoteIdentity(manifest,pin,{...f.options,timeoutMs}));assert.equal(f.calls.length,0);assert.deepEqual(f.weights,[]);}
});
test('actual localhost JSON-RPC supports native identity and inspection arrays with unordered responses',async()=>{
 const fixture=routingFixture(3),plan=prepareRouting(fixture.input),data=rawResults(fixture.inspections(plan.inspectionCalls)),batches:Call[][]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const calls=JSON.parse(Buffer.concat(chunks).toString()) as Call[];batches.push(calls);res.end(JSON.stringify(calls.map(c=>ok(c,c.method==='eth_call'?data.get(String(c.id)):identity(c))).reverse()));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const f=setup();
 try{const deployed={...manifest,rpcUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}`},options={reserve:f.options.reserve,shutdownSignal:f.shutdown.signal};
  assert.equal((await readQuoteIdentity(deployed,pin,options)).block.hash,pin.hash);
  const r=await readQuoteBatch({...fixture.input,manifest:deployed},{kind:'inspection',batchIndex:0},options);assert.deepEqual(r,fixture.inspections(plan.batches[0]!));assert.deepEqual(batches.map(b=>b.length),[3,8]);assert.equal(f.releases(),2);assert.equal(f.active(),0);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
