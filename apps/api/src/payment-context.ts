import {isDeepStrictEqual} from 'node:util';
import {decodeFunctionResult,encodeFunctionData,encodeFunctionResult,erc20Abi,type Abi,type Address,type Hex} from 'viem';
import {paymentsReadAbi} from '@orbital/sdk';
import {manifestSchema,paymentQuoteRequestSchema,hashSchema,uintSchema,type DeploymentManifest,type PaymentQuoteRequest} from '@orbital/shared';
import type {StaticReadCall,StaticReadResult} from './route-selection.js';
export type PaymentContextInput={manifest:DeploymentManifest;request:PaymentQuoteRequest;pin:{height:string;hash:string}};
export type PaymentContextPlan={calls:StaticReadCall[]};
export type PaymentContext={invoice:{merchant:string;amountDueRaw:bigint;expiresAt:bigint;recipients:string[];bps:number[];memoHash:string;status:number;payer:string;inputRaw:bigint;receivedRaw:bigint;refundRaw:bigint;routeHash:string};balanceRaw:bigint;allowanceRaw:bigint;decimals:number;usdcDecimals:number;usdc:string;router:string;allowedToken:boolean};
function validated(input:PaymentContextInput){
 try{
  if(!input||Object.keys(input).sort().join()!=='manifest,pin,request'||!input.pin||Object.keys(input.pin).sort().join()!=='hash,height')throw Error();
  const manifest=manifestSchema.parse(input.manifest),parsed=paymentQuoteRequestSchema.parse(input.request);
  const request={...parsed,invoiceId:parsed.invoiceId.toLowerCase(),payer:parsed.payer.toLowerCase(),tokenIn:parsed.tokenIn.toLowerCase()};
  const pin={height:uintSchema.parse(input.pin.height),hash:hashSchema.parse(input.pin.hash).toLowerCase()};
  const token=manifest.tokens.find(t=>t.address.toLowerCase()===request.tokenIn);
  if(!manifest.verified||!token||BigInt(pin.height)<BigInt(manifest.startBlock)||[manifest.payments,manifest.router,manifest.aqua].some(a=>a.toLowerCase()===request.payer))throw Error();
  return {manifest,request,pin,token};
 }catch{throw Error('PAYMENT_CONTEXT_INPUT_INVALID');}
}
/** Internally generated independent reads. No balance, approval, invoice term
 * or transaction target is accepted from the public request. */
export function preparePaymentContext(input:PaymentContextInput):PaymentContextPlan {
 const {manifest:m,request:r,pin}=validated(input);
 const call=(id:string,to:string,data:Hex):StaticReadCall=>({id,method:'eth_call',params:[{from:r.payer,to:to.toLowerCase(),data,value:'0x0'},{blockHash:pin.hash,requireCanonical:true}]});
 const calls=[
  call('payment:getInvoice',m.payments,encodeFunctionData({abi:paymentsReadAbi,functionName:'getInvoice',args:[r.invoiceId as Hex]})),
  call('payment:USDC',m.payments,encodeFunctionData({abi:paymentsReadAbi,functionName:'USDC'})),
  call('payment:ROUTER',m.payments,encodeFunctionData({abi:paymentsReadAbi,functionName:'ROUTER'})),
  call('payment:allowedToken',m.payments,encodeFunctionData({abi:paymentsReadAbi,functionName:'allowedToken',args:[r.tokenIn as Address]})),
  call('funding:balanceOf',r.tokenIn,encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[r.payer as Address]})),
  call('funding:allowance',r.tokenIn,encodeFunctionData({abi:erc20Abi,functionName:'allowance',args:[r.payer as Address,m.payments as Address]})),
  call('funding:decimals',r.tokenIn,encodeFunctionData({abi:erc20Abi,functionName:'decimals'})),
 ];
 if(r.tokenIn!==m.usdc.toLowerCase())calls.push(call('usdc:decimals',m.usdc,encodeFunctionData({abi:erc20Abi,functionName:'decimals'})));
 return {calls};
}
/** Canonical ABI and immutable/funding binding only. Invoice status/terms must
 * still match the authenticated indexed record; a revert is not indexed absence. */
export function decodePaymentContext(input:PaymentContextInput,observations:StaticReadResult[]):PaymentContext {
 const {manifest,request,token}=validated(input),plan=preparePaymentContext(input),expected=new Map(plan.calls.map(c=>[c.id,c])),values=new Map<string,string>();
 const invalid=():never=>{throw Error('PAYMENT_CONTEXT_INVALID');};
 if(!Array.isArray(observations)||observations.length!==plan.calls.length)return invalid();
 for(const observed of observations){
  const call=expected.get(observed?.request?.id);
  if(!call||values.has(call.id)||!isDeepStrictEqual(call,observed.request))return invalid();
  if(observed.status!=='fulfilled')throw Error('PAYMENT_CONTEXT_UNAVAILABLE');
  if(Object.keys(observed).sort().join()!=='data,request,status'||typeof observed.data!=='string'||observed.data.length>524290||!/^0x(?:[0-9a-fA-F]{2})*$/.test(observed.data))return invalid();
  values.set(call.id,observed.data);
 }
 function decode(abi:Abi,name:string,id:string):unknown{
  try{const data=values.get(id)! as Hex,value=decodeFunctionResult({abi,functionName:name,data});
   if(encodeFunctionResult({abi,functionName:name,result:value}).toLowerCase()!==data.toLowerCase())return invalid();return value;
  }catch{return invalid();}
 }
 // The tuple shape follows the separately authenticated generated read ABI.
 const raw=decode(paymentsReadAbi,'getInvoice','payment:getInvoice') as Omit<PaymentContext['invoice'],'expiresAt'>&{expiresAt:number};
 const usdc=(decode(paymentsReadAbi,'USDC','payment:USDC') as string).toLowerCase(),router=(decode(paymentsReadAbi,'ROUTER','payment:ROUTER') as string).toLowerCase();
 const allowedToken=decode(paymentsReadAbi,'allowedToken','payment:allowedToken') as boolean;
 const balanceRaw=decode(erc20Abi,'balanceOf','funding:balanceOf') as bigint,allowanceRaw=decode(erc20Abi,'allowance','funding:allowance') as bigint;
 const decimals=decode(erc20Abi,'decimals','funding:decimals') as number,usdcDecimals=request.tokenIn===manifest.usdc.toLowerCase()?decimals:decode(erc20Abi,'decimals','usdc:decimals') as number;
 if(usdc!==manifest.usdc.toLowerCase()||router!==manifest.router.toLowerCase()||allowedToken!==true||decimals!==token.decimals||usdcDecimals!==6||raw.status<0||raw.status>4)return invalid();
 return {invoice:{...raw,merchant:raw.merchant.toLowerCase(),expiresAt:BigInt(raw.expiresAt),recipients:raw.recipients.map(r=>r.toLowerCase()),bps:[...raw.bps],memoHash:raw.memoHash.toLowerCase(),payer:raw.payer.toLowerCase(),routeHash:raw.routeHash.toLowerCase()},balanceRaw,allowanceRaw,decimals,usdcDecimals,usdc,router,allowedToken};
}
