import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {decodeFunctionData,type Hex} from 'viem';
import {paymentsAbi,routerAbi,takerData} from '@orbital/sdk';
import {observePaymentQuote as service} from '../src/payment-service.js';
import {prepareWholeSizeQuotes} from '../src/route-selection.js';
import {paymentServiceFixture as fixture} from './payment-service-fixture.js';
import {address,hash} from './strategies-fixture.js';
const observe=(f:ReturnType<typeof fixture>,options={})=>service(f.input.manifest,f.input.request,f.deps,{now:()=>f.now,...options});

test('direct USDC returns exact invoice payment and bounded approval only after both context and canonical rechecks',async()=>{
 const f=fixture(true),r=await observe(f);assert.equal(r.status,'observed');if(r.status!=='observed')return;
 assert.equal(r.data.amountInRaw,'100');assert.equal(r.data.amountOutRaw,'100');assert.equal(r.data.minimumOutRaw,'100');assert.equal(r.data.feeRaw,'0');assert.equal(r.data.refundRaw,'0');
 assert.equal(r.data.search,null);assert.equal(r.data.routing,null);assert.equal(r.data.reviewOnly,true);assert.equal(r.financialExecutionEnabled,false);assert.equal(r.paymentEligibilityVerified,false);
 assert.deepEqual(f.calls.map(c=>c.kind),['invoices','identity','context','context','identity','invoices']);
 assert.deepEqual(r.data.work,{identityMembers:6,contextMembers:14,inspectionMembers:0,quoteMembers:0,logicalMembers:20,nativeBatches:4});
 const plan=decodeFunctionData({abi:paymentsAbi,data:r.data.plan.data});assert.equal(plan.functionName,'payWithUSDC');assert.deepEqual(plan.args,[f.input.request.invoiceId]);
 assert.equal(r.data.approval?.to.toLowerCase(),f.input.manifest.usdc.toLowerCase());assert.equal(r.data.funding.approvalRequired,true);assert.doesNotThrow(()=>JSON.stringify(r));
 f.context.allowanceRaw=100n;const approved=await observe(f);assert.equal(approved.status,'observed');if(approved.status==='observed')assert.equal(approved.data.approval,null);
});

test('swap search uses one candidate/inspection set and exact adapter traits; retained quote and unsigned plan agree',async()=>{
 const f=fixture(),quotes:{amount:bigint;orderHash:string;data:Hex}[]=[],original=f.deps.readBatch;
 f.deps.readBatch=async(input,phase,...rest)=>{if(phase.kind==='quote')for(const c of prepareWholeSizeQuotes(input,phase.observations).quoteBatches[phase.batchIndex]!){assert.equal(c.params[0].from,f.input.manifest.payments.toLowerCase());quotes.push({amount:BigInt(input.intent.amountInRaw),orderHash:c.id.split(':')[0]!,data:c.params[0].data as Hex});}return original(input,phase,...rest);};
 const r=await observe(f);assert.equal(r.status,'observed');if(r.status!=='observed')return;
 assert.equal(r.data.amountInRaw,'134');assert.equal(r.data.amountOutRaw,'100');assert.equal(r.data.feeRaw,'1');assert.equal(r.data.minimumOutRaw,'100');assert.equal(r.data.refundRaw,'0');
 assert.equal(r.data.search?.minimumInputCertified,false);assert.equal(r.data.search?.selection,'sufficient_observed_input');assert.equal(r.data.routing?.best?.caller,f.input.manifest.payments.toLowerCase());
 assert.equal(f.calls.filter(c=>c.kind==='strategies').length,2);assert.equal(f.calls.filter(c=>c.kind==='inspection').length,1);
 assert.ok(f.calls.filter(c=>c.kind!=='invoices'||c.pin).every(c=>!c.pin||JSON.stringify(c.pin)===JSON.stringify(f.input.pin)));
 assert.equal(r.data.work.quoteMembers,quotes.length);assert.equal(r.data.work.logicalMembers,f.calls.reduce((sum,c)=>sum+(c.members??0),0));assert.equal(r.data.work.nativeBatches,f.calls.filter(c=>c.members).length);
 const decoded=decodeFunctionData({abi:paymentsAbi,data:r.data.plan.data});assert.equal(decoded.functionName,'payWithSwap');
 if(decoded.functionName==='payWithSwap'){const [id,order,index,amount,minimum,deadline,crossings]=decoded.args;assert.equal(id,f.input.request.invoiceId);assert.equal(index,1);assert.equal(amount,134n);assert.equal(minimum,100n);assert.equal(BigInt(deadline),f.timestamp+20n);assert.equal(crossings,16);
  const selected=quotes.find(q=>q.amount===134n&&q.orderHash===r.data.routing!.best!.orderHash)!;const quote=decodeFunctionData({abi:routerAbi,data:selected.data});assert.equal(quote.functionName,'quote');if(quote.functionName==='quote'){assert.deepEqual(quote.args[0],order);assert.equal(quote.args[1],amount);assert.equal(quote.args[2],takerData({taker:f.input.manifest.payments as Hex,recipient:f.input.manifest.payments as Hex,minimum,deadline:BigInt(deadline),input:index,output:0,maxCrossings:crossings}));}
 }
 assert.doesNotThrow(()=>JSON.stringify(r));
});

