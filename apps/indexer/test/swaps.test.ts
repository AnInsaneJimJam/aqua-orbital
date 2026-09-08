import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,getAddress,type AbiEvent,type Hex} from 'viem';
import {buildOrder,hashOrder,hashConfig,lifecycleAbi,lifecycleEventsAbi,swapEventsAbi,type Config} from '@orbital/sdk';
import {indexerSnapshot} from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncDeploymentOnce,type MaterializationRpc} from '../src/materializer.js';

const address=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
const maker=address(20),taker=address(21),recipient=address(22),GRID=1n<<32n;
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'1',tokens:[{address:address(1),symbol:'USDC',decimals:6,mock:true},{address:address(2),symbol:'oUSD18',decimals:18,mock:true},{address:address(3),symbol:'oUSD6',decimals:6,mock:true}]};
const config:Config={schemaVersion:1,chainId:31337n,router:manifest.router,maker,makerNonce:0n,tokens:manifest.tokens.map(t=>t.address),decimals:[6,18,6],tickKeys:[3n*GRID/2n,7n*GRID/4n,(1n<<64n)-1n],radiiInternal:[100n,200n,400n].map(r=>r*10n**18n*(1n<<64n)),feePpm:500,initialAmountsRaw:[100_000_000n,100n*10n**18n,100_000_000n]};
const orderHash=hashOrder(buildOrder(config));
const gross=9_007_199_254_740_993n;
const fee=(gross*500n+999999n)/1000000n;
function header(height:number,branch=0,parentBranch=branch){return {number:BigInt(height),hash:hash(branch*1000+height),parentHash:hash(parentBranch*1000+height-1),transactions:[hash(branch*1000+height+100)]};}
function event(block:ReturnType<typeof header>,logIndex:number,name:string,args:Record<string,unknown>,emitter=manifest.router){
 const entry=([...lifecycleEventsAbi,...swapEventsAbi] as readonly AbiEvent[]).find(item=>item.name===name)!;
 return {blockNumber:block.number,blockHash:block.hash,transactionHash:block.transactions[0]!,transactionIndex:0,logIndex,address:emitter,
  topics:encodeEventTopics({abi:[entry],eventName:name,args} as never) as Hex[],
  data:encodeAbiParameters(entry.inputs.filter(input=>!input.indexed),entry.inputs.filter(input=>!input.indexed).map(input=>args[input.name!]))};
}
const activation=(b:ReturnType<typeof header>,logIndex=0)=>event(b,logIndex,'StrategyActivated',{maker,orderHash,configHash:hashConfig(config)});
const swap=(b:ReturnType<typeof header>,logIndex=1,changes:Record<string,unknown>={})=>event(b,logIndex,'OrbitalSwapExecuted',{maker,orderHash,taker,recipient,tokenInIndex:1,tokenOutIndex:0,grossInputRaw:gross,netInputRaw:gross-fee,feeRaw:fee,amountOutRaw:12345n,version:2n,crossedTickKeys:[],crossedInward:[],...changes});
const retirement=(b:ReturnType<typeof header>,logIndex:number,version:bigint)=>event(b,logIndex,'StrategyRetired',{maker,orderHash,version});
function fixture(blocks:ReturnType<typeof header>[],logs:Map<bigint,ReturnType<typeof event>[]>){
 const byNumber=new Map(blocks.map(block=>[block.number,block]));let reads=0;
 const rpc:MaterializationRpc={
  async getChainId(){return 31337;},async getBlockNumber(){return blocks.at(-1)!.number;},
  async getBlock(number){const block=byNumber.get(number);if(!block)throw Error('RPC_BLOCK_UNAVAILABLE');return block;},
  async getLogs(number){return logs.get(number)??[];},
  async call(request,block){reads++;assert.equal(block.requireCanonical,true);assert.ok(blocks.some(b=>b.hash===block.blockHash));
   const decoded=decodeFunctionData({abi:lifecycleAbi,data:request.data});assert.equal(decoded.functionName,'getStrategyConfig');assert.equal(decoded.args[0],orderHash);
   return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:config});},
 };
 return {rpc,reads:()=>reads};
}
async function empty(pool:Awaited<ReturnType<typeof isolatedDatabase>>['pool']){
 for(const table of ['indexed_blocks','chain_events','strategy_snapshots','swap_receipts','deployment_cursor'])assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'0',table);
}

