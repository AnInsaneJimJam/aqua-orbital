import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Hex} from 'viem';
import * as DB from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncDeploymentOnce,deploymentScope} from '../src/materializer.js';
import {createMaterializationRpc} from '../src/rpc.js';
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Hex;
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'1',tokens:[{address:address(1),symbol:'USDC',decimals:6,mock:true},{address:address(2),symbol:'oUSD18',decimals:18,mock:true}]};
const header=(n:number,branch=0)=>({number:BigInt(n),hash:hash(branch*1000+n),parentHash:hash((n===5?0:branch)*1000+n-1),transactions:[hash(n+100)]});

test('one bounded range query authenticates all64 headers; foreign logs or a changed tip commit nothing',async()=>{
 const db=await isolatedDatabase();let wrongLog=true,changedTip=false,rangeReads=0,tipReads=0;
 const source=createMaterializationRpc('http://127.0.0.1:8545',async(_url,init)=>{
  const call=JSON.parse(String(init?.body));let result:unknown;
  if(call.method==='eth_chainId')result='0x7a69';
  else if(call.method==='eth_blockNumber')result='0x42';
  else if(call.method==='eth_getBlockByNumber'){
   const n=Number(BigInt(call.params[0])),b=header(n);if(n===64&&++tipReads%2===0&&changedTip)b.hash=hash(9999);
   result={...b,number:call.params[0]};
  }else if(call.method==='eth_getLogs'){
   rangeReads++;assert.deepEqual(call.params,[{address:[manifest.aqua,manifest.router,manifest.payments],fromBlock:'0x1',toBlock:'0x40'}]);
   result=[{blockNumber:'0x1',blockHash:wrongLog?hash(9999):hash(1),transactionHash:hash(101),transactionIndex:'0x0',logIndex:'0x0',address:manifest.aqua,topics:[hash(999)],data:'0x',removed:false}];
  }else throw Error('UNEXPECTED_RPC');
  return Response.json({jsonrpc:'2.0',id:call.id,result});
 });
 try{
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc,{maxBlocks:64}),/RPC_INVALID_BLOCK_LOG/);
  assert.equal((await DB.indexerSnapshot(db.pool,31337)).cursor,null);
  wrongLog=false;changedTip=true;tipReads=0;
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc,{maxBlocks:64})).status,'retry');
  assert.equal((await DB.indexerSnapshot(db.pool,31337)).cursor,null);
  changedTip=false;tipReads=0;
  assert.equal((await syncDeploymentOnce(db.pool,manifest,source.rpc,{maxBlocks:64})).block,64n);
  assert.equal(rangeReads,3);assert.equal((await db.pool.query('SELECT count(*) FROM indexed_blocks')).rows[0].count,'64');
  assert.equal((await db.pool.query('SELECT count(*) FROM deployment_blocks WHERE projection_version=1 AND swap_projection_version=1')).rows[0].count,'64');
  assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'1');
  await assert.rejects(()=>syncDeploymentOnce(db.pool,manifest,source.rpc,{maxBlocks:65}),/INVALID_BLOCK_BATCH/);
 }finally{source.close();await db.close();}
});

test('empty runs roll back every coverage row on failure, reject contradictions, and retain canonical reorg replay',async()=>{
 const db=await isolatedDatabase();const scope=deploymentScope(manifest),blocks=Array.from({length:8},(_,i)=>header(i+1));
 try{
  await db.pool.query(`CREATE FUNCTION refuse_range() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.height=5 THEN RAISE EXCEPTION 'TEST_EMPTY_RANGE_FAILURE'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER refuse_range BEFORE INSERT ON deployment_blocks FOR EACH ROW EXECUTE FUNCTION refuse_range()`);
  await assert.rejects(()=>DB.atomicEmptyDeploymentBlocks(db.pool,scope,blocks),/TEST_EMPTY_RANGE_FAILURE/);
  for(const table of ['indexed_blocks','deployment_blocks','deployment_cursor','indexer_cursor'])assert.equal((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'0');
  await db.pool.query('DROP TRIGGER refuse_range ON deployment_blocks');
  await DB.atomicEmptyDeploymentBlocks(db.pool,scope,blocks);await DB.atomicEmptyDeploymentBlocks(db.pool,scope,blocks);
  assert.equal((await db.pool.query('SELECT count(*) FROM deployment_blocks')).rows[0].count,'8');
  await assert.rejects(()=>DB.atomicEmptyDeploymentBlocks(db.pool,scope,[{...blocks[0]!,parentHash:hash(999)},...blocks.slice(1)]),/REORG_REQUIRES_REPLAY/);
  const snapshot=await DB.indexerSnapshot(db.pool,31337),fork=[header(8,1),header(7,1),header(6,1),header(5,1),header(4)];
  assert.equal((await DB.reconcileCanonicalChain(db.pool,31337,snapshot.cursor!,fork)).status,'rolled_back');
  assert.equal((await db.pool.query('SELECT count(*) FROM deployment_blocks')).rows[0].count,'4');
  await DB.atomicEmptyDeploymentBlocks(db.pool,scope,fork.slice(0,4).reverse());
  assert.equal((await DB.indexerSnapshot(db.pool,31337)).cursor?.hash,hash(1008));
  await db.pool.query(`INSERT INTO chain_events(chain_id,block_hash,tx_hash,log_index,emitter,topic,payload) VALUES($1,$2,$3,0,$4,$5,'{}')`,[31337,hash(1008),hash(108),manifest.aqua,hash(999)]);
  await assert.rejects(()=>DB.atomicEmptyDeploymentBlocks(db.pool,scope,fork.slice(0,4).reverse()),/EMPTY_RANGE_HAS_EVENTS/);
  await db.pool.query("UPDATE indexer_state SET status='resync_required' WHERE chain_id=31337");
  await assert.rejects(()=>DB.atomicEmptyDeploymentBlocks(db.pool,scope,[header(9,1)]),/RESYNC_REQUIRED/);
 }finally{await db.close();}
});
