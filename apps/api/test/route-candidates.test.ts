import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,encodeFunctionResult,type AbiEvent,type Hex} from 'viem';
import {lifecycleEventsAbi,swapEventsAbi,lifecycleAbi,feeIn} from '@orbital/sdk';
import {readStrategies} from '../../../packages/db/src/strategy-reads.js';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {deploymentScope,syncDeploymentOnce,type MaterializationRpc} from '../../indexer/src/materializer.js';
import {routingFixture} from './route-selection-fixture.js';
import {manifest,topics,header,address} from './strategies-fixture.js';

async function fixture(count=205){
 const f=routingFixture(count),db=await isolatedDatabase(),tip=Math.ceil(count/25)+1,logs=new Map<bigint,any[]>();
 function add(block:number,index:number,name:string,args:Record<string,unknown>){const abi=([...lifecycleEventsAbi,...swapEventsAbi] as readonly AbiEvent[]).find(e=>e.name===name)!,b=header(block),list=logs.get(BigInt(block))??[];
  list.push({blockNumber:b.number,blockHash:b.hash,transactionHash:b.transactions[0]!,transactionIndex:0,logIndex:index,address:manifest.router,topics:encodeEventTopics({abi:[abi],eventName:name,args} as never) as Hex[],data:encodeAbiParameters(abi.inputs.filter(i=>!i.indexed),abi.inputs.filter(i=>!i.indexed).map(i=>args[i.name!]))});logs.set(BigInt(block),list);}
 f.records.forEach((r,i)=>add(Math.floor(i/25)+1,i%25,'StrategyActivated',{maker:r.maker,orderHash:r.orderHash,configHash:r.configHash}));
 const gross=9007199254740993n,fee=feeIn(gross,f.configs[0]!.feePpm);
 add(tip,0,'OrbitalSwapExecuted',{maker:f.records[0]!.maker,orderHash:f.records[0]!.orderHash,taker:address(22),recipient:address(23),tokenInIndex:2,tokenOutIndex:0,grossInputRaw:gross,netInputRaw:gross-fee,feeRaw:fee,amountOutRaw:7000n,version:2n,crossedTickKeys:[],crossedInward:[]});
 add(tip,1,'StrategyRetired',{maker:f.records[1]!.maker,orderHash:f.records[1]!.orderHash,version:2n});
 const rpc:MaterializationRpc={async getChainId(){return 31337;},async getBlockNumber(){return BigInt(tip+2);},async getBlock(n){return header(Number(n));},async getLogs(n){return logs.get(n)??[];},async call(request){const id=`0x${request.data.slice(-64)}`,index=f.records.findIndex(r=>r.orderHash.toLowerCase()===id.toLowerCase());return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:f.configs[index]!});}};
 try{for(let i=0;i<tip;i++)await syncDeploymentOnce(db.pool,manifest,rpc);}catch(error){await db.close();throw error;}
 return {...f,db,tip,fee,close:()=>db.close()};
}
test('candidate reader returns at most200 canonical pair records by successful block/log activity with exact fee sums',async()=>{
 const f=await fixture();try{const result=await readStrategies(f.db.pool,deploymentScope(manifest),topics,{kind:'candidates',tokenIn:address(1).toLowerCase(),tokenOut:address(3).toLowerCase()});
  assert.equal(result.code,'STRATEGIES_COMPLETE');assert.equal(result.items?.length,200);assert.equal(result.hasMore,true);assert.equal(result.items![0]!.orderHash,f.records[0]!.orderHash);assert.equal(result.items![0]!.updated.event,'OrbitalSwapExecuted');assert.equal(result.items![0]!.version,'2');assert.deepEqual(result.items![0]!.feeTotals,[{token:address(3).toLowerCase(),amountRaw:f.fee.toString()}]);assert.ok(result.items!.every(r=>r.lifecycle==='active'&&r.orderHash!==f.records[1]!.orderHash));
  assert.equal(result.items![1]!.orderHash,f.records[204]!.orderHash);assert.equal(result.items![2]!.orderHash,f.records[203]!.orderHash);
  const prior=await readStrategies(f.db.pool,deploymentScope(manifest),topics,{kind:'candidates',tokenIn:address(1).toLowerCase(),tokenOut:address(3).toLowerCase(),pin:{height:'1',hash:header(1).hash}});assert.equal(prior.items?.length,25);assert.equal(prior.hasMore,false);assert.equal(prior.items![0]!.orderHash,f.records[24]!.orderHash);assert.equal(prior.items!.find(r=>r.orderHash===f.records[0]!.orderHash)!.version,'1');
 }finally{await f.close();}
});
test('candidate reader refuses source gaps and coverage gaps and validates bounded pair shape',async()=>{
 const f=await fixture(6);try{const query={kind:'candidates' as const,tokenIn:address(1).toLowerCase(),tokenOut:address(3).toLowerCase()};assert.equal((await readStrategies(f.db.pool,deploymentScope(manifest),topics,query)).code,'STRATEGIES_COMPLETE');
  await f.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=1');assert.equal((await readStrategies(f.db.pool,deploymentScope(manifest),topics,query)).code,'STRATEGY_COVERAGE_INCOMPLETE');await f.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=1');
  await f.db.pool.query('DELETE FROM swap_receipts');assert.equal((await readStrategies(f.db.pool,deploymentScope(manifest),topics,query)).code,'STRATEGY_SOURCE_COVERAGE_MISMATCH');
  for(const changed of [{tokenIn:address(0)},{tokenOut:query.tokenIn},{tokenIn:'arbitrary sql'}])await assert.rejects(()=>readStrategies(f.db.pool,deploymentScope(manifest),topics,{...query,...changed}),/CANDIDATE_PAIR/);
 }finally{await f.close();}
});
