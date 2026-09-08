import {manifestSchema,hashSchema,uintSchema,type DeploymentManifest} from '@orbital/shared';
import {createHash} from 'node:crypto';
import {decodeFunctionResult,encodeFunctionResult,type Hex} from 'viem';
import {routerAbi} from '@orbital/sdk';
import {prepareRouting,prepareWholeSizeQuotes,type RoutingInput,type StaticReadCall,type StaticReadResult} from './route-selection.js';
import {preparePaymentContext,decodePaymentContext,type PaymentContextInput,type PaymentContext} from './payment-context.js';
import type {QuoteCache} from './quote-cache.js';
export type QuoteRpcOptions={reserve:(weight:number)=>()=>void;shutdownSignal:AbortSignal;signal?:AbortSignal;fetcher?:typeof fetch;timeoutMs?:number;cache?:QuoteCache;onCacheHit?:()=>void};
export type QuoteRpcPhase={kind:'inspection';batchIndex:number}|{kind:'quote';batchIndex:number;observations:StaticReadResult[]};
type Request={id:string|number;method:string;params:unknown[]};
type Reply={result:unknown;reverted:false}|{reverted:true};
const MAX_MEMBER_BYTES=256*1024;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hex=(v:unknown):v is string=>typeof v==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(v);
class RpcFailure extends Error {}
class TransientTransport extends Error {}
const fail=(code='RPC_DATA_INVALID'):never=>{throw new RpcFailure(code);};
function quantity(v:unknown):bigint{
 if(typeof v!=='string'||v.length>66||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))return fail();
 return BigInt(v);
}
function deployment(input:DeploymentManifest):DeploymentManifest{
 const m=manifestSchema.safeParse(input);
 if(!m.success||!m.data.verified||!['http:','https:'].includes(new URL(m.data.rpcUrl).protocol))return fail('RPC_INPUT_INVALID');
 return m.data;
}
function deadline(options:QuoteRpcOptions,started:number):number{
 const timeout=options.timeoutMs??8000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>8000)return fail('RPC_INPUT_INVALID');
 if(options.shutdownSignal.aborted||options.signal?.aborted)return fail('RPC_ABORTED');
 return started+timeout;
}
function check(signal:AbortSignal,end:number){if(signal.aborted||performance.now()>=end)return fail('RPC_ABORTED');}
async function abortable<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 let stop:(()=>void)|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{
  stop=()=>reject(new RpcFailure('RPC_ABORTED'));if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});
 })]);}finally{if(stop)signal.removeEventListener('abort',stop);}
}
async function pause(ms:number,signal:AbortSignal){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await abortable(new Promise<void>(resolve=>{timer=setTimeout(resolve,ms);}),signal);}finally{clearTimeout(timer);}
}
async function body(response:Response,signal:AbortSignal,end:number,limit:number):Promise<unknown>{
 const announced=response.headers.get('content-length');
 if(announced!==null&&(announced.length>7||!/^[0-9]+$/.test(announced)||BigInt(announced)>BigInt(limit))){void response.body?.cancel().catch(()=>{});return fail('RPC_RESPONSE_TOO_LARGE');}
 if(!response.body)return fail();
 // Fixed backing storage also bounds bookkeeping for adversarial one-byte
 // chunks; retaining each chunk separately would multiply the memory cost.
 const reader=response.body.getReader(),bytes=new Uint8Array(limit);let length=0;
 try{
  for(;;){
   // Ready/empty chunks can starve timers; check elapsed time in every read.
   check(signal,end);const part=await abortable(reader.read(),signal);if(part.done)break;
   if(part.value.byteLength>limit-length)return fail('RPC_RESPONSE_TOO_LARGE');
   bytes.set(part.value,length);length+=part.value.byteLength;
  }
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length)));}catch{return fail();}
  check(signal,end);return parsed;
 }catch(error){if(error instanceof RpcFailure)throw error;return fail('RPC_STREAM_ERROR');}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
