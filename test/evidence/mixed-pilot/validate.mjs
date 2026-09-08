import assert from 'node:assert/strict';
const integer=value=>BigInt(value);
const vector=values=>values.map(integer);
const phase=t=>[integer(t.key),t.inward,t.initialRelease,t.finalRetention];
export function validateObservation(w,r,maxCrossings=16){
 if(r.reverted)return {classification:'unexpected-revert',accepted:false};
 if(!r.accepted){
  assert.equal(r.mixed,true,'nonmixed result must be accepted or reverted');
  const c=r.composition;assert.notEqual(c.status,4,'complete certificate cannot be hidden');
  const classification=c.status===1?'start-membership-uncertainty':c.status===2?'retention-repartition':c.status===3?'crossing-limit':
   !c.initial.identified?'initial-discovery-or-release':!c.endpoint.root.identified?'final-discovery-or-event-schedule':
   c.endpoint.status!==3?'final-payout-domain-or-precision':'arc-order-or-direction';
  return {classification,accepted:false};
 }
 const expected=integer(w.output_raw),q=integer(w.output_quantum);
 // The oracle must resolve a strictly non-integral raw output. In this domain
 // the one-quantum total error bound admits exactly the oracle's raw floor.
 assert(integer(w.shortfall_floor_grid)>0n,'oracle raw equality needs a separate exact witness');
 assert(integer(w.shortfall_ceil_grid)<q*(1n<<32n),'oracle raw boundary unresolved');
 assert.equal(integer(r.amountOutRaw),expected,'raw payout differs from independently resolved floor');
 assert.deepEqual(vector(r.reserves),vector(w.actual_endpoint),'actual endpoint differs');
 assert(integer(r.shortfallUpper)>=integer(w.shortfall_ceil),'reported error bound below reference gap');
 assert(integer(r.shortfallUpper)<=q,'reported error bound exceeds one raw quantum');
 if(!r.mixed){
  assert.equal(w.actual_initial_prefix,0);assert.equal(w.actual_final_prefix,0);
  assert.equal(w.transitions.length,0,'interior dispatch skipped a required transition');
  return {classification:'accepted-interior',accepted:true};
 }
 const c=r.composition,e=c.endpoint;
 assert.equal(c.status,4);assert.equal(e.status,3);assert(c.initial.identified&&e.root.identified);
 assert(c.initial.bracket.certified&&e.root.bracket.certified);
 assert.equal(c.refinementUsed+c.refinementRemaining,160,'shared refinement ledger');
 assert.equal(c.firstSolveUsed+c.resumeUsed,c.refinementUsed,'phase work ledger');
 assert.equal(c.transitions.length+c.crossingRemaining,maxCrossings,'shared crossing ledger');
 assert.equal(c.releaseCrossings+c.frontierCrossings+c.retentionCrossings,c.transitions.length);
 assert.equal(c.initial.boundaryCount,w.initial_ideal_prefix);
 assert.equal(e.root.boundaryCount,w.final_ideal_prefix);
 assert.equal(e.actualBoundaryCount,w.actual_final_prefix);
 assert.equal(integer(e.amountOutRaw),expected);assert.deepEqual(vector(e.reserves),vector(r.reserves));
 for(const [observed,oracle] of [[c.initial,w.initial],[e.root,w.final]]){
  assert(integer(observed.bracket.lo)<=integer(oracle.root_floor_grid),'root lower bound excludes oracle');
  assert(integer(observed.bracket.hi)>=integer(oracle.root_ceil_grid),'root upper bound excludes oracle');
 }
 assert.deepEqual(c.transitions.map(phase),w.transitions.map(t=>[integer(t.key),t.direction==='inward',t.initial_release,t.final_retention]),'ordered crossing keys/phases');
 return {classification:'accepted-mixed',accepted:true};
}
