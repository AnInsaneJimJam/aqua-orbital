import type {TransactionEstimate} from './execution';
/** Shared review primitives. These functions neither price nor sign a trade. */
export const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
/** Human review time starts after preflight, not at an indexer's timestamp.
 * Execution must independently revalidate live state and these exact bytes. */
export function reviewExpiresAt(nowMs:number,deadline:bigint){
 const end=Math.min(nowMs+60000,Number(deadline)*1000-10000);
 if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(end)||end<=nowMs)throw Error('Transaction deadline is too close. Prepare a fresh review.');
 return end;
}
export function assertLiveReviewTime(timestamp:bigint,deadline:bigint,nowMs:number){
 if(!Number.isSafeInteger(nowMs)||nowMs<0||Number(timestamp)*1000>nowMs+1000||nowMs-Number(timestamp)*1000>=20000||Number(deadline)*1000<=nowMs)throw Error('Current chain observation is stale or transaction deadline expired');
}
export function nativeTokenSpend(chainId:number,tokenIn:string,usdc:string,amount:bigint):bigint {
 if(amount<0n)throw Error('Invalid token spend');
 // Arc's native USDC and ERC-20 USDC represent one inventory in different units.
 return chainId===5042002&&same(tokenIn,usdc)?amount*10n**12n:0n;
}
export function funded(estimate:TransactionEstimate,spend:bigint){
 if(typeof estimate.gas!=='bigint'||typeof estimate.maxFeePerGas!=='bigint'||typeof estimate.nativeBalance!=='bigint'||estimate.gas<=0n||estimate.maxFeePerGas<0n
  ||(estimate.maxPriorityFeePerGas!==undefined&&(typeof estimate.maxPriorityFeePerGas!=='bigint'||estimate.maxPriorityFeePerGas<0n||estimate.maxPriorityFeePerGas>estimate.maxFeePerGas))||spend<0n||estimate.nativeBalance<estimate.gas*estimate.maxFeePerGas+spend)throw Error('Insufficient balance for gas and the reviewed spend.');
}
export function withinBudget(estimate:TransactionEstimate,budget:TransactionEstimate){
 funded(estimate,budget.nativeSpend??0n);
 if(estimate.gas>budget.gas||estimate.maxFeePerGas>budget.maxFeePerGas||(estimate.maxPriorityFeePerGas??0n)>(budget.maxPriorityFeePerGas??0n))throw Error('Gas estimate increased. Review again.');
 funded({...budget,nativeBalance:estimate.nativeBalance},budget.nativeSpend??0n);
 return {...budget,nativeBalance:estimate.nativeBalance};
}
