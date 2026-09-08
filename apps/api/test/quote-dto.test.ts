import test from 'node:test';
import assert from 'node:assert/strict';
import {swapQuoteObservationSchema} from '@orbital/shared';
import {swapQuoteWireFixture} from './quote-http-fixture.js';
test('strict swap observation DTO accepts exact bounded non-executable observed and unavailable envelopes',()=>{
 const f=swapQuoteWireFixture();assert.equal(swapQuoteObservationSchema.safeParse(f.observed).success,true);assert.equal(swapQuoteObservationSchema.safeParse(f.unavailable).success,true);assert.equal(f.observed.data.best.amountInRaw,'9007199254740993');
});
test('swap observation DTO rejects malformed nested money, bounds, count coherence and added execution fields without throwing',()=>{
 const f=swapQuoteWireFixture();assert.equal(swapQuoteObservationSchema.safeParse(f.observed).success,true);
 for(const mutate of [(v:any)=>v.transaction={to:v.router},(v:any)=>v.financialExecutionEnabled=true,(v:any)=>v.request.blockTimestamp='1',(v:any)=>v.data.best.amountOutRaw='1e18',(v:any)=>v.data.best.feePpm=0.5,(v:any)=>v.data.best.stateVersion='0',(v:any)=>v.data.alternatives.push(v.data.best),(v:any)=>v.data.counts.quoted=33,(v:any)=>v.data.counts.scanned=2,(v:any)=>v.data.diagnostics[0].code='UNCONTROLLED',(v:any)=>v.freshness.ageMs=10001]){
  const value=structuredClone(f.observed);mutate(value);assert.doesNotThrow(()=>swapQuoteObservationSchema.safeParse(value));assert.equal(swapQuoteObservationSchema.safeParse(value).success,false);
 }
});
