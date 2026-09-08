import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,type Hex} from 'viem';
import {routerAbi,feeIn,takerData} from '@orbital/sdk';
import {prepareRouting,prepareWholeSizeQuotes,selectWholeSizeQuotes,type StaticReadResult} from '../src/route-selection.js';
import {routingFixture} from './route-selection-fixture.js';
import {address,hash,manifest} from './strategies-fixture.js';

test('bounded preparation sorts canonical block/log activity and caps inspections without claiming eligibility',()=>{
 const f=routingFixture(40),p=prepareRouting(f.input);assert.equal(p.counts.scanned,40);assert.equal(p.counts.inspected,32);assert.equal(p.counts.eligible,0);assert.equal(p.counts.notInspected,8);
 assert.equal(p.inspectionCalls.length,96);assert.ok(p.batches.every((b:unknown[])=>b.length<=8));assert.equal(p.inspectionCalls[0]!.id,`${f.records[39]!.orderHash}:getStrategyConfig`);
 assert.equal(p.diagnostics.filter((d:any)=>d.code==='NOT_INSPECTED_CAP').length,8);assert.equal(p.financialExecutionEnabled,false);assert.equal(p.canonicalVerification,'pending');
 assert.throws(()=>prepareRouting({...f.input,snapshot:{...f.input.snapshot,items:[...f.records,...f.records]}}),/CANDIDATE/);
});
test('inspection and quote plans preserve exact caller, recipient, canonical bytes and one hash pin',()=>{
 const f=routingFixture(),p=prepareRouting(f.input);for(const call of p.inspectionCalls){assert.equal(call.params[0].from,address(22).toLowerCase());assert.equal(call.params[0].to,manifest.router.toLowerCase());assert.deepEqual(call.params[1],{blockHash:hash(3),requireCanonical:true});}
 const q=prepareWholeSizeQuotes(f.input,f.inspections(p.inspectionCalls));assert.equal(q.counts.eligible,6);assert.equal(q.quoteCalls.length,6);
 for(const call of q.quoteCalls){const decoded=decodeFunctionData({abi:routerAbi,data:call.params[0].data as Hex});assert.equal(decoded.functionName,'quote');assert.equal(decoded.args[1],9007199254740993n);assert.equal(decoded.args[2],takerData({taker:address(22),recipient:address(23),minimum:0n,deadline:1700000023n,input:0,output:2,maxCrossings:16}));}
});
test('payment planning uses adapter caller/recipient and an independent payer without invoice authorization',()=>{
 const f=routingFixture();f.input.intent={kind:'payment',payer:address(22),tokenIn:address(3),amountInRaw:'1000000000000000000',minimumOutRaw:'1234567',slippageBps:100,maxCrossings:4};
 const p=prepareRouting(f.input),q=prepareWholeSizeQuotes(f.input,f.inspections(p.inspectionCalls));assert.equal(q.quoteCalls.length,6);
 const call=q.quoteCalls[0]!;assert.equal(call.params[0].from,manifest.payments.toLowerCase());const decoded=decodeFunctionData({abi:routerAbi,data:call.params[0].data as Hex});assert.equal(decoded.args[2],takerData({taker:address(12),recipient:address(12),minimum:1234567n,deadline:1700000023n,input:2,output:0,maxCrossings:4}));
 const selected=selectWholeSizeQuotes(f.input,f.inspections(p.inspectionCalls),f.quotes(q.quoteCalls,()=>2_000_000n));assert.ok(selected.best);assert.equal(selected.best.payer,address(22).toLowerCase());assert.equal(selected.best.kind,'payment');assert.equal(selected.best.caller,manifest.payments.toLowerCase());
 f.input.intent.payer=f.configs[0]!.maker;assert.equal(prepareRouting(f.input).counts.locallyAccepted,0);
 const payment=f.input.intent;for(const bad of [manifest.router,manifest.aqua,manifest.payments,address(0)])assert.throws(()=>prepareRouting({...f.input,intent:{...payment,payer:bad}}),/ROUTING_INPUT/);
});
test('whole-size results rank exact output then fee/hash and return no more than three alternatives',()=>{
 const f=routingFixture(9),p=prepareRouting(f.input),observed=f.inspections(p.inspectionCalls),q=prepareWholeSizeQuotes(f.input,observed);
 const result=selectWholeSizeQuotes(f.input,observed,f.quotes(q.quoteCalls));assert.equal(result.counts.quoted,9);assert.equal(result.alternatives.length,3);assert.ok(result.best);assert.equal(result.best.feePpm,100);
 const expected=f.records.filter((_,i)=>i%3===0).map(r=>r.orderHash).sort()[0];assert.equal(result.best.orderHash,expected);assert.equal(result.best.amountInRaw,'9007199254740993');assert.equal(result.best.feeRaw,feeIn(9007199254740993n,100).toString());assert.equal(result.best.minimumOutRaw,'19900000000000000000');assert.equal(result.financialExecutionEnabled,false);assert.equal(result.canonicalVerification,'pending');
 const other=selectWholeSizeQuotes(f.input,observed,f.quotes(q.quoteCalls,id=>id===f.records[1]!.orderHash?21n*10n**18n:20n*10n**18n));assert.ok(other.best);assert.equal(other.best.orderHash,f.records[1]!.orderHash);assert.equal(other.best.feePpm,500);
});
test('more than32 locally valid but untradeable observations retain exact failure and cap counts',()=>{
 const f=routingFixture(40),p=prepareRouting(f.input),observed=f.inspections(p.inspectionCalls,r=>{r.availability[2]!.aquaAllowanceRaw=0n;r.availability[2]!.fundingCeilingRaw=0n;});
 const q=prepareWholeSizeQuotes(f.input,observed);assert.equal(q.quoteCalls.length,0);assert.equal(q.counts.scanned,40);assert.equal(q.counts.inspected,32);assert.equal(q.counts.eligible,0);assert.equal(q.counts.failed,32);assert.equal(q.counts.notInspected,8);
 const result=selectWholeSizeQuotes(f.input,observed,[]);assert.equal(result.best,null);assert.deepEqual(result.alternatives,[]);assert.equal(result.diagnostics.filter((d:any)=>d.code==='OUTPUT_UNAVAILABLE').length,32);
});
test('partial fills, excess inventory, wrong order bytes, reverts and absent observations are discarded',()=>{
 const f=routingFixture(),p=prepareRouting(f.input),observed=f.inspections(p.inspectionCalls),q=prepareWholeSizeQuotes(f.input,observed),results=f.quotes(q.quoteCalls);
 const id=(i:number)=>results[i]!.request.id.split(':')[0] as Hex;
 results[0]={request:results[0]!.request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[1n,20n*10n**18n,id(0)]})};
 results[1]={request:results[1]!.request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[9007199254740993n,301n*10n**18n,id(1)]})};
 results[2]={request:results[2]!.request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[9007199254740993n,20n*10n**18n,hash(99)]})};
 results[3]={request:results[3]!.request,status:'rejected',reason:'revert'};results.pop();
 const result=selectWholeSizeQuotes(f.input,observed,results);assert.equal(result.counts.quoted,1);assert.equal(result.counts.failed,5);assert.deepEqual(new Set(result.diagnostics.map((d:any)=>d.code)),new Set(['PARTIAL_FILL','OUTPUT_UNAVAILABLE','QUOTE_DATA_INVALID','QUOTE_REVERTED','QUOTE_MISSING','QUOTED']));
 for(const field of ['from','to','data'] as const){const bad=structuredClone(observed);bad[0]!.request.params[0][field]=field==='data'?'0x':address(99);assert.throws(()=>prepareWholeSizeQuotes(f.input,bad),/OBSERVATION/);}
 const mixed=structuredClone(observed);mixed[0]!.request.params[1].blockHash=hash(99);assert.throws(()=>prepareWholeSizeQuotes(f.input,mixed),/OBSERVATION/);
 assert.throws(()=>prepareWholeSizeQuotes(f.input,[...observed,observed[0]!] as StaticReadResult[]),/OBSERVATION/);
});
test('invalid source scope, token roles and numeric limits cannot create call plans',()=>{
 const f=routingFixture();assert.ok(prepareRouting(f.input).inspectionCalls.length);
 for(const changed of [{...f.input.snapshot,code:'STRATEGY_COVERAGE_INCOMPLETE'},{...f.input.snapshot,deploymentId:hash(99)},{...f.input.snapshot,asOf:{height:'2',hash:hash(2)}},{...f.input.snapshot,coverage:{...f.input.snapshot.coverage,coveredBlocks:'2'}}])assert.throws(()=>prepareRouting({...f.input,snapshot:changed}),/CANDIDATE/);
 for(const changed of [{amountInRaw:'1e18'},{amountInRaw:'0'},{maxCrossings:17},{slippageBps:501},{recipient:manifest.router},{wallet:manifest.aqua},{tokenOut:address(99)}])assert.throws(()=>prepareRouting({...f.input,intent:{...f.input.intent,...changed} as typeof f.input.intent}),/ROUTING_INPUT/);
 const tiny=prepareRouting({...f.input,intent:{...f.input.intent,amountInRaw:'1'}});assert.equal(tiny.counts.locallyAccepted,0);assert.equal(tiny.counts.failed,6);
});
