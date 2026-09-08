import {manifestSchema,hashSchema,nonzeroAddressSchema,strategyListQuerySchema,strategyFiltersSchema,strategyCursorSchema,type DeploymentManifest,type StrategyReadDTO} from '@orbital/shared';
import type {StrategyReadQuery,StrategyReadSnapshot} from '@orbital/db';
import {readinessDeploymentScope} from './deployment-scope.js';
import {strategyRecord,strategyFinancial} from './strategy-validation.js';
import {isFreshIndexedHead} from './index-freshness.js';
export type StrategyRpcResult={chainId:number;head:bigint;block:{height:string;hash:string;timestamp?:bigint};config?:unknown;state?:unknown;availability?:unknown};
export type StrategyReadDependencies={readDatabase(manifest:DeploymentManifest,query:StrategyReadQuery):Promise<StrategyReadSnapshot>;readRpc(manifest:DeploymentManifest,pin:{height:string;hash:string},orderHash:string|null):Promise<StrategyRpcResult>};
export type StrategyResponse={schemaVersion:1;httpStatus:number;status:'available'|'stale'|'unavailable';code:string;financialExecutionEnabled:false;
 chainId?:number;deploymentId?:string;asOf?:{height:string;hash:string};currentIndexedBlock?:{height:string;hash:string};historical?:boolean;
 coverage?:StrategyReadSnapshot['coverage']&{complete:true;scope:'registered_strategies';unactivatedShipments:false};freshness?:{indexedAt:string;ageMs:number;head:string;stale:boolean};
 data:null|{strategy?:StrategyReadDTO|null;items?:StrategyReadDTO[];nextCursor?:string|null;limit?:number};message?:string;retryable?:boolean;field?:string|null};
