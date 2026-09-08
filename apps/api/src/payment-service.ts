import {isDeepStrictEqual} from 'node:util';
import type {InvoiceReadQuery,InvoiceReadSnapshot,StrategyReadSnapshot,StrategyReadQuery} from '@orbital/db';
import {manifestSchema,paymentQuoteRequestSchema,hashSchema,uintSchema,type DeploymentManifest,type PaymentQuoteRequest,type InvoiceReadDTO,type Token} from '@orbital/shared';
import {buildPaymentTx,buildPaymentApprovalTx,buildOrder,configFromDTO,type TransactionPlan,type PaymentInput,type PlanContext} from '@orbital/sdk';
import type {QuoteDependencies,QuoteIdentity,QuoteOptions} from './quote-service.js';
import {preparePaymentContext,type PaymentContextInput,type PaymentContext} from './payment-context.js';
import {searchPaymentInput,type PaymentSearchResult} from './payment-search.js';
import {prepareRouting,prepareWholeSizeQuotes,selectWholeSizeQuotes,type RoutingInput,type StaticReadCall,type StaticReadResult} from './route-selection.js';
import {validatePaymentFunding,PaymentValidationError,type PaymentFunding} from './payment-validation.js';
import {readinessDeploymentScope} from './deployment-scope.js';

export type PaymentQuoteDependencies=QuoteDependencies&{
 readInvoices(manifest:DeploymentManifest,query:InvoiceReadQuery):Promise<InvoiceReadSnapshot>;
 readContext(input:PaymentContextInput,signal:AbortSignal,timeoutMs:number):Promise<PaymentContext>;
};
type Selection=ReturnType<typeof selectWholeSizeQuotes>;
type RoutingData=Pick<Selection,'best'|'alternatives'|'counts'|'coverage'|'diagnostics'>;
export type PaymentSearchSummary=Omit<PaymentSearchResult<RoutingData>,'selected'>;
export type PaymentWork={identityMembers:number;contextMembers:number;inspectionMembers:number;quoteMembers:number;logicalMembers:number;nativeBatches:number;cacheHitMembers:number;cacheHitBatches:number};
export type PaymentWirePlan=Omit<TransactionPlan,'value'>&{value:'0'};
type ObservationScope={chainId:number;deploymentId:string;asOf:{height:string;hash:string};currentIndexedBlock:{height:string;hash:string};historical:boolean;
 freshness:{indexedAt:string;ageMs:number;head:string;blockTimestamp:string;observedAt:string};coverage:InvoiceReadSnapshot['coverage']&{complete:true}};
export type PaymentQuoteObservation=ObservationScope&{schemaVersion:1;status:'observed';httpStatus:200;code:'PAYMENT_QUOTE_OBSERVED';financialExecutionEnabled:false;paymentEligibilityVerified:false;canonicalVerification:'verified_at_pin';
 data:{request:PaymentQuoteRequest;kind:'direct'|'swap';invoice:InvoiceReadDTO;tokenIn:Token;amountInRaw:string;amountOutRaw:string;minimumOutRaw:string;feeRaw:string;refundRaw:string;expiresAt:string;
  funding:{balanceRaw:string;allowanceRaw:string;boundRaw:string;spender:string;approvalRequired:boolean};routing:RoutingData|null;search:PaymentSearchSummary|null;work:PaymentWork;
  reviewOnly:true;plan:PaymentWirePlan;approval:PaymentWirePlan|null}};
