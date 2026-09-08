import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import * as rpc from '../src/quote-rpc.js';
import {preparePaymentContext,decodePaymentContext,type PaymentContextInput,type PaymentContext} from '../src/payment-context.js';
import {contextFixture} from './payment-context-fixture.js';
import {address} from './strategies-fixture.js';

type Call={jsonrpc:string;id:string;method:string;params:unknown[]};
const read=(rpc as unknown as {readPaymentContext:(input:PaymentContextInput,options:rpc.QuoteRpcOptions)=>Promise<PaymentContext>}).readPaymentContext;
function setup(direct=false){
 const fixture=contextFixture(direct),data=new Map(fixture.observations().map(r=>[r.request.id,r.status==='fulfilled'?r.data:'0x']));
 const calls:Call[][]=[],weights:number[]=[],shutdown=new AbortController(),cancel=new AbortController();let active=0,releases=0;
 const response=(batch:Call[])=>new Response(JSON.stringify(batch.map(c=>({jsonrpc:'2.0',id:c.id,result:data.get(c.id)})).reverse()));
 const options:rpc.QuoteRpcOptions={shutdownSignal:shutdown.signal,signal:cancel.signal,reserve(weight){assert.equal(active,0);assert.ok(weight<=8);weights.push(weight);active=weight;return()=>{active=0;releases++;};},fetcher:async(url,init)=>{
  assert.equal(String(url),fixture.input.manifest.rpcUrl);assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');const batch=JSON.parse(String(init?.body)) as Call[];calls.push(batch);assert.equal(active,batch.length);return response(batch);
 }};
 const clean=()=>{assert.equal(active,0);assert.equal(getEventListeners(shutdown.signal,'abort').length,0);assert.equal(getEventListeners(cancel.signal,'abort').length,0);};
 return {...fixture,data,calls,weights,shutdown,cancel,options,response,clean,releases:()=>releases};
}

test('payment reads use one complete reserved 7/8-member native batch and decode unordered replies',async()=>{
 for(const direct of [false,true]){
  const f=setup(direct),result=await read(f.input,f.options);
  assert.deepEqual(result,decodePaymentContext(f.input,f.observations()));assert.equal(result.invoice.amountDueRaw,9007199254740993n);
  assert.deepEqual(f.weights,[direct?7:8]);assert.equal(f.calls.length,1);assert.equal(f.releases(),1);
  assert.deepEqual(f.calls[0],preparePaymentContext(f.input).calls.map(c=>({jsonrpc:'2.0',...c})));f.clean();
 }
});

test('unknown invoice revert, incomplete IDs and changed immutables reject the entire payment context',async()=>{
 for(const mode of ['revert','missing','duplicate','immutable'] as const){
  const f=setup();f.options.fetcher=async(_url,init)=>{const calls=JSON.parse(String(init?.body)) as Call[];f.calls.push(calls);
   const rows=calls.map(c=>({jsonrpc:'2.0',id:c.id,result:f.data.get(c.id)})) as Record<string,unknown>[];
   if(mode==='revert')rows[0]={jsonrpc:'2.0',id:calls[0]!.id,error:{code:3,message:'execution reverted: private invoice data',data:'0x'}};
   if(mode==='missing')rows.pop();if(mode==='duplicate')rows[1]=rows[0]!;if(mode==='immutable')rows[1]!.result='0x'+'00'.repeat(31)+'63';
   return new Response(JSON.stringify(rows));
  };
  await assert.rejects(read(f.input,f.options),error=>{assert.ok(error instanceof Error);assert.match(error.message,/^(RPC_REMOTE_ERROR|RPC_PROTOCOL_ERROR|PAYMENT_CONTEXT_INVALID)$/);assert.ok(!error.message.includes('private'));return true;});
  assert.equal(f.calls.length,1);assert.equal(f.releases(),1);f.clean();
 }
});

test('payment input validation and pre-cancellation happen before RPC reservation',async()=>{
 for(const mode of ['role','token','unverified','descriptor','cancel'] as const){
  const f=setup();if(mode==='role')f.input.request.payer=f.input.manifest.payments;if(mode==='token')f.input.request.tokenIn=address(99);
  if(mode==='unverified')f.input.manifest={...f.input.manifest,verified:false};if(mode==='descriptor')Object.assign(f.input,{calls:[]});if(mode==='cancel')f.cancel.abort();
  await assert.rejects(read(f.input,f.options));assert.deepEqual(f.weights,[]);assert.equal(f.calls.length,0);f.clean();
 }
});

test('payment retries retain one reservation and byte-identical internally generated batch',async()=>{
 const f=setup(),original=f.options.fetcher!;let attempts=0;
 f.options.fetcher=async(url,init)=>{if(++attempts<3){f.calls.push(JSON.parse(String(init?.body)));return new Response('busy',{status:503});}return original(url,init);};
 await read(f.input,f.options);assert.equal(attempts,3);assert.deepEqual(f.weights,[8]);assert.equal(f.releases(),1);assert.deepEqual(f.calls[0],f.calls[2]);f.clean();
});

test('payment deadline, cancellation and response size checks release all reserved capacity',async()=>{
 for(const mode of ['timeout','cancel','oversized'] as const){
  const f=setup();f.options.timeoutMs=50;f.options.fetcher=async()=>mode==='oversized'?new Response('[]',{headers:{'content-length':String(8*256*1024+1)}}):new Promise<Response>(()=>{});
  const pending=read(f.input,f.options);let timer:ReturnType<typeof setTimeout>|undefined;
  if(mode==='cancel')timer=setTimeout(()=>f.cancel.abort(),10);
  try{await assert.rejects(pending,mode==='oversized'?/RPC_RESPONSE_TOO_LARGE/:/RPC_ABORTED/);}finally{clearTimeout(timer);}
  assert.equal(f.releases(),1);f.clean();
 }
});
