import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {decodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {lifecycleAbi,routerAbi,hashOrder,type Order} from '@orbital/sdk';
import {manifestSchema} from '@orbital/shared';
import {createReadDependencies} from '../src/runtime.js';
import {strategyFixture,manifest,address,hash} from './strategies-fixture.js';

const intent={kind:'swap' as const,wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'1000000',slippageBps:50,maxCrossings:16};
export async function quoteRuntimeFixture(before:(batch:any[])=>Promise<void>=async()=>{}){
 const f=await strategyFixture(),timestamp=BigInt(Math.floor(Date.now()/1000)),requests:any[][]=[];
 const rpc=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const batch=JSON.parse(Buffer.concat(chunks).toString());assert.ok(Array.isArray(batch)&&batch.length>0&&batch.length<=8);requests.push(batch);await before(batch);
  const response=batch.map((call:any)=>{let result:unknown;
   if(call.method==='eth_chainId')result='0x7a69';else if(call.method==='eth_blockNumber')result='0x5';else if(call.method==='eth_getBlockByNumber')result={number:call.params[0],hash:hash(3),timestamp:`0x${timestamp.toString(16)}`};
   else{assert.equal(call.method,'eth_call');assert.equal(call.params[0].to.toLowerCase(),manifest.router.toLowerCase());assert.deepEqual(call.params[1],{blockHash:hash(3),requireCanonical:true});const decoded=decodeFunctionData({abi:[...lifecycleAbi,...routerAbi],data:call.params[0].data as Hex});
    if(decoded.functionName==='quote'){const order=decoded.args[0] as Order,outputIndex=Number(BigInt(`0x${String(decoded.args[2]).slice(-4,-2)}`));result=encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[decoded.args[1] as bigint,outputIndex===2?10n**18n:2_000_000n,hashOrder(order)]});}
    else{const observation=f.observation(decoded.args[0] as string);result=encodeFunctionResult({abi:lifecycleAbi,functionName:decoded.functionName as 'getStrategyConfig',result:decoded.functionName==='getStrategyConfig'?observation.config:decoded.functionName==='getStrategyState'?observation.state:observation.availability} as never);}
   }
   return {jsonrpc:'2.0',id:call.id,result};
  });res.setHeader('content-type','application/json');res.end(JSON.stringify(response.reverse()));
 }catch{res.statusCode=500;res.end('fixture request invalid');}});
 await new Promise<void>(resolve=>rpc.listen(0,'127.0.0.1',resolve));const directory=await mkdtemp(join(tmpdir(),'orbital-quote-runtime-')),path=join(directory,'manifest.json');await writeFile(path,JSON.stringify({...manifest,rpcUrl:`http://127.0.0.1:${(rpc.address() as AddressInfo).port}`}));
 const configured=manifestSchema.parse(JSON.parse(await readFile(path,'utf8'))),runtime=createReadDependencies(f.db.pool.options.connectionString!);
 return {f,timestamp,requests,configured,runtime,manifestPath:path,async close(){await runtime.close();rpc.closeAllConnections();await new Promise<void>(resolve=>rpc.close(()=>resolve()));await f.close();if(dirname(directory)!==tmpdir()||!directory.startsWith(join(tmpdir(),'orbital-quote-runtime-')))throw Error('Unsafe fixture path');await rm(directory,{recursive:true,force:true});}};
}
