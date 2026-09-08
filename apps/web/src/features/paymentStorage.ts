import {addressSchema,hashSchema,chainIdSchema} from '@orbital/shared';
import type {PendingTransaction,TransactionPlan} from '@orbital/sdk';
import type {Address,Hex} from 'viem';
export type PendingPayment={transaction:PendingTransaction;invoiceId:Hex;stage:'approval'|'payment';plan:TransactionPlan};
export const paymentStorageKey=(chain:number,account:string,id:string)=>`orbital:payment:1:${chain}:${account.toLowerCase()}:${id.toLowerCase()}`;
export function encodePendingPayment(p:PendingPayment){return JSON.stringify({...p,plan:{...p.plan,value:'0'}});}
/** Recovery data is public and untrusted. It is never used to authorize a send. */
export function decodePendingPayment(raw:string,chainId:number,account:string,invoiceId:string):PendingPayment {
 if(raw.length>24000)throw Error('Invalid recovery record');
 const p=JSON.parse(raw),t=p.transaction,plan=p.plan;
 if(p.stage!=='approval'&&p.stage!=='payment')throw Error('Invalid recovery stage');
 if(t.schemaVersion!==1||chainIdSchema.parse(t.chainId)!==chainId||addressSchema.parse(t.account).toLowerCase()!==account.toLowerCase()||hashSchema.parse(p.invoiceId).toLowerCase()!==invoiceId.toLowerCase()
  ||typeof t.label!=='string'||t.label.length>200||plan.chainId!==chainId||plan.account?.toLowerCase()!==account.toLowerCase()||plan.value!=='0'||typeof plan.data!=='string'||!/^0x(?:[0-9a-fA-F]{2}){4,10000}$/.test(plan.data)||typeof plan.label!=='string'||plan.label.length>200)throw Error('Invalid recovery record');
 return {transaction:{schemaVersion:1,hash:hashSchema.parse(t.hash) as Hex,chainId,account:account as Address,label:t.label},invoiceId:invoiceId as Hex,stage:p.stage,plan:{chainId,account:account as Address,to:addressSchema.parse(plan.to) as Address,data:plan.data as Hex,value:0n,label:plan.label}};
}
