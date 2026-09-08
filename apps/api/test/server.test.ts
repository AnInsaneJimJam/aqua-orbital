import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
test('no configuration never creates fake live financial data',async()=>{
 const app=await createServer();
 for(const path of ['/deployment','/strategies','/metrics','/ready','/events']){
  const r=await app.inject(path);assert.equal(r.statusCode,503);assert.ok(r.json().code);
 }
 const proof=await app.inject('/proof');assert.equal(proof.json().items[0].status,'unavailable');
 const health=await app.inject('/health');assert.equal(health.json().chainWrites,false);
 await app.close();
});
test('invalid quote requests are rejected before RPC access',async()=>{
 const app=await createServer();
 const r=await app.inject({method:'POST',url:'/quotes/swap',payload:{amountInRaw:'1e18',rpcUrl:'http://untrusted'}});assert.equal(r.statusCode,400);
 const oversized=await app.inject({method:'POST',url:'/quotes/swap',headers:{'content-type':'application/json'},payload:JSON.stringify({data:'x'.repeat(17000)})});assert.equal(oversized.statusCode,413);
 await app.close();
});
test('CORS permits explicit local origins and excludes unrelated sites',async()=>{
 const app=await createServer();
 try{
  const allowed=await app.inject({url:'/deployment',headers:{origin:'http://127.0.0.1:3002'}});
  assert.equal(allowed.headers['access-control-allow-origin'],'http://127.0.0.1:3002');
  const denied=await app.inject({url:'/health',headers:{origin:'https://unrelated.example'}});
  assert.equal(denied.headers['access-control-allow-origin'],undefined);
 }finally{await app.close();}
});