test('same-block activation, exact wide swaps and retirement preserve receipt facts, sequence and raw pair totals',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const first=swap(b);const second=swap(b,2,{version:3n,taker:recipient,recipient,crossedTickKeys:[config.tickKeys[0],config.tickKeys[1],config.tickKeys[1],config.tickKeys[0]],crossedInward:[false,false,true,true]});
  const source=fixture([b,header(2),header(3)],new Map([[1n,[retirement(b,3,4n),second,first,activation(b),first]]]));
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'indexed');
  const receipts=(await db.pool.query('SELECT * FROM swap_receipts ORDER BY log_index')).rows;
  assert.equal(receipts.length,2);assert.equal(receipts[0].gross_input_raw,gross.toString());assert.equal(receipts[0].net_input_raw,(gross-fee).toString());assert.equal(receipts[0].fee_raw,fee.toString());
  assert.equal(receipts[0].token_in,config.tokens[1]!.toLowerCase());assert.equal(receipts[0].token_out,config.tokens[0]!.toLowerCase());assert.equal(receipts[0].input_decimals,18);
  assert.deepEqual(receipts[1].crossed_tick_keys,[config.tickKeys[0],config.tickKeys[1],config.tickKeys[1],config.tickKeys[0]].map(String));assert.deepEqual(receipts[1].crossed_inward,[false,false,true,true]);
  const latest=(await db.pool.query('SELECT * FROM strategies')).rows[0];assert.equal(latest.lifecycle,'retired');assert.equal(latest.version,'4');assert.equal(latest.financial_state_available,false);
  assert.deepEqual((await db.pool.query('SELECT version FROM strategy_snapshots ORDER BY log_index')).rows.map(row=>row.version),['1','2','3','4']);
  const totals=(await db.pool.query('SELECT * FROM swap_pair_totals')).rows[0];assert.equal(totals.swap_count,'2');assert.equal(totals.gross_input_raw,(2n*gross).toString());assert.equal(totals.fee_raw,(2n*fee).toString());assert.equal(totals.amount_out_raw,'24690');
  assert.equal((await db.pool.query('SELECT projection_version,swap_projection_version FROM deployment_blocks')).rows[0].projection_version,1);assert.equal((await db.pool.query('SELECT swap_projection_version FROM deployment_blocks')).rows[0].swap_projection_version,1);
  assert.equal(source.reads(),1);assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'idle');assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'2');
 }finally{await db.close();}
});

test('invalid immutable context, money, identities, version and crossing metadata reject the entire block',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const logs=new Map([[1n,[activation(b)]]]);const source=fixture([b,header(2),header(3)],logs);
  const cases:Record<string,unknown>[]=[{maker:address(99)},{orderHash:hash(99)},{taker:maker},{taker:address(0)},{recipient:maker},{recipient:address(0)},{recipient:manifest.router},{recipient:manifest.aqua},{tokenInIndex:3},{tokenOutIndex:1},{grossInputRaw:0n},{netInputRaw:gross-fee-1n},{feeRaw:fee+1n},{amountOutRaw:0n},{version:3n},{crossedTickKeys:[1n],crossedInward:[false]},{crossedTickKeys:[(1n<<64n)-1n],crossedInward:[false]},{crossedTickKeys:[config.tickKeys[0]],crossedInward:[]},{crossedTickKeys:Array(17).fill(config.tickKeys[0]),crossedInward:Array(17).fill(false)},{crossedTickKeys:[config.tickKeys[1],config.tickKeys[0]],crossedInward:[false,false]}];
  for(const bad of cases){logs.set(1n,[activation(b),swap(b,1,bad)]);await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/INVALID_SWAP_TRANSITION|INVALID_EVENT_ARGUMENTS/);await empty(db.pool);}
  logs.set(1n,[activation(b),retirement(b,1,2n),swap(b,2,{version:3n})]);await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/INVALID_SWAP_TRANSITION/);await empty(db.pool);
  logs.set(1n,[activation(b),{...swap(b),address:manifest.payments}]);await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/EVENT_EMITTER_MISMATCH/);await empty(db.pool);
 }finally{await db.close();}
});

