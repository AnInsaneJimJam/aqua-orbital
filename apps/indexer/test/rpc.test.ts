import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMaterializationRpc} from '../src/rpc.js';

test('historic hydration uses canonical EIP-1898 and log retrieval uses exact block hash',async()=>{
 const calls:{method:string;params:unknown[]}[]=[];
 const {rpc,close}=createMaterializationRpc('http://localhost:8545',async(_url,init)=>{
  const body=JSON.parse(String(init?.body));calls.push(body);
  return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_getLogs'?[]:'0x'});
 });
 try{
  const blockHash=`0x${'12'.repeat(32)}` as const;
  await rpc.call({to:`0x${'34'.repeat(20)}`,data:'0x12345678'},{blockHash,requireCanonical:true});
  await rpc.getLogs(10n,[`0x${'34'.repeat(20)}`],blockHash);
  assert.deepEqual(calls[0]?.params[1],{blockHash,requireCanonical:true});
  assert.deepEqual(calls[1]?.params,[{address:[`0x${'34'.repeat(20)}`],blockHash}]);
 }finally{close();}
});
test('only read transport failures retry, while JSON-RPC errors remain one request',async()=>{
 let calls=0;
 const transient=createMaterializationRpc('http://localhost:8545',async(_url,init)=>{
  if(++calls<3)throw TypeError('transport failure');const body=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:body.id,result:'0x7a69'});
 });
 assert.equal(await transient.rpc.getChainId(),31337);assert.equal(calls,3);transient.close();
 calls=0;
 const rejected=createMaterializationRpc('http://localhost:8545',async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:'private provider diagnostics'}});});
 await assert.rejects(()=>rejected.rpc.getChainId(),/^Error: RPC_REQUEST_REJECTED$/);assert.equal(calls,1);rejected.close();
});
test('stalled read aborts within the request deadline and response size is bounded',async()=>{
 const stalled=createMaterializationRpc('http://localhost:8545',async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})),25);
 const start=Date.now();await assert.rejects(()=>stalled.rpc.getBlockNumber(),/RPC_TIMEOUT/);assert.ok(Date.now()-start<1000);stalled.close();
 const oversized=createMaterializationRpc('http://localhost:8545',async()=>new Response('x',{headers:{'content-length':'3000000'}}));
 await assert.rejects(()=>oversized.rpc.getBlockNumber(),/RPC_RESPONSE_LIMIT/);oversized.close();
});
test('eight-request capacity and shutdown release all pending read operations',async()=>{
 let fetches=0;
 const source=createMaterializationRpc('http://localhost:8545',async(_url,init)=>{fetches++;return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));});
 const pending=Array.from({length:8},()=>source.rpc.getBlockNumber());
 await assert.rejects(()=>source.rpc.getBlockNumber(),/RPC_CAPACITY/);assert.equal(fetches,8);
 source.close();const results=await Promise.allSettled(pending);
 for(const result of results){assert.equal(result.status,'rejected');if(result.status==='rejected')assert.equal(result.reason.message,'RPC_CLOSED');}
 await assert.rejects(()=>source.rpc.getChainId(),/RPC_CLOSED/);
});
