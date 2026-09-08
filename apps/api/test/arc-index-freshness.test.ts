import test from 'node:test';
import assert from 'node:assert/strict';
import type {ReceiptMetricsSnapshot} from '@orbital/db';
import {cursorFollows,isFreshIndexedHead} from '../src/index-freshness.js';
import {checkReadiness,type IndexedState,type ReadinessDependencies} from '../src/readiness.js';
import {observeQuote,type QuoteDependencies} from '../src/quote-service.js';
import {observePaymentQuote} from '../src/payment-service.js';
import {prepareRouting,prepareWholeSizeQuotes} from '../src/route-selection.js';
import {getStrategies} from '../src/strategies.js';
import {getInvoices} from '../src/invoices.js';
import {getMetrics} from '../src/metrics.js';
import {routingFixture} from './route-selection-fixture.js';
import {paymentServiceFixture} from './payment-service-fixture.js';
import {hash} from './strategies-fixture.js';

const ARC=5042002,timestamp=1700000003n,now=Number(timestamp)*1000;
const block=(height:number)=>({height:String(height),hash:hash(height)});
// Deterministic unit observations only; no RPC, database or live settlement evidence.
function quoteFixture(chainId=ARC){
 const f=routingFixture(1,chainId),head={value:5n};
 f.input.intent.amountInRaw='1000000';
 f.input.snapshot.indexedAt=new Date(now).toISOString();
 const deps:QuoteDependencies={
  async readDatabase(){return structuredClone(f.input.snapshot);},
  async readIdentity(m,pin){return {chainId:m.chainId,head:head.value,block:{...pin,timestamp}};},
  async readBatch(input,phase){
   const batches=phase.kind==='inspection'?prepareRouting(input).batches:prepareWholeSizeQuotes(input,phase.observations).quoteBatches;
   return phase.kind==='inspection'?f.inspections(batches[phase.batchIndex]!):f.quotes(batches[phase.batchIndex]!);
  },
 };
 return {...f,head,deps};
}
const quote=(f:ReturnType<typeof quoteFixture>)=>observeQuote(f.input.manifest,f.input.intent,f.deps,{now:()=>now});
const payment=(f:ReturnType<typeof paymentServiceFixture>)=>observePaymentQuote(f.input.manifest,f.input.request,f.deps,{now:()=>f.now});

test('Arc accepts only two through eight blocks of head lag; other chains retain exactly two',()=>{
 for(const lag of [-1n,0n,1n,2n,3n,7n,8n,9n,100n]){
  assert.equal(isFreshIndexedHead(ARC,100n+lag,100n),lag>=2n&&lag<=8n,`Arc ${lag}`);
  assert.equal(isFreshIndexedHead(31337,100n+lag,100n),lag===2n,`local ${lag}`);
 }
 assert.equal(isFreshIndexedHead(ARC,1n,-1n),false);
 assert.equal(cursorFollows(block(3),block(4)),true);
 assert.equal(cursorFollows(block(3),block(3)),true);
 assert.equal(cursorFollows(block(4),block(3)),false);
 assert.equal(cursorFollows(block(4),{height:'4',hash:hash(99)}),false);
});

test('Arc readiness keeps canonical, age, confirmation and final cursor checks',async()=>{
 const f=quoteFixture(),projection={...block(3),height:3n,updatedAt:new Date(now),canonical:true,projectionVersion:1};
 const state:IndexedState={height:3n,hash:hash(3),status:'indexing',updatedAt:new Date(now),canonical:true,
  materialization:{deploymentId:f.input.snapshot.deploymentId,identityMatches:true,cursor:projection}};
 const deps:ReadinessDependencies={async readDatabase(){return structuredClone(state);},
  async readRpc(){return {chainId:ARC,head:f.head.value,indexedBlockHash:hash(3)};}};
 for(const [head,code] of [[5n,'READ_DEPENDENCIES_READY'],[11n,'READ_DEPENDENCIES_READY'],[12n,'INDEXER_CATCHING_UP'],[4n,'INDEXER_UNCONFIRMED']] as const){
  f.head.value=head;assert.equal((await checkReadiness(f.input.manifest,deps,now)).code,code);
 }
 f.head.value=7n;
 for(const [patch,code] of [[{canonical:false},'INDEXER_ORPHANED'],[{updatedAt:new Date(now-10001)},'INDEXER_STALE']] as const)
  assert.equal((await checkReadiness(f.input.manifest,{...deps,async readDatabase(){return {...state,...patch};}},now)).code,code);
 assert.equal((await checkReadiness(f.input.manifest,{...deps,async readRpc(){return {chainId:ARC,head:7n,indexedBlockHash:hash(99)};}},now)).code,'INDEXER_ORPHANED');
 let reads=0;
 assert.equal((await checkReadiness(f.input.manifest,{...deps,async readDatabase(){return ++reads===1?state:{...state,height:4n,hash:hash(4)};}},now)).code,'INDEXER_CHANGED');
});

