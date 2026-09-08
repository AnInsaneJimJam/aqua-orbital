import type {Address,Hex} from 'viem';
import type {DeploymentManifest,PaymentQuoteRequest,PaymentQuoteObservationDTO} from '@orbital/shared';
import {decodePaymentQuoteObservation} from './payment-read';
import {buildOrder,type TransactionPlan} from './codec';
import {configFromDTO} from './dto';
import {buildPaymentTx,buildPaymentApprovalTx,type InvoiceSnapshot,type PaymentInput,type PlanContext} from './plans';
import {executeReviewed,type ExecutionPort,type PendingTransaction,type TransactionEstimate} from './execution';
import {same,freeze,funded,nativeTokenSpend,withinBudget} from './review-core';

type Observed=Extract<PaymentQuoteObservationDTO,{status:'observed'}>;
export type PaymentDraft={context:PlanContext;request:PaymentQuoteRequest;observation:Observed;input:PaymentInput};
export type PaymentBlock={number:bigint;hash:Hex;timestamp:bigint};
export type PaymentLiveState={chainId:number;block:PaymentBlock;invoice:InvoiceSnapshot;usdc:Address;router:Address;allowedToken:boolean;decimals:number;usdcDecimals:number;balanceRaw:bigint;allowanceRaw:bigint};
/** observe must use one canonical block for the complete invoice/funding read.
 * estimate must simulate this exact transaction before estimating its gas.
 * Providers supply observations only; no method may sign except send. */
export type PaymentPort=ExecutionPort&{observe:(draft:PaymentDraft)=>Promise<PaymentLiveState>;canonical:(block:Pick<PaymentBlock,'number'|'hash'>)=>Promise<void>};
export type PaymentReview={draft:PaymentDraft;stage:'approval'|'payment';plan:TransactionPlan;estimate:TransactionEstimate;expiresAtMs:number;block:PaymentBlock};
const issuedDrafts=new WeakSet<object>(),issuedReviews=new WeakSet<object>();
/** The public response remains review-only. This constructs a local intent,
 * never trusts its calldata, and still requires independent live preflight. */