test('canonical rollback removes swap receipts, totals and version snapshot before alternative replay',async()=>{
 const db=await isolatedDatabase();try{
  const b1=header(1),b2=header(2);const original=fixture([b1,b2,header(3),header(4)],new Map([[1n,[activation(b1)]],[2n,[swap(b2,0)]]]));
  await syncDeploymentOnce(db.pool,manifest,original.rpc);await syncDeploymentOnce(db.pool,manifest,original.rpc);
  const alt=header(2,1,0);const alternate=fixture([b1,alt,header(3,1),header(4,1)],new Map([[2n,[swap(alt,0,{amountOutRaw:999n})]]]));
  assert.equal((await syncDeploymentOnce(db.pool,manifest,alternate.rpc)).status,'rolled_back');
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'0');assert.equal((await db.pool.query('SELECT count(*) FROM swap_pair_totals')).rows[0].count,'0');assert.equal((await db.pool.query('SELECT version FROM strategies')).rows[0].version,'1');
  assert.equal((await syncDeploymentOnce(db.pool,manifest,alternate.rpc)).status,'indexed');assert.equal((await db.pool.query('SELECT block_hash,amount_out_raw FROM swap_receipts')).rows[0].block_hash,alt.hash);assert.equal((await db.pool.query('SELECT amount_out_raw FROM swap_pair_totals')).rows[0].amount_out_raw,'999');
 }finally{await db.close();}
});

test('swap receipt deletion failure atomically preserves the entire canonical branch',async()=>{
 const db=await isolatedDatabase();try{
  const b1=header(1),b2=header(2);const source=fixture([b1,b2,header(3),header(4)],new Map([[1n,[activation(b1)]],[2n,[swap(b2,0)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);await syncDeploymentOnce(db.pool,manifest,source.rpc);
  await db.pool.query(`CREATE FUNCTION refuse_swap_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_SWAP_DELETE_FAILURE'; END $$; CREATE TRIGGER refuse_swap_delete BEFORE DELETE ON swap_receipts FOR EACH ROW EXECUTE FUNCTION refuse_swap_delete()`);
  const alternate=fixture([b1,header(2,1,0),header(3,1),header(4,1)],new Map());await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,alternate.rpc),/TEST_SWAP_DELETE_FAILURE/);
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'1');assert.equal((await db.pool.query('SELECT version FROM strategies')).rows[0].version,'2');assert.equal((await indexerSnapshot(db.pool,31337)).cursor?.height,2n);
 }finally{await db.close();}
});

test('legacy canonical blocks backfill chronologically before advancing and never refresh readiness timestamps',async()=>{
 const db=await isolatedDatabase();try{
  const b1=header(1),b2=header(2);const source=fixture([b1,b2,header(3),header(4)],new Map([[1n,[activation(b1)]],[2n,[swap(b2,0),retirement(b2,1,3n)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);await syncDeploymentOnce(db.pool,manifest,source.rpc);
  await db.pool.query("DELETE FROM swap_receipts; DELETE FROM strategy_snapshots WHERE version=2; UPDATE chain_events SET decoded_version=NULL,decoded_payload=NULL WHERE decoded_payload->>'kind'='strategy_swap'; UPDATE deployment_blocks SET swap_projection_version=0");
  const before=(await db.pool.query('SELECT height,hash,updated_at FROM deployment_cursor')).rows[0];const stateBefore=(await db.pool.query('SELECT updated_at FROM indexer_state')).rows[0].updated_at;
  const first=await syncDeploymentOnce(db.pool,manifest,source.rpc);assert.equal(first.status,'backfilled');assert.equal(first.block,1n);
  assert.equal((await db.pool.query('SELECT version FROM strategies')).rows[0].version,'3');assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'0');
  const second=await syncDeploymentOnce(db.pool,manifest,source.rpc);assert.equal(second.status,'backfilled');assert.equal(second.block,2n);
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'1');assert.equal((await db.pool.query('SELECT version FROM strategies')).rows[0].version,'3');
  assert.deepEqual((await db.pool.query('SELECT height,hash,updated_at FROM deployment_cursor')).rows[0],before);assert.deepEqual((await db.pool.query('SELECT updated_at FROM indexer_state')).rows[0].updated_at,stateBefore);
  assert.equal(source.reads(),1);assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'idle');
 }finally{await db.close();}
});

test('same-block legacy activation and future retirement do not contaminate backfilled swap predecessor',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),swap(b),retirement(b,2,3n)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);
  await db.pool.query("DELETE FROM swap_receipts; DELETE FROM strategy_snapshots WHERE version=2; UPDATE chain_events SET decoded_version=NULL,decoded_payload=NULL WHERE decoded_payload->>'kind'='strategy_swap'; UPDATE deployment_blocks SET swap_projection_version=0");
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'backfilled');
  assert.deepEqual((await db.pool.query('SELECT version FROM strategy_snapshots ORDER BY log_index')).rows.map(row=>row.version),['1','2','3']);
 }finally{await db.close();}
});

