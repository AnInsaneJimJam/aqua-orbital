import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteCache} from '../src/quote-cache.js';
const key=(n:number)=>n.toString(16).padStart(64,'0'),quote=(n:number)=>`0x${n.toString(16).padStart(192,'0')}`;
test('five-second TTL starts before the RPC read and hits never extend it',()=>{
 let now=0;const c=createQuoteCache({clock:()=>now}),stamp=c.begin();now=4000;c.put(key(1),stamp,[quote(1)]);
 now=4999;assert.deepEqual(c.get(key(1)),[quote(1)]);now=5000;assert.equal(c.get(key(1)),null);assert.deepEqual(c.stats(),{entries:0,payloadBytes:0});
 const late=c.begin();now=10000;c.put(key(2),late,[quote(2)]);assert.equal(c.get(key(2)),null);
});
test('complete arrays are copied both ways; entry and UTF-16 payload budgets bound retained data',()=>{
 let now=0;const c=createQuoteCache({clock:()=>now,maxEntries:2,maxBytes:1032}),values=[quote(1)];c.put(key(1),c.begin(),values);values[0]=quote(99);
 const read=c.get(key(1))!;assert.deepEqual(read,[quote(1)]);read[0]=quote(98);assert.deepEqual(c.get(key(1)),[quote(1)]);
 now++;c.put(key(2),c.begin(),[quote(2)]);assert.deepEqual(c.stats(),{entries:2,payloadBytes:1032});now++;c.put(key(3),c.begin(),[quote(3)]);
 assert.equal(c.get(key(1)),null);assert.deepEqual(c.get(key(2)),[quote(2)]);assert.deepEqual(c.get(key(3)),[quote(3)]);assert.equal(c.stats().entries,2);
 const bytes=createQuoteCache({clock:()=>now,maxBytes:516});bytes.put(key(1),bytes.begin(),[quote(1),quote(2)]);assert.equal(bytes.stats().entries,0);
});
test('clear, clock regression and invalid clocks invalidate retained entries and old in-flight stamps',()=>{
 for(const mode of ['clear','backward','nan','infinite','negative']){let now=100;const c=createQuoteCache({clock:()=>now}),stamp=c.begin();c.put(key(1),stamp,[quote(1)]);
  if(mode==='clear')c.clear();else{now=mode==='backward'?99:mode==='nan'?NaN:mode==='negative'?-1:Infinity;assert.equal(c.get(key(1)),null);}
  now=101;c.put(key(2),stamp,[quote(2)]);assert.equal(c.get(key(1)),null);assert.equal(c.get(key(2)),null);c.put(key(3),c.begin(),[quote(3)]);assert.deepEqual(c.get(key(3)),[quote(3)]);
 }
});
test('duplicate completion never refreshes an existing entry or replaces its independent copy',()=>{
 let now=0;const c=createQuoteCache({clock:()=>now}),first=c.begin();now=1000;const second=c.begin();c.put(key(1),second,[quote(2)]);now=2000;c.put(key(1),first,[quote(1)]);
 assert.deepEqual(c.get(key(1)),[quote(2)]);now=5999;assert.deepEqual(c.get(key(1)),[quote(2)]);now=6000;assert.equal(c.get(key(1)),null);
});
test('invalid configuration, keys, sizes, stamps and noncanonical byte shapes are never retained',()=>{
 for(const options of [{ttlMs:5001},{ttlMs:0},{maxEntries:257},{maxEntries:1.5},{maxBytes:1048577},{maxBytes:0}])assert.throws(()=>createQuoteCache(options));
 const c=createQuoteCache({clock:()=>100});for(const values of [[],Array(9).fill(quote(1)),['0x'],[quote(1)+'00'],['0x'+'GG'.repeat(96)]]){c.put(key(1),c.begin(),values);assert.equal(c.get(key(1)),null);}
 for(const k of ['',key(1)+'0','z'.repeat(64)]){c.put(k,c.begin(),[quote(1)]);assert.equal(c.get(k),null);}
 c.put(key(1),null,[quote(1)]);c.put(key(1),{at:101,generation:0},[quote(1)]);assert.equal(c.get(key(1)),null);assert.equal(c.stats().entries,0);
});
