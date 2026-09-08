import {encodeAbiParameters,encodeEventTopics,decodeEventLog,erc20Abi,type Address,type Hex} from 'viem';
import {hashSchema} from '@orbital/shared';
import {hashOrder,hashConfig,encodeOrder,buildOrder,type Config,type TransactionPlan} from './codec';
import {buildRetireTx,buildDockTx,buildMakerApprovalTx,validateTransactionPlan,type StrategyInput,type PlanContext,type PlanIntent} from './plans';
import {lifecycleEventsAbi,aquaEventsAbi} from './generated/abi';
import {executeReviewed,type ExecutionPort,type TransactionEstimate,type TransactionReceipt,type PendingTransaction} from './execution';
import {freeze,same,funded,withinBudget} from './review-core';
import type {PaymentBlock} from './payment-review';

export type StrategyAdminIntent={kind:'deactivate'}|{kind:'approve';token:Address};
export type StrategyAdminDraft={context:PlanContext;input:StrategyInput;intent:StrategyAdminIntent};
export type StrategyAdminLive={chainId:number;block:PaymentBlock;config:Config;maker:Address;configHash:Hex;status:1|2;version:bigint;
 availability:{token:Address;liveTokenCount:number;allocation:bigint;allowance:bigint}[]};
export type StrategyAdminPort=ExecutionPort&{observe:(draft:StrategyAdminDraft)=>Promise<StrategyAdminLive>;canonical:(block:Pick<PaymentBlock,'number'|'hash'>)=>Promise<void>};
export type StrategyAdminReceiptIntent={kind:'retire'|'dock'|'approval';context:PlanContext;input:StrategyInput;token?:Address;reset?:boolean;plan:TransactionPlan};
export type StrategyAdminReview=StrategyAdminReceiptIntent&{draft:StrategyAdminDraft;estimate:TransactionEstimate;block:PaymentBlock;version:bigint;expiresAtMs:number};
const drafts=new WeakSet<object>(),reviews=new WeakSet<object>();
export function createStrategyAdminDraft(context:PlanContext,input:StrategyInput,intent:StrategyAdminIntent):StrategyAdminDraft{
 buildRetireTx(context,input);
 if(intent.kind==='approve')buildMakerApprovalTx(context,{...input,token:intent.token,reset:false});
 else if(intent.kind!=='deactivate')throw Error('Unknown strategy administration action');
 const draft=freeze(structuredClone({context,input,intent}));drafts.add(draft);return draft;
}
function freshBlock(block:PaymentBlock,now:()=>number){
 if(typeof block.number!=='bigint'||block.number<0n||!hashSchema.safeParse(block.hash).success||typeof block.timestamp!=='bigint'||block.timestamp<0n
  ||Number(block.timestamp)*1000>now()+1000||now()-Number(block.timestamp)*1000>=20000)throw Error('Current strategy observation is stale');
}
async function liveState(draft:StrategyAdminDraft,port:StrategyAdminPort,now:()=>number){
 if(!drafts.has(draft))throw Error('Prepare a validated strategy draft');
 const {context:c,input}=draft,identity=await port.identity();
 if(identity.chainId!==c.chainId||!identity.account||!same(identity.account,c.account))throw Error('Wallet or network changed. Review again.');
 const live=await port.observe(draft);freshBlock(live.block,now);
 if(live.chainId!==c.chainId||!same(live.maker,c.account)||!same(live.configHash,hashConfig(input.config))
  ||!same(encodeOrder(buildOrder(live.config)),encodeOrder(input.order))||![1,2].includes(live.status)||typeof live.version!=='bigint'||live.version<1n||live.version>=(1n<<64n))throw Error('Strategy identity changed');
 if(live.availability.length!==input.config.tokens.length||live.availability.some((a,i)=>!same(a.token,input.config.tokens[i]!)
  ||!Number.isInteger(a.liveTokenCount)||a.liveTokenCount<0||a.liveTokenCount>255||typeof a.allocation!=='bigint'||a.allocation<0n||a.allocation>=(1n<<248n)
  ||typeof a.allowance!=='bigint'||a.allowance<0n||a.allowance>=(1n<<256n)||(a.liveTokenCount===255&&a.allocation!==0n)))throw Error('Strategy allocation unavailable');
 await port.canonical(live.block);return live;
}
function nextPlan(draft:StrategyAdminDraft,live:StrategyAdminLive):StrategyAdminReceiptIntent{
 const context={...draft.context,now:live.block.timestamp},input=draft.input,base={context,input};
 const docked=live.availability.every(a=>a.liveTokenCount===255),allLive=live.availability.every(a=>a.liveTokenCount===input.config.tokens.length);
 if(draft.intent.kind==='deactivate'){
  if(live.status===1)return {...base,kind:'retire',plan:buildRetireTx(context,input)};
  if(docked)throw Error('This strategy is already retired and docked.');
  if(!allLive)throw Error('Aqua entries cannot be docked as one complete strategy. Check the allocation.');
  return {...base,kind:'dock',plan:buildDockTx(context,input)};
 }
 if(live.status!==1||!allLive)throw Error('Approval updates require a live active strategy.');
 const token=draft.intent.token,i=input.config.tokens.findIndex(t=>same(t,token)),cap=input.config.initialAmountsRaw[i]!*4n,allowance=live.availability[i]!.allowance;
 if(allowance>=cap)throw Error('The current Aqua allowance already covers this bounded cap.');
 // Reset an existing insufficient allowance explicitly before replacing it.
 // This is a separate review/signature and temporarily affects shared strategies.
 const reset=allowance>0n;
 return {...base,kind:'approval',token,reset,plan:buildMakerApprovalTx(context,{...input,token,reset})};
}
export async function prepareStrategyAdminReview(draft:StrategyAdminDraft,port:StrategyAdminPort,now:()=>number=Date.now):Promise<StrategyAdminReview>{
 const live=await liveState(draft,port,now),intent=nextPlan(draft,live),estimate={...await port.estimate(intent.plan),nativeSpend:0n};funded(estimate,0n);
 await port.canonical(live.block);freshBlock(live.block,now);
 const identity=await port.identity();if(identity.chainId!==draft.context.chainId||!identity.account||!same(identity.account,draft.context.account))throw Error('Wallet changed. Review again.');
 const review=freeze<StrategyAdminReview>({...intent,draft,estimate,block:live.block,version:live.version,expiresAtMs:Number(live.block.timestamp)*1000+20000});reviews.add(review);return review;
}
export async function executeStrategyAdminReview(review:StrategyAdminReview,port:StrategyAdminPort,persist:(record:PendingTransaction)=>void,now:()=>number=Date.now){
 const fresh=()=>{if(now()>=review.expiresAtMs)throw Error('Strategy review expired. Review again.');};
 if(!reviews.has(review))throw Error('Prepare a new strategy review');fresh();reviews.delete(review);
 return executeReviewed(review.plan,{...port,estimate:async plan=>{
  const live=await liveState(review.draft,port,now),next=nextPlan(review.draft,live);fresh();
  if(live.version!==review.version||next.kind!==review.kind||next.reset!==review.reset||!same(next.plan.data,plan.data))throw Error('Strategy state or allowance changed. Review again.');
  await port.canonical(review.block);const estimate=withinBudget(await port.estimate(plan),review.estimate);await port.canonical(live.block);freshBlock(live.block,now);fresh();return estimate;
 },send:async(plan,fees)=>{fresh();return port.send(plan,fees);}},persist);
}
export function validateStrategyAdminReceiptIntent(i:StrategyAdminReceiptIntent){
 let intent:PlanIntent;
 if(i.kind==='retire'||i.kind==='dock')intent={kind:i.kind,input:i.input};
 else if(i.kind==='approval'&&i.token&&typeof i.reset==='boolean')intent={kind:'makerApproval',input:{...i.input,token:i.token,reset:i.reset}};
 else throw Error('Invalid saved strategy action');
 validateTransactionPlan(i.plan,i.context,intent);return i;
}
export function decodeStrategyAdminReceipt(receipt:TransactionReceipt,input:StrategyAdminReceiptIntent){
 const i=validateStrategyAdminReceiptIntent(input),orderHash=hashOrder(i.input.order),bad=():never=>{throw Error('Receipt does not establish the reviewed strategy action');};
 if(receipt.status!=='success'||!hashSchema.safeParse(receipt.hash).success||!hashSchema.safeParse(receipt.blockHash).success||typeof receipt.blockNumber!=='bigint'||receipt.blockNumber<0n||!Array.isArray(receipt.logs)
  ||typeof receipt.gasUsed!=='bigint'||receipt.gasUsed<=0n||typeof receipt.effectiveGasPrice!=='bigint'||receipt.effectiveGasPrice<0n)return bad();
 const signature=i.kind==='retire'?encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyRetired'})[0]!:i.kind==='dock'?encodeEventTopics({abi:aquaEventsAbi,eventName:'Docked'})[0]!:encodeEventTopics({abi:erc20Abi,eventName:'Approval'})[0]!;
 const logs=receipt.logs.filter(l=>same(l.address,i.plan.to)&&l.topics[0]&&same(l.topics[0],signature));if(logs.length!==1)return bad();const log=logs[0]!;
 if(log.removed!==false||log.blockNumber!==receipt.blockNumber||!same(log.blockHash,receipt.blockHash!)||!same(log.transactionHash,receipt.hash)||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)return bad();
 let topics:readonly (Hex|Hex[]|null)[],data:Hex;
 if(i.kind==='retire'){
  const decoded=decodeEventLog({abi:lifecycleEventsAbi,data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true});
  if(decoded.eventName!=='StrategyRetired'||decoded.args.version<2n)return bad();
  topics=encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyRetired',args:{maker:i.plan.account,orderHash}});
  data=encodeAbiParameters([{type:'uint64'}],[decoded.args.version]);
 }else if(i.kind==='dock'){
  topics=encodeEventTopics({abi:aquaEventsAbi,eventName:'Docked'});
  data=encodeAbiParameters([{type:'address'},{type:'address'},{type:'bytes32'}],[i.plan.account,i.context.manifest.router as Address,orderHash]);
 }else{
  topics=encodeEventTopics({abi:erc20Abi,eventName:'Approval',args:{owner:i.plan.account,spender:i.context.manifest.aqua as Address}});
  const index=i.input.config.tokens.findIndex(t=>same(t,i.token!));data=encodeAbiParameters([{type:'uint256'}],[i.reset?0n:i.input.config.initialAmountsRaw[index]!*4n]);
 }
 if(!same(data,log.data)||topics.length!==log.topics.length||topics.some((t,k)=>typeof t!=='string'||!same(t,log.topics[k]!)))return bad();
 return {kind:i.kind,orderHash,hash:receipt.hash,gasPaid:receipt.gasUsed*receipt.effectiveGasPrice};
}
