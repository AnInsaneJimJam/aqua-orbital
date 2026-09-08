import test from 'node:test';
import assert from 'node:assert/strict';
import {validateObservation} from './validate.mjs';

const witness=()=>({output_raw:'12',output_quantum:'100',shortfall_floor_grid:'4294967296',shortfall_ceil_grid:'8589934592',shortfall_ceil:'2',
 actual_endpoint:['800','900'],actual_initial_prefix:0,initial_ideal_prefix:0,final_ideal_prefix:0,actual_final_prefix:0,
 initial:{root_floor_grid:'100',root_ceil_grid:'101'},final:{root_floor_grid:'40',root_ceil_grid:'41'},transitions:[]});
const result=()=>({accepted:true,reverted:false,mixed:false,amountOutRaw:12n,reserves:[800n,900n],shortfallUpper:2n});
test('nonintegral one-quantum oracle excludes both overpayment and an extra raw-unit haircut',()=>{
 assert.equal(validateObservation(witness(),result()).classification,'accepted-interior');
 for(const delta of [-1n,1n])assert.throws(()=>validateObservation(witness(),{...result(),amountOutRaw:12n+delta}),/raw payout/);
});
test('wrong untouched reserves or understated/oversized slack cannot pass comparison',()=>{
 assert.throws(()=>validateObservation(witness(),{...result(),reserves:[801n,900n]}),/endpoint/);
 for(const bound of [1n,101n])assert.throws(()=>validateObservation(witness(),{...result(),shortfallUpper:bound}),/error bound/);
});
test('a root on a raw equality boundary requires its separate exact interpretation',()=>{
 assert.throws(()=>validateObservation({...witness(),shortfall_floor_grid:'0'},result()),/equality/);
});
test('conservative deferrals and unexpected reverts are never accepted observations',()=>{
 assert.deepEqual(validateObservation(witness(),{reverted:true}),{classification:'unexpected-revert',accepted:false});
 for(const [status,classification] of [[1,'start-membership-uncertainty'],[2,'retention-repartition'],[3,'crossing-limit']]){
  assert.deepEqual(validateObservation(witness(),{reverted:false,accepted:false,mixed:true,composition:{status}}),{classification,accepted:false});
 }
 assert.throws(()=>validateObservation(witness(),{accepted:false,mixed:true,composition:{status:4}}),/complete certificate/);
});
test('mixed roots, ordered phases and shared budgets must all match independently',()=>{
 const w=witness();w.actual_final_prefix=1;w.transitions=[{key:'7',direction:'outward',initial_release:false,final_retention:true}];
 const r={...result(),mixed:true,composition:{status:4,refinementUsed:4,refinementRemaining:156,firstSolveUsed:3,resumeUsed:1,
  crossingRemaining:15,releaseCrossings:0,frontierCrossings:0,retentionCrossings:1,
  initial:{identified:true,boundaryCount:0,bracket:{certified:true,lo:99n,hi:102n}},
  endpoint:{status:3,root:{identified:true,boundaryCount:0,bracket:{certified:true,lo:39n,hi:42n}},actualBoundaryCount:1,amountOutRaw:12n,reserves:[800n,900n]},
  transitions:[{key:7n,inward:false,initialRelease:false,finalRetention:true}]}};
 assert.equal(validateObservation(w,r).classification,'accepted-mixed');
 for(const mutate of [x=>{x.composition.refinementRemaining++},x=>{x.composition.transitions[0].finalRetention=false},
  x=>{x.composition.endpoint.root.bracket.lo=41n},x=>{x.composition.endpoint.actualBoundaryCount=0}]){
  const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateObservation(w,bad));
 }
});
