import test from 'node:test';
import assert from 'node:assert/strict';
import {PAYMENT_SEARCH_LIMITS,searchPaymentInput,type PaymentSearchStage} from '../src/payment-search.js';

const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
const ids=(n:number)=>Array.from({length:n},(_,i)=>hash(i+1));
const options=(seed=2n,bound=1000000n,count=1)=>({seed,bound,eligibleOrderHashes:ids(count),checkpoint(){}});
function stage(amount:bigint,orders:string[],sufficient:boolean):PaymentSearchStage<{amount:bigint;output:bigint}>{
 return {outcomes:orders.map(orderHash=>({orderHash,status:sufficient?'quoted':'unavailable'})),value:sufficient?{amount,output:amount}:null};
}

test('search retains a complete sufficient stage and bounds all amounts with exact bigint counters',async()=>{
 const o=options(10n,1000n,3),seen:bigint[]=[];
 const r:any=await searchPaymentInput(o,async amount=>{seen.push(amount);return stage(amount,o.eligibleOrderHashes,amount>=37n);});
 assert.equal(r.selected.input,37n);assert.equal(r.selected.value.amount,37n);assert.equal(r.minimumInputCertified,false);
 assert.equal(r.selection,'sufficient_observed_input');assert.equal(r.stagesUsed,seen.length);assert.equal(r.quoteCallsUsed,3*seen.length);
 assert.equal(new Set(seen).size,seen.length);assert.ok(seen.every(x=>x>=2n&&x<=1000n));
 assert.deepEqual(seen,[10n,20n,40n,30n,35n,37n,36n]);
 assert.equal(r.expansionStages,3);assert.equal(r.refinementStages,4);assert.equal(r.stopReason,'adjacent_cursor');
 for(const row of r.outcomes)assert.equal(row.quoted+row.unavailable,seen.length);
});

test('32 eligible orders force four complete stages and reserve the final expansion for the cap',async()=>{
 const o=options(2n,(1n<<256n)-1n,32),seen:bigint[]=[];
 const r:any=await searchPaymentInput(o,async amount=>{seen.push(amount);return stage(amount,o.eligibleOrderHashes,false);});
 assert.deepEqual(seen,[2n,4n,8n,o.bound]);assert.equal(r.selected,null);assert.equal(r.selection,null);
 assert.equal(r.stopReason,'search_exhausted');assert.equal(r.stagesUsed,4);assert.equal(r.quoteCallsUsed,128);assert.equal(r.quoteBatchesUsed,16);
 assert.equal(r.outcomes.length,32);assert.equal(r.minimumInputCertified,false);
});

test('E9 reaches the 28-batch ceiling while staying below128 quote members',async()=>{
 const o=options(2n,1n<<200n,9);
 const r:any=await searchPaymentInput(o,async amount=>stage(amount,o.eligibleOrderHashes,amount===o.bound));
 assert.equal(r.expansionStages,8);assert.equal(r.refinementStages,6);assert.equal(r.stagesUsed,14);
 assert.equal(r.quoteCallsUsed,126);assert.equal(r.quoteBatchesUsed,28);assert.equal(r.stopReason,'aggregate_limit');
 assert.equal(r.selected.input,o.bound);
});

test('all eligible counts obey exact aggregate and native-batch ceilings without silently truncating a stage',async()=>{
 for(let e=1;e<=32;e++){
  const o=options(2n,1n<<200n,e);const r:any=await searchPaymentInput(o,async amount=>stage(amount,o.eligibleOrderHashes,amount===o.bound));
  assert.equal(r.stagesUsed,Math.min(16,Math.floor(128/e)));assert.equal(r.quoteCallsUsed,r.stagesUsed*e);
  assert.equal(r.quoteBatchesUsed,r.stagesUsed*Math.ceil(e/8));assert.ok(r.quoteBatchesUsed<=28);
  assert.ok(r.expansionStages<=8&&r.refinementStages<=8&&r.quoteCallsUsed<=128);
 }
 assert.equal(PAYMENT_SEARCH_LIMITS.maxExpansions,8);assert.equal(PAYMENT_SEARCH_LIMITS.maxRefinements,8);
});

