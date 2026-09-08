import test from 'node:test';
import assert from 'node:assert/strict';
import {swapSettings,maximumSwapInput,estimateMaximumSwap} from '../src/swap-controls';

test('device settings require integer supported limits and expose the documented defaults',()=>{
 assert.deepEqual(swapSettings(),{slippageBps:10,deadlineSeconds:180});
 for(const slippageBps of [1,10,50,100,500])for(const deadlineSeconds of [60,180,600])assert.deepEqual(swapSettings({slippageBps,deadlineSeconds}),{slippageBps,deadlineSeconds});
 for(const bad of [{slippageBps:0,deadlineSeconds:180},{slippageBps:501,deadlineSeconds:180},{slippageBps:1.5,deadlineSeconds:180},{slippageBps:'10',deadlineSeconds:180},{slippageBps:10,deadlineSeconds:120},null])assert.throws(()=>swapSettings(bad));
});
test('Max preserves exact large balances, separate gas inventories and conservative native-to-raw rounding',()=>{
 const balance=9007199254740993n;
 assert.equal(maximumSwapInput(balance,false),balance);
 assert.equal(maximumSwapInput(balance,true),null);
 assert.equal(maximumSwapInput(balance,true,[0n]),balance-50000n);
 assert.equal(maximumSwapInput(balance,true,[25000n*10n**12n+1n]),balance-50002n);
 assert.equal(maximumSwapInput(balance,true,[20000n*10n**12n,10000n*10n**12n]),balance-60000n);
 assert.equal(maximumSwapInput(50000n,true,[0n]),0n);
 assert.throws(()=>maximumSwapInput(-1n,false));assert.throws(()=>maximumSwapInput(balance,true,[-1n]));
});
test('Max estimates its actual candidate, increases the reserve and rechecks the smaller amount',async()=>{
 const seen:bigint[]=[];
 const amount=await estimateMaximumSwap(1000000n,async candidate=>{seen.push(candidate);return {stage:'swap',gasCostNative:(seen.length===1?40000n:30000n)*10n**12n};});
 assert.equal(amount,920000n);assert.deepEqual(seen,[950000n,920000n]);
});
test('unknown remaining gas, exhausted balance and unstable gas cannot silently choose an entire USDC balance',async()=>{
 await assert.rejects(estimateMaximumSwap(1000000n,async()=>({stage:'approval',gasCostNative:1n})),/remaining approval and swap/);
 await assert.rejects(estimateMaximumSwap(50000n,async()=>{throw Error('Must not estimate');}),/gas reserve/);
 let calls=0;await assert.rejects(estimateMaximumSwap(1000000n,async()=>({stage:'swap',gasCostNative:BigInt(++calls*30000)*10n**12n})),/changed/);assert.equal(calls,3);
 await assert.rejects(estimateMaximumSwap(1000000n,async()=>{throw Error('RPC unavailable');}),/RPC unavailable/);
});
