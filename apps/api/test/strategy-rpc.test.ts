import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {encodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {lifecycleAbi,type Config} from '@orbital/sdk';
import type {DeploymentManifest} from '@orbital/shared';
import {readStrategyRpc,type StrategyRpcOptions} from '../src/strategy-rpc.js';

const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Hex;
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
const manifest:DeploymentManifest={chainId:31337,rpcUrl:'http://127.0.0.1:9999',explorerUrl:'https://example.invalid',verified:true,
 aqua:address(1),router:address(2),payments:address(3),usdc:address(4),startBlock:'1',tokens:[{address:address(4),symbol:'USDC',decimals:6,mock:true},{address:address(5),symbol:'oUSD18',decimals:18,mock:true}]};
const pin={height:'3',hash:hash(3)},orderHash=hash(9);
const config:Config={schemaVersion:1,chainId:31337n,router:address(2),maker:address(8),makerNonce:0n,tokens:[address(4),address(5)],decimals:[6,18],tickKeys:[(1n<<64n)-1n],radiiInternal:[1n<<100n],feePpm:500,initialAmountsRaw:[1n,2n]};
const state={maker:address(8),configHash:hash(8),status:1,version:9007199254740995n,X:[1n<<120n,2n<<120n],principalInternal:[1n,2n],virtualInternal:0n,
 sumInternal:3n<<120n,sumSquaresInternal:{hi:1n,lo:2n},interiorRadius:1n<<100n,boundarySumNumerator:0n,boundarySigmaLower:0n,boundarySigmaUpper:0n,interiorTickMask:1,slackBoundInternal:0n,cumulativeFeeRaw:[0n,9007199254740993n]};
const availability=config.tokens.map(token=>({token,aquaAllocationRaw:(1n<<248n)-1n,liveTokenCount:2,walletBalanceRaw:1n<<250n,aquaAllowanceRaw:1n<<251n,live:true,backingValid:true,surplusInternal:{hi:17n,lo:3n},deficitInternal:{hi:0n,lo:0n},fundingCeilingRaw:1n}));
const values={getStrategyConfig:config,getStrategyState:state,getStrategyAvailability:availability};
const names=Object.keys(values) as (keyof typeof values)[];
type Call={jsonrpc:string;id:number;method:string;params:unknown[]};
function result(call:Call):unknown{
 if(call.method==='eth_chainId')return '0x7a69';
 if(call.method==='eth_blockNumber')return '0x5';
 if(call.method==='eth_getBlockByNumber')return {number:'0x3',hash:pin.hash,timestamp:'0x6553f103'};
 assert.equal(call.method,'eth_call');
 const target=call.params[0] as {to:string;data:Hex};
 assert.equal(target.to.toLowerCase(),manifest.router.toLowerCase());assert.deepEqual(call.params[1],{blockHash:pin.hash,requireCanonical:true});
 const name=names.find(name=>encodeFunctionData({abi:lifecycleAbi,functionName:name,args:[orderHash]})===target.data);assert.ok(name);
 return encodeFunctionResult({abi:lifecycleAbi,functionName:name,result:values[name]} as never);
}
const response=(call:Call,value:unknown=result(call))=>new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result:value}));
function setup(handler:(call:Call,signal:AbortSignal)=>Promise<Response>=async call=>response(call)){
 let active=0,releases=0;const weights:number[]=[],calls:Call[]=[];const shutdown=new AbortController();
 const options:StrategyRpcOptions={shutdownSignal:shutdown.signal,reserve(weight){weights.push(weight);if(active+weight>8)throw Error('RPC_CAPACITY');active+=weight;return()=>{active-=weight;releases++;};},
  fetcher:async(_url,init)=>{assert.equal(active,weights.at(-1));const call=JSON.parse(String(init?.body)) as Call;calls.push(call);return handler(call,init!.signal!);}};
 return {options,shutdown,weights,calls,active:()=>active,releases:()=>releases};
}
test('detail uses exactly six reserved reads and hash-pinned ABI getters with exact bigint values',async()=>{
 const f=setup();const observed=await readStrategyRpc(manifest,pin,orderHash,f.options);
 assert.deepEqual(f.weights,[6]);assert.equal(f.active(),0);assert.equal(f.releases(),1);assert.equal(f.calls.length,6);
 assert.equal(observed.chainId,31337);assert.equal(observed.head,5n);assert.deepEqual(observed.block,{...pin,timestamp:1700000003n});
 assert.deepEqual(observed.config,config);assert.deepEqual(observed.state,state);assert.deepEqual(observed.availability,availability);
 assert.deepEqual(f.calls.find(c=>c.method==='eth_getBlockByNumber')!.params,['0x3',false]);
 assert.ok(f.calls.every(c=>!c.method.match(/send|sign|multicall/i)));
});
test('listing and known absence use only three reads, without querying contract state',async()=>{
 const f=setup();const observed=await readStrategyRpc(manifest,pin,null,f.options);
 assert.deepEqual(f.weights,[3]);assert.equal(f.calls.length,3);assert.equal(observed.state,undefined);assert.equal(f.releases(),1);
});
test('invalid deployment, pin, hash and shutdown reject before reservation or network work',async()=>{
 for(const [m,p,id] of [[{...manifest,verified:false},pin,null],[manifest,{...pin,height:'03'},null],[manifest,{...pin,hash:'0x12'},null],[manifest,pin,'0x12']] as const){
  const f=setup();await assert.rejects(readStrategyRpc(m,p,id,f.options));assert.equal(f.calls.length,0);assert.deepEqual(f.weights,[]);
 }
 const f=setup();f.shutdown.abort();await assert.rejects(readStrategyRpc(manifest,pin,null,f.options));assert.equal(f.calls.length,0);assert.deepEqual(f.weights,[]);
});
test('reservation rejection performs no fetch and never releases an unacquired reservation',async()=>{
 const f=setup();f.options.reserve=()=>{throw Error('RPC_CAPACITY');};await assert.rejects(readStrategyRpc(manifest,pin,orderHash,f.options),/RPC_CAPACITY/);assert.equal(f.calls.length,0);assert.equal(f.releases(),0);
});
test('wrong chain, header identity, malformed quantities and insufficient confirmations fail closed',async()=>{
 for(const mutate of [(c:Call)=>c.method==='eth_chainId'?'0x1':result(c),(c:Call)=>c.method==='eth_blockNumber'?'0x4':result(c),
  (c:Call)=>c.method==='eth_blockNumber'?'0x05':result(c),(c:Call)=>c.method==='eth_getBlockByNumber'?{number:'0x2',hash:pin.hash}:result(c),
  (c:Call)=>c.method==='eth_getBlockByNumber'?{number:'0x3',hash:hash(99)}:result(c)]){
  const f=setup(async c=>response(c,mutate(c)));await assert.rejects(readStrategyRpc(manifest,pin,null,f.options));assert.equal(f.active(),0);assert.equal(f.releases(),1);
 }
});
test('RPC errors, mismatched response IDs and noncanonical ABI encodings are never retried',async()=>{
 for(const invalid of ['rpc','id','trailing','truncated'] as const){
  const f=setup(async c=>{
   if(c.method!=='eth_call')return response(c);
   if(invalid==='rpc')return new Response(JSON.stringify({jsonrpc:'2.0',id:c.id,error:{code:-32000,message:'private endpoint detail'}}));
   if(invalid==='id')return new Response(JSON.stringify({jsonrpc:'2.0',id:c.id+100,result:result(c)}));
   const data=result(c) as string;return response(c,invalid==='trailing'?data+'00'.repeat(32):data.slice(0,-2));
  });
  await assert.rejects(readStrategyRpc(manifest,pin,orderHash,f.options),error=>error instanceof Error&&!error.message.includes('private endpoint'));
  assert.equal(f.calls.length,6);assert.equal(f.releases(),1);
 }
});
test('transient transport failures retry only at bounded attempts and retain one reservation',async()=>{
 let attempts=0;const f=setup(async c=>{if(c.method==='eth_chainId'&&++attempts<3)return new Response('temporary',{status:503});return response(c);});
 const started=performance.now();await readStrategyRpc(manifest,pin,null,f.options);assert.equal(attempts,3);assert.ok(performance.now()-started>=950);assert.deepEqual(f.weights,[3]);assert.equal(f.releases(),1);
});
test('a stalled streamed body times out the group and cancels siblings',async()=>{
 let aborted=0;const f=setup(async(c,signal)=>{signal.addEventListener('abort',()=>aborted++,{once:true});
  if(c.method==='eth_chainId')return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"jsonrpc":'));}}));
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
 });
 const started=performance.now();await assert.rejects(readStrategyRpc(manifest,pin,null,{...f.options,timeoutMs:40}));
 assert.ok(performance.now()-started<1000);assert.equal(aborted,3);assert.equal(f.active(),0);assert.equal(f.releases(),1);
});
test('oversized or malformed streamed JSON fails without returning partial financial data',async()=>{
 for(const body of ['x'.repeat(262145),'{not json']){
  const f=setup(async()=>new Response(body));await assert.rejects(readStrategyRpc(manifest,pin,orderHash,f.options));assert.equal(f.releases(),1);assert.equal(f.calls.length,6);
 }
});
test('shutdown interrupts a retry delay and releases capacity for the whole group',async()=>{
 const f=setup(async()=>new Response('temporary',{status:503}));const pending=readStrategyRpc(manifest,pin,null,f.options);
 setTimeout(()=>f.shutdown.abort(),30);await assert.rejects(pending);assert.equal(f.calls.length,3);assert.equal(f.releases(),1);assert.equal(f.active(),0);
});
test('empty streamed chunks cannot starve the deadline or accumulate unbounded work',async()=>{
 let chunks=0;const f=setup(async c=>c.method==='eth_chainId'?new Response(new ReadableStream({pull(controller){
  if(++chunks===50000)controller.close();else controller.enqueue(new Uint8Array());
 }})):response(c));
 await assert.rejects(readStrategyRpc(manifest,pin,null,{...f.options,timeoutMs:5}));
 assert.ok(chunks<50000,'deadline must interrupt the read loop, not wait for stream completion');assert.equal(f.releases(),1);
});
test('native HTTP transport returns decoded getter observations at the requested canonical hash',async()=>{
 const calls:Call[]=[];const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const c=JSON.parse(Buffer.concat(chunks).toString()) as Call;calls.push(c);res.end(JSON.stringify({jsonrpc:'2.0',id:c.id,result:result(c)}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const f=setup();
 try{const observed=await readStrategyRpc({...manifest,rpcUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}`},pin,orderHash,{reserve:f.options.reserve,shutdownSignal:f.shutdown.signal});
  assert.deepEqual(observed.availability,availability);assert.equal(calls.length,6);assert.equal(f.active(),0);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
