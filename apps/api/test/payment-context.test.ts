import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,erc20Abi,type Hex} from 'viem';
import {paymentsReadAbi} from '@orbital/sdk';
import {preparePaymentContext,decodePaymentContext,type PaymentContextInput} from '../src/payment-context.js';
import type {StaticReadResult} from '../src/route-selection.js';
import {address,hash,manifest} from './strategies-fixture.js';

import {contextFixture} from './payment-context-fixture.js';

test('payment context uses eight independent exact reads at one hash pin and deduplicates direct USDC decimals',()=>{
 for(const direct of [false,true]){
  const {input}=contextFixture(direct),plan=preparePaymentContext(input);assert.equal(plan.calls.length,direct?7:8);
  assert.deepEqual(plan.calls.map(c=>c.id),['payment:getInvoice','payment:USDC','payment:ROUTER','payment:allowedToken','funding:balanceOf','funding:allowance','funding:decimals',...(direct?[]:['usdc:decimals'])]);
  for(const call of plan.calls){assert.equal(call.method,'eth_call');assert.equal(call.params[0].from,address(22).toLowerCase());assert.equal(call.params[0].value,'0x0');assert.deepEqual(call.params[1],{blockHash:hash(3),requireCanonical:true});
   const decoded=decodeFunctionData({abi:call.id.startsWith('payment:')?paymentsReadAbi:erc20Abi,data:call.params[0].data as Hex});
   assert.equal(call.params[0].to,(call.id.startsWith('payment:')?manifest.payments:call.id.startsWith('usdc:')?manifest.usdc:input.request.tokenIn).toLowerCase());
   if(decoded.functionName==='getInvoice')assert.deepEqual(decoded.args,[hash(90)]);
   if(decoded.functionName==='allowedToken')assert.deepEqual(decoded.args,[input.request.tokenIn]);
   if(decoded.functionName==='balanceOf')assert.deepEqual(decoded.args,[address(22)]);
   if(decoded.functionName==='allowance')assert.deepEqual(decoded.args,[address(22),manifest.payments]);
  }
 }
});

test('complete reordered results retain exact bigint invoice and funding amounts without granting payment authority',()=>{
 const f=contextFixture(),context=decodePaymentContext(f.input,f.observations().reverse());
 assert.equal(context.invoice.amountDueRaw,9007199254740993n);assert.equal(context.invoice.expiresAt,1700001000n);
 assert.equal(context.balanceRaw,9007199254740993000000n);assert.equal(context.allowanceRaw,0n);assert.equal(context.decimals,18);assert.equal(context.usdcDecimals,6);
 assert.equal(context.router,manifest.router.toLowerCase());assert.equal(context.usdc,manifest.usdc.toLowerCase());assert.equal(context.allowedToken,true);
 assert.equal(context.invoice.status,1);assert.equal('paymentEligibilityVerified' in context,false);
 const direct=contextFixture(true);assert.equal(decodePaymentContext(direct.input,direct.observations()).decimals,6);
});

test('invalid request, manifest, role or pin never creates a context call plan',()=>{
 const f=contextFixture();
 for(const request of [{...f.input.request,payer:manifest.payments},{...f.input.request,payer:manifest.router},{...f.input.request,payer:manifest.aqua},{...f.input.request,tokenIn:address(99)},{...f.input.request,minimumOutRaw:'1'}])assert.throws(()=>preparePaymentContext({...f.input,request} as PaymentContextInput),/PAYMENT_CONTEXT_INPUT_INVALID/);
 for(const pin of [{height:'0',hash:hash(3)},{height:'3',hash:'0x12'},{height:'03',hash:hash(3)}])assert.throws(()=>preparePaymentContext({...f.input,pin}),/PAYMENT_CONTEXT_INPUT_INVALID/);
 assert.throws(()=>preparePaymentContext({...f.input,manifest:{...manifest,verified:false}}),/PAYMENT_CONTEXT_INPUT_INVALID/);
 assert.throws(()=>preparePaymentContext({...f.input,target:address(99)} as never),/PAYMENT_CONTEXT_INPUT_INVALID/);
});

test('context result set rejects missing, duplicate, changed-caller, mixed-block, foreign and reverted members',()=>{
 const f=contextFixture(),original=f.observations();
 const invalid:StaticReadResult[][]=[original.slice(1),[...original,original[0]!],original.map((row,i)=>i===0?original[1]!:row)];
 for(const field of ['from','to','data'] as const){const changed=structuredClone(original);changed[0]!.request.params[0][field]=field==='data'?'0x':address(99);invalid.push(changed);}
 const wrongPin=structuredClone(original);wrongPin[0]!.request.params[1].blockHash=hash(99);invalid.push(wrongPin);
 const foreign=structuredClone(original);foreign[0]!.request.id='other:getInvoice';invalid.push(foreign);
 const reverted=structuredClone(original);reverted[0]={request:reverted[0]!.request,status:'rejected',reason:'revert'};invalid.push(reverted);
 for(const rows of invalid)assert.throws(()=>decodePaymentContext(f.input,rows),/PAYMENT_CONTEXT_(INVALID|UNAVAILABLE)/);
});

test('noncanonical or malformed ABI and inconsistent immutable/token bindings cannot become funding observations',()=>{
 const f=contextFixture(),cases:[string,Hex][]=[['payment:USDC',encodeFunctionResult({abi:paymentsReadAbi,functionName:'USDC',result:address(99)})],
  ['payment:ROUTER',encodeFunctionResult({abi:paymentsReadAbi,functionName:'ROUTER',result:address(99)})],
  ['payment:allowedToken',encodeFunctionResult({abi:paymentsReadAbi,functionName:'allowedToken',result:false})],
  ['funding:decimals',encodeFunctionResult({abi:erc20Abi,functionName:'decimals',result:6})],
  ['usdc:decimals',encodeFunctionResult({abi:erc20Abi,functionName:'decimals',result:18})],['funding:balanceOf','0x']];
 for(const [id,data] of cases){const rows=f.observations();const index=rows.findIndex(r=>r.request.id===id);rows[index]={request:rows[index]!.request,status:'fulfilled',data};assert.throws(()=>decodePaymentContext(f.input,rows),/PAYMENT_CONTEXT_INVALID/);}
 const trailing=f.observations();assert.equal(trailing[0]!.status,'fulfilled');if(trailing[0]!.status==='fulfilled')trailing[0]!.data+='00';assert.throws(()=>decodePaymentContext(f.input,trailing),/PAYMENT_CONTEXT_INVALID/);
});

test('raw invoice statuses remain distinguishable and do not authenticate indexed absence or payment eligibility',()=>{
 const f=contextFixture();for(const status of [0,1,2,3,4]){f.invoice.status=status;assert.equal(decodePaymentContext(f.input,f.observations()).invoice.status,status);}
 f.invoice.status=5;assert.throws(()=>decodePaymentContext(f.input,f.observations()),/PAYMENT_CONTEXT_INVALID/);
});