function replies(value:unknown,requests:Request[],allowReverts:boolean):Reply[]{
 if(!Array.isArray(value)||value.length!==requests.length)return fail('RPC_PROTOCOL_ERROR');
 const expected=new Set(requests.map(r=>r.id)),mapped=new Map<string|number,Reply>();
 for(const row of value){
  if(!record(row)||row.jsonrpc!=='2.0'||(typeof row.id!=='string'&&typeof row.id!=='number')||!expected.has(row.id)||mapped.has(row.id)
   ||Object.hasOwn(row,'result')===Object.hasOwn(row,'error'))return fail('RPC_PROTOCOL_ERROR');
  // This is a bound on the complete serialized member, not just decoded hex.
  if(new TextEncoder().encode(JSON.stringify(row)).byteLength>MAX_MEMBER_BYTES)return fail('RPC_RESPONSE_TOO_LARGE');
  if(Object.hasOwn(row,'error')){
   const e=row.error;
   if(!allowReverts||!record(e)||!Number.isInteger(e.code)||typeof e.message!=='string'||!hex(e.data)
    ||!(e.code===3||(e.code===-32000&&/^execution reverted(?::[^\r\n]*)?$/.test(e.message))))return fail('RPC_REMOTE_ERROR');
   mapped.set(row.id,{reverted:true});
  }else mapped.set(row.id,{reverted:false,result:row.result});
 }
 return requests.map(r=>mapped.get(r.id)!);
}
async function send(url:string,requests:Request[],allowReverts:boolean,options:QuoteRpcOptions,signal:AbortSignal,end:number):Promise<Reply[]>{
 const payload=JSON.stringify(requests.map(r=>({jsonrpc:'2.0',...r})));
 for(let attempt=0;attempt<3;attempt++){
  check(signal,end);
  try{
   let response:Response;
   try{response=await abortable((options.fetcher??fetch)(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:payload,signal}),signal);}
   catch{check(signal,end);throw new TransientTransport();}
   if(!response.ok){void response.body?.cancel().catch(()=>{});
    if(response.status===408||response.status===429||response.status>=500)throw new TransientTransport();
    return fail('RPC_HTTP_ERROR');
   }
   const result=replies(await body(response,signal,end,requests.length*MAX_MEMBER_BYTES),requests,allowReverts);
   check(signal,end);return result;
  }catch(error){
   if(!(error instanceof TransientTransport))throw error;
   if(attempt===2)return fail('RPC_UNAVAILABLE');
   await pause(attempt===0?250:750,signal);
  }
 }
 return fail('RPC_UNAVAILABLE');
}
async function batch<T>(url:string,requests:Request[],allowReverts:boolean,options:QuoteRpcOptions,end:number,finish:(values:Reply[])=>T):Promise<T>{
 if(requests.length<1||requests.length>8||new Set(requests.map(r=>r.id)).size!==requests.length)return fail('RPC_INPUT_INVALID');
 if(options.shutdownSignal.aborted||options.signal?.aborted||performance.now()>=end)return fail('RPC_ABORTED');
 const release=options.reserve(requests.length),group=new AbortController(),abort=()=>group.abort();
 const sources=[options.shutdownSignal,...(options.signal?[options.signal]:[])];
 for(const source of sources)source.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,Math.max(0,end-performance.now()));
 try{
  if(sources.some(s=>s.aborted))abort();
  const values=await send(url,requests,allowReverts,options,group.signal,end),result=finish(values);
  check(group.signal,end);return result;
 }finally{clearTimeout(timer);for(const source of sources)source.removeEventListener('abort',abort);abort();release();}
}
/** Read-only identity at the requested block. The service additionally binds
 * this observation to its DB snapshot and performs the final canonical check. */
export async function readQuoteIdentity(input:DeploymentManifest,pin:{height:string;hash:string},options:QuoteRpcOptions):Promise<{chainId:number;head:bigint;block:{height:string;hash:string;timestamp:bigint}}>{
 const end=deadline(options,performance.now()),manifest=deployment(input),height=uintSchema.safeParse(pin?.height),hash=hashSchema.safeParse(pin?.hash);
 if(!height.success||!hash.success||BigInt(height.data)<BigInt(manifest.startBlock))return fail('RPC_INPUT_INVALID');
 const requests:Request[]=[{id:1,method:'eth_chainId',params:[]},{id:2,method:'eth_blockNumber',params:[]},{id:3,method:'eth_getBlockByNumber',params:[`0x${BigInt(height.data).toString(16)}`,false]}];
 return batch(manifest.rpcUrl,requests,false,options,end,values=>{
  const observed=values.map(v=>v.reverted?undefined:v.result),chain=quantity(observed[0]),head=quantity(observed[1]),header=observed[2];
  if(chain!==BigInt(manifest.chainId))return fail('RPC_CHAIN_MISMATCH');
  if(!record(header)||quantity(header.number)!==BigInt(height.data)||!hashSchema.safeParse(header.hash).success||String(header.hash).toLowerCase()!==hash.data.toLowerCase())return fail('RPC_BLOCK_MISMATCH');
  if(head<BigInt(height.data)+2n)return fail('RPC_UNCONFIRMED');
  return {chainId:manifest.chainId,head,block:{height:height.data,hash:hash.data.toLowerCase(),timestamp:quantity(header.timestamp)}};
 });
}
/** Select only an internally regenerated batch. No arbitrary descriptor, target,
 * caller or RPC method can authorize a request. Financial/configuration ABI
 * coherence and whole-operation snapshot checks remain in the pure core/service. */
