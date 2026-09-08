import type {InvoiceRecord} from '@orbital/db';
import type {InvoiceReadDTO,Token} from '@orbital/shared';
import type {InvoiceSnapshot} from '@orbital/sdk';
import {isDeepStrictEqual} from 'node:util';
import {preparePaymentContext,type PaymentContext,type PaymentContextInput} from './payment-context.js';
import {invoiceView} from './invoice-view.js';

export class PaymentValidationError extends Error {
 constructor(code:string,readonly httpStatus:409|422|503){super(code);}
}
export type PaymentFunding={kind:'direct'|'swap';invoice:InvoiceReadDTO;snapshot:InvoiceSnapshot;token:Token;
 expiresAt:bigint;boundRaw:bigint;seedRaw:bigint;balanceRaw:bigint;allowanceRaw:bigint};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const MAX=(1n<<256n)-1n,USDC_LIMIT=(1n<<160n)/(10n**12n*(1n<<64n));
const zeroAddress=`0x${'0'.repeat(40)}`,zeroHash=`0x${'0'.repeat(64)}`;
const min=(a:bigint,b:bigint)=>a<b?a:b;
const invalid=():never=>{throw new PaymentValidationError('PAYMENT_DATA_INVALID',503);};
/** Conditional on the caller's authenticated, fully covered invoice snapshot
 * and context at the same pin. This pure check never establishes canonical
 * coverage, indexed absence, current freshness or transaction eligibility. */
export function validatePaymentFunding(input:PaymentContextInput,record:InvoiceRecord,context:PaymentContext,blockTimestamp:bigint):PaymentFunding {
 try {
  preparePaymentContext(input);
  const {manifest:m,request:r,pin}=input,invoice=invoiceView(m,record),token=m.tokens.find(t=>same(t.address,r.tokenIn))!;
  if(typeof blockTimestamp!=='bigint'||blockTimestamp<0n||blockTimestamp>=(1n<<40n)
   ||!same(invoice.adapter,m.payments)||!same(invoice.invoiceId,r.invoiceId)
   ||BigInt(invoice.amountDueRaw)>=USDC_LIMIT||BigInt(invoice.expiresAt)===0n
   ||invoice.recipients.some(recipient=>same(recipient.address,m.payments)))return invalid();
  for(const source of [invoice.created,invoice.updated])if(BigInt(source.blockNumber)<BigInt(m.startBlock)||BigInt(source.blockNumber)>BigInt(pin.height)
   ||(source.blockNumber===pin.height&&!same(source.blockHash,pin.hash)))return invalid();
  if(!same(context.usdc,m.usdc)||!same(context.router,m.router)||context.allowedToken!==true||context.decimals!==token.decimals||context.usdcDecimals!==6
   ||[context.balanceRaw,context.allowanceRaw].some(v=>typeof v!=='bigint'||v<0n||v>MAX))return invalid();
  const expected={merchant:invoice.merchant.toLowerCase(),amountDueRaw:BigInt(invoice.amountDueRaw),expiresAt:BigInt(invoice.expiresAt),
   recipients:invoice.recipients.map(recipient=>recipient.address.toLowerCase()),bps:invoice.recipients.map(recipient=>recipient.bps),memoHash:invoice.memoHash.toLowerCase(),
   status:invoice.status==='unpaid'?1:invoice.status==='paid'?3:4,payer:invoice.payment?.payer.toLowerCase()??zeroAddress,
   inputRaw:BigInt(invoice.payment?.inputRaw??'0'),receivedRaw:BigInt(invoice.payment?.receivedRaw??'0'),refundRaw:BigInt(invoice.payment?.refundRaw??'0'),routeHash:invoice.payment?.routeHash.toLowerCase()??zeroHash};
  const observed={...context.invoice,merchant:context.invoice.merchant.toLowerCase(),recipients:context.invoice.recipients.map(a=>a.toLowerCase()),memoHash:context.invoice.memoHash.toLowerCase(),payer:context.invoice.payer.toLowerCase(),routeHash:context.invoice.routeHash.toLowerCase()};
  if(!isDeepStrictEqual(observed,expected))throw new PaymentValidationError('PAYMENT_INVOICE_MISMATCH',503);
  if(invoice.status!=='unpaid')throw new PaymentValidationError(invoice.status==='paid'?'INVOICE_PAID':'INVOICE_CANCELLED',409);
  if(expected.expiresAt<=blockTimestamp)throw new PaymentValidationError('INVOICE_EXPIRED',409);
  const expiresAt=min(blockTimestamp+20n,expected.expiresAt),kind=same(r.tokenIn,m.usdc)?'direct':'swap';
  const maximum=BigInt(r.maxInputRaw),balance=context.balanceRaw;
  let boundRaw=min(maximum,balance),seedRaw=expected.amountDueRaw;
  if(kind==='direct'){
   if(maximum<seedRaw)throw new PaymentValidationError('PAYMENT_MAX_INPUT_INSUFFICIENT',422);
   if(balance<seedRaw)throw new PaymentValidationError('PAYMENT_BALANCE_INSUFFICIENT',422);
  }else{
   // Exact maximal raw gross satisfying raw*q < 2^160. Allowance is an
   // approval observation and must not reduce the financial search domain.
   const q=10n**BigInt(18-token.decimals)*(1n<<64n);
   boundRaw=min(boundRaw,((1n<<160n)-1n)/q);
   if(boundRaw<2n)throw new PaymentValidationError('PAYMENT_INPUT_TOO_SMALL',422);
   // Unit-parity proposal only: ceil(due * 10^d / 10^6), then [2,B] clamp.
   // It asserts no price, feasibility or fee-adjusted sufficiency.
   seedRaw=(expected.amountDueRaw*10n**BigInt(token.decimals)+999999n)/1000000n;
   seedRaw=min(seedRaw<2n?2n:seedRaw,boundRaw);
  }
  const snapshot:InvoiceSnapshot={chainId:m.chainId,adapter:m.payments as `0x${string}`,id:r.invoiceId as `0x${string}`,merchant:expected.merchant as `0x${string}`,
   status:'unpaid',amountDueRaw:expected.amountDueRaw,expiresAt:expected.expiresAt,recipients:expected.recipients as `0x${string}`[],bps:expected.bps,memoHash:expected.memoHash as `0x${string}`};
  return {kind,invoice,snapshot,token:{...token},expiresAt,boundRaw,seedRaw,balanceRaw:balance,allowanceRaw:context.allowanceRaw};
 }catch(error){if(error instanceof PaymentValidationError)throw error;return invalid();}
}
