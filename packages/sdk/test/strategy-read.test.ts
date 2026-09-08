import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeStrategyDetail,decodeStrategyList,strategyInventory} from '../src/strategy-read';
import {strategyObservation,strategyListing,strategyRecord,strategyManifest as manifest,hash,address,maker} from './fixtures/strategy';
const detail=(v:unknown=strategyObservation(),http=200,m=manifest,id=strategyRecord().orderHash)=>decodeStrategyDetail(v,http,m,id);
const list=(v:unknown=strategyListing(),request={maker,status:'all' as const,limit:6})=>decodeStrategyList(v,200,manifest,request);
test('public strategy reads bind canonical configuration, order, deployment, request and receipt identity',()=>{
 assert.deepEqual(detail(),strategyObservation());assert.deepEqual(list(),strategyListing());
 for(const change of [{verified:false},{chainId:31337},{router:address(99)},{startBlock:'11'},{tokens:manifest.tokens.map(t=>({...t,decimals:6}))}])assert.throws(()=>detail(strategyObservation(),200,{...manifest,...change}));
 for(const field of ['orderHash','configHash','maker','router'] as const){const v=strategyObservation();v.data.strategy[field]=field.endsWith('Hash')?hash(999):address(99);assert.throws(()=>detail(v));}
 const v=strategyObservation();v.data.strategy.order.data+='00';assert.throws(()=>detail(v));
 assert.throws(()=>detail(strategyObservation(),200,manifest,hash(999)));assert.throws(()=>list(strategyListing(),{maker:address(99),status:'all',limit:6}));
});
test('inventory preserves principal fractions, fees, allocation and conservative capacity as different amounts',()=>{
 const v=detail(),rows=strategyInventory(v.data.strategy!,manifest);
 assert.equal(rows[0]!.principal,'300.000000000000000001');assert.equal(rows[0]!.fees,'0.000007');assert.equal(rows[0]!.available,'300');
 assert.equal(rows[0]!.allocation,'300.000008');assert.equal(rows[2]!.fees,'0.000000000000000009');
 const limited=strategyObservation();limited.data.strategy.financial!.availability[0]!.walletBalanceRaw='0';limited.data.strategy.financial!.availability[0]!.fundingCeilingRaw='0';
 assert.equal(strategyInventory(detail(limited).data.strategy!,manifest)[0]!.available,'0');
});
test('strategy amounts and reported availability cannot violate raw bounds, geometry bookkeeping or backing arithmetic',()=>{
 for(const mutate of [
  (s:any)=>s.state.principalInternal[0]='1', (s:any)=>s.state.sumInternal='1',(s:any)=>s.state.sumSquaresInternal.lo='1',
  (s:any)=>s.state.interiorTickMask=5,(s:any)=>s.state.interiorRadius='1',(s:any)=>s.state.boundarySumNumerator='1',
  (s:any)=>s.state.boundarySigmaLower='1',(s:any)=>s.state.cumulativeFeeRaw[0]='1e9',
  (s:any)=>s.availability[0].fundingCeilingRaw='300000001',(s:any)=>s.availability[0].surplusInternal.lo='0',
  (s:any)=>s.availability[0].token=address(4),(s:any)=>s.availability[0].backingValid=false,
  (s:any)=>s.availability[0].live=false,(s:any)=>s.state.version='1',
 ]){const v=strategyObservation();mutate(v.data.strategy.financial);assert.throws(()=>detail(v));}
 const docked=strategyObservation(),s=docked.data.strategy.financial!.state;
 docked.data.strategy.financial!.availability.forEach((a,i)=>{
  const required=BigInt(s.principalInternal[i]!)+BigInt(s.cumulativeFeeRaw[i]!)*10n**BigInt(18-docked.data.strategy.config.decimals[i]!)*(1n<<64n);
  a.aquaAllocationRaw='0';a.liveTokenCount=255;a.live=false;a.backingValid=false;a.surplusInternal={hi:'0',lo:'0'};
  a.deficitInternal={hi:(required>>256n).toString(),lo:(required% (1n<<256n)).toString()};a.fundingCeilingRaw='0';
 });assert.doesNotThrow(()=>detail(docked));
});
test('observation freshness, coverage, status and canonical absence are checked independently of record contents',()=>{
 for(const change of [{financialExecutionEnabled:true},{deploymentId:hash(999)},{historical:true},{status:'stale'},
  {coverage:{...strategyObservation().coverage,coveredBlocks:'5'}},{coverage:{...strategyObservation().coverage,unactivatedShipments:true}},
  {freshness:{...strategyObservation().freshness,head:'15'}},{data:{strategy:null}},{data:{...strategyObservation().data,calldata:'0x'}}])assert.throws(()=>detail({...strategyObservation(),...change}));
 const absent={...strategyObservation(),code:'STRATEGY_NOT_FOUND',data:{strategy:null},retryable:false,field:'hash'};
 assert.equal(detail(absent,404).data.strategy,null);assert.throws(()=>detail(absent));assert.throws(()=>detail(strategyObservation(),404));
 const stale={...strategyObservation(),status:'stale',code:'STRATEGIES_STALE',freshness:{...strategyObservation().freshness,ageMs:10001,stale:true}};assert.doesNotThrow(()=>detail(stale));
});
test('strategy lifecycle receipts cannot invent an update, move before activation or conflict with the observation block',()=>{
 for(const mutate of [(r:any)=>r.version='1',(r:any)=>r.updated.event='StrategyRetired',(r:any)=>r.updated.blockNumber='11',
  (r:any)=>r.updated.blockNumber='15',(r:any)=>r.updated={...r.activated,event:'OrbitalSwapExecuted'},(r:any)=>r.activated.event='OrbitalSwapExecuted']){
  const v=strategyObservation();mutate(v.data.strategy);assert.throws(()=>detail(v));
 }
 const retired=strategyObservation();retired.data.strategy.lifecycle='retired';retired.data.strategy.updated.event='StrategyRetired';retired.data.strategy.financial!.state.status=2;retired.data.strategy.financial!.availability.forEach(a=>a.fundingCeilingRaw='0');assert.doesNotThrow(()=>detail(retired));
});
test('pagination rejects mixed pages, duplicates, wrong filter/order and unbound continuation cursors',()=>{
 const a=strategyRecord(),b=strategyRecord(1),v=strategyListing([b,a]);assert.doesNotThrow(()=>list(v));
 assert.throws(()=>list(strategyListing([a,b])));assert.throws(()=>list(strategyListing([a,a])));
 assert.throws(()=>list({...v,data:{...v.data,limit:5}}));assert.throws(()=>list({...v,data:{...v.data,nextCursor:'evil'}}));
 assert.throws(()=>list({...v,data:{...v.data,items:[{...a,financial:a.financial}]}}));
 const cursor={version:1,chainId:manifest.chainId,deploymentId:v.deploymentId,filters:{maker,status:'all'},pin:v.asOf,after:{blockNumber:a.updated.blockNumber,logIndex:a.updated.logIndex,orderHash:a.orderHash}};
 const withCursor={...v,data:{...v.data,nextCursor:Buffer.from(JSON.stringify(cursor)).toString('base64url')}};assert.doesNotThrow(()=>list(withCursor));
 const next=strategyListing([]);assert.doesNotThrow(()=>decodeStrategyList(next,200,manifest,{maker,status:'all',limit:6,cursor:withCursor.data.nextCursor}));
 assert.throws(()=>decodeStrategyList({...next,asOf:{height:'16',hash:hash(116)}},200,manifest,{maker,status:'all',limit:6,cursor:withCursor.data.nextCursor}));
});
