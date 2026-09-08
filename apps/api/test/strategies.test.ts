import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalChain} from '@orbital/db';
import type pg from 'pg';
import {readStrategies} from '../../../packages/db/src/strategy-reads.js';
import {deploymentScope} from '../../indexer/src/materializer.js';
import {getStrategies as controller} from '../src/strategies.js';
import {strategyFixture,manifest,maker,otherMaker,address,hash,header,topics} from './strategies-fixture.js';
// Assert the transport representation too: a leaked bigint cannot serialize.
async function getStrategies(...args:Parameters<typeof controller>){return JSON.parse(JSON.stringify(await controller(...args)));}

test('registered catalogue is receipt-backed, exact, and never a financial inventory',async()=>{
 const f=await strategyFixture();try{const result=await getStrategies(manifest,{query:{}},f.dependencies);assert.equal(result.httpStatus,200);assert.equal(result.financialExecutionEnabled,false);
  assert.equal(result.coverage.scope,'registered_strategies');assert.equal(result.coverage.unactivatedShipments,false);assert.equal(result.data.items.length,6);
  const item=result.data.items.find((i:any)=>i.orderHash===f.hashes[0]);assert.equal(item.version,'3');assert.equal(item.updated.event,'OrbitalSwapExecuted');assert.equal(item.financial,null);assert.equal(item.tradeEligibilityVerified,false);
  assert.equal(item.config.radiiInternal[0],f.configs[0]!.radiiInternal[0]!.toString());assert.ok(f.calls.every(c=>c.orderHash===null));
 }finally{await f.close();}
});
test('detail binds three coherent router reads and exact principal, fees, wide moments and funding',async()=>{
 const f=await strategyFixture();try{const result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,200);const s=result.data.strategy;
  assert.equal(s.version,'3');assert.equal(s.financial.state.version,'3');assert.equal(s.financial.state.cumulativeFeeRaw[2],f.observation(f.hashes[0]!).state.cumulativeFeeRaw[2]!.toString());
  assert.equal(s.financial.availability[0].walletBalanceRaw,f.observation(f.hashes[0]!).availability[0]!.walletBalanceRaw.toString());assert.equal(s.financial.state.sumSquaresInternal.hi,f.observation(f.hashes[0]!).state.sumSquaresInternal.hi.toString());
  assert.deepEqual(f.calls,[{pin:{height:'3',hash:hash(3)},orderHash:f.hashes[0]}]);assert.equal(s.tradeEligibilityVerified,false);
 }finally{await f.close();}
});
test('retirement after same-block swaps remains terminal with its own later version',async()=>{
 const f=await strategyFixture({retireFirst:true});try{const result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,200);const s=result.data.strategy;
  assert.equal(s.lifecycle,'retired');assert.equal(s.version,'4');assert.equal(s.updated.event,'StrategyRetired');assert.ok(s.updated.logIndex>s.activated.logIndex);assert.ok(s.financial.availability.every((a:any)=>a.fundingCeilingRaw==='0'));
 }finally{await f.close();}
});
test('absence requires complete lifecycle and swap coverage; no deployment stays unavailable',async()=>{
 assert.equal((await getStrategies(null,{hash:hash(999)})).httpStatus,503);
 const f=await strategyFixture();try{assert.equal((await getStrategies(manifest,{hash:hash(999)},f.dependencies)).httpStatus,404);
  await f.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=1');const unavailable=await getStrategies(manifest,{hash:hash(999)},f.dependencies);assert.equal(unavailable.httpStatus,503);assert.equal(unavailable.data,null);
 }finally{await f.close();}
});
test('stable filter-bound pagination survives normal advancement and retains registered coverage',async()=>{
 const f=await strategyFixture({initialTip:1});try{const first=await getStrategies(manifest,{maker,query:{limit:'2'}},f.dependencies);assert.equal(first.httpStatus,200);assert.equal(first.data.items.length,2);const cursor=first.data.nextCursor;assert.ok(cursor);
  await f.advance(3);const second=await getStrategies(manifest,{maker,query:{limit:'2',cursor}},f.dependencies);assert.equal(second.httpStatus,200);assert.equal(second.historical,true);assert.equal(second.asOf.height,'1');assert.ok(second.data.items.every((i:any)=>!first.data.items.some((j:any)=>i.orderHash===j.orderHash)));
  assert.equal((await getStrategies(manifest,{maker:otherMaker,query:{cursor}},f.dependencies)).httpStatus,400);
  assert.equal((await getStrategies(manifest,{maker,query:{cursor,status:'retired'}},f.dependencies)).httpStatus,400);
 }finally{await f.close();}
});
test('filter and cursor inputs are bounded and cannot choose network, token or transaction data',async()=>{
 for(const query of [{limit:'51'},{limit:'0'},{limit:'01'},{tokenIn:address(1)},{tokenIn:address(1),tokenOut:address(1)},{tokenIn:address(1),tokenOut:address(99)},{maker:address(0)},{status:'shipped'},{rpcUrl:'https://example.invalid'},{cursor:'a'.repeat(1400)}])assert.equal((await getStrategies(manifest,{query})).httpStatus,400);
 assert.equal((await getStrategies(manifest,{hash:'bad'})).httpStatus,400);
});
test('orphaned listing pins and reorgs between RPC and database checks never expose balances',async()=>{
 const f=await strategyFixture();try{const first=await getStrategies(manifest,{query:{limit:'2'}},f.dependencies);const cursor=first.data.nextCursor;
  await reconcileCanonicalChain(f.db.pool,31337,{height:3n,hash:hash(3)},[{number:3n,hash:hash(53),parentHash:hash(2)},header(2)]);
  assert.equal((await getStrategies(manifest,{query:{limit:'2',cursor}},f.dependencies)).httpStatus,409);
 }finally{await f.close();}
 const g=await strategyFixture();try{const rpc=g.dependencies.readRpc;g.dependencies.readRpc=async(...args)=>{const r=await rpc(...args);await reconcileCanonicalChain(g.db.pool,31337,{height:3n,hash:hash(3)},[{number:3n,hash:hash(53),parentHash:hash(2)},header(2)]);return r;};
  const result=await getStrategies(manifest,{hash:g.hashes[0]!},g.dependencies);assert.equal(result.httpStatus,503);assert.equal(result.data,null);
 }finally{await g.close();}
});
test('altered immutable configuration, detached sources and omitted receipts fail closed',async()=>{
 for(const sql of ["UPDATE strategy_snapshots SET maker='0x0000000000000000000000000000000000000063'",'DELETE FROM swap_receipts',"UPDATE strategy_snapshots SET config=jsonb_set(config,'{feePpm}','100')"]){const f=await strategyFixture();try{assert.equal((await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies)).httpStatus,200);await f.db.pool.query(sql);const result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,503);assert.equal(result.data,null);}finally{await f.close();}}
});
test('inconsistent RPC identity, version, quantities and availability cannot become a complete observation',async()=>{
 const f=await strategyFixture();try{assert.equal((await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies)).httpStatus,200);const rpc=f.dependencies.readRpc;for(const mutate of [
  (r:any)=>{r.chainId=1;},(r:any)=>{r.block.hash=hash(99);},(r:any)=>{r.config.router=address(99);},(r:any)=>{r.state.version=1n;},(r:any)=>{r.state.maker=address(99);},
  (r:any)=>{r.state.principalInternal[0]++;},(r:any)=>{r.state.sumSquaresInternal.lo++;},(r:any)=>{r.state.cumulativeFeeRaw[2]++;},(r:any)=>{r.availability.pop();},
  (r:any)=>{r.availability[0].token=address(99);},(r:any)=>{r.availability[0].fundingCeilingRaw++;},(r:any)=>{r.availability[0].surplusInternal.lo++;},(r:any)=>{r.state.X[0]='1e18';},
 ]){f.dependencies.readRpc=async(...args)=>{const r=await rpc(...args);mutate(r);return r;};const result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,503);assert.equal(result.data,null);}
 }finally{await f.close();}
});
test('unhealthy live/backing conditions and revocations remain inspectable with truthful zero ceilings',async()=>{
 const f=await strategyFixture();try{const rpc=f.dependencies.readRpc;f.dependencies.readRpc=async(...args)=>{const r:any=await rpc(...args);const a=r.availability[0],P=r.state.principalInternal[0];a.aquaAllocationRaw=0n;a.live=false;a.liveTokenCount=0;a.backingValid=false;a.surplusInternal={hi:0n,lo:0n};a.deficitInternal={hi:P>>256n,lo:P% (1n<<256n)};for(const x of r.availability)x.fundingCeilingRaw=0n;return r;};
  let result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,200);assert.equal(result.data.strategy.financial.availability[0].backingValid,false);
  f.dependencies.readRpc=async(...args)=>{const r:any=await rpc(...args);r.availability[0].aquaAllowanceRaw=0n;r.availability[0].fundingCeilingRaw=0n;return r;};result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,200);assert.equal(result.data.strategy.financial.availability[0].fundingCeilingRaw,'0');
 }finally{await f.close();}
});
test('stale catalogue remains labeled and transport failures never leak partial financial state',async()=>{
 const f=await strategyFixture();try{await f.db.pool.query("UPDATE indexer_state SET updated_at=now()-interval '15 seconds'");assert.equal((await getStrategies(manifest,{query:{}},f.dependencies)).status,'stale');
  f.dependencies.readRpc=async()=>{throw Error('private credentials');};const result=await getStrategies(manifest,{hash:f.hashes[0]!},f.dependencies);assert.equal(result.httpStatus,503);assert.equal(result.data,null);assert.doesNotMatch(JSON.stringify(result),/credentials/);
 }finally{await f.close();}
});
test('default20 and max50 listing bounds preserve filters and deterministic continuation',async()=>{
 const f=await strategyFixture({count:25,retireFirst:true});try{
  const first=await getStrategies(manifest,{query:{}},f.dependencies);assert.equal(first.httpStatus,200);assert.equal(first.data.limit,20);assert.equal(first.data.items.length,20);assert.ok(first.data.nextCursor);
  const all=await getStrategies(manifest,{query:{limit:'50',tokenIn:address(1),tokenOut:address(3)}},f.dependencies);assert.equal(all.data.items.length,25);assert.equal(all.data.nextCursor,null);
  const retired=await getStrategies(manifest,{query:{status:'retired'}},f.dependencies);assert.equal(retired.data.items.length,1);assert.equal(retired.data.items[0].orderHash,f.hashes[0]);
  const owned=await getStrategies(manifest,{maker:otherMaker,query:{}},f.dependencies);assert.equal(owned.data.items.length,1);assert.equal(owned.data.items[0].maker.toLowerCase(),otherMaker.toLowerCase());
 }finally{await f.close();}
});
test('coverage, receipt versions and fee observations use one database snapshot',async()=>{
 const f=await strategyFixture();try{
  let changed=false;
  const reader={async connect(){const client=await f.db.pool.connect(),query=client.query.bind(client),wrapped=Object.create(client) as pg.PoolClient;
   wrapped.release=()=>client.release();wrapped.query=(async(sql:string,values?:unknown[])=>{const result=await query(sql,values);if(!changed&&sql.includes('AS covered_blocks')){changed=true;await f.db.pool.query('DELETE FROM swap_receipts');}return result;}) as typeof client.query;return wrapped;
  }} as pg.Pool;
  const observed=await readStrategies(reader,deploymentScope(manifest),topics,{kind:'detail',hash:f.hashes[0]!});assert.equal(observed.code,'STRATEGIES_COMPLETE');assert.equal(observed.items?.[0]?.version,'3');assert.equal(observed.items?.[0]?.feeTotals.length,1);
  assert.equal((await f.dependencies.readDatabase(manifest,{kind:'detail',hash:f.hashes[0]!})).code,'STRATEGY_SOURCE_COVERAGE_MISMATCH');
 }finally{await f.close();}
});
