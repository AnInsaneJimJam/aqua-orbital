import type {Address,Hex} from 'viem';
import type {DeploymentManifest,QuoteRequest,SwapQuoteObservationDTO} from '@orbital/shared';
import {decodeSwapQuoteObservation} from './quote-read';
import {buildOrder,hashConfig,type Config,type TransactionPlan} from './codec';
import {configFromDTO} from './dto';
import {buildSwapTx,buildSwapApprovalTx,type SwapInput,type PlanContext} from './plans';
import {executeReviewed,type ExecutionPort,type PendingTransaction,type TransactionEstimate} from './execution';
import {same,freeze,funded,nativeTokenSpend,withinBudget} from './review-core';

type Observed=Extract<SwapQuoteObservationDTO,{status:'observed'}>;
export type SwapDraft={context:PlanContext;request:QuoteRequest;observation:Observed;input:SwapInput};
export type SwapBlock={number:bigint;hash:Hex;timestamp:bigint};
export type SwapLiveState={chainId:number;block:SwapBlock;config:Config;maker:Address;configHash:Hex;status:number;version:bigint;balanceRaw:bigint;allowanceRaw:bigint;inputDecimals:number;outputDecimals:number;liveTokens:boolean;backingValid:boolean;outputFundingRaw:bigint;quotedInputRaw:bigint;quotedOutputRaw:bigint;quotedOrderHash:Hex};
/** All observe fields must share one canonical block; estimate simulates exact
 * bytes without overrides. No method except send may request a signature. */
