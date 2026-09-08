import {encodeFunctionResult,type Hex} from 'viem';
import {routerAbi} from '@orbital/sdk';
import type {InvoiceReadSnapshot,InvoiceRecord} from '@orbital/db';
import type {PaymentQuoteDependencies} from '../src/payment-service.js';
import {preparePaymentContext,decodePaymentContext} from '../src/payment-context.js';
import {prepareRouting,prepareWholeSizeQuotes,type StaticReadCall,type StaticReadResult} from '../src/route-selection.js';
import {contextFixture} from './payment-context-fixture.js';
import {routingFixture} from './route-selection-fixture.js';
import {address,hash} from './strategies-fixture.js';

/** Deterministic unit responses; no live balances, quotes or canonical claims. */
export function paymentServiceFixture(direct=false,count=2){
 const f=contextFixture(direct),routing=routingFixture(count),timestamp=1700000003n,now=Number(timestamp)*1000;
 const context=decodePaymentContext(f.input,f.observations());
 if(!direct){f.input.request.tokenIn=address(2);context.decimals=6;}
 f.input.request.maxInputRaw='1000';context.balanceRaw=1000n;context.invoice.amountDueRaw=100n;context.invoice.expiresAt=timestamp+1000n;
 const receipt={blockNumber:'1',blockHash:hash(1),txHash:hash(101),logIndex:0};
 const record:InvoiceRecord={invoiceId:f.input.request.invoiceId,merchant:context.invoice.merchant,adapter:f.input.manifest.payments,amountDueRaw:'100',expiresAt:context.invoice.expiresAt.toString(),
  recipients:context.invoice.recipients.map((address,i)=>({address,bps:context.invoice.bps[i]!})),memoHash:context.invoice.memoHash,status:'unpaid',version:'1',created:{...receipt},updated:{...receipt},payment:null};
 routing.input.snapshot.indexedAt=new Date(now).toISOString();
 const invoices:InvoiceReadSnapshot={...structuredClone(routing.input.snapshot),code:'INVOICES_COMPLETE',items:[record]};
 const calls:{kind:string;pin?:unknown;phase?:unknown;amount?:bigint;members?:number;budget?:number}[]=[];
 const output={value:(amount:bigint,_id:string)=>amount*3n/4n};
 const deps:PaymentQuoteDependencies={
  async readInvoices(m,q){calls.push({kind:'invoices',pin:q.pin});return structuredClone(invoices);},
  async readDatabase(m,q){calls.push({kind:'strategies',pin:q.pin});return structuredClone(routing.input.snapshot);},
  async readIdentity(m,pin,signal,budget){calls.push({kind:'identity',pin,members:3,budget});return {chainId:m.chainId,head:BigInt(invoices.currentCursor!.height)+2n,block:{...pin,timestamp}};},
  async readContext(input,signal,budget){calls.push({kind:'context',pin:input.pin,members:preparePaymentContext(input).calls.length,budget});return structuredClone(context);},
  async readBatch(input,phase,signal,budget){
   const batches=phase.kind==='inspection'?prepareRouting(input).batches:prepareWholeSizeQuotes(input,phase.observations).quoteBatches;
   const plan=batches[phase.batchIndex]!;calls.push({kind:phase.kind,pin:input.snapshot.asOf,amount:BigInt(input.intent.amountInRaw),phase,members:plan.length,budget});
   if(phase.kind==='inspection')return routing.inspections(plan);
   return plan.map((request:StaticReadCall):StaticReadResult=>{const id=request.id.split(':')[0]!;return {request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[BigInt(input.intent.amountInRaw),output.value(BigInt(input.intent.amountInRaw),id),id as Hex]})};});
  },
 };
 return {...f,routing,timestamp,now,record,invoices,context,calls,deps,output};
}
