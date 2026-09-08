import {invoiceReadSchema,type DeploymentManifest,type InvoiceReadDTO} from '@orbital/shared';
import type {InvoiceRecord} from '@orbital/db';

/** Exact floor/remainder recipient amounts and event-derived status. The caller
 * must authenticate the deployment-scoped canonical source snapshot. */
export function invoiceView(manifest:DeploymentManifest,inv:InvoiceRecord):InvoiceReadDTO {
 const token=(address:string)=>{const found=manifest.tokens.find(t=>t.address.toLowerCase()===address.toLowerCase());if(!found)throw Error('INVALID_TOKEN');return found;};
 let remaining=BigInt(inv.amountDueRaw);
 const recipients=inv.recipients.map((r,i)=>{const amount=i+1===inv.recipients.length?remaining:BigInt(inv.amountDueRaw)*BigInt(r.bps)/10000n;remaining-=amount;return {...r,amountRaw:amount.toString()};});
 return invoiceReadSchema.parse({...inv,recipients,created:{...inv.created,event:'InvoiceCreated'},
  updated:{...inv.updated,event:inv.status==='unpaid'?'InvoiceCreated':inv.status==='paid'?'InvoicePaid':'InvoiceCancelled'},
  settlementToken:token(manifest.usdc),paymentEligibilityVerified:false,
  payment:inv.payment?{...inv.payment,inputToken:token(inv.payment.tokenIn),kind:/^0x0{64}$/i.test(inv.payment.routeHash)?'direct':'swap'}:null});
}
