import {decodeFunctionData,encodeFunctionData,decodeEventLog,encodeEventTopics,encodeAbiParameters,type Address,type Hex} from 'viem';
import {hashSchema,nonzeroAddressSchema} from '@orbital/shared';
import type {TransactionPlan} from './codec';
import {paymentsAbi,paymentsEventsAbi} from './generated/abi';
import {buildInvoiceTx,buildCancelInvoiceTx,validateInvoiceTerms,type PlanContext,type InvoiceCreateInput,type InvoiceSnapshot} from './plans';
import {executeReviewed,type ExecutionPort,type PendingTransaction,type TransactionEstimate,type TransactionReceipt} from './execution';
import type {PaymentBlock} from './payment-review';
import {freeze,same,funded,withinBudget} from './review-core';

export type InvoiceTerms=Omit<InvoiceCreateInput,'merchantNonce'>;
export type InvoiceAdminIntent={kind:'create';terms:InvoiceTerms}|{kind:'cancel';invoice:InvoiceSnapshot};
export type InvoiceAdminDraft={context:PlanContext;intent:InvoiceAdminIntent};
export type InvoiceAdminLive={chainId:number;block:PaymentBlock;usdc:Address;router:Address;usdcDecimals:number;merchantNonce?:bigint;invoice?:InvoiceSnapshot};
/** Observe all immutable metadata and nonce/invoice at one canonical block.
 * estimate must simulate exact calldata without state overrides. */
export type InvoiceAdminPort=ExecutionPort&{observe:(draft:InvoiceAdminDraft)=>Promise<InvoiceAdminLive>;canonical:(block:Pick<PaymentBlock,'number'|'hash'>)=>Promise<void>};
export type InvoiceAdminReview={draft:InvoiceAdminDraft;kind:'create'|'cancel';plan:TransactionPlan;estimate:TransactionEstimate;block:PaymentBlock;expiresAtMs:number;merchantNonce?:bigint;predictedInvoiceId?:Hex};
export type InvoiceAdminReceiptIntent={kind:'create'|'cancel';plan:TransactionPlan};
const drafts=new WeakSet<object>(),reviews=new WeakSet<object>();

