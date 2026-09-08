import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {decodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {lifecycleAbi} from '@orbital/sdk';
import {createServer} from '../src/server.js';
import {createReadDependencies} from '../src/runtime.js';
import {strategyFixture,manifest,hash} from './strategies-fixture.js';

async function startRpc(f:Awaited<ReturnType<typeof strategyFixture>>,before:()=>Promise<void>=async()=>{}){
 const calls:any[]=[];
 const rpc=httpServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());calls.push(body);
  await before();
  let result:unknown;
  if(body.method==='eth_chainId')result='0x7a69';else if(body.method==='eth_blockNumber')result='0x5';
  else if(body.method==='eth_getBlockByNumber'){const height=Number(BigInt(body.params[0]));result={number:body.params[0],hash:hash(height),parentHash:hash(height-1),timestamp:'0x6553f103',transactions:[],uncles:[],gasLimit:'0x100000',gasUsed:'0x0',size:'0x100',difficulty:'0x0',totalDifficulty:'0x0'};}
  else{const decoded=decodeFunctionData({abi:lifecycleAbi,data:body.params[0].data as Hex}),id=decoded.args[0] as string,observation=f.observation(id);
   result=encodeFunctionResult({abi:lifecycleAbi,functionName:decoded.functionName,result:decoded.functionName==='getStrategyConfig'?observation.config:decoded.functionName==='getStrategyState'?observation.state:observation.availability} as never);}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 });
 await new Promise<void>(resolve=>rpc.listen(0,'127.0.0.1',resolve));
 return {calls,url:`http://127.0.0.1:${(rpc.address() as AddressInfo).port}`,close:async()=>{rpc.closeAllConnections();await new Promise<void>(resolve=>rpc.close(()=>resolve()));}};
}
test('configured production runtime serves real database detail through six bounded hash-pinned HTTP reads',async()=>{
 const f=await strategyFixture(),rpc=await startRpc(f),{calls}=rpc;
 const directory=await mkdtemp(join(tmpdir(),'orbital-strategy-runtime-')),manifestPath=join(directory,'manifest.json');
 await writeFile(manifestPath,JSON.stringify({...manifest,rpcUrl:rpc.url}));
 const app=await createServer({manifestPath,databaseUrl:f.db.pool.options.connectionString!,logger:false});
 try{const result=await app.inject(`/api/v1/strategies/${f.hashes[0]}`);assert.equal(result.statusCode,200);assert.equal(result.json().data.strategy.financial.state.version,'3');assert.equal(result.json().financialExecutionEnabled,false);assert.equal(calls.length,6);
  const reads=calls.filter(call=>call.method==='eth_call');assert.equal(reads.length,3);assert.ok(reads.every(call=>call.params[0].to.toLowerCase()===manifest.router.toLowerCase()));assert.ok(reads.every(call=>JSON.stringify(call.params[1])===JSON.stringify({blockHash:hash(3),requireCanonical:true})));assert.ok(calls.every(call=>!/^eth_(send|sign)/.test(call.method)));
 }finally{await app.close();await rpc.close();await f.close();if(dirname(directory)!==tmpdir()||!directory.startsWith(join(tmpdir(),'orbital-strategy-runtime-')))throw Error('Unsafe fixture path');await rm(directory,{recursive:true,force:true});}
});
test('strategy detail reservations share the global eight-request runtime budget and release capacity',async()=>{
 const f=await strategyFixture();let release!:()=>void,arrived!:()=>void,pending=0,peak=0;
 const barrier=new Promise<void>(resolve=>{release=resolve;}),allArrived=new Promise<void>(resolve=>{arrived=resolve;});
 const rpc=await startRpc(f,async()=>{pending++;peak=Math.max(peak,pending);if(pending===6)arrived();await barrier;pending--;});
 const runtime=createReadDependencies(f.db.pool.options.connectionString!),configured={...manifest,rpcUrl:rpc.url};
 try{
  const detail=runtime.strategyDependencies.readRpc(configured,{height:'3',hash:hash(3)},f.hashes[0]!);
  await assert.rejects(()=>runtime.metricsDependencies.readRpc(configured,[{height:'3',hash:hash(3)}]),/RPC_CAPACITY/);
  await assert.rejects(()=>runtime.strategyDependencies.readRpc(configured,{height:'3',hash:hash(3)},null),/RPC_CAPACITY/);
  const timer=setTimeout(arrived,5000);await allArrived;clearTimeout(timer);assert.equal(peak,6);release();assert.equal((await detail).chainId,31337);
  assert.equal((await runtime.metricsDependencies.readRpc(configured,[{height:'3',hash:hash(3)}])).blocks.length,1);
  assert.equal((await runtime.strategyDependencies.readRpc(configured,{height:'3',hash:hash(3)},null)).chainId,31337);
 }finally{release();await runtime.close();await rpc.close();await f.close();}
});
