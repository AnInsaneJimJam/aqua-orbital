import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ZodType} from 'zod';
import * as shared from '../src/index.js';
const fixtures=JSON.parse(readFileSync(new URL('../../sdk/test/fixtures/payment-observations.json',import.meta.url),'utf8'));
const schema=()=> (shared as typeof shared&{paymentQuoteObservationSchema:ZodType}).paymentQuoteObservationSchema;
test('bounded payment wire schema preserves direct, swap and canonical absence observations without execution permission',()=>{
 for(const fixture of fixtures)assert.deepEqual(schema().parse(fixture.payload),fixture.payload);
});
test('payment wire rejects extra targets, executable flags, malformed numeric strings and unbounded search/plan payloads',()=>{
 for(const edit of [(r:any)=>{r.financialExecutionEnabled=true;},(r:any)=>{r.paymentEligibilityVerified=true;},(r:any)=>{r.data.reviewOnly=false;},(r:any)=>{r.data.plan.value='1';},(r:any)=>{r.data.plan.privateKey='forbidden';},(r:any)=>{r.data.amountInRaw='1e18';},(r:any)=>{r.data.search.quoteCallsUsed=129;},(r:any)=>{r.data.search.minimumInputCertified=true;},(r:any)=>{r.data.plan.data='0x'+'00'.repeat(20000);},(r:any)=>{r.data.search.outcomes=Array(33).fill(r.data.search.outcomes[0]);}]){
  const r=structuredClone(fixtures.find((f:any)=>f.kind==='swap').payload);edit(r);assert.equal(schema().safeParse(r).success,false);
 }
});
