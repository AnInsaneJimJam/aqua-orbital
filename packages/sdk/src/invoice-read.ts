import {invoiceListSchema,invoiceCursorSchema,nonzeroAddressSchema,hashSchema, invoiceDetailSchema, manifestSchema, type DeploymentManifest, type InvoiceDetailDTO, type Token} from '@orbital/shared';
import {encodeAbiParameters, keccak256, type Address} from 'viem';

/** Public read validation; never authorizes payment or constructs a transaction. */
export function decodeInvoiceDetail(input: unknown, httpStatus: number, configured: DeploymentManifest, requestedId: string): InvoiceDetailDTO {
  const manifest = manifestSchema.parse(configured), id = hashSchema.parse(requestedId).toLowerCase();
  if (!manifest.verified) throw Error('Verified deployment required');
  const result = invoiceDetailSchema.parse(input), invoice = result.data.invoice;
  if (httpStatus !== (invoice ? 200 : 404)) throw Error('Invoice response status mismatch');
  // This ABI identity matches the API/indexer's deployment scope. Credentials
  // and presentation metadata do not belong to the deployed contract identity.
  const deploymentId = keccak256(encodeAbiParameters([{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
    [BigInt(manifest.chainId), manifest.aqua as Address, manifest.router as Address, manifest.payments as Address]));
  if (result.chainId !== manifest.chainId || result.deploymentId.toLowerCase() !== deploymentId || result.coverage.fromBlock !== manifest.startBlock) throw Error('Invoice deployment mismatch');
  if (invoice) {
    if (invoice.invoiceId.toLowerCase() !== id || invoice.adapter.toLowerCase() !== manifest.payments.toLowerCase()
      || invoice.settlementToken.address.toLowerCase() !== manifest.usdc.toLowerCase()) throw Error('Invoice identity mismatch');
    const tokenMatches = (token: Token) => manifest.tokens.some(t => t.address.toLowerCase() === token.address.toLowerCase()
      && t.decimals === token.decimals && t.symbol === token.symbol && t.mock === token.mock);
    if (!tokenMatches(invoice.settlementToken) || (invoice.payment && !tokenMatches(invoice.payment.inputToken))) throw Error('Invoice token metadata mismatch');
  }
  return result;
}

/** Wallet-scoped canonical history; the financial controller still rereads terms. */
export function decodeInvoiceList(input:unknown,httpStatus:number,configured:DeploymentManifest,request:{merchant:string;limit:number;cursor?:string}){
 const v=invoiceListSchema.parse(input),merchant=nonzeroAddressSchema.parse(request.merchant).toLowerCase();
 if(httpStatus!==200||v.data.limit!==request.limit||v.data.items.length>request.limit||v.code!==(v.status==='stale'?'INVOICES_STALE':'INVOICES_AVAILABLE'))throw Error('Invalid invoice listing');
 // Reuse all covered-history, canonical chronology and token metadata checks.
 if(!v.data.items.length)decodeInvoiceDetail({...v,code:'INVOICE_NOT_FOUND',retryable:false,field:'id',data:{invoice:null}},404,configured,'0x'+'0'.repeat(64));
 for(const item of v.data.items){decodeInvoiceDetail({...v,data:{invoice:item}},200,configured,item.invoiceId);if(item.merchant.toLowerCase()!==merchant)throw Error('Invoice merchant mismatch');}
 const position=(r:typeof v.data.items[number])=>({createdBlock:r.created.blockNumber,createdLog:r.created.logIndex,invoiceId:r.invoiceId.toLowerCase()});
 type Position=ReturnType<typeof position>;
 const compare=(a:Position,b:Position)=>BigInt(a.createdBlock)!==BigInt(b.createdBlock)?BigInt(a.createdBlock)<BigInt(b.createdBlock)?-1:1:a.createdLog-b.createdLog||(a.invoiceId.toLowerCase()<b.invoiceId.toLowerCase()?-1:a.invoiceId.toLowerCase()===b.invoiceId.toLowerCase()?0:1);
 function cursor(encoded:string){
  if(encoded.length>1024||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('Invalid invoice cursor');
  const c=invoiceCursorSchema.parse(JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/'))));
  if(btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==encoded||c.chainId!==v.chainId||c.deploymentId!==v.deploymentId||c.merchant!==merchant||c.pin.height!==v.asOf.height||c.pin.hash!==v.asOf.hash)throw Error('Invoice cursor scope mismatch');return c;
 }
 let previous=request.cursor?cursor(request.cursor).after:undefined;
 for(const item of v.data.items){const p=position(item);if(previous&&compare(p,previous)>=0)throw Error('Invoice listing order mismatch');previous=p;}
 if(v.data.nextCursor&&(!previous||compare(cursor(v.data.nextCursor).after,previous)!==0))throw Error('Invalid invoice continuation');return v;
}