const encodeCursor=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const pinnedIdentity=(s:StrategyReadSnapshot)=>JSON.stringify({chainId:s.chainId,deploymentId:s.deploymentId,asOf:s.asOf,coverage:s.coverage,items:s.items,hasMore:s.hasMore});
async function bounded<T>(operation:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('READ_TIMEOUT')),ms);})]);}finally{if(timer)clearTimeout(timer);}}
export async function getStrategies(input:DeploymentManifest|null,request:{hash:string}|{maker?:string;query?:unknown},deps?:StrategyReadDependencies,now=Date.now(),timeoutMs=8000):Promise<StrategyResponse>{
 const started=performance.now();
 const fail=(code:string,httpStatus=503,field:string|null=null):StrategyResponse=>({schemaVersion:1,httpStatus,status:'unavailable',code,financialExecutionEnabled:false,data:null,retryable:httpStatus===503||httpStatus===409,field,
  message:httpStatus===400?'Check the strategy identifier, filters or pagination parameters.':httpStatus===409?'The indexed page is no longer canonical. Restart the listing.':'Canonical registered strategy observations are unavailable.'});
 let query:StrategyReadQuery,cursor:string|undefined;
 if('hash' in request){if(!hashSchema.safeParse(request.hash).success)return fail('INVALID_HASH',400,'hash');query={kind:'detail',hash:request.hash.toLowerCase()};}
 else{
  if(request.maker&&!nonzeroAddressSchema.safeParse(request.maker).success)return fail('INVALID_ADDRESS',400,'address');
  const parsed=strategyListQuerySchema.safeParse(request.query??{});if(!parsed.success)return fail('INVALID_STRATEGY_QUERY',400,'query');
  const args=parsed.data;
  if(request.maker&&args.maker&&request.maker.toLowerCase()!==args.maker.toLowerCase())return fail('INVALID_STRATEGY_QUERY',400,'maker');
  const filters=strategyFiltersSchema.safeParse({maker:(request.maker??args.maker)?.toLowerCase(),tokenIn:args.tokenIn?.toLowerCase(),tokenOut:args.tokenOut?.toLowerCase(),status:args.status??'all'});
  if(!filters.success)return fail('INVALID_STRATEGY_QUERY',400,'query');
  query={kind:'list',filters:filters.data,limit:args.limit};cursor=args.cursor;
 }
 const parsed=manifestSchema.safeParse(input);if(!parsed.success||!parsed.data.verified)return fail('DEPLOYMENT_UNAVAILABLE');
 const manifest=parsed.data,scope=readinessDeploymentScope(manifest);
 if(query.kind==='list'){
  for(const token of [query.filters.tokenIn,query.filters.tokenOut])if(token&&!manifest.tokens.some(t=>t.address.toLowerCase()===token))return fail('INVALID_TOKEN',400,'pair');
  if(cursor){try{const decoded=strategyCursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));
   if(encodeCursor(decoded)!==cursor||decoded.chainId!==scope.chainId||decoded.deploymentId!==scope.id||JSON.stringify(decoded.filters)!==JSON.stringify(query.filters))throw Error();
   query={...query,pin:decoded.pin,after:decoded.after};
  }catch{return fail('INVALID_STRATEGY_CURSOR',400,'cursor');}}
 }
 if(!deps)return fail('DATABASE_UNAVAILABLE');
 let before:StrategyReadSnapshot;
 try{before=await bounded(deps.readDatabase(manifest,query),timeoutMs);}catch{return fail('DATABASE_UNAVAILABLE');}
 if(before.chainId!==scope.chainId||before.deploymentId!==scope.id)return fail('MATERIALIZATION_DEPLOYMENT_MISMATCH');
 if(before.code!=='STRATEGIES_COMPLETE')return fail(before.code,before.code==='STRATEGY_CURSOR_ORPHANED'&&cursor?409:before.code==='INVALID_STRATEGY_CURSOR'?400:503);
 if(!before.asOf||!before.currentCursor||!before.items||!before.indexedAt)return fail('STRATEGY_DATA_INVALID');
 const pin=before.asOf;let items:StrategyReadDTO[];
 try{items=before.items.map(record=>strategyRecord(record,manifest,pin));
  if(query.kind==='detail'&&(items.length>1||items.some(item=>item.orderHash.toLowerCase()!==query.hash)))throw Error();
  if(query.kind==='list'&&(items.length>query.limit||items.some(item=>(query.filters.maker&&item.maker.toLowerCase()!==query.filters.maker)
   ||(query.filters.status!=='all'&&item.lifecycle!==query.filters.status)||[query.filters.tokenIn,query.filters.tokenOut].some(t=>t&&!item.config.tokens.some(a=>a.toLowerCase()===t)))))throw Error();
 }catch{return fail('STRATEGY_DATA_INVALID');}
 let rpc:StrategyRpcResult;
 try{rpc=await bounded(deps.readRpc(manifest,pin,query.kind==='detail'&&items.length?query.hash:null),timeoutMs);}catch{return fail('RPC_UNAVAILABLE');}
 if(rpc.chainId!==manifest.chainId)return fail('RPC_CHAIN_MISMATCH');
 if(!rpc.block||rpc.block.height!==pin.height||!hashSchema.safeParse(rpc.block.hash).success||rpc.block.hash.toLowerCase()!==pin.hash.toLowerCase())return fail('RPC_BLOCK_MISMATCH');
 if(typeof rpc.head!=='bigint'||rpc.head<BigInt(pin.height)+2n)return fail('INDEXER_UNCONFIRMED');
 if(query.kind==='detail'&&items.length){try{items[0]!.financial=strategyFinancial(before.items[0]!,items[0]!,rpc);}catch{return fail('STRATEGY_DATA_INVALID');}}
 let after:StrategyReadSnapshot;
 try{after=await bounded(deps.readDatabase(manifest,{...query,pin}),timeoutMs);}catch{return fail('DATABASE_UNAVAILABLE');}
 if(after.code!=='STRATEGIES_COMPLETE')return fail(after.code==='STRATEGY_CURSOR_ORPHANED'?'STRATEGY_SNAPSHOT_CHANGED':after.code);
 if(pinnedIdentity(before)!==pinnedIdentity(after)||!after.currentCursor||!after.indexedAt)return fail('STRATEGY_SNAPSHOT_CHANGED');
 const indexedTime=Math.min(Date.parse(before.indexedAt),Date.parse(after.indexedAt)),observedNow=now+performance.now()-started;
 if(!Number.isFinite(indexedTime)||!Number.isFinite(observedNow)||indexedTime>observedNow+1000)return fail('INDEXER_TIME_INVALID');
 const ageMs=Math.max(0,Math.ceil(observedNow-indexedTime)),stale=ageMs>10000||!isFreshIndexedHead(manifest.chainId,rpc.head,BigInt(after.currentCursor.height));
 const absent=query.kind==='detail'&&!items.length;
 let data:NonNullable<StrategyResponse['data']>;
 if(query.kind==='detail')data={strategy:items[0]??null};
 else{const last=items.at(-1);data={items,limit:query.limit,nextCursor:before.hasMore&&last?encodeCursor({version:1,chainId:scope.chainId,deploymentId:scope.id,filters:query.filters,pin,after:{blockNumber:last.updated.blockNumber,logIndex:last.updated.logIndex,orderHash:last.orderHash}}):null};}
 return {schemaVersion:1,httpStatus:absent?404:200,status:stale?'stale':'available',code:absent?'STRATEGY_NOT_FOUND':stale?'STRATEGIES_STALE':'STRATEGIES_AVAILABLE',financialExecutionEnabled:false,
  chainId:scope.chainId,deploymentId:scope.id,asOf:pin,currentIndexedBlock:after.currentCursor,historical:BigInt(pin.height)<BigInt(after.currentCursor.height),
  coverage:{...before.coverage,complete:true,scope:'registered_strategies',unactivatedShipments:false},freshness:{indexedAt:new Date(indexedTime).toISOString(),ageMs,head:rpc.head.toString(),stale},data,
  ...(absent?{message:'Strategy not found in canonical registered history at the indicated block.',retryable:false,field:'hash'}:{})};
}