export type SwapPort=ExecutionPort&{observe:(draft:SwapDraft)=>Promise<SwapLiveState>;canonical:(block:Pick<SwapBlock,'number'|'hash'>)=>Promise<void>};
export type SwapReview={draft:SwapDraft;stage:'approval'|'swap';plan:TransactionPlan;estimate:TransactionEstimate;expiresAtMs:number;block:SwapBlock};
const drafts=new WeakSet<object>(),reviews=new WeakSet<object>();
export function createSwapDraft(raw:unknown,status:number,manifest:DeploymentManifest,request:QuoteRequest,settings:{deadlineSeconds:number},nowMs=Date.now()):SwapDraft {
 const observation=decodeSwapQuoteObservation(raw,status,manifest,request,nowMs);
 if(observation.status!=='observed'||!observation.data.best)throw Error('Swap quote unavailable. Refresh and try again.');
 if(![60,180,600].includes(settings.deadlineSeconds))throw Error('Select a supported transaction deadline');
 const r=observation.data.best,config=configFromDTO(r.config),context:PlanContext={manifest:structuredClone(manifest),chainId:manifest.chainId,account:request.wallet as Address,now:BigInt(observation.freshness.blockTimestamp)};
 const input:SwapInput={config,order:buildOrder(config),tokenIn:request.tokenIn as Address,tokenOut:request.tokenOut as Address,recipient:request.recipient as Address,amountInRaw:BigInt(request.amountInRaw),minimumOutRaw:BigInt(r.minimumOutRaw),deadline:context.now+BigInt(settings.deadlineSeconds),maxCrossings:request.maxCrossings,
  quote:{chainId:manifest.chainId,router:manifest.router,orderHash:r.orderHash,configHash:r.configHash,caller:r.caller,recipient:r.recipient,tokenIn:r.tokenIn,tokenOut:r.tokenOut,amountInRaw:r.amountInRaw,amountOutRaw:r.amountOutRaw,feeRaw:r.feeRaw,stateVersion:r.stateVersion,blockNumber:observation.asOf.height,blockHash:observation.asOf.hash,expiresAt:r.expiresAt,maxCrossings:r.maxCrossings}};
 buildSwapTx(context,input);
 const draft=freeze({context,request:structuredClone(request),observation,input});drafts.add(draft);return draft;
}
function fresh(draft:SwapDraft,now:()=>number){
 if(!drafts.has(draft))throw Error('Prepare a new validated swap draft');
 decodeSwapQuoteObservation(draft.observation,200,draft.context.manifest,draft.request,now());
}
async function liveState(draft:SwapDraft,port:SwapPort,now:()=>number){
 fresh(draft,now);const {context:c,input:i,observation:o}=draft,identity=await port.identity();
 if(identity.chainId!==c.chainId||!identity.account||!same(identity.account,c.account))throw Error('Wallet or network changed. Review again.');
 const live=await port.observe(draft),t=live.block.timestamp,clock=now();
 if(live.chainId!==c.chainId||live.block.number<BigInt(o.asOf.height)||!/^0x[0-9a-fA-F]{64}$/.test(live.block.hash)||t<c.now||Number(t)*1000>clock+1000||clock-Number(t)*1000>=20000||t>=BigInt(i.quote.expiresAt))throw Error('Current chain observation is stale');
 if(live.status!==1)throw Error('The selected strategy is retired or unavailable');
 if(!live.liveTokens)throw Error('The selected strategy is docked or incomplete');
 if(!live.backingValid)throw Error('Maker inventory is not backed');
 if(!same(live.maker,i.config.maker)||!same(live.configHash,i.quote.configHash)||!same(hashConfig(live.config),i.quote.configHash)||live.version!==BigInt(i.quote.stateVersion))throw Error('Strategy changed. Refresh the quote.');
 const a=c.manifest.tokens.find(v=>same(v.address,i.tokenIn))!,b=c.manifest.tokens.find(v=>same(v.address,i.tokenOut))!;
 if(live.inputDecimals!==a.decimals||live.outputDecimals!==b.decimals)throw Error('Token metadata changed');
 if(live.balanceRaw<i.amountInRaw||live.allowanceRaw<0n)throw Error('Insufficient input token balance');
 if(!same(live.quotedOrderHash,i.quote.orderHash)||live.quotedInputRaw!==i.amountInRaw||live.quotedOutputRaw<i.minimumOutRaw)throw Error('The current quote does not meet the reviewed minimum');
 if(live.outputFundingRaw<live.quotedOutputRaw)throw Error('Insufficient maker inventory');
 await port.canonical({number:BigInt(o.asOf.height),hash:o.asOf.hash as Hex});await port.canonical(live.block);fresh(draft,now);
 return live;
}
export async function prepareSwapReview(draft:SwapDraft,port:SwapPort,now:()=>number=Date.now):Promise<SwapReview>{
 const live=await liveState(draft,port,now),stage=live.allowanceRaw<draft.input.amountInRaw?'approval':'swap',context={...draft.context,now:live.block.timestamp};
 const plan=stage==='approval'?buildSwapApprovalTx(context,draft.input):buildSwapTx(context,draft.input);
 const estimate={...await port.estimate(plan),nativeSpend:nativeTokenSpend(context.chainId,draft.input.tokenIn,context.manifest.usdc,draft.input.amountInRaw)};
 funded(estimate,estimate.nativeSpend);await port.canonical(live.block);fresh(draft,now);
 const identity=await port.identity();if(identity.chainId!==context.chainId||!identity.account||!same(identity.account,context.account))throw Error('Wallet changed. Review again.');fresh(draft,now);
 const expiresAtMs=Math.min(Date.parse(draft.observation.freshness.indexedAt)+10000,Number(draft.input.quote.expiresAt)*1000);
 const review=freeze<SwapReview>({draft,stage,plan,estimate,expiresAtMs,block:live.block});reviews.add(review);return review;
}
export async function executeSwapReview(review:SwapReview,port:SwapPort,persist:(pending:PendingTransaction)=>void,now:()=>number=Date.now){
 if(!reviews.has(review)||now()>=review.expiresAtMs)throw Error('Swap review expired. Review again.');reviews.delete(review);
 const {draft,estimate:budget}=review;
 return executeReviewed(review.plan,{...port,send:async(plan,fees)=>{fresh(draft,now);if(now()>=review.expiresAtMs)throw Error('Swap review expired. Review again.');return port.send(plan,fees);},estimate:async plan=>{
  const live=await liveState(draft,port,now),stage=live.allowanceRaw<draft.input.amountInRaw?'approval':'swap';
  if(stage!==review.stage)throw Error('Token allowance changed. Review again.');
  const estimate=withinBudget(await port.estimate(plan),budget);await port.canonical(live.block);fresh(draft,now);
  if(now()>=review.expiresAtMs)throw Error('Swap review expired. Review again.');return estimate;
 }},persist);
}