export function createPaymentDraft(raw:unknown,status:number,manifest:DeploymentManifest,request:PaymentQuoteRequest,nowMs=Date.now()):PaymentDraft {
 const observation=decodePaymentQuoteObservation(raw,status,manifest,request,nowMs);
 if(observation.status!=='observed')throw Error('Payment quote unavailable. Refresh and try again.');
 const d=observation.data,inv=d.invoice;
 const invoice:InvoiceSnapshot={chainId:manifest.chainId,adapter:manifest.payments as Address,id:request.invoiceId as Hex,merchant:inv.merchant as Address,status:'unpaid',amountDueRaw:BigInt(inv.amountDueRaw),expiresAt:BigInt(inv.expiresAt),recipients:inv.recipients.map(r=>r.address as Address),bps:inv.recipients.map(r=>r.bps),memoHash:inv.memoHash as Hex};
 const context:PlanContext={manifest:structuredClone(manifest),chainId:manifest.chainId,account:request.payer as Address,now:BigInt(observation.freshness.blockTimestamp)};
 let input:PaymentInput={kind:'direct',invoice};
 if(d.kind==='swap'){
  const route=d.routing!.best,config=configFromDTO(route.config);
  input={kind:'swap',invoice,config,order:buildOrder(config),tokenIn:request.tokenIn as Address,amountInRaw:BigInt(d.amountInRaw),minimumOutRaw:BigInt(d.minimumOutRaw),deadline:BigInt(d.expiresAt),maxCrossings:request.maxCrossings,
   quote:{chainId:manifest.chainId,router:manifest.router,orderHash:route.orderHash,configHash:route.configHash,caller:route.caller,recipient:route.recipient,tokenIn:route.tokenIn,tokenOut:route.tokenOut,amountInRaw:route.amountInRaw,amountOutRaw:route.amountOutRaw,feeRaw:route.feeRaw,stateVersion:route.stateVersion,blockNumber:observation.asOf.height,blockHash:observation.asOf.hash,expiresAt:route.expiresAt,maxCrossings:route.maxCrossings}};
 }
 // Also reconstruct here: refactors of the decoder cannot silently turn this
 // boundary into a server-calldata pass-through.
 const plan=buildPaymentTx(context,input);
 if(!same(plan.to,d.plan.to)||!same(plan.data,d.plan.data))throw Error('Payment plan mismatch');
 const draft=freeze({context,request:structuredClone(request),observation,input});issuedDrafts.add(draft);return draft;
}
export const paymentNativeSpend=nativeTokenSpend;
function fresh(draft:PaymentDraft,now:()=>number){
 if(!issuedDrafts.has(draft))throw Error('Prepare a new validated payment draft');
 decodePaymentQuoteObservation(draft.observation,200,draft.context.manifest,draft.request,now());
}
async function liveState(draft:PaymentDraft,port:PaymentPort,now:()=>number){
 fresh(draft,now);
 const identity=await port.identity(),{context:c,request:r,observation:o}=draft;
 if(identity.chainId!==c.chainId||!identity.account||!same(identity.account,c.account))throw Error('Wallet or network changed. Review again.');
 const live=await port.observe(draft),a=live.invoice,b=draft.input.invoice,t=live.block.timestamp,clock=now();
 if(live.chainId!==c.chainId||live.block.number<BigInt(o.asOf.height)||!/^0x[0-9a-fA-F]{64}$/.test(live.block.hash)||t<c.now||Number(t)*1000>clock+1000||clock-Number(t)*1000>=20000||t>=BigInt(o.data.expiresAt))throw Error('Current chain observation is stale');
 if(a.chainId!==b.chainId||!same(a.adapter,b.adapter)||!same(a.id,b.id)||a.status!=='unpaid'||!same(a.merchant,b.merchant)||a.amountDueRaw!==b.amountDueRaw||a.expiresAt!==b.expiresAt||!same(a.memoHash,b.memoHash)
  ||a.recipients.length!==b.recipients.length||a.bps.length!==b.bps.length||a.recipients.some((v,i)=>!same(v,b.recipients[i]!))||a.bps.some((v,i)=>v!==b.bps[i]))throw Error('Invoice changed. Refresh its terms.');
 if(!same(live.usdc,c.manifest.usdc)||!same(live.router,c.manifest.router)||live.allowedToken!==true||live.decimals!==o.data.tokenIn.decimals||live.usdcDecimals!==6)throw Error('Payment deployment changed');
 if(live.balanceRaw<BigInt(o.data.amountInRaw)||live.allowanceRaw<0n)throw Error('Insufficient input token balance');
 await port.canonical({number:BigInt(o.asOf.height),hash:o.asOf.hash as Hex});await port.canonical(live.block);fresh(draft,now);
 return live;
}
/** Explicit review of one action. Approval success never signs a payment. */
export async function preparePaymentReview(draft:PaymentDraft,port:PaymentPort,now:()=>number=Date.now):Promise<PaymentReview>{
 const live=await liveState(draft,port,now),stage=live.allowanceRaw<BigInt(draft.observation.data.amountInRaw)?'approval':'payment';
 const ctx={...draft.context,now:live.block.timestamp},plan=stage==='approval'?buildPaymentApprovalTx(ctx,draft.input):buildPaymentTx(ctx,draft.input);
 const estimate={...await port.estimate(plan),nativeSpend:paymentNativeSpend(ctx.chainId,draft.request.tokenIn,ctx.manifest.usdc,BigInt(draft.observation.data.amountInRaw))};
 funded(estimate,estimate.nativeSpend);await port.canonical(live.block);fresh(draft,now);
 const identity=await port.identity();if(identity.chainId!==ctx.chainId||!identity.account||!same(identity.account,ctx.account))throw Error('Wallet changed. Review again.');
 const expiresAtMs=Math.min(Date.parse(draft.observation.freshness.indexedAt)+10000,Number(draft.observation.data.expiresAt)*1000);
 const review=freeze<PaymentReview>({draft,stage,plan,estimate,expiresAtMs,block:live.block});issuedReviews.add(review);return review;
}
export async function executePaymentReview(review:PaymentReview,port:PaymentPort,persist:(pending:PendingTransaction)=>void,now:()=>number=Date.now){
 if(!issuedReviews.has(review)||now()>=review.expiresAtMs)throw Error('Payment review expired. Review again.');
 // Consume before awaiting: double clicks or direct repeated SDK calls cannot
 // submit the same review twice, including after ambiguous RPC/storage errors.
 issuedReviews.delete(review);
 const {draft,estimate:budget}=review;
 return executeReviewed(review.plan,{...port,send:async(plan,fees)=>{fresh(draft,now);if(now()>=review.expiresAtMs)throw Error('Payment review expired. Review again.');return port.send(plan,fees);},estimate:async plan=>{
  const live=await liveState(draft,port,now),stage=live.allowanceRaw<BigInt(draft.observation.data.amountInRaw)?'approval':'payment';
  if(stage!==review.stage)throw Error('Token allowance changed. Review again.');
  const estimate=await port.estimate(plan),bounded=withinBudget(estimate,budget);
  await port.canonical(live.block);fresh(draft,now);if(now()>=review.expiresAtMs)throw Error('Payment review expired. Review again.');
  return bounded;
 }},persist);
}