test('all 32 eligible orders stay below aggregate limits and unsuccessful discovery is unavailable, never insufficient liquidity',async()=>{
 const f=fixture(false,32);f.output.value=()=>0n;const r=await observe(f);assert.equal(r.status,'unavailable');assert.equal(r.code,'PAYMENT_SEARCH_EXHAUSTED');assert.equal(r.httpStatus,503);assert.equal(r.data,null);
 assert.equal(f.calls.filter(c=>c.kind==='quote').reduce((n,c)=>n+c.members!,0),128);assert.equal(f.calls.filter(c=>c.kind==='inspection').length,12);
 assert.equal(f.calls.filter(c=>c.kind==='identity').length,2);assert.equal(f.calls.filter(c=>c.kind==='context').length,2);
 assert.doesNotMatch(JSON.stringify(r),/insufficient liquidity/i);
});

test('initial malformed source, request or configuration never starts quote work',async()=>{
 for(const mode of ['unverified','request','role','missingCoverage','extraInvoice','wrongInvoice','current','time'] as const){
  const f=fixture();if(mode==='unverified')f.input.manifest={...f.input.manifest,verified:false};if(mode==='request')Object.assign(f.input.request,{minimumOutRaw:'1'});if(mode==='role')f.input.request.payer=f.input.manifest.payments;
  if(mode==='missingCoverage')f.invoices.coverage.coveredBlocks='2';if(mode==='extraInvoice')f.invoices.items!.push(structuredClone(f.record));if(mode==='wrongInvoice')f.invoices.items![0]!.invoiceId=hash(99);
  if(mode==='current')f.invoices.currentCursor={height:'4',hash:hash(4)};if(mode==='time')f.invoices.indexedAt=new Date(f.now-11000).toISOString();
  const r=await observe(f);assert.equal(r.status,'unavailable',mode);assert.equal(f.calls.some(c=>c.kind==='inspection'||c.kind==='quote'),false,mode);
 }
});

test('only complete canonically rechecked indexed absence returns 404; getter failures return unavailable',async()=>{
 const f=fixture();f.invoices.items=[];const r=await observe(f);assert.equal(r.httpStatus,404);assert.equal(r.code,'INVOICE_NOT_FOUND');assert.equal(r.canonicalVerification,'verified_at_pin');assert.deepEqual(r.asOf,f.input.pin);
 assert.deepEqual(f.calls.map(c=>c.kind),['invoices','identity','identity','invoices']);
 const broken=fixture();broken.deps.readContext=async()=>{throw Error('RPC_REMOTE_ERROR');};const error=await observe(broken);assert.equal(error.httpStatus,503);assert.equal(error.canonicalVerification,'unavailable');
 const changed=fixture();changed.invoices.items=[];const original=changed.deps.readInvoices;let reads=0;changed.deps.readInvoices=async(...args)=>{if(++reads===2)changed.invoices.coverage.coveredBlocks='2';return original(...args);};assert.equal((await observe(changed)).httpStatus,503);
});