test('database rejects out-of-range uint256/version and invalid receipt relations',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),swap(b)]]]));await syncDeploymentOnce(db.pool,manifest,source.rpc);
  for(const [field,value] of [['gross_input_raw',(1n<<256n).toString()],['amount_out_raw','-1'],['version',(1n<<64n).toString()],['version','0'],['fee_raw','0'],['net_input_raw','1']])await assert.rejects(()=>db.pool.query(`UPDATE swap_receipts SET ${field}=$1`,[value]),/check constraint/);
  await assert.rejects(()=>db.pool.query("UPDATE swap_receipts SET crossed_tick_keys='[\"1\"]',crossed_inward='[]'"),/check constraint/);
  assert.equal((await db.pool.query('SELECT gross_input_raw FROM swap_receipts')).rows[0].gross_input_raw,gross.toString());
 }finally{await db.close();}
});

test('a late legacy retirement version gap rolls back every newly backfilled receipt and coverage marker',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),swap(b),retirement(b,2,3n)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);
  // Model a v1 database, whose retirement transition allowed unexplained gaps
  // while swaps were unrecognized raw logs. A v2 receipt fact is not invented.
  const oldRetirement=retirement(b,2,4n);
  await db.pool.query("DELETE FROM swap_receipts; DELETE FROM strategy_snapshots WHERE version=2; UPDATE strategy_snapshots SET version=4 WHERE lifecycle='retired'; UPDATE chain_events SET decoded_version=NULL,decoded_payload=NULL WHERE decoded_payload->>'kind'='strategy_swap'; UPDATE deployment_blocks SET swap_projection_version=0");
  await db.pool.query("UPDATE chain_events SET payload=$1,decoded_payload=jsonb_set(decoded_payload,'{version}','\"4\"') WHERE log_index=2",[JSON.stringify({version:1,topics:oldRetirement.topics,data:oldRetirement.data})]);
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc),/INVALID_STRATEGY_TRANSITION/);
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'0');
  assert.deepEqual((await db.pool.query('SELECT version FROM strategy_snapshots ORDER BY log_index')).rows.map(row=>row.version),['1','4']);
  assert.equal((await db.pool.query('SELECT swap_projection_version FROM deployment_blocks')).rows[0].swap_projection_version,0);
  assert.equal((await db.pool.query('SELECT decoded_payload FROM chain_events WHERE log_index=1')).rows[0].decoded_payload,null);
 }finally{await db.close();}
});

test('PostgreSQL fee validation retains a fractional raw atom at large integer magnitudes',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1),wideGross=1_000_000_000_000_000_000_001n,wideFee=(wideGross*500n+999999n)/1000000n;
  const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),swap(b,1,{grossInputRaw:wideGross,netInputRaw:wideGross-wideFee,feeRaw:wideFee})]]]));
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'indexed');
  assert.equal((await db.pool.query('SELECT fee_raw FROM swap_receipts')).rows[0].fee_raw,'500000000000000001');
 }finally{await db.close();}
});

test('a concurrently extended canonical router log set invalidates a stale backfill batch',async()=>{
 const db=await isolatedDatabase();try{
  const b=header(1);const source=fixture([b,header(2),header(3)],new Map([[1n,[activation(b),swap(b)]]]));
  await syncDeploymentOnce(db.pool,manifest,source.rpc);
  await db.pool.query("DELETE FROM swap_receipts; DELETE FROM strategy_snapshots WHERE version=2; UPDATE chain_events SET decoded_version=NULL,decoded_payload=NULL WHERE decoded_payload->>'kind'='strategy_swap'; UPDATE deployment_blocks SET swap_projection_version=0");
  const getBlock=source.rpc.getBlock;let reads=0;
  source.rpc.getBlock=async number=>{
   // Two canonical-tip checks precede pendingSwapBackfill. The third block
   // read occurs after the cached batch was loaded but before its transaction.
   if(number===1n&&++reads===3){
    const extra=swap(b,2,{version:3n,amountOutRaw:999n});
    await db.pool.query('INSERT INTO chain_events(chain_id,block_hash,tx_hash,log_index,emitter,topic,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[31337,b.hash,extra.transactionHash,extra.logIndex,manifest.router.toLowerCase(),extra.topics[0],JSON.stringify({version:1,topics:extra.topics,data:extra.data})]);
   }
   return getBlock(number);
  };
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'retry');
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'0');assert.equal((await db.pool.query('SELECT swap_projection_version FROM deployment_blocks')).rows[0].swap_projection_version,0);
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc)).status,'backfilled');
  assert.equal((await db.pool.query('SELECT count(*) FROM swap_receipts')).rows[0].count,'2');assert.equal((await db.pool.query('SELECT version FROM strategies')).rows[0].version,'3');
 }finally{await db.close();}
});