test('Arc quote accepts bounded confirmed lag and rejects stale, unconfirmed or replaced pins',async()=>{
 for(const lag of [1n,2n,5n,8n,9n]){
  const f=quoteFixture();f.head.value=3n+lag;
  const r=await quote(f);assert.equal(r.status,lag>=2n&&lag<=8n?'observed':'unavailable',String(lag));
  if(r.status==='observed'){assert.equal(r.data.best?.amountInRaw,'1000000');assert.equal(r.asOf.height,'3');}
 }
 const local=quoteFixture(31337);local.head.value=6n;assert.equal((await quote(local)).code,'QUOTE_INDEXER_STALE');
 const orphan=quoteFixture();orphan.deps.readIdentity=async()=>({chainId:ARC,head:7n,block:{height:'3',hash:hash(99),timestamp}});
 assert.equal((await quote(orphan)).code,'QUOTE_RPC_IDENTITY_INVALID');
 const old=quoteFixture();old.input.snapshot.indexedAt=new Date(now-10001).toISOString();assert.equal((await quote(old)).code,'QUOTE_INDEXER_STALE');
});

test('Arc quote retains its original pinned payload as the confirmed tip advances',async()=>{
 const f=quoteFixture(),read=f.deps.readDatabase;let reads=0;
 f.head.value=9n;
 f.deps.readDatabase=async(...args)=>{const s=await read(...args);if(++reads===2)s.currentCursor=block(6);return s;};
 const r=await quote(f);assert.equal(r.status,'observed');if(r.status!=='observed')return;
 assert.deepEqual(r.asOf,block(3));assert.deepEqual(r.currentIndexedBlock,block(6));assert.equal(r.historical,true);
 for(const mode of ['unconfirmed','payload','orphan'] as const){
  const g=quoteFixture(),read=g.deps.readDatabase;let reads=0;g.head.value=9n;
  g.deps.readDatabase=async(...args)=>{const s=await read(...args);if(++reads===2){s.currentCursor=block(mode==='unconfirmed'?8:6);if(mode==='payload')s.items=[];if(mode==='orphan')s.code='STRATEGY_CURSOR_ORPHANED';}return s;};
  const result=await quote(g);assert.equal(result.status,'unavailable',mode);
  assert.equal(result.code,mode==='unconfirmed'?'QUOTE_INDEXER_STALE':mode==='payload'?'QUOTE_SOURCE_CHANGED':'QUOTE_SOURCE_UNAVAILABLE',mode);
 }
});

function advancingPayment(){
 const f=paymentServiceFixture(false,1,ARC),deps={...f.deps};let invoices=0,strategies=0,identities=0;
 f.deps.readInvoices=async(...args)=>{const s=await deps.readInvoices(...args);s.currentCursor=block(++invoices===1?3:5);return s;};
 f.deps.readDatabase=async(...args)=>{const s=await deps.readDatabase(...args);s.currentCursor=block(++strategies===1?4:6);return s;};
 f.deps.readIdentity=async(...args)=>{const r=await deps.readIdentity(...args);r.head=++identities===1?7n:9n;return r;};
 return f;
}

test('Arc swap-funded payment uses one canonical pin through independently advancing source cursors',async()=>{
 const f=advancingPayment(),r=await payment(f);
 assert.equal(r.status,'observed',r.code);if(r.status!=='observed')return;
 assert.equal(r.data.kind,'swap');assert.equal(r.data.amountInRaw,'134');assert.equal(r.data.amountOutRaw,'100');
 assert.deepEqual(r.asOf,block(3));assert.deepEqual(r.currentIndexedBlock,block(5));assert.equal(r.historical,true);
 assert.equal(r.data.work.identityMembers,6);assert.equal(f.calls.filter(c=>c.kind==='identity').length,2);
 assert.ok(f.calls.filter(c=>c.pin).every(c=>JSON.stringify(c.pin)===JSON.stringify(block(3))));
 assert.equal(f.calls.filter(c=>c.kind==='invoices').length,2);assert.equal(f.calls.filter(c=>c.kind==='strategies').length,2);
});

test('Arc direct payment keeps the same freshness boundary and identity budget',async()=>{
 for(const lag of [1n,2n,8n,9n]){
  const f=paymentServiceFixture(true,1,ARC),identity=f.deps.readIdentity;
  f.deps.readIdentity=async(...args)=>{const r=await identity(...args);r.head=3n+lag;return r;};
  const r=await payment(f);assert.equal(r.status,lag>=2n&&lag<=8n?'observed':'unavailable',String(lag));
  if(r.status==='observed'){assert.equal(r.data.kind,'direct');assert.equal(r.data.work.identityMembers,6);}
 }
});

test('initial historical candidate relaxation remains confined to Arc payments',async()=>{
 const swap=quoteFixture();swap.input.snapshot.currentCursor=block(4);
 assert.throws(()=>prepareRouting(swap.input),/CANDIDATE_SOURCE_INVALID/);
 const local=paymentServiceFixture(false,1,31337),read=local.deps.readDatabase;
 local.deps.readDatabase=async(...args)=>{const s=await read(...args);s.currentCursor=block(4);return s;};
 assert.equal((await payment(local)).code,'PAYMENT_SOURCE_UNAVAILABLE');
});