test('changed final context, invoice source, candidate source or canonical identity discards every retained quote',async()=>{
 for(const mode of ['balance','allowance','invoice','candidate','hash','timestamp','resync'] as const){
  const f=fixture();let contexts=0,identities=0,invoices=0,strategies=0;const d={...f.deps};
  f.deps.readContext=async(...args)=>{const r=await d.readContext(...args);if(++contexts===2){if(mode==='balance')r.balanceRaw++;if(mode==='allowance')r.allowanceRaw++;}return r;};
  f.deps.readInvoices=async(...args)=>{const r=await d.readInvoices(...args);if(++invoices===2){if(mode==='invoice')r.items![0]!.memoHash=hash(77);if(mode==='resync')r.code='RESYNC_REQUIRED';}return r;};
  f.deps.readDatabase=async(...args)=>{const r=await d.readDatabase(...args);if(++strategies===2&&mode==='candidate')r.items!.pop();return r;};
  f.deps.readIdentity=async(...args)=>{const r=await d.readIdentity(...args);if(++identities===2){if(mode==='hash')r.block.hash=hash(77);if(mode==='timestamp')r.block.timestamp++;}return r;};
  const r=await observe(f);assert.equal(r.status,'unavailable',mode);assert.equal(r.data,null,mode);assert.equal(r.canonicalVerification,'unavailable',mode);
 }
});

test('ordinary confirmed tip advancement retains the original pin only when both final database scopes match the new head',async()=>{
 const f=fixture(),identity=f.deps.readIdentity;let identities=0;
 f.deps.readIdentity=async(...args)=>{if(++identities===2){f.invoices.currentCursor={height:'4',hash:hash(4)};f.routing.input.snapshot.currentCursor={height:'4',hash:hash(4)};}return identity(...args);};
 const r=await observe(f);assert.equal(r.status,'observed');assert.equal(r.historical,true);assert.equal(r.asOf?.height,'3');assert.equal(r.currentIndexedBlock?.height,'4');
});

test('incomplete quote batches, non-EVM failures and late transport failure cannot return an earlier sufficient stage',async()=>{
 for(const mode of ['missing','transport','late'] as const){
  const f=fixture(),original=f.deps.readBatch;let stages=0;
  f.deps.readBatch=async(...args)=>{const rows=await original(...args);if(args[1].kind==='quote'&&++stages===3){if(mode==='missing')return rows.slice(1);if(mode==='transport')rows[0]={request:rows[0]!.request,status:'rejected',reason:'transport'};else if(mode==='late')throw Error('private provider detail');}return rows;};
  const r=await observe(f);assert.equal(r.status,'unavailable',mode);assert.equal(r.data,null);assert.doesNotMatch(JSON.stringify(r),/private/);assert.equal(stages,3);
 }
});

test('a matching terminal invoice or exact direct funding deficit returns its specific conflict after final checks',async()=>{
 for(const mode of ['cancelled','expired','max','balance'] as const){
  const f=fixture(true);let code='',status=409;
  if(mode==='cancelled'){f.record.status='cancelled';f.record.version='2';f.record.updated={blockNumber:'2',blockHash:hash(2),txHash:hash(102),logIndex:0};f.context.invoice.status=4;code='INVOICE_CANCELLED';}
  if(mode==='expired'){f.record.expiresAt=f.timestamp.toString();f.context.invoice.expiresAt=f.timestamp;code='INVOICE_EXPIRED';}
  if(mode==='max'){f.input.request.maxInputRaw='99';code='PAYMENT_MAX_INPUT_INSUFFICIENT';status=422;}
  if(mode==='balance'){f.context.balanceRaw=99n;code='PAYMENT_BALANCE_INSUFFICIENT';status=422;}
  const r=await observe(f);assert.equal(r.code,code);assert.equal(r.httpStatus,status);assert.equal(f.calls.filter(c=>c.kind==='context').length,2);assert.equal(f.calls.filter(c=>c.kind==='invoices').length,2);
 }
});

