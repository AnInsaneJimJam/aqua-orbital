import {hashSchema} from '@orbital/shared';
import {validateInvoiceAdminReceiptIntent,type InvoiceAdminReceiptIntent,type PendingTransaction} from '@orbital/sdk';
export type PendingInvoiceAdmin=InvoiceAdminReceiptIntent&{schemaVersion:1;transaction:PendingTransaction};
export const invoiceAdminStoragePrefix=(chain:number,account:string)=>`orbital:invoice-admin:1:${chain}:${account.toLowerCase()}:`;
export const invoiceAdminStorageKey=(p:PendingInvoiceAdmin)=>invoiceAdminStoragePrefix(p.transaction.chainId,p.transaction.account)+p.transaction.hash.toLowerCase();
export const encodePendingInvoiceAdmin=(p:PendingInvoiceAdmin)=>JSON.stringify({...p,plan:{...p.plan,value:'0'}});
export function decodePendingInvoiceAdmin(raw:string,chain:number,account:string):PendingInvoiceAdmin {
 if(raw.length>16000)throw Error('Invalid invoice recovery record');const parsed=JSON.parse(raw);
 if(parsed.schemaVersion!==1||parsed.plan?.value!=='0')throw Error('Invalid invoice recovery record');
 const p:PendingInvoiceAdmin={...parsed,plan:{...parsed.plan,value:0n}},t=p.transaction;
 if(t.schemaVersion!==1||t.chainId!==chain||t.account.toLowerCase()!==account.toLowerCase()||p.plan.chainId!==chain||p.plan.account.toLowerCase()!==account.toLowerCase()
  ||typeof t.label!=='string'||t.label.length>200||typeof p.plan.label!=='string'||p.plan.label.length>200)throw Error('Invoice recovery scope mismatch');
 hashSchema.parse(t.hash);validateInvoiceAdminReceiptIntent(p);return p;
}
export function readPendingInvoiceAdmin(chain:number,account:string){
 const prefix=invoiceAdminStoragePrefix(chain,account),keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort();
 if(keys.length>64)throw Error('Too many saved invoice actions');
 return keys.map(key=>{const p=decodePendingInvoiceAdmin(localStorage.getItem(key)!,chain,account);if(invoiceAdminStorageKey(p)!==key)throw Error('Saved invoice hash mismatch');return p;});
}
