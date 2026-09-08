import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createServer} from '../src/server.js';
import {strategyFixture,manifest,maker,hash} from './strategies-fixture.js';

test('strategy HTTP aliases expose typed registered observations and preserve disabled quotes',async()=>{
 const f=await strategyFixture(),directory=await mkdtemp(join(tmpdir(),'orbital-strategy-http-')),manifestPath=join(directory,'manifest.json');
 await writeFile(manifestPath,JSON.stringify(manifest));const app=await createServer({manifestPath,strategyDependencies:f.dependencies,logger:false});
 try{
  for(const prefix of ['', '/api/v1']){
   const list=await app.inject(`${prefix}/strategies?limit=2`);assert.equal(list.statusCode,200);assert.equal(list.json().data.items.length,2);assert.equal(list.headers['cache-control'],'no-store');assert.equal(list.json().coverage.unactivatedShipments,false);
   const owned=await app.inject(`${prefix}/makers/${maker}/strategies`);assert.equal(owned.statusCode,200);assert.ok(owned.json().data.items.every((i:any)=>i.maker.toLowerCase()===maker.toLowerCase()));
   const detail=await app.inject(`${prefix}/strategies/${f.hashes[0]}`);assert.equal(detail.statusCode,200);assert.equal(detail.json().data.strategy.financial.state.version,'3');assert.equal(detail.json().financialExecutionEnabled,false);
   const absent=await app.inject(`${prefix}/strategies/${hash(9999)}`);assert.equal(absent.statusCode,404);assert.equal(absent.json().code,'STRATEGY_NOT_FOUND');assert.ok(absent.json().requestId);assert.equal(absent.json().retryable,false);
   for(const path of [`${prefix}/strategies/bad`,`${prefix}/strategies?limit=51`,`${prefix}/strategies/${f.hashes[0]}?rpcUrl=bad`]){const invalid=await app.inject(path);assert.equal(invalid.statusCode,400);assert.ok(invalid.json().requestId);assert.ok(invalid.json().message);}
  }
  assert.equal((await app.inject({method:'POST',url:'/quotes/swap',payload:{wallet:maker,recipient:manifest.tokens[1]!.address,tokenIn:manifest.tokens[0]!.address,tokenOut:manifest.tokens[1]!.address,amountInRaw:'1000000',slippageBps:50,maxCrossings:0}})).statusCode,503);
  assert.equal((await app.inject({method:'POST',url:'/quotes/payment',payload:{}})).statusCode,400);
  assert.equal((await app.inject('/ready')).statusCode,503);
 }finally{await app.close();await f.close();if(dirname(directory)!==tmpdir()||!directory.startsWith(join(tmpdir(),'orbital-strategy-http-')))throw Error('Unsafe fixture path');await rm(directory,{recursive:true,force:true});}
});
