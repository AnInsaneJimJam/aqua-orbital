import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeFunctionData,erc20Abi} from 'viem';
import {createSwapDraft,prepareSwapReview,executeSwapReview,type SwapPort,type SwapLiveState} from '../src/swap-review';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/swap-quote-observation.json',import.meta.url),'utf8'));
const txHash=`0x${'ab'.repeat(32)}` as const;
function setup(){
 const f=fixture();let clock=1700000003200,sends=0;const records:unknown[]=[];
 const draft=createSwapDraft(f.observed,200,f.manifest,f.request,{deadlineSeconds:180},clock),r=f.observed.data.best;
 const live:SwapLiveState={chainId:f.manifest.chainId,block:{number:4n,hash:txHash,timestamp:1700000003n},config:structuredClone(draft.input.config),maker:r.config.maker,configHash:r.configHash,status:1,version:BigInt(r.stateVersion),balanceRaw:BigInt(r.amountInRaw),allowanceRaw:0n,inputDecimals:6,outputDecimals:18,liveTokens:true,backingValid:true,outputFundingRaw:BigInt(r.amountOutRaw),quotedInputRaw:BigInt(r.amountInRaw),quotedOutputRaw:BigInt(r.amountOutRaw),quotedOrderHash:r.orderHash};
 const port:SwapPort={identity:async()=>({account:draft.context.account,chainId:31337}),canonical:async()=>{},observe:async()=>structuredClone(live),estimate:async()=>({gas:30000n,maxFeePerGas:3n,maxPriorityFeePerGas:1n,nativeBalance:1000000n}),send:async(plan,fees)=>{sends++;assert.equal(fees?.gas,30000n);return txHash;},receipt:async()=>({hash:txHash,status:'success',blockNumber:5n})};
 return {f,draft,live,port,records,now:()=>clock,expire:()=>{clock+=20000;},sends:()=>sends};
}
test('swap approval targets only the router for the exact input, with a separate fresh swap review',async()=>{
 const s=setup(),review=await prepareSwapReview(s.draft,s.port,s.now);assert.equal(review.stage,'approval');
 const call=decodeFunctionData({abi:erc20Abi,data:review.plan.data});assert.equal(call.functionName,'approve');assert.deepEqual(call.args,[s.f.manifest.router.toLowerCase(),BigInt(s.f.request.amountInRaw)]);
 assert.equal(review.draft.input.deadline,1700000183n);assert.equal(s.sends(),0);await executeSwapReview(review,s.port,p=>s.records.push(p),s.now);assert.equal(s.sends(),1);
 await assert.rejects(executeSwapReview(review,s.port,()=>{},s.now));s.live.allowanceRaw=s.live.balanceRaw;
 const swap=await prepareSwapReview(s.draft,s.port,s.now);assert.equal(swap.stage,'swap');assert.equal(swap.plan.to.toLowerCase(),s.f.manifest.router.toLowerCase());assert.equal(s.sends(),1);
});
test('unknown routes, stale observations and invalid local deadlines cannot construct swap drafts',()=>{
 const s=setup();for(const seconds of [0,20,59,601,NaN])assert.throws(()=>createSwapDraft(s.f.observed,200,s.f.manifest,s.f.request,{deadlineSeconds:seconds},s.now()));
 assert.throws(()=>createSwapDraft(s.f.unavailable,503,s.f.manifest,s.f.request,{deadlineSeconds:180},s.now()));
 s.expire();assert.throws(()=>createSwapDraft(s.f.observed,200,s.f.manifest,s.f.request,{deadlineSeconds:180},s.now()));
});
test('retired, docked, changed-version or unbacked strategies and partial/under-minimum quotes never reach a review',async()=>{
 for(const mutate of [(s:SwapLiveState)=>{s.status=2;},(s:SwapLiveState)=>{s.version++;},(s:SwapLiveState)=>{s.liveTokens=false;},(s:SwapLiveState)=>{s.backingValid=false;},(s:SwapLiveState)=>{s.configHash=txHash;},(s:SwapLiveState)=>{s.config.makerNonce++;},(s:SwapLiveState)=>{s.outputFundingRaw=1n;},(s:SwapLiveState)=>{s.quotedInputRaw--;},(s:SwapLiveState)=>{s.quotedOutputRaw=1n;},(s:SwapLiveState)=>{s.quotedOrderHash=txHash;}]){
  const s=setup();mutate(s.live);await assert.rejects(prepareSwapReview(s.draft,s.port,s.now));assert.equal(s.sends(),0);
 }
});
test('payer balances, decimals and live canonical block identity are mandatory even for approval',async()=>{
 for(const change of [(s:ReturnType<typeof setup>)=>{s.live.balanceRaw--;},(s:ReturnType<typeof setup>)=>{s.live.inputDecimals=18;},(s:ReturnType<typeof setup>)=>{s.live.outputDecimals=6;},(s:ReturnType<typeof setup>)=>{s.live.block.timestamp-=30n;},(s:ReturnType<typeof setup>)=>{s.port.canonical=async()=>{throw Error('Orphan');};},(s:ReturnType<typeof setup>)=>{s.port.identity=async()=>({chainId:1});}]){
  const s=setup();change(s);await assert.rejects(prepareSwapReview(s.draft,s.port,s.now));assert.equal(s.sends(),0);
 }
});
test('review cannot be mutated or reused, and intervening funding, account, expiry and gas changes prevent signatures',async()=>{
 for(const change of [(s:ReturnType<typeof setup>)=>s.expire(),(s:ReturnType<typeof setup>)=>{s.live.version++;},(s:ReturnType<typeof setup>)=>{s.live.allowanceRaw=s.live.balanceRaw;},(s:ReturnType<typeof setup>)=>{s.port.estimate=async()=>({gas:30001n,maxFeePerGas:3n,nativeBalance:1000000n});},(s:ReturnType<typeof setup>)=>{s.port.identity=async()=>({chainId:1});}]){
  const s=setup(),review=await prepareSwapReview(s.draft,s.port,s.now);assert.equal(Object.isFrozen(review.draft.input.config.tokens),true);change(s);await assert.rejects(executeSwapReview(review,s.port,()=>{},s.now));assert.equal(s.sends(),0);
 }
});
test('an interrupted swap receipt retains the hash; rejected signatures store nothing',async()=>{
 const s=setup();s.live.allowanceRaw=s.live.balanceRaw;const review=await prepareSwapReview(s.draft,s.port,s.now);s.port.receipt=async()=>{throw Error('Offline');};
 await assert.rejects(executeSwapReview(review,s.port,p=>s.records.push(p),s.now),/Offline/);assert.equal(s.sends(),1);assert.equal((s.records[0] as any).hash,txHash);
 const rejected=setup(),r=await prepareSwapReview(rejected.draft,rejected.port,rejected.now);rejected.port.send=async()=>{throw Error('User rejected request');};await assert.rejects(executeSwapReview(r,rejected.port,p=>rejected.records.push(p),rejected.now),/rejected/);assert.equal(rejected.records.length,0);
});