export async function readQuoteBatch(input:RoutingInput,phase:QuoteRpcPhase,options:QuoteRpcOptions):Promise<StaticReadResult[]>{
 const end=deadline(options,performance.now()),manifest=deployment(input.manifest);
 if(!record(phase)||!Number.isInteger(phase.batchIndex)||phase.batchIndex<0||!['inspection','quote'].includes(phase.kind)
  ||Object.keys(phase).sort().join()!==(phase.kind==='inspection'?'batchIndex,kind':'batchIndex,kind,observations'))return fail('RPC_INPUT_INVALID');
 const plans=phase.kind==='inspection'?prepareRouting(input).batches:prepareWholeSizeQuotes(input,phase.observations).quoteBatches;
 const requests:StaticReadCall[]|undefined=plans[phase.batchIndex];if(!requests)return fail('RPC_INPUT_INVALID');
 const active=()=>{check(options.shutdownSignal,end);if(options.signal)check(options.signal,end);};
 let key:string|undefined;
 if(phase.kind==='quote'&&options.cache){
  const orders=new Set(requests.map(r=>r.id.split(':')[0]!));
  // Full exact call bytes bind pair/amount/caller/recipient/minimum/deadline and
  // crossing limit. Intent additionally binds payer and swap slippage. Fresh
  // canonical getters and explicit record versions bind the inspected state.
  key=createHash('sha256').update(JSON.stringify({schemaVersion:1,manifest,pin:input.snapshot.asOf,timestamp:input.blockTimestamp,intent:input.intent,requests,
   versions:input.snapshot.items!.filter(r=>orders.has(r.orderHash)).map(r=>[r.orderHash,r.version]).sort(),
   inspections:phase.observations.filter(r=>orders.has(r.request.id.split(':')[0]!)).map(r=>[r.request.id,r.status==='fulfilled'?r.data.toLowerCase():null]).sort(),
  })).digest('hex');
  active();const cached=options.cache.get(key);active();
  if(cached&&cached.length===requests.length){options.onCacheHit?.();active();return requests.map((request,i)=>({request,status:'fulfilled',data:cached[i]!}));}
 }
 active();const stamp=key?options.cache!.begin():null;
 const result=await batch(manifest.rpcUrl,requests,true,options,end,values=>values.map((v,index):StaticReadResult=>{
  const request=requests[index]!;if(v.reverted)return {request,status:'rejected',reason:'revert'};
  if(!hex(v.result))return fail();return {request,status:'fulfilled',data:v.result};
 }));
 active();
 if(key){
  // Do not retain reverts, malformed ABI, partial fills or empty quotes. The
  // pure core still checks minimum/output availability on every cache hit.
  const values:string[]=[];
  try{for(const row of result){if(row.status!=='fulfilled')throw Error();const decoded=decodeFunctionResult({abi:routerAbi,functionName:'quote',data:row.data as Hex});
   if(encodeFunctionResult({abi:routerAbi,functionName:'quote',result:decoded}).toLowerCase()!==row.data.toLowerCase()||decoded[0]!==BigInt(input.intent.amountInRaw)||decoded[1]===0n||decoded[2].toLowerCase()!==row.request.id.split(':')[0]!.toLowerCase())throw Error();
   values.push(row.data.toLowerCase());
  }}catch{values.length=0;}
  active();if(values.length===requests.length)options.cache!.put(key,stamp,values);
 }
 return result;
}

/** One internally generated context batch, under the same weighted capacity,
 * retry/size/deadline rules as quote reads. Any reverted getter invalidates the
 * entire context; only the canonical indexed source can establish absence. */
export async function readPaymentContext(input:PaymentContextInput,options:QuoteRpcOptions):Promise<PaymentContext>{
 const end=deadline(options,performance.now()),manifest=deployment(input.manifest),requests=preparePaymentContext(input).calls;
 return batch(manifest.rpcUrl,requests,false,options,end,values=>decodePaymentContext(input,values.map((value,index):StaticReadResult=>{
  if(value.reverted||!hex(value.result))return fail();
  return {request:requests[index]!,status:'fulfilled',data:value.result};
 })));
}
