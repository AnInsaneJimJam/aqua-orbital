import {isDeepStrictEqual} from 'node:util';
import {manifestSchema,hashSchema,uintSchema,type DeploymentManifest} from '@orbital/shared';
import type {StrategyReadQuery,StrategyReadSnapshot} from '@orbital/db';
import {prepareRouting,prepareWholeSizeQuotes,selectWholeSizeQuotes,validateRoutingIntent,type RoutingInput,type RoutingIntent,type StaticReadResult} from './route-selection.js';
import type {QuoteRpcPhase} from './quote-rpc.js';
import {readinessDeploymentScope} from './deployment-scope.js';
export type QuoteIdentity={chainId:number;head:bigint;block:{height:string;hash:string;timestamp:bigint}};
export type QuoteDependencies={readDatabase(manifest:DeploymentManifest,query:StrategyReadQuery):Promise<StrategyReadSnapshot>;readIdentity(manifest:DeploymentManifest,pin:{height:string;hash:string},signal:AbortSignal,timeoutMs:number):Promise<QuoteIdentity>;readBatch(input:RoutingInput,phase:QuoteRpcPhase,signal:AbortSignal,timeoutMs:number,onCacheHit?:()=>void):Promise<StaticReadResult[]>};
export type QuoteOptions={signal?:AbortSignal;now?:()=>number;timeoutMs?:number};
type Selection=ReturnType<typeof selectWholeSizeQuotes>;
type QuoteData=Pick<Selection,'best'|'alternatives'|'counts'|'coverage'|'diagnostics'>;
export type QuoteObservation={schemaVersion:1;status:'observed';code:'QUOTE_OBSERVED'|'NO_ROUTE_IN_INSPECTED_SET';financialExecutionEnabled:false;canonicalVerification:'verified_at_pin';chainId:number;deploymentId:string;asOf:{height:string;hash:string};currentIndexedBlock:{height:string;hash:string};historical:boolean;freshness:{indexedAt:string;ageMs:number;head:string;blockTimestamp:string;observedAt:string};data:QuoteData};
export type QuoteUnavailable={schemaVersion:1;status:'unavailable';code:string;financialExecutionEnabled:false;canonicalVerification:'unavailable';data:null;message:string};
class QuoteFailure extends Error {}
const fail=(code:string):never=>{throw new QuoteFailure(code);};
const unavailable=(code:string):QuoteUnavailable=>({schemaVersion:1,status:'unavailable',code,financialExecutionEnabled:false,canonicalVerification:'unavailable',data:null,message:'A complete canonical quote observation is unavailable.'});
const pinned=(s:StrategyReadSnapshot)=>({chainId:s.chainId,deploymentId:s.deploymentId,asOf:s.asOf,coverage:s.coverage,items:s.items,hasMore:s.hasMore});
/** Internal read-only observation, never execution permission. The server owns
 * manifest, database and transport dependencies; requests cannot supply a block
 * timestamp, arbitrary descriptor, RPC URL, cached witness or signed transaction. */