test('partial-oracle countermodel may miss a lower sufficient point and never certifies a minimum',async()=>{
 // Ideal output is input. Input2 is sufficient; discovery at3 is unknown.
 const o=options(5n,5n),seen:bigint[]=[];
 const r:any=await searchPaymentInput(o,async amount=>{seen.push(amount);return stage(amount,o.eligibleOrderHashes,amount>=2n&&amount!==3n);});
 assert.deepEqual(seen,[5n,3n,4n]);assert.equal(r.selected.input,4n);assert.ok(!seen.includes(2n));assert.equal(r.minimumInputCertified,false);
 assert.equal(r.outcomes[0].unavailable,1);
});

test('saturation, clamping, adjacent bounds and fee plateaus use integer arithmetic',async()=>{
 for(const [seed,bound] of [[1n,2n],[1n<<270n,2n],[20n,21n]] as const){
  const o=options(seed,bound),seen:bigint[]=[];
  const r:any=await searchPaymentInput(o,async amount=>{seen.push(amount);const net=amount-(amount*1000n+999999n)/1000000n;return stage(amount,o.eligibleOrderHashes,net>=1n);});
  assert.ok(r.selected.input>=2n&&r.selected.input<=bound);assert.equal(new Set(seen).size,seen.length);
 }
 const o=options(9007199254740993n,9007199254741010n),seen:bigint[]=[];
 await searchPaymentInput(o,async amount=>{seen.push(amount);return stage(amount,o.eligibleOrderHashes,amount===o.bound);});
 assert.equal(seen[0],9007199254740993n);assert.ok(seen.includes(o.bound));
});

test('no eligible strategies consume no quote stage and preserve an explicit unavailable search outcome',async()=>{
 const o=options(2n,100n,0);let calls=0;
 const r:any=await searchPaymentInput(o,async()=>{calls++;throw Error('unexpected');});
 assert.equal(calls,0);assert.equal(r.selected,null);assert.equal(r.stagesUsed,0);assert.equal(r.stopReason,'no_eligible_strategies');
});

test('missing, duplicated, changed, extra, malformed or contradictory stage outcomes abort instead of retaining a partial result',async()=>{
 const o=options(2n,100n,2);
 const invalid=[
  {outcomes:[{orderHash:hash(1),status:'quoted'}],value:{}},
  {outcomes:[{orderHash:hash(1),status:'quoted'},{orderHash:hash(1),status:'quoted'}],value:{}},
  {outcomes:[{orderHash:hash(1),status:'quoted'},{orderHash:hash(3),status:'quoted'}],value:{}},
  {outcomes:[{orderHash:hash(1),status:'quoted'},{orderHash:hash(2),status:'quoted'},{orderHash:hash(3),status:'quoted'}],value:{}},
  {outcomes:[{orderHash:hash(1),status:'ignored'},{orderHash:hash(2),status:'quoted'}],value:{}},
  {outcomes:[{orderHash:hash(1),status:'quoted'},{orderHash:hash(2),status:'unavailable'}],value:null},
  {outcomes:[{orderHash:hash(1),status:'unavailable'},{orderHash:hash(2),status:'unavailable'}],value:{}},
 ];
 for(const bad of invalid)await assert.rejects(searchPaymentInput(o,async()=>bad as PaymentSearchStage<object>),/PAYMENT_STAGE_INVALID/);
});

test('transport failures, cancellation and a failed final checkpoint cannot return an earlier sufficient result',async()=>{
 for(const failure of ['transport','cancelled','expired']){
  const o=options(100n,100n);let probes=0,stop=false;
  o.checkpoint=()=>{if(stop)throw Error(failure);};
  await assert.rejects(searchPaymentInput(o,async amount=>{probes++;if(probes===2){if(failure==='transport')throw Error(failure);stop=true;}return stage(amount,o.eligibleOrderHashes,true);}),new RegExp(failure));
  assert.equal(probes,2);
 }
});

