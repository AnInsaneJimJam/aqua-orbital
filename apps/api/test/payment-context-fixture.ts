import {encodeFunctionResult,erc20Abi,type Hex} from 'viem';
import {paymentsReadAbi} from '@orbital/sdk';
import {preparePaymentContext,type PaymentContextInput} from '../src/payment-context.js';
import type {StaticReadResult} from '../src/route-selection.js';
import {address,hash,manifest} from './strategies-fixture.js';

export function contextFixture(direct=false){
 const input:PaymentContextInput={manifest,request:{invoiceId:hash(90),payer:address(22),tokenIn:direct?manifest.usdc:address(3),maxInputRaw:'100000000000000000000',maxCrossings:16},pin:{height:'3',hash:hash(3)}};
 const invoice={merchant:address(20),amountDueRaw:9007199254740993n,expiresAt:1700001000,recipients:[address(20),address(23)],bps:[9000,1000],memoHash:hash(99),status:1,payer:address(0),inputRaw:0n,receivedRaw:0n,refundRaw:0n,routeHash:hash(0)};
 function observations():StaticReadResult[]{return preparePaymentContext(input).calls.map(request=>{
  const name=request.id.split(':')[1]!;let data:Hex;
  if(name==='getInvoice')data=encodeFunctionResult({abi:paymentsReadAbi,functionName:'getInvoice',result:invoice});
  else if(name==='USDC'||name==='ROUTER')data=encodeFunctionResult({abi:paymentsReadAbi,functionName:name,result:name==='USDC'?manifest.usdc as Hex:manifest.router as Hex});
  else if(name==='allowedToken')data=encodeFunctionResult({abi:paymentsReadAbi,functionName:name,result:true});
  else if(name==='balanceOf'||name==='allowance')data=encodeFunctionResult({abi:erc20Abi,functionName:name,result:name==='balanceOf'?9007199254740993000000n:0n});
  else data=encodeFunctionResult({abi:erc20Abi,functionName:'decimals',result:request.id==='usdc:decimals'||direct?6:18});
  return {request,status:'fulfilled',data};
 });}
 return {input,invoice,observations};
}
