import test from 'node:test';
import assert from 'node:assert/strict';
import {createChainRpcHandler} from '../src/server/chain-rpc';
const a=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const manifest={verified:true,chainId:5042002,rpcUrl:'https://rpc.example.invalid',explorerUrl:'https://explorer.example.invalid',aqua:a(1),router:a(2),payments:a(3),usdc:a(4),startBlock:'1',tokens:[{address:a(4),symbol:'USDC',decimals:6,mock:false},{address:a(5),symbol:'DEMO',decimals:18,mock:true}]};
const request=(body:unknown,headers?:HeadersInit,url='http://localhost:3002/api/chain')=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const call={jsonrpc:'2.0',id:7,method:'eth_call',params:[{from:a(6),to:a(2),data:'0x1234',value:'0x0'},{blockHash:'0x'+'ab'.repeat(32),requireCanonical:true}]};

test('fixed-provider read relay preserves exact canonical simulation and revert data, without cookies or redirects',async()=>{
 const seen:any[]=[];const result={jsonrpc:'2.0',id:7,error:{code:3,message:'execution reverted',data:'0x12345678'}};
 const handler=createChainRpcHandler(async()=>manifest,async(url,options)=>{seen.push({url:String(url),options});return Response.json(result);});
 const response=await handler(request(call,{cookie:'identity=must-not-forward'}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),result);
 assert.equal(seen[0].url,manifest.rpcUrl+'/');assert.deepEqual(JSON.parse(seen[0].options.body),call);
 assert.deepEqual(seen[0].options.headers,{'content-type':'application/json'});assert.equal(seen[0].options.redirect,'error');
 const noParams=createChainRpcHandler(async()=>manifest,async(_url,options)=>Response.json({jsonrpc:'2.0',id:8,result:JSON.parse(String(options?.body)).method==='eth_chainId'?'0x4cef52':null}));
 assert.equal((await noParams(request({jsonrpc:'2.0',id:8,method:'eth_chainId'}))).status,200);
});

test('relay rejects signing/broadcast, unverified deployment, cross-site input and simulation overrides without upstream access',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('should not call');};const handler=createChainRpcHandler(async()=>manifest,transport);
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sign','wallet_requestPermissions','debug_traceCall'])assert.equal((await handler(request({...call,method}))).status,400);
 assert.equal((await handler(request([call]))).status,400);
 assert.equal((await handler(request({...call,params:[...call.params,{}]}))).status,400);
 assert.equal((await handler(request({...call,params:[{...call.params[0],to:a(99)},call.params[1]]}))).status,400);
 assert.equal((await handler(request(call,{},'http://localhost:3002/api/chain?rpc=https://evil.invalid'))).status,403);
 assert.equal((await handler(request(call,{'sec-fetch-site':'cross-site',origin:'https://evil.invalid'}))).status,403);
 assert.equal((await handler(request(call,{'content-length':'999999'}))).status,413);
 assert.equal((await createChainRpcHandler(async()=>({...manifest,verified:false}),transport)(request(call))).status,503);
 assert.equal(calls,0);
});