export function createInvoiceAdminDraft(context:PlanContext,intent:InvoiceAdminIntent):InvoiceAdminDraft {
 if(intent.kind==='create')buildInvoiceTx(context,{...intent.terms,merchantNonce:0n});
 else if(intent.kind==='cancel')buildCancelInvoiceTx(context,intent.invoice);
 else throw Error('Unknown invoice administration action');
 const draft=freeze(structuredClone({context,intent}));drafts.add(draft);return draft;
}
function sameInvoice(a:InvoiceSnapshot,b:InvoiceSnapshot){
 return a.chainId===b.chainId&&same(a.adapter,b.adapter)&&same(a.id,b.id)&&same(a.merchant,b.merchant)&&a.status==='unpaid'&&b.status==='unpaid'
  &&a.amountDueRaw===b.amountDueRaw&&a.expiresAt===b.expiresAt&&same(a.memoHash,b.memoHash)&&a.recipients.length===b.recipients.length&&a.bps.length===b.bps.length
  &&a.recipients.every((r,k)=>same(r,b.recipients[k]!))&&a.bps.every((v,k)=>v===b.bps[k]);
}
function freshBlock(block:PaymentBlock,now:()=>number){
 if(typeof block.number!=='bigint'||block.number<0n||!hashSchema.safeParse(block.hash).success||typeof block.timestamp!=='bigint'||block.timestamp<0n
  ||Number(block.timestamp)*1000>now()+1000||now()-Number(block.timestamp)*1000>=20000)throw Error('Current chain observation is stale');
}
async function liveState(draft:InvoiceAdminDraft,port:InvoiceAdminPort,now:()=>number){
 if(!drafts.has(draft))throw Error('Prepare a new validated invoice draft');
 const {context:c,intent}=draft,identity=await port.identity();
 if(identity.chainId!==c.chainId||!identity.account||!same(identity.account,c.account))throw Error('Wallet or network changed. Review again.');
 const live=await port.observe(draft);freshBlock(live.block,now);
 if(live.chainId!==c.chainId||!same(live.usdc,c.manifest.usdc)||!same(live.router,c.manifest.router)||live.usdcDecimals!==6)throw Error('Invoice deployment changed');
 const ctx={...c,now:live.block.timestamp};
 if(intent.kind==='create'){
  if(typeof live.merchantNonce!=='bigint')throw Error('Invoice nonce unavailable');
  buildInvoiceTx(ctx,{...intent.terms,merchantNonce:live.merchantNonce});
 }else{
  if(!live.invoice||!sameInvoice(live.invoice,intent.invoice))throw Error('Invoice changed. Refresh its terms.');
  buildCancelInvoiceTx(ctx,live.invoice);
 }
 await port.canonical(live.block);freshBlock(live.block,now);return live;
}
export async function prepareInvoiceAdminReview(draft:InvoiceAdminDraft,port:InvoiceAdminPort,now:()=>number=Date.now):Promise<InvoiceAdminReview>{
 const live=await liveState(draft,port,now),{intent,context}=draft,ctx={...context,now:live.block.timestamp};
 const creation=intent.kind==='create'?buildInvoiceTx(ctx,{...intent.terms,merchantNonce:live.merchantNonce!}):undefined;
 const plan=creation?.plan??buildCancelInvoiceTx(ctx,(intent as Extract<InvoiceAdminIntent,{kind:'cancel'}>).invoice);
 const estimate={...await port.estimate(plan),nativeSpend:0n};funded(estimate,0n);
 await port.canonical(live.block);freshBlock(live.block,now);
 const identity=await port.identity();if(identity.chainId!==context.chainId||!identity.account||!same(identity.account,context.account))throw Error('Wallet changed. Review again.');
 const review=freeze<InvoiceAdminReview>({draft,kind:intent.kind,plan,estimate,block:live.block,expiresAtMs:Number(live.block.timestamp)*1000+20000,
  ...(creation?{merchantNonce:live.merchantNonce,predictedInvoiceId:creation.invoiceId}:{})});
 reviews.add(review);return review;
}
export async function executeInvoiceAdminReview(review:InvoiceAdminReview,port:InvoiceAdminPort,persist:(pending:PendingTransaction)=>void,now:()=>number=Date.now){
 const fresh=()=>{if(now()>=review.expiresAtMs)throw Error('Invoice review expired. Review again.');};
 if(!reviews.has(review))throw Error('Prepare a new invoice review');fresh();reviews.delete(review);
 return executeReviewed(review.plan,{...port,estimate:async plan=>{
  const live=await liveState(review.draft,port,now);fresh();
  if(review.kind==='create'&&live.merchantNonce!==review.merchantNonce)throw Error('Merchant nonce changed. Review again.');
  await port.canonical(review.block);const estimate=withinBudget(await port.estimate(plan),review.estimate);
  await port.canonical(live.block);freshBlock(live.block,now);fresh();return estimate;
 },send:async(plan,fees)=>{fresh();return port.send(plan,fees);}},persist);
}

/** Recovery data never grants signing authority. Decode only these canonical calls. */
export function validateInvoiceAdminReceiptIntent(intent:InvoiceAdminReceiptIntent){
 const p=intent.plan;
 if(!['create','cancel'].includes(intent.kind)||![31337,5042002].includes(p.chainId)||p.value!==0n||typeof p.data!=='string'||p.data.length>10000)throw Error('Invalid saved invoice action');
 nonzeroAddressSchema.parse(p.account);nonzeroAddressSchema.parse(p.to);
 const decoded=decodeFunctionData({abi:paymentsAbi,data:p.data});
 if(intent.kind==='create'&&decoded.functionName==='createInvoice'){
  const [amountDueRaw,expiresAt,recipients,bps,memoHash]=decoded.args;
  const terms={amountDueRaw,expiresAt:BigInt(expiresAt),recipients:[...recipients],bps:[...bps],memoHash};validateInvoiceTerms(p.to,terms);
  if(!same(encodeFunctionData({abi:paymentsAbi,functionName:'createInvoice',args:decoded.args}),p.data))throw Error('Noncanonical saved invoice action');
  return {kind:'create' as const,plan:p,terms};
 }
 if(intent.kind==='cancel'&&decoded.functionName==='cancelInvoice'){
  if(!same(encodeFunctionData({abi:paymentsAbi,functionName:'cancelInvoice',args:decoded.args}),p.data))throw Error('Noncanonical saved invoice action');
  return {kind:'cancel' as const,plan:p,invoiceId:decoded.args[0]};
 }
 throw Error('Saved invoice action does not match its stage');
}
/** The transport must first bind canonical transaction bytes to intent.plan.
 * The creation event, never the predicted nonce ID, supplies the shareable ID. */
