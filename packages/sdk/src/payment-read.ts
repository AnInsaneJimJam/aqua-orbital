import {manifestSchema,paymentQuoteRequestSchema,paymentQuoteObservationSchema,type DeploymentManifest,type PaymentQuoteRequest,type PaymentQuoteObservationDTO,type Token} from '@orbital/shared';
import type {Address,Hex} from 'viem';
import {decodeInvoiceDetail} from './invoice-read';
import {buildOrder,feeIn,hashConfig,hashOrder} from './codec';
import {configFromDTO} from './dto';
import {buildPaymentTx,validateTransactionPlan,type PaymentInput,type InvoiceSnapshot,type PlanContext} from './plans';
import {validPaymentCacheCounts} from './payment-cache-counts';

const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const invalid=():never=>{throw Error('Invalid payment quote observation');};
const min=(a:bigint,b:bigint)=>a<b?a:b;
/** Independently reconstructs the invoice, financial limits and exact unsigned
 * plans. The returned wire object has no execution port and grants no permission
 * to sign; fresh wallet observations, simulation and explicit review remain required. */
export function decodePaymentQuoteObservation(input:unknown,httpStatus:number,configured:DeploymentManifest,requested:PaymentQuoteRequest,nowMs=Date.now()):PaymentQuoteObservationDTO {
 const manifest=manifestSchema.parse(configured),request=paymentQuoteRequestSchema.parse(requested),result=paymentQuoteObservationSchema.parse(input);
 if(result.canonicalVerification==='unavailable'){
  if(!Number.isInteger(httpStatus)||httpStatus<400||httpStatus>599||httpStatus===404)return invalid();return result;
 }
 const present=result.status==='observed',echo=present?result.data.request:result.request;
 if(!manifest.verified||httpStatus!==(present?200:404)||!Number.isSafeInteger(nowMs)||nowMs<0)return invalid();
 for(const key of ['invoiceId','payer','tokenIn'] as const)if(!same(echo[key],request[key]))return invalid();
 if(echo.maxInputRaw!==request.maxInputRaw||echo.maxCrossings!==request.maxCrossings||!same(result.router,manifest.router)||!same(result.adapter,manifest.payments)||result.deploymentStartBlock!==manifest.startBlock
  ||[manifest.aqua,manifest.router,manifest.payments].some(a=>same(a,request.payer)))return invalid();
 const token=manifest.tokens.find(t=>same(t.address,request.tokenIn));if(!token)return invalid();
 const invoice=present?result.data.invoice:null;
 // Reuse independently validated canonical coverage, exact recipient splits,
 // source receipts, deployment identity and token metadata from invoice reads.
 decodeInvoiceDetail({schemaVersion:1,status:'available',code:present?'INVOICES_AVAILABLE':'INVOICE_NOT_FOUND',financialExecutionEnabled:false,
  chainId:result.chainId,deploymentId:result.deploymentId,asOf:result.asOf,currentIndexedBlock:result.currentIndexedBlock,historical:result.historical,
  freshness:{indexedAt:result.freshness.indexedAt,ageMs:result.freshness.ageMs,head:result.freshness.head,stale:false},coverage:result.coverage,data:{invoice},
  ...(!present?{retryable:false,field:'id'}:{})},httpStatus,manifest,request.invoiceId);
 const {freshness:f}=result,indexed=Date.parse(f.indexedAt),observed=Date.parse(f.observedAt),timestamp=BigInt(f.blockTimestamp);
 const deadline=invoice?min(timestamp+20n,BigInt(invoice.expiresAt)):timestamp+20n,age=Math.max(0,observed-indexed);
 if(deadline<=timestamp||deadline>=(1n<<40n)||observed>nowMs+1000||indexed>observed+1000||indexed>nowMs+1000||observed-indexed>10000||nowMs-indexed>10000
  ||f.ageMs<age||f.ageMs>age+1||Number(timestamp)*1000>observed+1000||Number(timestamp)*1000>nowMs+1000||Number(deadline)*1000<=observed||Number(deadline)*1000<=nowMs)return invalid();
 if(!present)return result;
 const d=result.data,inv=d.invoice,due=BigInt(inv.amountDueRaw),amount=BigInt(d.amountInRaw),output=BigInt(d.amountOutRaw),balance=BigInt(d.funding.balanceRaw),allowance=BigInt(d.funding.allowanceRaw),maximum=BigInt(request.maxInputRaw),bound=BigInt(d.funding.boundRaw);
 const direct=same(request.tokenIn,manifest.usdc),tokenMatches=(a:Token,b:Token)=>same(a.address,b.address)&&a.decimals===b.decimals&&a.symbol===b.symbol&&a.mock===b.mock;
 const q=10n**BigInt(18-token.decimals)*(1n<<64n),expectedBound=direct?min(maximum,balance):min(min(maximum,balance),((1n<<160n)-1n)/q);
 if(!tokenMatches(token,d.tokenIn)||inv.status!=='unpaid'||due>=(1n<<160n)/(10n**12n*(1n<<64n))||BigInt(inv.expiresAt)===0n||inv.recipients.some(r=>same(r.address,manifest.payments))
  ||d.kind!==(direct?'direct':'swap')||d.minimumOutRaw!==inv.amountDueRaw||BigInt(d.expiresAt)!==deadline||output<due||BigInt(d.refundRaw)!==output-due
  ||bound!==expectedBound||amount>bound||(!direct&&amount<2n)||!same(d.funding.spender,manifest.payments)||d.funding.approvalRequired!==(allowance<amount)||(d.approval!==null)!==d.funding.approvalRequired)return invalid();
 const snapshot:InvoiceSnapshot={chainId:manifest.chainId,adapter:manifest.payments as Address,id:request.invoiceId as Hex,merchant:inv.merchant as Address,status:'unpaid',amountDueRaw:due,expiresAt:BigInt(inv.expiresAt),recipients:inv.recipients.map(r=>r.address as Address),bps:inv.recipients.map(r=>r.bps),memoHash:inv.memoHash as Hex};
 const ctx:PlanContext={manifest,chainId:manifest.chainId,account:request.payer as Address,now:timestamp};
 let intent:PaymentInput={kind:'direct',invoice:snapshot};
 const w=d.work;
 if(w.logicalMembers!==w.identityMembers+w.contextMembers+w.inspectionMembers+w.quoteMembers)return invalid();
 if(direct){
  if(d.routing!==null||d.search!==null||amount!==due||output!==due||d.feeRaw!=='0'||d.refundRaw!=='0'||w.contextMembers!==14||w.inspectionMembers!==0||w.quoteMembers!==0||w.logicalMembers!==20||w.nativeBatches!==4||w.cacheHitMembers!==0||w.cacheHitBatches!==0)return invalid();
 }else{
  if(!d.routing||!d.search)return invalid();
  const routing=d.routing,search=d.search,c=routing.counts,diagnostics=routing.diagnostics,E=c.eligible,stages=search.stagesUsed;
  if(c.locallyAccepted>c.scanned||c.inspected!==Math.min(c.locallyAccepted,32)||c.notInspected!==c.locallyAccepted-c.inspected||E>c.inspected||E===0||c.quoted===0||c.quoted>E
   ||c.failed!==c.scanned-c.quoted-c.notInspected||diagnostics.length!==c.scanned||new Set(diagnostics.map(d=>d.orderHash.toLowerCase())).size!==diagnostics.length
   ||diagnostics.filter(d=>d.code==='QUOTED').length!==c.quoted||diagnostics.filter(d=>d.code==='NOT_INSPECTED_CAP').length!==c.notInspected||routing.alternatives.length!==Math.min(3,c.quoted-1)
   ||(routing.coverage.scanTruncated&&c.scanned!==200)||diagnostics.some(d=>['QUOTE_MISSING','QUOTE_FAILED','INSPECTION_MISSING'].includes(d.code)))return invalid();
  const quoteCodes=['QUOTED','QUOTE_REVERTED','PARTIAL_FILL','MINIMUM_NOT_MET','QUOTE_DATA_INVALID'];
  const definite=new Set(diagnostics.filter(d=>quoteCodes.includes(d.code)).map(d=>d.orderHash.toLowerCase()));
  const outcomes=new Map(search.outcomes.map(o=>[o.orderHash.toLowerCase(),o]));
  const stageCap=Math.min(16,Math.floor(128/E));
  // OUTPUT_UNAVAILABLE also labels an eligible quote above its live funding
  // ceiling. The aggregate outcome set distinguishes that case from a failed
  // pre-quote availability inspection; the wire does not contain raw getters.
  if(outcomes.size!==E||search.outcomes.length!==E||[...definite].some(id=>!outcomes.has(id))
   ||search.outcomes.some(o=>o.quoted+o.unavailable!==stages||!diagnostics.some(d=>same(d.orderHash,o.orderHash)&&(quoteCodes.includes(d.code)||d.code==='OUTPUT_UNAVAILABLE')))
   ||stages!==search.expansionStages+search.refinementStages||search.expansionStages>Math.min(8,stageCap)||stages>stageCap||search.quoteCallsUsed!==E*stages||search.quoteBatchesUsed!==stages*Math.ceil(E/8)
   ||(search.stopReason==='aggregate_limit'&&stages!==stageCap)||(search.stopReason==='refinement_limit'&&search.refinementStages!==8)
   ||(search.stopReason==='refinement_skipped'&&(stages===stageCap||search.refinementStages===8))
   ||w.contextMembers!==16||w.inspectionMembers!==3*c.inspected||w.quoteMembers!==search.quoteCallsUsed||w.nativeBatches+w.cacheHitBatches!==4+Math.ceil(w.inspectionMembers/8)+search.quoteBatchesUsed)return invalid();
  if(!validPaymentCacheCounts(E,stages,w.cacheHitMembers,w.cacheHitBatches))return invalid();
  const routes=[routing.best,...routing.alternatives];if(new Set(routes.map(r=>r.orderHash.toLowerCase())).size!==routes.length)return invalid();
  for(let index=0;index<routes.length;index++){
   const route=routes[index]!,config=configFromDTO(route.config),order=buildOrder(config),gross=BigInt(route.amountInRaw),out=BigInt(route.amountOutRaw);
   if(!same(hashConfig(config),route.configHash)||!same(hashOrder(order),route.orderHash)||!diagnostics.some(d=>same(d.orderHash,route.orderHash)&&d.code==='QUOTED')||!outcomes.get(route.orderHash.toLowerCase())?.quoted
    ||!same(route.payer,request.payer)||!same(route.caller,manifest.payments)||!same(route.recipient,manifest.payments)||!same(route.tokenIn,request.tokenIn)||!same(route.tokenOut,manifest.usdc)
    ||route.amountInRaw!==d.amountInRaw||route.minimumOutRaw!==inv.amountDueRaw||route.expiresAt!==d.expiresAt||route.maxCrossings!==request.maxCrossings||route.feePpm!==config.feePpm||BigInt(route.feeRaw)!==feeIn(gross,config.feePpm)
    ||out<due||out*10n**12n*(1n<<64n)>=(1n<<160n)||[request.payer,manifest.aqua,manifest.router,manifest.payments].some(a=>same(a,config.maker)))return invalid();
   const candidate:PaymentInput={kind:'swap',invoice:snapshot,config,order,tokenIn:request.tokenIn as Address,amountInRaw:gross,minimumOutRaw:due,deadline,maxCrossings:request.maxCrossings,
    quote:{chainId:manifest.chainId,router:manifest.router,orderHash:route.orderHash,configHash:route.configHash,caller:route.caller,recipient:route.recipient,tokenIn:route.tokenIn,tokenOut:route.tokenOut,amountInRaw:route.amountInRaw,amountOutRaw:route.amountOutRaw,feeRaw:route.feeRaw,stateVersion:route.stateVersion,blockNumber:result.asOf.height,blockHash:result.asOf.hash,expiresAt:route.expiresAt,maxCrossings:route.maxCrossings}};
   buildPaymentTx(ctx,candidate);if(index===0)intent=candidate;
   if(index>0){const previous=routes[index-1]!,a=BigInt(previous.amountOutRaw);if(a<out||(a===out&&(previous.feePpm>route.feePpm||(previous.feePpm===route.feePpm&&previous.orderHash.toLowerCase()>route.orderHash.toLowerCase()))))return invalid();}
  }
  if(d.amountOutRaw!==routing.best.amountOutRaw||d.feeRaw!==routing.best.feeRaw)return invalid();
 }
 validateTransactionPlan({...d.plan,value:0n},ctx,{kind:'payment',input:intent});
 if(d.approval)validateTransactionPlan({...d.approval,value:0n},ctx,{kind:'paymentApproval',input:intent});
 return result;
}