export type PaymentQuoteUnavailable=Partial<ObservationScope>&{schemaVersion:1;status:'unavailable';httpStatus:400|404|409|422|429|503|504;code:string;financialExecutionEnabled:false;paymentEligibilityVerified:false;canonicalVerification:'unavailable'|'verified_at_pin';data:null;message:string};
class PaymentFailure extends Error {constructor(code:string,readonly httpStatus:PaymentQuoteUnavailable['httpStatus']=503){super(code);}}
const fail=(code:string,status?:PaymentQuoteUnavailable['httpStatus']):never=>{throw new PaymentFailure(code,status);};
export const paymentUnavailable=(code:string,httpStatus:PaymentQuoteUnavailable['httpStatus']=503):PaymentQuoteUnavailable=>({schemaVersion:1,status:'unavailable',httpStatus,code,financialExecutionEnabled:false,paymentEligibilityVerified:false,canonicalVerification:'unavailable',data:null,message:'A complete canonical payment quote observation is unavailable.'});
const pinned=(s:InvoiceReadSnapshot|StrategyReadSnapshot)=>({chainId:s.chainId,deploymentId:s.deploymentId,asOf:s.asOf,coverage:s.coverage,items:s.items,hasMore:s.hasMore});
const wirePlan=(p:TransactionPlan):PaymentWirePlan=>({...p,value:'0'});
/** Read-only service. All financial values and the unsigned review plan remain
 * observations at one authenticated historical pin. No user wallet action is
 * authorized here; the HTTP and SDK boundaries must validate them separately. */
