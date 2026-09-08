import test from 'node:test';
import assert from 'node:assert/strict';
import {validPaymentCacheCounts} from '../src/payment-cache-counts.js';
test('cache count validation matches independent subset enumeration for every supported stage multiset',()=>{
 let checks=0;
 for(let eligible=1;eligible<=32;eligible++)for(let stages=1;stages<=Math.min(16,Math.floor(128/eligible));stages++){
  let states=new Set(['0:0']);
  for(let stage=0;stage<stages;stage++)for(let remaining=eligible;remaining>0;remaining-=8){const size=Math.min(8,remaining),next=new Set(states);for(const state of states){const [members,batches]=state.split(':').map(Number) as [number,number];next.add(`${members+size}:${batches+1}`);}states=next;}
  for(let members=0;members<=128;members++)for(let batches=0;batches<=28;batches++){assert.equal(validPaymentCacheCounts(eligible,stages,members,batches),states.has(`${members}:${batches}`),`${eligible}/${stages}/${members}/${batches}`);checks++;}
 }
 assert.ok(checks>1000000);
});
test('unsupported, noninteger and nonfinite work counts never validate',()=>{
 for(const values of [[0,1,0,0],[33,1,0,0],[1,17,0,0],[32,5,0,0],[1,1,-1,0],[1,1,1,-1],[1,1,1,29],[1,1,129,1],[1.5,1,0,0],[1,1,NaN,0],[1,1,0,Infinity]])assert.equal(validPaymentCacheCounts(...values as [number,number,number,number]),false);
});
