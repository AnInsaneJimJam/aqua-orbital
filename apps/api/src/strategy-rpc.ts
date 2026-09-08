import {setMaxListeners} from 'node:events';
import {decodeFunctionResult,encodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {lifecycleAbi} from '@orbital/sdk';
import {manifestSchema,hashSchema,uintSchema,type DeploymentManifest} from '@orbital/shared';
import type {StrategyRpcResult} from './strategies.js';

export type StrategyRpcOptions={reserve:(weight:number)=>()=>void;shutdownSignal:AbortSignal;fetcher?:typeof fetch;timeoutMs?:number};
const MAX_BYTES=256*1024;
const getters=['getStrategyConfig','getStrategyState','getStrategyAvailability'] as const;
type Getter=typeof getters[number];
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(code='RPC_DATA_INVALID'):never=>{throw Error(code);};
class TransientTransport extends Error {}
function quantity(value:unknown):bigint{
 if(typeof value!=='string'||value.length>66||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))return fail();
 return BigInt(value);
}
async function abortable<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 let stop:(()=>void)|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{
  stop=()=>reject(Error('RPC_ABORTED'));if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});
 })]);}finally{if(stop)signal.removeEventListener('abort',stop);}
}
async function pause(ms:number,signal:AbortSignal){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await abortable(new Promise<void>(resolve=>{timer=setTimeout(resolve,ms);}),signal);}finally{clearTimeout(timer);}
}
async function body(response:Response,signal:AbortSignal,deadline:number):Promise<unknown>{
 const announced=response.headers.get('content-length');
 if(announced!==null&&(announced.length>6||!/^[0-9]+$/.test(announced)||BigInt(announced)>BigInt(MAX_BYTES))){void response.body?.cancel().catch(()=>{});return fail('RPC_RESPONSE_TOO_LARGE');}
 if(!response.body)return fail();
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{
  for(;;){
   // A continuously ready stream can monopolize microtasks and prevent the
   // timer callback from running. Check monotonic elapsed time in the loop.
   if(signal.aborted||performance.now()>=deadline)return fail('RPC_ABORTED');
   const part=await abortable(reader.read(),signal);if(part.done)break;
   length+=part.value.byteLength;if(length>MAX_BYTES)return fail('RPC_RESPONSE_TOO_LARGE');
   if(part.value.byteLength)chunks.push(part.value);
  }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail();}
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function rpc(url:string,id:number,method:string,params:unknown[],fetcher:typeof fetch,signal:AbortSignal,deadline:number):Promise<unknown>{
 for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)return fail('RPC_ABORTED');
  try{
   let response:Response;
   try{response=await abortable(fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal}),signal);}
   catch{if(signal.aborted)return fail('RPC_ABORTED');throw new TransientTransport();}
   if(!response.ok){void response.body?.cancel().catch(()=>{});
    if(response.status===408||response.status===429||response.status>=500)throw new TransientTransport();
    return fail('RPC_HTTP_ERROR');
   }
   const value=await body(response,signal,deadline);
   if(!record(value)||value.jsonrpc!=='2.0'||value.id!==id||!Object.hasOwn(value,'result')||Object.hasOwn(value,'error'))return fail('RPC_PROTOCOL_ERROR');
   return value.result;
  }catch(error){
   if(!(error instanceof TransientTransport)||attempt===2||signal.aborted)throw error instanceof TransientTransport?Error('RPC_UNAVAILABLE'):error;
   await pause(attempt===0?250:750,signal);
  }
 }
 return fail('RPC_UNAVAILABLE');
}
function decoded(name:Getter,value:unknown):unknown{
 if(typeof value!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(value))return fail();
 try{
  const result=decodeFunctionResult({abi:lifecycleAbi,functionName:name,data:value as Hex});
  if(encodeFunctionResult({abi:lifecycleAbi,functionName:name,result} as never).toLowerCase()!==value.toLowerCase())return fail();
  return result;
 }catch{return fail();}
}
/** Read-only deployment transport. All detail getters use the same canonical
 * EIP-1898 block hash. The controller separately verifies snapshot/contract
 * coherence and DB state after these reads; this never authorizes a trade. */
export async function readStrategyRpc(input:DeploymentManifest,pin:{height:string;hash:string},orderHash:string|null,options:StrategyRpcOptions):Promise<StrategyRpcResult>{
 const parsed=manifestSchema.safeParse(input),height=uintSchema.safeParse(pin?.height),hash=hashSchema.safeParse(pin?.hash);
 const timeout=options.timeoutMs??8000;
 if(!parsed.success||!parsed.data.verified||!height.success||!hash.success||(orderHash!==null&&!hashSchema.safeParse(orderHash).success)
  ||!Number.isInteger(timeout)||timeout<1||timeout>8000)return fail('RPC_INPUT_INVALID');
 const manifest=parsed.data;
 if(!['http:','https:'].includes(new URL(manifest.rpcUrl).protocol)||BigInt(height.data)<BigInt(manifest.startBlock))return fail('RPC_INPUT_INVALID');
 if(options.shutdownSignal.aborted)return fail('RPC_ABORTED');
 const release=options.reserve(orderHash===null?3:6);
 const started=performance.now();
 const group=new AbortController();setMaxListeners(20,group.signal); // At most six native fetch + six explicit abort listeners.
 const abort=()=>group.abort();options.shutdownSignal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeout);
 try{
  if(options.shutdownSignal.aborted)abort();
  const jobs:[string,unknown[]][]=[['eth_chainId',[]],['eth_blockNumber',[]],['eth_getBlockByNumber',[`0x${BigInt(height.data).toString(16)}`,false]]];
  if(orderHash!==null)for(const name of getters)jobs.push(['eth_call',[
   {to:manifest.router,data:encodeFunctionData({abi:lifecycleAbi,functionName:name,args:[orderHash as Hex]})},
   {blockHash:hash.data.toLowerCase(),requireCanonical:true},
  ]]);
  const observed=await Promise.allSettled(jobs.map(async([method,params],index)=>{
   try{return await rpc(manifest.rpcUrl,index+1,method,params,options.fetcher??fetch,group.signal,started+timeout);}catch(error){abort();throw error;}
  }));
  if(observed.some(item=>item.status==='rejected'))return fail('RPC_UNAVAILABLE');
  const values=observed.map(item=>item.status==='fulfilled'?item.value:undefined);
  const chain=quantity(values[0]),head=quantity(values[1]),header=values[2];
  if(chain!==BigInt(manifest.chainId))return fail('RPC_CHAIN_MISMATCH');
  if(!record(header)||quantity(header.number)!==BigInt(height.data)||!hashSchema.safeParse(header.hash).success
   ||String(header.hash).toLowerCase()!==hash.data.toLowerCase())return fail('RPC_BLOCK_MISMATCH');
  if(head<BigInt(height.data)+2n)return fail('RPC_UNCONFIRMED');
  const result:StrategyRpcResult={chainId:manifest.chainId,head,block:{height:height.data,hash:hash.data.toLowerCase(),...(header.timestamp===undefined?{}:{timestamp:quantity(header.timestamp)})}};
  if(orderHash!==null){result.config=decoded(getters[0],values[3]);result.state=decoded(getters[1],values[4]);result.availability=decoded(getters[2],values[5]);}
  // A bounded synchronous JSON/ABI decode can finish before the timer gets an
  // event-loop turn. Never return a result past the same total group deadline.
  if(group.signal.aborted||performance.now()-started>=timeout)return fail('RPC_ABORTED');
  return result;
 }finally{clearTimeout(timer);options.shutdownSignal.removeEventListener('abort',abort);abort();release();}
}
