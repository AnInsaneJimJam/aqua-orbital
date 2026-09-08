import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {routerAbi,configToDTO,hashOrder,buildOrder,hashConfig} from '@orbital/sdk';
import {readQuoteBatch,type QuoteRpcOptions} from '../src/quote-rpc.js';
import {createQuoteCache} from '../src/quote-cache.js';
import {prepareRouting,type StaticReadCall} from '../src/route-selection.js';
import {readinessDeploymentScope} from '../src/deployment-scope.js';
import {routingFixture} from './route-selection-fixture.js';
import {address,hash} from './strategies-fixture.js';
import {awaitServiceBarrier} from './http-barrier.js';
function setup(){
 const f=routingFixture(2),shutdown=new AbortController();let now=0,hits=0,active=0,releases=0;
 const cache=createQuoteCache({clock:()=>now}),calls:StaticReadCall[][]=[],weights:number[]=[];
 const encode=(c:StaticReadCall)=>{const d=decodeFunctionData({abi:routerAbi,data:c.params[0].data as Hex});return encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[d.args[1],20n*10n**18n,c.id.split(':')[0] as Hex]});};
 let reply:(batch:StaticReadCall[],signal:AbortSignal)=>Promise<Response>=async batch=>new Response(JSON.stringify(batch.map(c=>({jsonrpc:'2.0',id:c.id,result:encode(c)})).reverse()));
 const options:QuoteRpcOptions&{cache:ReturnType<typeof createQuoteCache>;onCacheHit:()=>void}={cache,onCacheHit:()=>{hits++;},shutdownSignal:shutdown.signal,reserve(n){weights.push(n);active+=n;return()=>{releases++;active-=n;};},fetcher:async(_url,init)=>{const batch=JSON.parse(String(init!.body));calls.push(batch);return reply(batch,init!.signal!);}};
 const observations=()=>f.inspections(prepareRouting(f.input).inspectionCalls,(raw,id)=>{raw.state.version=BigInt(f.records.find(r=>r.orderHash===id)!.version);});
 return {f,cache,options,calls,weights,encode,shutdown,observations,read:()=>readQuoteBatch(f.input,{kind:'quote',batchIndex:0,observations:observations()},options),setClock:(n:number)=>{now=n;},setReply:(r:typeof reply)=>{reply=r;},hits:()=>hits,active:()=>active,releases:()=>releases};
}
test('a complete hit skips native reservation while reconstructing independent result/request objects',async()=>{
 const f=setup(),first=await f.read(),original=structuredClone(first);first[0]!.request.params[0].from=address(99);if(first[0]!.status==='fulfilled')first[0]!.data='0x';
 assert.deepEqual(await f.read(),original);assert.equal(f.calls.length,1);assert.deepEqual(f.weights,[2]);assert.equal(f.releases(),1);assert.equal(f.hits(),1);assert.equal(f.active(),0);
 f.setClock(5000);await f.read();assert.equal(f.calls.length,2);
});
test('cache identity binds caller, recipient, payer, pair, amount, limits, pin, timestamp, order version and RPC deployment',async()=>{
 const mutations=[(f:ReturnType<typeof setup>)=>{f.f.input.intent={...f.f.input.intent,amountInRaw:'9007199254740994'};},
  (f:ReturnType<typeof setup>)=>{if(f.f.input.intent.kind==='swap')f.f.input.intent.wallet=address(24);},
  (f:ReturnType<typeof setup>)=>{if(f.f.input.intent.kind==='swap')f.f.input.intent.recipient=address(24);},
  (f:ReturnType<typeof setup>)=>{f.f.input.intent.tokenIn=address(2);},
  (f:ReturnType<typeof setup>)=>{if(f.f.input.intent.kind==='swap')f.f.input.intent.slippageBps=100;},
  (f:ReturnType<typeof setup>)=>{f.f.input.intent.maxCrossings=15;},
  (f:ReturnType<typeof setup>)=>{f.f.input.blockTimestamp='1700000004';},
  (f:ReturnType<typeof setup>)=>{f.f.input.snapshot.asOf={height:'3',hash:hash(4)};f.f.input.snapshot.currentCursor={...f.f.input.snapshot.asOf};},
  (f:ReturnType<typeof setup>)=>{f.f.input.manifest={...f.f.input.manifest,rpcUrl:'http://another.example.invalid'};},
  (f:ReturnType<typeof setup>)=>{for(const r of f.f.records){r.version='2';r.updated={...r.updated,event:'OrbitalSwapExecuted',blockNumber:'2',blockHash:hash(2)};}},
 ];
 for(const mutate of mutations){const f=setup();await f.read();mutate(f);await f.read();assert.equal(f.calls.length,2);assert.equal(f.hits(),0);}
 for(const dimension of ['chain','router']){const f=setup();await f.read();f.f.input.manifest={...f.f.input.manifest,...(dimension==='chain'?{chainId:5042002}:{router:address(99)})};
  for(let i=0;i<f.f.configs.length;i++){const c=f.f.configs[i]!;c.chainId=BigInt(f.f.input.manifest.chainId);c.router=f.f.input.manifest.router as Hex;Object.assign(f.f.records[i]!,{router:c.router,config:configToDTO(c),configHash:hashConfig(c),orderHash:hashOrder(buildOrder(c))});}
  f.f.input.snapshot.chainId=f.f.input.manifest.chainId;f.f.input.snapshot.deploymentId=readinessDeploymentScope(f.f.input.manifest).id;await f.read();assert.equal(f.calls.length,2);assert.equal(f.hits(),0);
 }
 const pay=setup();pay.f.input.intent={kind:'payment',payer:address(22),tokenIn:address(3),amountInRaw:'1000000000000000000',minimumOutRaw:'1',invoiceExpiresAt:'1700000013',maxCrossings:16};
 await pay.read();for(const change of [{payer:address(24)},{minimumOutRaw:'2'},{invoiceExpiresAt:'1700000014'}]){Object.assign(pay.f.input.intent,change);await pay.read();}assert.equal(pay.calls.length,4);assert.equal(pay.hits(),0);
});
test('malformed, reverted, partial-fill, zero-output or wrong-order batches never populate the cache',async()=>{
 for(const mode of ['revert','malformed','partial','zero','order','missing']){const f=setup();f.setReply(async batch=>new Response(JSON.stringify(batch.slice(0,mode==='missing'?1:2).map((c,i)=>{
  if(i===0&&mode==='revert')return {jsonrpc:'2.0',id:c.id,error:{code:3,message:'execution reverted',data:'0x'}};
  const d=decodeFunctionData({abi:routerAbi,data:c.params[0].data as Hex});return {jsonrpc:'2.0',id:c.id,result:i===0&&mode==='malformed'?'0x':encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[d.args[1]-(i===0&&mode==='partial'?1n:0n),i===0&&mode==='zero'?0n:20n*10n**18n,i===0&&mode==='order'?hash(99):c.id.split(':')[0] as Hex]})};}))));
  for(let i=0;i<2;i++){if(mode==='missing')await assert.rejects(f.read());else await f.read();}assert.equal(f.calls.length,2);assert.equal(f.cache.stats().entries,0);assert.equal(f.hits(),0);
 }
});
test('inspection reads are uncached and invalid or aborted requests cannot consume a primed entry',async()=>{
 const f=setup();await f.read();for(const signal of [new AbortController(),f.shutdown]){signal.abort();await assert.rejects(readQuoteBatch(f.f.input,{kind:'quote',batchIndex:0,observations:f.observations()},{...f.options,signal:signal.signal}));}
 assert.equal(f.calls.length,1);assert.equal(f.hits(),0);
 const g=setup();const plan=prepareRouting(g.f.input),rows=g.f.inspections(plan.inspectionCalls);g.setReply(async batch=>new Response(JSON.stringify(batch.map(c=>({jsonrpc:'2.0',id:c.id,result:(rows.find(r=>r.request.id===c.id) as {data:string}).data})))));
 for(let i=0;i<2;i++)await readQuoteBatch(g.f.input,{kind:'inspection',batchIndex:0},g.options);assert.equal(g.calls.length,2);assert.equal(g.cache.stats().entries,0);
});
test('concurrent identical misses have independent cancellation and clear invalidates in-flight fills',async()=>{
 let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});const f=setup();let reached!:()=>void;const arrived=new Promise<void>(resolve=>{reached=resolve;});
 f.setReply(async batch=>{if(f.calls.length===2)reached();await barrier;return new Response(JSON.stringify(batch.map(c=>({jsonrpc:'2.0',id:c.id,result:f.encode(c)}))));});
 const cancel=new AbortController(),one=readQuoteBatch(f.f.input,{kind:'quote',batchIndex:0,observations:f.observations()},{...f.options,signal:cancel.signal}),two=f.read();
 try{await awaitServiceBarrier(arrived,Promise.all([one,two]));cancel.abort();await assert.rejects(one);assert.equal(f.cache.stats().entries,0);f.cache.clear();release();await two;assert.equal(f.cache.stats().entries,0);assert.equal(f.active(),0);assert.equal(f.releases(),2);
  await f.read();await f.read();assert.equal(f.calls.length,3);assert.equal(f.hits(),1);
 }finally{release();}
});
