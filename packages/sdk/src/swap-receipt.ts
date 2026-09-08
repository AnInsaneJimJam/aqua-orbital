import {decodeEventLog,encodeAbiParameters,encodeEventTopics,encodeFunctionData,type Address,type Hex} from 'viem';
import {quoteRequestSchema,uintSchema,uint40Schema,uint64Schema,hashSchema,nonzeroAddressSchema,type ConfigDTO,type QuoteRequest} from '@orbital/shared';
import {buildOrder,feeIn,hashOrder,takerData,routerAbi,type TransactionPlan} from './codec';
import {configFromDTO,configToDTO} from './dto';
import {buildSwapTx} from './plans';
import {swapEventsAbi} from './generated/abi';
import type {SwapDraft} from './swap-review';
import type {TransactionReceipt} from './execution';
import {same,freeze} from './review-core';

/** Public recovery intent only. It is never accepted by the signing API. */
export type SwapReceiptIntent={plan:TransactionPlan;config:ConfigDTO;request:QuoteRequest;minimumOutRaw:string;deadline:string;stateVersion:string};
export function createSwapReceiptIntent(draft:SwapDraft):SwapReceiptIntent {
 return freeze({plan:buildSwapTx(draft.context,draft.input),config:configToDTO(draft.input.config),request:structuredClone(draft.request),minimumOutRaw:draft.input.minimumOutRaw.toString(),deadline:draft.input.deadline.toString(),stateVersion:draft.input.quote.stateVersion});
}
export function validateSwapReceiptIntent(intent:SwapReceiptIntent){
 const config=configFromDTO(intent.config),r=quoteRequestSchema.parse(intent.request),plan=intent.plan,order=buildOrder(config),orderHash=hashOrder(order);
 const minimum=BigInt(uintSchema.parse(intent.minimumOutRaw)),deadline=BigInt(uint40Schema.parse(intent.deadline)),version=BigInt(uint64Schema.parse(intent.stateVersion)),amount=BigInt(r.amountInRaw);
 const inputIndex=config.tokens.findIndex(t=>same(t,r.tokenIn)),outputIndex=config.tokens.findIndex(t=>same(t,r.tokenOut));
 if(![31337,5042002].includes(plan.chainId)||BigInt(plan.chainId)!==config.chainId||!same(plan.account,r.wallet)||!same(plan.to,config.router)||plan.value!==0n||minimum===0n||deadline===0n||version===0n||inputIndex<0||outputIndex<0||inputIndex===outputIndex||same(r.wallet,config.maker)||same(r.recipient,config.maker)||same(r.recipient,config.router))throw Error('Invalid saved swap intent');
 nonzeroAddressSchema.parse(plan.account);nonzeroAddressSchema.parse(plan.to);
 if(amount*10n**BigInt(18-config.decimals[inputIndex]!)*(1n<<64n)>=(1n<<160n)||feeIn(amount,config.feePpm)>=amount)throw Error('Invalid saved swap input');
 const data=takerData({taker:r.wallet as Address,recipient:r.recipient as Address,minimum,deadline,input:inputIndex,output:outputIndex,maxCrossings:r.maxCrossings});
 if(!same(encodeFunctionData({abi:routerAbi,functionName:'swap',args:[order,amount,data]}),plan.data))throw Error('Saved swap calldata differs from its intent');
 return {config,request:r,plan,minimum,deadline,version,amount,inputIndex,outputIndex,orderHash};
}
/** Decode actual settlement only after the wallet port checks the transaction
 * and canonical receipt. Estimates are never substituted for a missing event. */
export function decodeSwapReceipt(receipt:TransactionReceipt,intent:SwapReceiptIntent){
 const i=validateSwapReceiptIntent(intent),bad=():never=>{throw Error('Receipt does not establish the reviewed swap settlement');};
 if(receipt.status!=='success'||!hashSchema.safeParse(receipt.hash).success||!hashSchema.safeParse(receipt.blockHash).success||typeof receipt.blockNumber!=='bigint'||receipt.blockNumber<0n||!Array.isArray(receipt.logs)
  ||typeof receipt.gasUsed!=='bigint'||receipt.gasUsed<=0n||typeof receipt.effectiveGasPrice!=='bigint'||receipt.effectiveGasPrice<0n)return bad();
 const signature=encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted'})[0]!;
 const logs=receipt.logs.filter(l=>same(l.address,i.plan.to)&&l.topics[0]&&same(l.topics[0],signature));
 if(logs.length!==1)return bad();const log=logs[0]!;
 if(log.removed!==false||log.blockNumber!==receipt.blockNumber||!same(log.blockHash,receipt.blockHash!)||!same(log.transactionHash,receipt.hash)||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)return bad();
 const decoded=decodeEventLog({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted',data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true}),a=decoded.args;
 const topics=encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted',args:{maker:a.maker,orderHash:a.orderHash,taker:a.taker}});
 const data=encodeAbiParameters(swapEventsAbi[0].inputs.filter(v=>!v.indexed),[a.recipient,a.tokenInIndex,a.tokenOutIndex,a.grossInputRaw,a.netInputRaw,a.feeRaw,a.amountOutRaw,a.version,a.crossedTickKeys,a.crossedInward]);
 if(!same(data,log.data)||topics.length!==log.topics.length||topics.some((v,n)=>!same(v as Hex,log.topics[n]!))||!same(a.maker,i.config.maker)||!same(a.orderHash,i.orderHash)||!same(a.taker,i.request.wallet)||!same(a.recipient,i.request.recipient)
  ||a.tokenInIndex!==i.inputIndex||a.tokenOutIndex!==i.outputIndex||a.grossInputRaw!==i.amount||a.feeRaw!==feeIn(i.amount,i.config.feePpm)||a.netInputRaw!==i.amount-a.feeRaw||a.amountOutRaw<i.minimum||a.amountOutRaw*10n**BigInt(18-i.config.decimals[i.outputIndex]!)*(1n<<64n)>=(1n<<160n)||a.version<=i.version
  ||a.crossedTickKeys.length!==a.crossedInward.length||a.crossedTickKeys.length>i.request.maxCrossings||a.crossedTickKeys.some(key=>!i.config.tickKeys.includes(key)))return bad();
 return freeze({hash:receipt.hash,blockNumber:receipt.blockNumber,grossInputRaw:a.grossInputRaw,netInputRaw:a.netInputRaw,feeRaw:a.feeRaw,amountOutRaw:a.amountOutRaw,version:a.version,gasPaid:receipt.gasUsed*receipt.effectiveGasPrice,
  crossings:a.crossedTickKeys.map((tickKey,n)=>({tickKey,inward:a.crossedInward[n]!}))});
}