export async function observePaymentQuote(input:DeploymentManifest|null,request:PaymentQuoteRequest,deps?:PaymentQuoteDependencies,options:QuoteOptions={}):Promise<PaymentQuoteObservation|PaymentQuoteUnavailable>{
 const started=performance.now();let base:number;
 try{base=options.now?.()??Date.now();}catch{return paymentUnavailable('INVALID_PAYMENT_REQUEST',400);}
 const timeout=options.timeoutMs??20000;
 if(!Number.isSafeInteger(base)||base<0||!Number.isInteger(timeout)||timeout<1||timeout>20000)return paymentUnavailable('INVALID_PAYMENT_REQUEST',400);
 const parsed=manifestSchema.safeParse(input),args=paymentQuoteRequestSchema.safeParse(request);
 if(!args.success)return paymentUnavailable('INVALID_PAYMENT_REQUEST',400);
 if(!parsed.success||!parsed.data.verified)return paymentUnavailable('PAYMENT_DEPLOYMENT_UNAVAILABLE');
 const manifest=parsed.data,r={...args.data,invoiceId:args.data.invoiceId.toLowerCase(),payer:args.data.payer.toLowerCase(),tokenIn:args.data.tokenIn.toLowerCase()};
 if(!manifest.tokens.some(t=>t.address.toLowerCase()===r.tokenIn)||[manifest.payments,manifest.router,manifest.aqua].some(a=>a.toLowerCase()===r.payer))return paymentUnavailable('INVALID_PAYMENT_REQUEST',400);
 if(!deps)return paymentUnavailable('PAYMENT_DATABASE_UNAVAILABLE');
 const scope=readinessDeploymentScope(manifest),group=new AbortController(),abort=()=>group.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeout),now=()=>base+performance.now()-started,indexedTimes:number[]=[];
 let blockTimestamp:bigint|undefined,invoiceDeadline:bigint|undefined;
 const work:PaymentWork={identityMembers:0,contextMembers:0,inspectionMembers:0,quoteMembers:0,logicalMembers:0,nativeBatches:0,cacheHitMembers:0,cacheHitBatches:0};
 function checkpoint(){
  if(options.signal?.aborted)fail('PAYMENT_QUOTE_CANCELLED');
  if(group.signal.aborted||performance.now()-started>=timeout){abort();fail('PAYMENT_QUOTE_TIMEOUT',504);}
  const time=now();if(indexedTimes.some(indexed=>time-indexed>10000))fail('PAYMENT_INDEXER_STALE');
  if(blockTimestamp!==undefined){if(Number(blockTimestamp)*1000>time+1000)fail('PAYMENT_BLOCK_TIME_INVALID');
   if(invoiceDeadline!==undefined&&Number(invoiceDeadline)*1000<=time)fail('INVOICE_EXPIRED',409);
   if(Number(blockTimestamp+20n)*1000<=time)fail('PAYMENT_QUOTE_EXPIRED');}
 }
 const rpcBudget=()=>{checkpoint();return Math.max(1,Math.min(8000,Math.floor(timeout-(performance.now()-started))));};
 function charge(kind:'identityMembers'|'contextMembers'|'inspectionMembers'|'quoteMembers',count:number){
  checkpoint();if(!Number.isInteger(count)||count<1||count>8)fail('PAYMENT_WORK_INVALID');
  work[kind]+=count;work.logicalMembers+=count;work.nativeBatches++;
  if(work.identityMembers>6||work.contextMembers>16||work.inspectionMembers>96||work.quoteMembers>128||work.logicalMembers>246||work.nativeBatches+work.cacheHitBatches>44)fail('PAYMENT_WORK_EXCEEDED');
 }
 async function run<T>(operation:()=>Promise<T>,code:string):Promise<T>{
  checkpoint();let stop:(()=>void)|undefined;
  try{const value=await Promise.race([operation(),new Promise<never>((_,reject)=>{stop=()=>reject(new PaymentFailure('PAYMENT_QUOTE_TIMEOUT',504));group.signal.addEventListener('abort',stop,{once:true});if(group.signal.aborted)stop();})]);checkpoint();return value;}
  catch(error){checkpoint();if(error instanceof PaymentFailure)throw error;if(error instanceof Error&&error.message==='RPC_CAPACITY')return fail('PAYMENT_QUOTE_CAPACITY',429);return fail(code);}
  finally{if(stop)group.signal.removeEventListener('abort',stop);}
 }
 function source(s:InvoiceReadSnapshot|StrategyReadSnapshot,kind:'invoice'|'strategy',pin?:{height:string;hash:string}){
  const validBlock=(b:{height:string;hash:string}|null)=>b&&uintSchema.safeParse(b.height).success&&hashSchema.safeParse(b.hash).success;
  if(!s||s.code!==(kind==='invoice'?'INVOICES_COMPLETE':'STRATEGIES_COMPLETE')||s.chainId!==scope.chainId||s.deploymentId!==scope.id
   ||!validBlock(s.asOf)||!validBlock(s.currentCursor)||!s.indexedAt||!Array.isArray(s.items)||typeof s.hasMore!=='boolean')fail('PAYMENT_SOURCE_UNAVAILABLE');
  const at=s.asOf!,current=s.currentCursor!,start=BigInt(manifest.startBlock),height=BigInt(at.height),c=s.coverage;
  if(height<start||height>BigInt(current.height)||(at.height===current.height&&at.hash!==current.hash)||(pin&&!isDeepStrictEqual(pin,at))
   ||!c||c.fromBlock!==manifest.startBlock||c.toBlock!==at.height||c.expectedBlocks!==(height-start+1n).toString()||c.canonicalBlocks!==c.expectedBlocks||c.coveredBlocks!==c.expectedBlocks)fail('PAYMENT_SOURCE_UNAVAILABLE');
  if(kind==='invoice'?(s.items!.length>1||s.hasMore||(s.items! as InvoiceReadSnapshot['items'])!.some(i=>i.invoiceId.toLowerCase()!==r.invoiceId))
   :s.items!.length>200||(s.hasMore&&s.items!.length!==200))fail('PAYMENT_SOURCE_UNAVAILABLE');
  const indexed=Date.parse(s.indexedAt!),time=now();if(!Number.isFinite(indexed)||indexed>time+1000)fail('PAYMENT_INDEXER_TIME_INVALID');indexedTimes.push(indexed);checkpoint();
 }
 function identity(observed:QuoteIdentity,pin:{height:string;hash:string}){
  if(observed.chainId!==manifest.chainId||typeof observed.head!=='bigint'||observed.head<0n||observed.head>=(1n<<256n)||!observed.block
   ||observed.block.height!==pin.height||!hashSchema.safeParse(observed.block.hash).success||observed.block.hash.toLowerCase()!==pin.hash
   ||typeof observed.block.timestamp!=='bigint'||observed.block.timestamp<0n||observed.block.timestamp+20n>=(1n<<40n)||observed.head<BigInt(pin.height)+2n)fail('PAYMENT_RPC_IDENTITY_INVALID');
 }
 async function readIdentity(pin:{height:string;hash:string}){charge('identityMembers',3);const result=await run(()=>deps!.readIdentity(manifest,pin,group.signal,rpcBudget()),'PAYMENT_RPC_UNAVAILABLE');identity(result,pin);return result;}
 async function readContext(context:PaymentContextInput){charge('contextMembers',preparePaymentContext(context).calls.length);return structuredClone(await run(()=>deps!.readContext(context,group.signal,rpcBudget()),'PAYMENT_CONTEXT_UNAVAILABLE'));}
 function complete(expected:StaticReadCall[],rows:StaticReadResult[]){
  if(!Array.isArray(rows)||rows.length!==expected.length)fail('PAYMENT_BATCH_INCOMPLETE');
  const remaining=new Map(expected.map(c=>[c.id,c]));
  for(const row of rows){const call=remaining.get(row?.request?.id);if(!call||!isDeepStrictEqual(call,row.request))fail('PAYMENT_BATCH_INCOMPLETE');remaining.delete(call!.id);
   if(row.status==='fulfilled'){if(Object.keys(row).sort().join()!=='data,request,status'||typeof row.data!=='string'||row.data.length>524290||!/^0x(?:[0-9a-fA-F]{2})*$/.test(row.data))fail('PAYMENT_BATCH_INVALID');}
   else if(row.status!=='rejected'||row.reason!=='revert'||Object.keys(row).sort().join()!=='reason,request,status')fail('PAYMENT_BATCH_INVALID');
  }
  return rows;
 }
 try{
  checkpoint();const invoiceQuery:InvoiceReadQuery={kind:'detail',id:r.invoiceId};
  const before=structuredClone(await run(()=>deps.readInvoices(manifest,invoiceQuery),'PAYMENT_DATABASE_UNAVAILABLE'));source(before,'invoice');
  if(!isDeepStrictEqual(before.asOf,before.currentCursor))fail('PAYMENT_SOURCE_UNAVAILABLE');
  const pin=before.asOf!,first=await readIdentity(pin);blockTimestamp=first.block.timestamp;checkpoint();
  if(first.head!==BigInt(before.currentCursor!.height)+2n)fail('PAYMENT_INDEXER_STALE');
  const contextInput:PaymentContextInput={manifest,request:r,pin},record=before.items![0];
  let initialContext:PaymentContext|undefined,funding:PaymentFunding|undefined,pending:PaymentValidationError|PaymentFailure|undefined;
  let candidates:StrategyReadSnapshot|undefined,candidateQuery:StrategyReadQuery|undefined,routing:RoutingData|null=null,search:PaymentSearchSummary|null=null;
  if(record){
   initialContext=await readContext(contextInput);
   try{funding=validatePaymentFunding(contextInput,record,initialContext,blockTimestamp);invoiceDeadline=funding.snapshot.expiresAt;}
   catch(error){if(error instanceof PaymentValidationError&&error.httpStatus!==503)pending=error;else throw error;}
   if(funding?.kind==='swap'){
    checkpoint();candidateQuery={kind:'candidates',tokenIn:r.tokenIn,tokenOut:manifest.usdc.toLowerCase(),pin};
    candidates=structuredClone(await run(()=>deps.readDatabase(manifest,candidateQuery!),'PAYMENT_DATABASE_UNAVAILABLE'));source(candidates,'strategy',pin);
    if(!isDeepStrictEqual(candidates.currentCursor,pin))fail('PAYMENT_SOURCE_UNAVAILABLE');
    const makeRouting=(amount:bigint):RoutingInput=>({manifest,snapshot:candidates!,blockTimestamp:blockTimestamp!.toString(),intent:{kind:'payment',payer:r.payer,tokenIn:r.tokenIn,amountInRaw:amount.toString(),minimumOutRaw:record.amountDueRaw,invoiceExpiresAt:record.expiresAt,maxCrossings:r.maxCrossings}});
    const initial=makeRouting(funding.seedRaw),plan=prepareRouting(initial),inspections:StaticReadResult[]=[];
    for(let batchIndex=0;batchIndex<plan.batches.length;batchIndex++){const batch=plan.batches[batchIndex]!;charge('inspectionMembers',batch.length);
     inspections.push(...complete(batch,await run(()=>deps.readBatch(initial,{kind:'inspection',batchIndex},group.signal,rpcBudget()),'PAYMENT_RPC_UNAVAILABLE')));}
    const eligible=prepareWholeSizeQuotes(initial,inspections).quoteCalls.map(c=>c.id.split(':')[0]!);
    const result=await searchPaymentInput<RoutingData>({seed:funding.seedRaw,bound:funding.boundRaw,eligibleOrderHashes:eligible,checkpoint,
     shouldRefine:()=>Math.min(timeout-(performance.now()-started),Math.min(...indexedTimes)+10000-now(),Number(funding!.expiresAt)*1000-now())>2000},async amount=>{
      const input=makeRouting(amount),prepared=prepareWholeSizeQuotes(input,inspections),ids=prepared.quoteCalls.map(c=>c.id.split(':')[0]!);
      if(!isDeepStrictEqual(ids,eligible))fail('PAYMENT_ELIGIBLE_SET_CHANGED');
      const quotes:StaticReadResult[]=[];
      for(let batchIndex=0;batchIndex<prepared.quoteBatches.length;batchIndex++){const batch=prepared.quoteBatches[batchIndex]!;charge('quoteMembers',batch.length);
       let hit=false;const onCacheHit=()=>{checkpoint();if(hit)fail('PAYMENT_CACHE_ACCOUNTING_INVALID');hit=true;work.nativeBatches--;work.cacheHitBatches++;work.cacheHitMembers+=batch.length;};
       quotes.push(...complete(batch,await run(()=>deps.readBatch(input,{kind:'quote',batchIndex,observations:inspections},group.signal,rpcBudget(),onCacheHit),'PAYMENT_RPC_UNAVAILABLE')));}
      const selected=selectWholeSizeQuotes(input,inspections,quotes),quoted=new Set(selected.diagnostics.filter(d=>d.code==='QUOTED').map(d=>d.orderHash));
      const value:RoutingData={best:selected.best,alternatives:selected.alternatives,counts:selected.counts,coverage:selected.coverage,diagnostics:selected.diagnostics};
      return {outcomes:eligible.map(orderHash=>({orderHash,status:quoted.has(orderHash)?'quoted' as const:'unavailable' as const})),value:selected.best?value:null};
     });
    const {selected,...summary}=result;search=summary;routing=selected?.value??null;
    if(result.quoteCallsUsed!==work.quoteMembers)fail('PAYMENT_WORK_INVALID');
    if(!routing)pending=new PaymentFailure('PAYMENT_SEARCH_EXHAUSTED');
   }
  }
  if(initialContext){const finalContext=await readContext(contextInput);if(!isDeepStrictEqual(initialContext,finalContext))fail('PAYMENT_CONTEXT_CHANGED');}
  const last=await readIdentity(pin);if(last.head<first.head||last.block.timestamp!==blockTimestamp)fail('PAYMENT_RPC_IDENTITY_INVALID');
  const after=structuredClone(await run(()=>deps.readInvoices(manifest,{...invoiceQuery,pin}),'PAYMENT_DATABASE_UNAVAILABLE'));source(after,'invoice',pin);
  if(!isDeepStrictEqual(pinned(before),pinned(after)))fail('PAYMENT_SOURCE_CHANGED');
  if(last.head!==BigInt(after.currentCursor!.height)+2n)fail('PAYMENT_INDEXER_STALE');
  if(candidates){const final=await run(()=>deps.readDatabase(manifest,candidateQuery!),'PAYMENT_DATABASE_UNAVAILABLE');source(final,'strategy',pin);
   if(!isDeepStrictEqual(pinned(candidates),pinned(final)))fail('PAYMENT_SOURCE_CHANGED');
   if(!isDeepStrictEqual(final.currentCursor,after.currentCursor)||last.head!==BigInt(final.currentCursor!.height)+2n)fail('PAYMENT_INDEXER_STALE');}
  checkpoint();const observed=now(),indexed=Math.min(...indexedTimes);
  const observation:ObservationScope={chainId:scope.chainId,deploymentId:scope.id,asOf:pin,currentIndexedBlock:after.currentCursor!,historical:BigInt(pin.height)<BigInt(after.currentCursor!.height),
   freshness:{indexedAt:new Date(indexed).toISOString(),ageMs:Math.max(0,Math.ceil(observed-indexed)),head:last.head.toString(),blockTimestamp:blockTimestamp.toString(),observedAt:new Date(observed).toISOString()},coverage:{...before.coverage,complete:true}};
  if(!record)return {...paymentUnavailable('INVOICE_NOT_FOUND',404),...observation,canonicalVerification:'verified_at_pin'};
  if(pending)throw pending;if(!funding)fail('PAYMENT_DATA_INVALID');
  const funded=funding!,route=routing?.best,amount=route?BigInt(route.amountInRaw):funded.snapshot.amountDueRaw,out=route?BigInt(route.amountOutRaw):funded.snapshot.amountDueRaw;
  if(funded.kind==='swap'&&!route)fail('PAYMENT_DATA_INVALID');
  const ctx:PlanContext={manifest,chainId:manifest.chainId,account:r.payer as `0x${string}`,now:blockTimestamp};
  let intent:PaymentInput={kind:'direct',invoice:funded.snapshot};
  if(route){const config=configFromDTO(route.config);intent={kind:'swap',invoice:funded.snapshot,config,order:buildOrder(config),tokenIn:r.tokenIn as `0x${string}`,amountInRaw:amount,minimumOutRaw:funded.snapshot.amountDueRaw,deadline:funded.expiresAt,maxCrossings:r.maxCrossings,
   quote:{chainId:manifest.chainId,router:manifest.router,orderHash:route.orderHash,configHash:route.configHash,caller:route.caller,recipient:route.recipient,tokenIn:route.tokenIn,tokenOut:route.tokenOut,amountInRaw:route.amountInRaw,amountOutRaw:route.amountOutRaw,feeRaw:route.feeRaw,stateVersion:route.stateVersion,blockNumber:pin.height,blockHash:pin.hash,expiresAt:route.expiresAt,maxCrossings:route.maxCrossings}};}
  const plan=wirePlan(buildPaymentTx(ctx,intent)),approvalRequired=funded.allowanceRaw<amount,approval=approvalRequired?wirePlan(buildPaymentApprovalTx(ctx,intent)):null;
  checkpoint();return {schemaVersion:1,status:'observed',httpStatus:200,code:'PAYMENT_QUOTE_OBSERVED',financialExecutionEnabled:false,paymentEligibilityVerified:false,canonicalVerification:'verified_at_pin',...observation,
   data:{request:r,kind:funded.kind,invoice:funded.invoice,tokenIn:funded.token,amountInRaw:amount.toString(),amountOutRaw:out.toString(),minimumOutRaw:funded.snapshot.amountDueRaw.toString(),feeRaw:route?.feeRaw??'0',refundRaw:(out-funded.snapshot.amountDueRaw).toString(),expiresAt:funded.expiresAt.toString(),
    funding:{balanceRaw:funded.balanceRaw.toString(),allowanceRaw:funded.allowanceRaw.toString(),boundRaw:funded.boundRaw.toString(),spender:manifest.payments.toLowerCase(),approvalRequired},routing,search,work,reviewOnly:true,plan,approval}};
 }catch(error){return paymentUnavailable(error instanceof PaymentFailure||error instanceof PaymentValidationError?error.message:'PAYMENT_DATA_INVALID',error instanceof PaymentFailure||error instanceof PaymentValidationError?error.httpStatus:503);}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);abort();}
}