export async function observeQuote(input:DeploymentManifest|null,intent:RoutingIntent,deps?:QuoteDependencies,options:QuoteOptions={}):Promise<QuoteObservation|QuoteUnavailable>{
 const started=performance.now(),base=options.now?.()??Date.now(),timeout=options.timeoutMs??20000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>20000||!Number.isSafeInteger(base)||base<0)return unavailable('INVALID_QUOTE_REQUEST');
 const parsed=manifestSchema.safeParse(input);if(!parsed.success||!parsed.data.verified)return unavailable('QUOTE_DEPLOYMENT_UNAVAILABLE');
 const manifest=parsed.data;let request:ReturnType<typeof validateRoutingIntent>;
 try{request=validateRoutingIntent(manifest,intent);}catch{return unavailable('INVALID_QUOTE_REQUEST');}
 if(!deps)return unavailable('QUOTE_DATABASE_UNAVAILABLE');
 const scope=readinessDeploymentScope(manifest),group=new AbortController();
 const abort=()=>group.abort();options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeout),now=()=>base+performance.now()-started;
 const checkpoint=()=>{if(options.signal?.aborted)fail('QUOTE_CANCELLED');if(group.signal.aborted||performance.now()-started>=timeout){abort();fail('QUOTE_TIMEOUT');}};
 const rpcBudget=()=>{checkpoint();return Math.max(1,Math.min(8000,Math.floor(timeout-(performance.now()-started))));};
 async function run<T>(operation:()=>Promise<T>,code:string):Promise<T>{
  checkpoint();let stop:(()=>void)|undefined;
  try{const value=await Promise.race([operation(),new Promise<never>((_,reject)=>{stop=()=>reject(new QuoteFailure('QUOTE_TIMEOUT'));group.signal.addEventListener('abort',stop,{once:true});if(group.signal.aborted)stop();})]);checkpoint();return value;}
  catch(error){checkpoint();if(error instanceof QuoteFailure)throw error;return fail(code);}
  finally{if(stop)group.signal.removeEventListener('abort',stop);}
 }
 function source(s:StrategyReadSnapshot){
  if(s.code!=='STRATEGIES_COMPLETE'||s.chainId!==scope.chainId||s.deploymentId!==scope.id||!s.asOf||!s.currentCursor||!s.indexedAt
   ||!uintSchema.safeParse(s.asOf.height).success||!uintSchema.safeParse(s.currentCursor.height).success||!hashSchema.safeParse(s.asOf.hash).success||!hashSchema.safeParse(s.currentCursor.hash).success||BigInt(s.asOf.height)>BigInt(s.currentCursor.height))fail('QUOTE_SOURCE_UNAVAILABLE');
 }
 function age(s:StrategyReadSnapshot){const time=Date.parse(s.indexedAt!),observed=now();if(!Number.isFinite(time)||time>observed+1000)fail('QUOTE_INDEXER_TIME_INVALID');if(observed-time>10000)fail('QUOTE_INDEXER_STALE');return time;}
 function identity(r:QuoteIdentity,pin:{height:string;hash:string}){
  if(r.chainId!==manifest.chainId||typeof r.head!=='bigint'||r.head<0n||r.head>=(1n<<256n)||!r.block||r.block.height!==pin.height||!hashSchema.safeParse(r.block.hash).success||r.block.hash.toLowerCase()!==pin.hash.toLowerCase()
   ||typeof r.block.timestamp!=='bigint'||r.block.timestamp<0n||r.block.timestamp+20n>=(1n<<40n)||r.head<BigInt(pin.height)+2n)fail('QUOTE_RPC_IDENTITY_INVALID');
 }
 function clock(timestamp:bigint){const observed=now(),limit=timestamp+20n,expires=request.invoiceExpiry!==null&&request.invoiceExpiry<limit?request.invoiceExpiry:limit;if(Number(timestamp)*1000>observed+1000)fail('QUOTE_BLOCK_TIME_INVALID');if(Number(expires)*1000<=observed)fail('QUOTE_EXPIRED');}
 try{
  checkpoint();const query:StrategyReadQuery={kind:'candidates',tokenIn:request.tokenIn,tokenOut:request.tokenOut};
  const before=await run(()=>deps.readDatabase(manifest,query),'QUOTE_DATABASE_UNAVAILABLE');source(before);age(before);
  if(!isDeepStrictEqual(before.asOf,before.currentCursor))fail('QUOTE_SOURCE_UNAVAILABLE');
  const pin=before.asOf!,first=await run(()=>deps.readIdentity(manifest,pin,group.signal,rpcBudget()),'QUOTE_RPC_UNAVAILABLE');identity(first,pin);clock(first.block.timestamp);
  if(first.head!==BigInt(before.currentCursor!.height)+2n)fail('QUOTE_INDEXER_STALE');
  const routing:RoutingInput={manifest,snapshot:before,intent,blockTimestamp:first.block.timestamp.toString()},plan=prepareRouting(routing),observations:StaticReadResult[]=[];
  checkpoint();for(let batchIndex=0;batchIndex<plan.batches.length;batchIndex++)observations.push(...await run(()=>deps.readBatch(routing,{kind:'inspection',batchIndex},group.signal,rpcBudget()),'QUOTE_RPC_UNAVAILABLE'));
  const prepared=prepareWholeSizeQuotes(routing,observations),quotes:StaticReadResult[]=[];
  checkpoint();clock(first.block.timestamp);for(let batchIndex=0;batchIndex<prepared.quoteBatches.length;batchIndex++)quotes.push(...await run(()=>deps.readBatch(routing,{kind:'quote',batchIndex,observations},group.signal,rpcBudget()),'QUOTE_RPC_UNAVAILABLE'));
  const selected=selectWholeSizeQuotes(routing,observations,quotes);checkpoint();
  const last=await run(()=>deps.readIdentity(manifest,pin,group.signal,rpcBudget()),'QUOTE_RPC_UNAVAILABLE');identity(last,pin);
  if(last.block.timestamp!==first.block.timestamp||last.head<first.head)fail('QUOTE_RPC_IDENTITY_INVALID');
  const after=await run(()=>deps.readDatabase(manifest,{...query,pin}),'QUOTE_DATABASE_UNAVAILABLE');source(after);
  if(!isDeepStrictEqual(pinned(before),pinned(after)))fail('QUOTE_SOURCE_CHANGED');
  if(last.head!==BigInt(after.currentCursor!.height)+2n)fail('QUOTE_INDEXER_STALE');
  const indexed=Math.min(age(before),age(after));clock(last.block.timestamp);checkpoint();const observed=now();
  return {schemaVersion:1,status:'observed',code:selected.best?'QUOTE_OBSERVED':'NO_ROUTE_IN_INSPECTED_SET',financialExecutionEnabled:false,canonicalVerification:'verified_at_pin',chainId:scope.chainId,deploymentId:scope.id,asOf:pin,currentIndexedBlock:after.currentCursor!,historical:BigInt(pin.height)<BigInt(after.currentCursor!.height),freshness:{indexedAt:new Date(indexed).toISOString(),ageMs:Math.max(0,Math.ceil(observed-indexed)),head:last.head.toString(),blockTimestamp:first.block.timestamp.toString(),observedAt:new Date(observed).toISOString()},data:{best:selected.best,alternatives:selected.alternatives,counts:selected.counts,coverage:selected.coverage,diagnostics:selected.diagnostics}};
 }catch(error){return unavailable(error instanceof QuoteFailure?error.message:'QUOTE_DATA_INVALID');}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);abort();}
}
