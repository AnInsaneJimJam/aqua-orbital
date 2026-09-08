import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionResult,type Hex} from 'viem';
import {lifecycleAbi,routerAbi} from '@orbital/sdk';
import {reconcileCanonicalChain} from '@orbital/db';
import {observeQuote as service,type QuoteDependencies} from '../src/quote-service.js';
import {prepareRouting,prepareWholeSizeQuotes,type RoutingIntent,type StaticReadCall,type StaticReadResult} from '../src/route-selection.js';
import {strategyFixture,manifest,address,hash,header} from './strategies-fixture.js';

const intent:RoutingIntent={kind:'swap',wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'1000000',slippageBps:50,maxCrossings:16};
async function observeQuote(...args:Parameters<typeof service>){return JSON.parse(JSON.stringify(await service(...args)));}
async function fixture(){
 const f=await strategyFixture(),timestamp=BigInt(Math.floor(Date.now()/1000)),calls:{kind:string;value?:unknown}[]=[];
 const deps:QuoteDependencies={
  async readDatabase(m,q){calls.push({kind:'database',value:q});return f.dependencies.readDatabase(m,q);},
  async readIdentity(m,pin){calls.push({kind:'identity',value:pin});const observed=await f.dependencies.readRpc(m,pin,null);return {chainId:observed.chainId,head:observed.head,block:{...pin,timestamp}};},
  async readBatch(input,phase,signal){assert.equal(signal.aborted,false);calls.push({kind:phase.kind,value:phase});const batches=phase.kind==='inspection'?prepareRouting(input).batches:prepareWholeSizeQuotes(input,phase.observations).quoteBatches;
   return batches[phase.batchIndex]!.map((request:StaticReadCall):StaticReadResult=>{const [id,name]=request.id.split(':');if(name==='quote')return {request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[BigInt(input.intent.amountInRaw),10n**18n,id as Hex]})};
    const data=f.observation(id!);return {request,status:'fulfilled',data:encodeFunctionResult({abi:lifecycleAbi,functionName:name as 'getStrategyConfig',result:name==='getStrategyConfig'?data.config:name==='getStrategyState'?data.state:data.availability} as never)};
   });
  },
 };
 return {...f,timestamp,calls,deps};
}
test('service binds real canonical candidates to RPC timestamp and final identity/database checks',async()=>{
 const f=await fixture();try{const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.status,'observed');assert.equal(result.canonicalVerification,'verified_at_pin');assert.equal(result.financialExecutionEnabled,false);assert.equal(result.data.counts.scanned,6);assert.equal(result.data.counts.quoted,6);assert.equal(result.data.best.expiresAt,(f.timestamp+20n).toString());assert.equal(result.data.best.caller,address(22).toLowerCase());assert.equal(result.data.alternatives.length,3);
  assert.deepEqual(f.calls.map(c=>c.kind),['database','identity','inspection','inspection','inspection','quote','identity','database']);assert.equal(result.asOf.hash,hash(3));assert.ok(f.calls.filter(c=>c.kind==='identity').every(c=>JSON.stringify(c.value)===JSON.stringify({height:'3',hash:hash(3)})));assert.doesNotThrow(()=>JSON.stringify(result));
 }finally{await f.close();}
});
test('unavailable or malformed input never becomes an observed quote or starts RPC batches',async()=>{
 const f=await fixture();try{assert.equal((await observeQuote(manifest,intent,f.deps)).status,'observed');f.calls.length=0;
  for(const m of [null,{...manifest,verified:false}]){const result=await observeQuote(m,intent,f.deps);assert.equal(result.data,null);assert.equal(result.status,'unavailable');}assert.equal(f.calls.length,0);
  const invalid=await observeQuote(manifest,{...intent,amountInRaw:'1e18'},f.deps);assert.equal(invalid.code,'INVALID_QUOTE_REQUEST');assert.equal(f.calls.length,0);
  await f.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=1');const absent=await observeQuote(manifest,intent,f.deps);assert.equal(absent.data,null);assert.equal(f.calls.filter(c=>c.kind!=='database').length,0);
 }finally{await f.close();}
});
test('per-candidate getter and quote reverts retain diagnostics while other whole-size routes survive',async()=>{
 const f=await fixture();try{const original=f.deps.readBatch;let getter=false,quote=false;
  f.deps.readBatch=async(...args)=>{const rows=await original(...args);if(args[1].kind==='inspection'&&!getter){getter=true;rows[0]={request:rows[0]!.request,status:'rejected',reason:'revert'};}else if(args[1].kind==='quote'&&!quote){quote=true;rows[0]={request:rows[0]!.request,status:'rejected',reason:'revert'};}return rows;};
  const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.status,'observed');assert.equal(result.data.counts.scanned,6);assert.equal(result.data.counts.eligible,5);assert.equal(result.data.counts.quoted,4);assert.equal(result.data.counts.failed,2);assert.ok(result.data.diagnostics.some((d:any)=>d.code==='INSPECTION_FAILED'));assert.ok(result.data.diagnostics.some((d:any)=>d.code==='QUOTE_REVERTED'));
 }finally{await f.close();}
});
test('group transport failures discard partial results and prevent queued quote work',async()=>{
 const f=await fixture();try{let batches=0;const original=f.deps.readBatch;f.deps.readBatch=async(...args)=>{batches++;if(batches===2)throw Error('https://private.invalid/credential');return original(...args);};
  const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.data,null);assert.equal(batches,2);assert.equal(f.calls.some(c=>c.kind==='quote'),false);assert.doesNotMatch(JSON.stringify(result),/credential|private\.invalid/);
 }finally{await f.close();}
});
test('wrong identities, future or expired pinned timestamps and stale indexing fail before quote reads',async()=>{
 const f=await fixture();try{assert.equal((await observeQuote(manifest,intent,f.deps)).status,'observed');const original=f.deps.readIdentity;
  for(const mutate of [(r:any)=>{r.chainId=1;},(r:any)=>{r.block.hash=hash(99);},(r:any)=>{r.block.timestamp+=60n;},(r:any)=>{r.block.timestamp-=60n;},(r:any)=>{r.head=6n;}]){f.calls.length=0;f.deps.readIdentity=async(...args)=>{const r=await original(...args);mutate(r);return r;};const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.data,null);assert.equal(f.calls.some(c=>c.kind==='inspection'),false);}
  f.deps.readIdentity=original;await f.db.pool.query("UPDATE indexer_state SET updated_at=now()-interval '15 seconds'");f.calls.length=0;const stale=await observeQuote(manifest,intent,f.deps);assert.equal(stale.data,null);assert.equal(f.calls.some(c=>c.kind==='inspection'),false);
 }finally{await f.close();}
});
test('reorg after quotes discards all output; ordinary tip advancement can retain identical pinned observations',async()=>{
 const f=await fixture();try{const original=f.deps.readIdentity;let count=0;f.deps.readIdentity=async(...args)=>{const r=await original(...args);if(++count===2)await reconcileCanonicalChain(f.db.pool,31337,{height:3n,hash:hash(3)},[{number:3n,hash:hash(53),parentHash:hash(2)},header(2)]);return r;};const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.data,null);assert.equal(result.canonicalVerification,'unavailable');
 }finally{await f.close();}
 const g=await fixture();try{const original=g.deps.readIdentity;let count=0;g.deps.readIdentity=async(...args)=>{if(++count===2)await g.advance(4);return original(...args);};const result=await observeQuote(manifest,intent,g.deps);assert.equal(result.status,'observed');assert.equal(result.asOf.height,'3');assert.equal(result.currentIndexedBlock.height,'4');assert.equal(result.historical,true);assert.equal(result.data.counts.quoted,6);
 }finally{await g.close();}
});
test('cancellation and total deadline stop superseded work without returning a partial selection',async()=>{
 const f=await fixture();try{assert.equal((await observeQuote(manifest,intent,f.deps)).status,'observed');const snapshot=await f.deps.readDatabase(manifest,{kind:'candidates',tokenIn:address(1).toLowerCase(),tokenOut:address(3).toLowerCase()});f.deps.readDatabase=async()=>snapshot;
  let started!:()=>void;const reached=new Promise<void>(resolve=>{started=resolve;});let calls=0;f.deps.readBatch=async()=>{calls++;started();return new Promise(()=>{});};
  const signal=new AbortController(),pending=observeQuote(manifest,intent,f.deps,{signal:signal.signal});await reached;signal.abort('superseded private draft');const cancelled=await pending;assert.equal(cancelled.code,'QUOTE_CANCELLED');assert.equal(cancelled.data,null);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(cancelled),/draft/);
  calls=0;const timed=await observeQuote(manifest,intent,f.deps,{timeoutMs:50});assert.equal(timed.code,'QUOTE_TIMEOUT');assert.equal(timed.data,null);assert.equal(calls,1);
 }finally{await f.close();}
});
test('all inspected reverts report no route in the inspected set after canonical rechecks',async()=>{
 const f=await fixture();try{const original=f.deps.readBatch;f.deps.readBatch=async(...args)=>(await original(...args)).map(row=>({request:row.request,status:'rejected' as const,reason:'revert' as const}));
  const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.status,'observed');assert.equal(result.code,'NO_ROUTE_IN_INSPECTED_SET');assert.equal(result.data.best,null);assert.equal(result.data.counts.failed,6);assert.equal(result.data.counts.eligible,0);assert.equal(f.calls.filter(c=>c.kind==='identity').length,2);
 }finally{await f.close();}
});
test('every RPC group receives the remaining total budget instead of a fresh eight seconds',async()=>{
 const f=await fixture();try{const snapshot=await f.deps.readDatabase(manifest,{kind:'candidates',tokenIn:address(1).toLowerCase(),tokenOut:address(3).toLowerCase()}),budgets:unknown[]=[];f.deps.readDatabase=async()=>snapshot;
  const identity=f.deps.readIdentity,batch=f.deps.readBatch;f.deps.readIdentity=async(...args)=>{budgets.push((args as unknown[])[3]);return identity(...args);};f.deps.readBatch=async(...args)=>{budgets.push((args as unknown[])[3]);return batch(...args);};
  const result=await observeQuote(manifest,intent,f.deps,{timeoutMs:1000});assert.equal(result.status,'observed');assert.equal(budgets.length,6);assert.ok(budgets.every(v=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=1000));
 }finally{await f.close();}
});
test('final indexed freshness and source changes invalidate an otherwise completed quote selection',async()=>{
 for(const sql of ["UPDATE indexer_state SET updated_at=now()-interval '15 seconds'",'DELETE FROM swap_receipts']){const f=await fixture();try{assert.equal((await observeQuote(manifest,intent,f.deps)).status,'observed');const original=f.deps.readIdentity;let count=0;f.deps.readIdentity=async(...args)=>{const result=await original(...args);if(++count===2)await f.db.pool.query(sql);return result;};const result=await observeQuote(manifest,intent,f.deps);assert.equal(result.data,null);assert.equal(result.status,'unavailable');assert.equal(count,2);
 }finally{await f.close();}}
});