test('latency reserve skips optional refinement while requiring the final checkpoint',async()=>{
 let elapsed=0,checks=0;const o={...options(100n,100n),checkpoint(){checks++;if(elapsed>=10000)throw Error('expired');},shouldRefine:()=>10000-elapsed>2000};
 const r:any=await searchPaymentInput(o,async amount=>{elapsed=8500;return stage(amount,o.eligibleOrderHashes,true);});
 assert.equal(r.stagesUsed,1);assert.equal(r.selected.input,100n);assert.equal(r.stopReason,'refinement_skipped');assert.ok(checks>=3);
});

test('retained sufficient result is isolated from mutation by a later probe',async()=>{
 const o=options(5n,5n);let held:PaymentSearchStage<{amount:bigint;output:bigint}>|undefined;
 const r:any=await searchPaymentInput(o,async amount=>{if(!held){held=stage(amount,o.eligibleOrderHashes,true);return held;}held.value!.amount=9999n;held.value!.output=0n;return stage(amount,o.eligibleOrderHashes,false);});
 assert.equal(r.selected.input,5n);assert.deepEqual(r.selected.value,{amount:5n,output:5n});
});

test('invalid numeric domains or eligible sets are rejected before probing',async()=>{
 for(const change of [{seed:0n},{bound:1n},{bound:1n<<256n},{seed:2 as unknown as bigint},{eligibleOrderHashes:[hash(1),hash(1)]},{eligibleOrderHashes:ids(33)},{eligibleOrderHashes:['0x12']}]){
  let called=false;await assert.rejects(searchPaymentInput({...options(),...change},async()=>{called=true;return {outcomes:[],value:null};}),/PAYMENT_SEARCH_INVALID/);assert.equal(called,false);
 }
});

test('shared memory, accessors, cycles and non-data values cannot be retained as a quote result',async()=>{
 const o=options(2n,2n);let getterCalls=0;
 const accessor={get amount(){getterCalls++;return 2n;}};
 const cycle:Record<string,unknown>={};cycle.self=cycle;
 for(const value of [{buffer:new SharedArrayBuffer(4)},accessor,cycle,{view:new Uint8Array(2)},{fn:()=>1},{date:new Date()},[,,],{n:NaN},{['x'.repeat(1048577)]:true}]){
  await assert.rejects(searchPaymentInput(o,async()=>({outcomes:[{orderHash:hash(1),status:'quoted'}],value})),/PAYMENT_VALUE_INVALID/);
 }
 assert.equal(getterCalls,0);
});

test('a final-return checkpoint failure discards the retained quote after optional refinement is declined',async()=>{
 let declined=false,probes=0;
 const o={...options(100n,100n),checkpoint(){if(declined)throw Error('final expired');},shouldRefine(){declined=true;return false;}};
 await assert.rejects(searchPaymentInput(o,async amount=>{probes++;return stage(amount,o.eligibleOrderHashes,true);}),/final expired/);
 assert.equal(probes,1);
});

test('a complete reordered stage can include both quoted and unavailable strategies',async()=>{
 const o={...options(5n,5n,3),shouldRefine:()=>false};
 const r=await searchPaymentInput(o,async amount=>({outcomes:[{orderHash:hash(3),status:'unavailable' as const},{orderHash:hash(2),status:'quoted' as const},{orderHash:hash(1),status:'unavailable' as const}],value:{amount}}));
 assert.equal(r.selected?.input,5n);assert.deepEqual(r.outcomes,[{orderHash:hash(1),quoted:0,unavailable:1},{orderHash:hash(2),quoted:1,unavailable:0},{orderHash:hash(3),quoted:0,unavailable:1}]);
});

test('an exhausted bounded search can miss its sole sufficient input without claiming liquidity is insufficient',async()=>{
 const o=options(2n,100n),seen:bigint[]=[];
 const r=await searchPaymentInput(o,async amount=>{seen.push(amount);return stage(amount,o.eligibleOrderHashes,amount===3n);});
 assert.equal(r.selected,null);assert.equal(r.stopReason,'search_exhausted');assert.ok(!seen.includes(3n));assert.ok(seen.includes(100n));
 assert.equal(r.minimumInputCertified,false);
});