test('Arc payment rejects cursor rewinds, same-height replacements and unconfirmed final cursors',async()=>{
 for(const mode of ['invoiceRewind','strategyRewind','sameHeightFork','unconfirmed','lagged'] as const){
  const f=advancingPayment(),invoices=f.deps.readInvoices,strategies=f.deps.readDatabase;let invoiceReads=0,strategyReads=0;
  f.deps.readInvoices=async(...args)=>{const s=await invoices(...args);if(++invoiceReads===2&&mode==='invoiceRewind')s.currentCursor=block(3);return s;};
  f.deps.readDatabase=async(...args)=>{const s=await strategies(...args);if(++strategyReads===2){
   if(mode==='strategyRewind')s.currentCursor=block(4);
   if(mode==='sameHeightFork')s.currentCursor={height:'5',hash:hash(99)};
   if(mode==='unconfirmed')s.currentCursor=block(8);
  }return s;};
  if(mode==='lagged'){const identity=f.deps.readIdentity;let reads=0;f.deps.readIdentity=async(...args)=>{const r=await identity(...args);if(++reads===2)r.head=14n;return r;};}
  const r=await payment(f);assert.equal(r.status,'unavailable',mode);assert.equal(r.data,null,mode);
  assert.equal(r.code,mode==='invoiceRewind'?'PAYMENT_SOURCE_CHANGED':'PAYMENT_INDEXER_STALE',mode);
 }
});

test('Arc payment still rejects incomplete coverage, changed pinned payloads and orphaned sources',async()=>{
 for(const mode of ['coverage','invoice','strategy','orphan','rpcPin','candidatePin'] as const){
  const f=advancingPayment(),invoices=f.deps.readInvoices,strategies=f.deps.readDatabase;let invoiceReads=0,strategyReads=0;
  f.deps.readInvoices=async(...args)=>{const s=await invoices(...args);if(++invoiceReads===2){
   if(mode==='coverage')s.coverage.coveredBlocks='2';
   if(mode==='invoice')s.items![0]!.memoHash=hash(88);
   if(mode==='orphan')s.code='INVOICE_CURSOR_ORPHANED';
  }return s;};
  f.deps.readDatabase=async(...args)=>{const s=await strategies(...args);if(++strategyReads===2&&mode==='strategy')s.items=[];if(mode==='candidatePin')s.asOf={height:'3',hash:hash(99)};return s;};
  if(mode==='rpcPin'){const identity=f.deps.readIdentity;let reads=0;f.deps.readIdentity=async(...args)=>{const r=await identity(...args);if(++reads===2)r.block.hash=hash(99);return r;};}
  const r=await payment(f);assert.equal(r.status,'unavailable',mode);assert.equal(r.data,null,mode);
  assert.equal(r.code,mode==='rpcPin'?'PAYMENT_RPC_IDENTITY_INVALID':mode==='invoice'||mode==='strategy'?'PAYMENT_SOURCE_CHANGED':'PAYMENT_SOURCE_UNAVAILABLE',mode);
 }
});

test('public strategy, invoice and metrics reads classify the same Arc freshness window',async()=>{
 for(const chainId of [ARC,31337])for(const lag of [1n,2n,8n,9n]){
  const f=paymentServiceFixture(true,1,chainId),head=3n+lag,m=f.input.manifest;
  const expected=lag<2n?'unavailable':isFreshIndexedHead(chainId,head,3n)?'available':'stale';
  const strategies=await getStrategies(m,{query:{}},{readDatabase:f.deps.readDatabase,
   async readRpc(){return {chainId,head,block:{...block(3),timestamp}};}},now);
  const invoices=await getInvoices(m,{id:f.input.request.invoiceId},{readDatabase:f.deps.readInvoices,
   async readRpc(_m,blocks){return {chainId,head,blocks:blocks.map(b=>({...b,timestamp}))};}},now);
  const snapshot:ReceiptMetricsSnapshot={code:'METRICS_COMPLETE',chainId,deploymentId:f.invoices.deploymentId,cursor:block(3),
   indexedAt:new Date(now).toISOString(),coverage:f.invoices.coverage,
   totals:{swapCount:'0',activeStrategyCount:'0',pairs:[],firstSwap:null,lastSwap:null}};
  const metrics=await getMetrics(m,{async readDatabase(){return structuredClone(snapshot);},
   async readRpc(_m,blocks){return {chainId,head,blocks:blocks.map(b=>({...b,timestamp}))};}},now);
  for(const [kind,result] of [['strategies',strategies],['invoices',invoices],['metrics',metrics]] as const)
   assert.equal(result.status,expected,`${kind} chain ${chainId} lag ${lag}: ${result.code}`);
 }
});
