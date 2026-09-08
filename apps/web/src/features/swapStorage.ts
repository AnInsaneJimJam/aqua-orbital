import {hashSchema,tokenSchema,type Token} from '@orbital/shared';
import {encodeFunctionData,erc20Abi,type Address} from 'viem';
import {validateSwapReceiptIntent,type PendingTransaction,type SwapReceiptIntent,type TransactionPlan} from '@orbital/sdk';
export type PendingSwap={schemaVersion:1;transaction:PendingTransaction;stage:'approval'|'swap';plan:TransactionPlan;intent:SwapReceiptIntent;tokenIn:Token;tokenOut:Token};
export const swapStoragePrefix=(chainId:number,account:string)=>`orbital:swap:1:${chainId}:${account.toLowerCase()}:`;
export const swapStorageKey=(p:PendingSwap)=>swapStoragePrefix(p.transaction.chainId,p.transaction.account)+p.transaction.hash.toLowerCase();
export const encodePendingSwap=(p:PendingSwap)=>JSON.stringify({...p,plan:{...p.plan,value:'0'},intent:{...p.intent,plan:{...p.intent.plan,value:'0'}}});
/** A recovery record is public, untrusted data. It cannot create a review. */
export function decodePendingSwap(raw:string,chainId:number,account:string):PendingSwap {
 if(raw.length>32000)throw Error('Invalid saved swap');const parsed=JSON.parse(raw);
 if(parsed.schemaVersion!==1||!['approval','swap'].includes(parsed.stage)||parsed.plan?.value!=='0'||parsed.intent?.plan?.value!=='0')throw Error('Invalid saved swap');
 const p:PendingSwap={...parsed,plan:{...parsed.plan,value:0n},intent:{...parsed.intent,plan:{...parsed.intent.plan,value:0n}}},t=p.transaction;
 if(t.schemaVersion!==1||t.chainId!==chainId||t.account.toLowerCase()!==account.toLowerCase()||p.plan.chainId!==chainId||p.plan.account.toLowerCase()!==account.toLowerCase()||typeof t.label!=='string'||t.label.length>200)throw Error('Saved swap scope mismatch');
 hashSchema.parse(t.hash);const i=validateSwapReceiptIntent(p.intent);if(i.plan.chainId!==chainId||i.plan.account.toLowerCase()!==account.toLowerCase())throw Error('Saved swap scope mismatch');
 for(const [token,address] of [[p.tokenIn,i.request.tokenIn],[p.tokenOut,i.request.tokenOut]] as const){tokenSchema.parse(token);const index=i.config.tokens.findIndex(t=>t.toLowerCase()===address.toLowerCase());if(token.address.toLowerCase()!==address.toLowerCase()||token.decimals!==i.config.decimals[index])throw Error('Saved swap token mismatch');}
 const expected=p.stage==='swap'?i.plan:{to:i.request.tokenIn,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[i.config.router as Address,i.amount]})};
 if(p.plan.to.toLowerCase()!==expected.to.toLowerCase()||p.plan.data.toLowerCase()!==expected.data.toLowerCase())throw Error('Saved swap transaction mismatch');
 return p;
}
export function readPendingSwaps(chainId:number,account:string):PendingSwap[]{
 const prefix=swapStoragePrefix(chainId,account),keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort();
 if(keys.length>64)throw Error('Too many saved swaps to review safely');
 return keys.map(key=>{const p=decodePendingSwap(localStorage.getItem(key)!,chainId,account);if(swapStorageKey(p)!==key)throw Error('Saved swap hash mismatch');return p;});
}