test('cancellation or the single total timeout interrupts stalled dependencies and removes listeners',async()=>{
 for(const kind of ['readInvoices','readContext','readBatch'] as const){
  const f=fixture(),controller=new AbortController();let reached!:()=>void;const arrived=new Promise<void>(resolve=>{reached=resolve;});f.deps[kind]=async()=>{reached();return new Promise(()=>{});};
  const pending=observe(f,{signal:controller.signal,timeoutMs:500});await arrived;controller.abort();const r=await pending;assert.equal(r.code,'PAYMENT_QUOTE_CANCELLED');assert.equal(r.data,null);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  const timed=await observe(f,{timeoutMs:40});assert.equal(timed.code,'PAYMENT_QUOTE_TIMEOUT');assert.equal(timed.httpStatus,504);
 }
});

test('expiry and index freshness are checked again after slow final database work',async()=>{
 for(const mode of ['expiry','index'] as const){
  const f=fixture(true),original=f.deps.readInvoices;let reads=0;
  f.now+=900;if(mode==='expiry'){f.record.expiresAt=(f.timestamp+1n).toString();f.context.invoice.expiresAt=f.timestamp+1n;}else f.invoices.indexedAt=new Date(f.now-9900).toISOString();
  f.deps.readInvoices=async(...args)=>{if(++reads===2)await new Promise(resolve=>setTimeout(resolve,150));return original(...args);};
  const r=await observe(f);assert.equal(r.code,mode==='expiry'?'INVOICE_EXPIRED':'PAYMENT_INDEXER_STALE');assert.equal(r.data,null);assert.equal(reads,2);
 }
});

test('optional refinement yields to final checks under one short remaining budget',async()=>{
 const f=fixture(),r=await observe(f,{timeoutMs:1500});assert.equal(r.status,'observed');if(r.status!=='observed')return;
 assert.equal(r.data.amountInRaw,'200');assert.equal(r.data.search?.stopReason,'refinement_skipped');assert.equal(r.data.search?.refinementStages,0);
 assert.equal(f.calls.filter(c=>c.kind==='context').length,2);assert.equal(f.calls.filter(c=>c.kind==='identity').length,2);
 assert.ok(f.calls.filter(c=>c.budget!==undefined).every(c=>Number.isInteger(c.budget)&&c.budget!>0&&c.budget!<=1500));
});

test('32 inspections with nine eligible orders can attain the 44-batch bound while retaining a sufficient cap quote',async()=>{
 const f=fixture(false,32);f.input.request.maxInputRaw='65536';f.context.balanceRaw=65536n;f.record.amountDueRaw='2';f.context.invoice.amountDueRaw=2n;
 f.output.value=amount=>amount===65536n?2n:0n;
 const eligible=new Set(f.routing.records.slice(0,9).map(r=>r.orderHash)),original=f.deps.readBatch;
 f.deps.readBatch=async(...args)=>(await original(...args)).map(row=>args[1].kind==='inspection'&&!eligible.has(row.request.id.split(':')[0]!)?{request:row.request,status:'rejected' as const,reason:'revert' as const}:row);
 const r=await observe(f);assert.equal(r.status,'observed');if(r.status!=='observed')return;
 assert.equal(r.data.amountInRaw,'65536');assert.equal(r.data.search?.stagesUsed,14);assert.equal(r.data.search?.quoteCallsUsed,126);assert.equal(r.data.search?.quoteBatchesUsed,28);
 assert.deepEqual(r.data.work,{identityMembers:6,contextMembers:16,inspectionMembers:96,quoteMembers:126,logicalMembers:244,nativeBatches:44});
 assert.equal(f.calls.filter(c=>c.members).length,44);assert.equal(f.calls.reduce((n,c)=>n+(c.members??0),0),244);
});