export function decodeInvoiceAdminReceipt(receipt:TransactionReceipt,intent:InvoiceAdminReceiptIntent){
 const i=validateInvoiceAdminReceiptIntent(intent),bad=():never=>{throw Error('Receipt does not establish the reviewed invoice action');};
 if(receipt.status!=='success'||!hashSchema.safeParse(receipt.hash).success||!hashSchema.safeParse(receipt.blockHash).success||typeof receipt.blockNumber!=='bigint'||receipt.blockNumber<0n||!Array.isArray(receipt.logs)
  ||typeof receipt.gasUsed!=='bigint'||receipt.gasUsed<=0n||typeof receipt.effectiveGasPrice!=='bigint'||receipt.effectiveGasPrice<0n)return bad();
 const eventName=i.kind==='create'?'InvoiceCreated':'InvoiceCancelled',signature=encodeEventTopics({abi:paymentsEventsAbi,eventName})[0]!;
 const logs=receipt.logs.filter(l=>same(l.address,i.plan.to)&&l.topics[0]&&same(l.topics[0],signature));if(logs.length!==1)return bad();const log=logs[0]!;
 if(log.removed!==false||log.blockNumber!==receipt.blockNumber||!same(log.blockHash,receipt.blockHash!)||!same(log.transactionHash,receipt.hash)||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)return bad();
 const decoded=decodeEventLog({abi:paymentsEventsAbi,data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true});
 if(decoded.eventName!==eventName)return bad();const a=decoded.args;
 const topics=encodeEventTopics({abi:paymentsEventsAbi,eventName,args:{invoiceId:a.invoiceId,merchant:a.merchant}});
 if(!same(a.merchant,i.plan.account)||topics.length!==log.topics.length||topics.some((v,k)=>!same(v as Hex,log.topics[k]!)))return bad();
 if(i.kind==='create'){
  if(decoded.eventName!=='InvoiceCreated')return bad();const a=decoded.args,t=i.terms;
  const data=encodeAbiParameters([{type:'uint256'},{type:'uint40'},{type:'address[]'},{type:'uint16[]'},{type:'bytes32'}],[a.amountDueRaw,a.expiresAt,a.recipients,a.bps,a.memoHash]);
  if(!same(data,log.data)||a.amountDueRaw!==t.amountDueRaw||BigInt(a.expiresAt)!==t.expiresAt||!same(a.memoHash,t.memoHash)||a.recipients.length!==t.recipients.length||a.bps.length!==t.bps.length
   ||a.recipients.some((v,k)=>!same(v,t.recipients[k]!))||a.bps.some((v,k)=>v!==t.bps[k]))return bad();
 }else if(!same(a.invoiceId,i.invoiceId)||log.data!=='0x')return bad();
 return freeze({kind:i.kind,invoiceId:a.invoiceId,hash:receipt.hash,blockNumber:receipt.blockNumber,gasPaid:receipt.gasUsed*receipt.effectiveGasPrice});
}
export function invoiceRecipientAmounts(terms:InvoiceTerms){
 let remaining=terms.amountDueRaw;
 return terms.recipients.map((address,k)=>{const amountRaw=k+1===terms.recipients.length?remaining:terms.amountDueRaw*BigInt(terms.bps[k]!)/10000n;remaining-=amountRaw;return {address,bps:terms.bps[k]!,amountRaw};});
}
