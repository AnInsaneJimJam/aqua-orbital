import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConnection,createServer,type Socket} from 'node:net';
import {once} from 'node:events';
import type {PoolClient} from 'pg';
import {database,atomicDeploymentBlock,indexerSnapshot} from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {createReadDependencies} from '../src/runtime.js';
import {checkReadiness} from '../src/readiness.js';
import {readinessDeploymentScope} from '../src/deployment-scope.js';
import type {DeploymentManifest} from '@orbital/shared';

test('owned PostgreSQL socket loss stays handled, reads fail closed, and new connections recover', {timeout:60000}, async(t)=>{
  const db=await isolatedDatabase();
  t.diagnostic('Isolated schema created; only private proxy sockets will be dropped.');
  const base=new URL(db.pool.options.connectionString!);
  // Only sockets created by this test traverse the private proxy. No database
  // backend, container, shared service or unrelated connection is stopped.
  const sockets=new Set<Socket>();let online=true;
  const proxy=createServer(downstream=>{
    downstream.on('error',()=>{});
    if(!online){downstream.destroy();return;}
    const upstream=createConnection({host:base.hostname,port:Number(base.port||5432)});
    for(const socket of [downstream,upstream]){sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));}
    downstream.on('close',()=>upstream.destroy());upstream.on('close',()=>downstream.destroy());
    downstream.pipe(upstream);upstream.pipe(downstream);
  });
  await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const address=proxy.address();assert.ok(address&&typeof address==='object');
  const routed=new URL(base);routed.hostname='127.0.0.1';routed.port=String(address.port);
  const pool=database(routed.toString()),runtime=createReadDependencies(routed.toString());
  let held:PoolClient|undefined;
  try{
    // Test listeners must not mask the original unhandled EventEmitter error.
    assert.ok(pool.listenerCount('error')>0,'shared pool must handle idle errors before a caller subscribes');
    const hash=`0x${'ab'.repeat(32)}`,addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
    const manifest:DeploymentManifest={chainId:31337,rpcUrl:'http://127.0.0.1:1',explorerUrl:'https://example.invalid',verified:true,aqua:addr(3),router:addr(4),payments:addr(5),usdc:addr(1),startBlock:'1',tokens:[{address:addr(1),symbol:'USDC',decimals:6,mock:true},{address:addr(2),symbol:'oUSD18',decimals:18,mock:true}]};
    const scope=readinessDeploymentScope(manifest);
    await atomicDeploymentBlock(db.pool,{...scope,startBlock:1n},{number:1n,hash,parentHash:`0x${'00'.repeat(32)}`},[],[]);
    const now=new Date();await db.pool.query('UPDATE indexer_state SET updated_at=$1',[now]);await db.pool.query('UPDATE deployment_cursor SET updated_at=$1',[now]);
    let rpcReads=0;const dependencies={...runtime.dependencies,readRpc:async()=>{rpcReads++;return {chainId:31337,head:3n,indexedBlockHash:hash};}};
    assert.equal((await indexerSnapshot(pool,31337)).cursor?.hash,hash);
    const oldPid=(await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    assert.equal((await checkReadiness(manifest,dependencies)).status,'ready');
    t.diagnostic('Indexer reads and API readiness succeed before fault injection.');
    held=await pool.connect();assert.ok(held.listenerCount('error')>0,'checked-out client gaps must also be handled');
    // Keep a second pooled connection idle while the first is checked out.
    await pool.query('SELECT 1');
    const signal=AbortSignal.timeout(3000),idleFailure=once(pool,'error',{signal}),heldFailure=once(held,'error',{signal});
    online=false;for(const socket of sockets)socket.destroy();
    await Promise.all([idleFailure,heldFailure]);
    t.diagnostic('Both idle and checked-out connection errors were handled.');
    await assert.rejects(()=>held!.query('SELECT 1'));held.release();held=undefined;
    await assert.rejects(()=>indexerSnapshot(pool,31337));
    const beforeRpc=rpcReads,unavailable=await checkReadiness(manifest,dependencies);
    assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.code,'DATABASE_UNAVAILABLE');assert.equal(unavailable.financialExecutionEnabled,false);assert.equal(rpcReads,beforeRpc);
    t.diagnostic('Outage rejects indexer reads and returns DATABASE_UNAVAILABLE without RPC.');
    online=true;
    assert.equal((await indexerSnapshot(pool,31337)).cursor?.hash,hash);
    assert.notEqual((await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,oldPid);
    const recovered=await checkReadiness(manifest,dependencies);assert.equal(recovered.status,'ready');assert.equal(recovered.financialExecutionEnabled,false);
    t.diagnostic('New PostgreSQL connections recover canonical reads; financial execution stays disabled.');
  }finally{
    held?.release();await Promise.all([pool.end(),runtime.close()]);
    for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>proxy.close(error=>error?reject(error):resolve()));await db.close();
  }
});
