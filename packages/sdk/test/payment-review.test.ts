import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaymentDraft,preparePaymentReview,executePaymentReview,paymentNativeSpend,type PaymentPort,type PaymentLiveState} from '../src/payment-review';
import {encodeAbiParameters,keccak256,type Address} from 'viem';
const fixture=(kind='swap')=>JSON.parse(readFileSync(new URL('./fixtures/payment-observations.json',import.meta.url),'utf8')).find((f:any)=>f.kind===kind);
const hash=`0x${'ab'.repeat(32)}` as const;
function setup(kind='swap') {
 const f=fixture(kind),draft=createPaymentDraft(f.payload,f.httpStatus,f.manifest,f.request,f.nowMs);
 let now=f.nowMs,sends=0;const records:unknown[]=[];
 const live:PaymentLiveState={chainId:f.manifest.chainId,block:{number:4n,hash,timestamp:BigInt(Math.floor(now/1000))},invoice:structuredClone(draft.input.invoice),usdc:f.manifest.usdc,router:f.manifest.router,allowedToken:true,decimals:draft.observation.data.tokenIn.decimals,usdcDecimals:6,balanceRaw:1000n,allowanceRaw:0n};
 const port:PaymentPort={identity:async()=>({account:draft.context.account,chainId:draft.context.chainId}),observe:async()=>structuredClone(live),canonical:async()=>{},estimate:async()=>({gas:30000n,maxFeePerGas:3n,maxPriorityFeePerGas:1n,nativeBalance:1000000n}),send:async(_p,fees)=>{sends++;assert.equal(fees?.gas,30000n);return hash;},receipt:async()=>({hash,status:'success',blockNumber:5n})};
 return {f,draft,live,port,records,now:()=>now,advance:()=>{now+=20000;},sends:()=>sends};
}
test('payment review selects exact approval from fresh allowance, then requires a separate payment review',async()=>{
 for(const kind of ['direct','swap']){const s=setup(kind),r=await preparePaymentReview(s.draft,s.port,s.now);
  assert.equal(r.stage,'approval');assert.equal(r.plan.to.toLowerCase(),s.f.request.tokenIn.toLowerCase());assert.equal(s.sends(),0);
  await executePaymentReview(r,s.port,p=>s.records.push(p),s.now);assert.equal(s.sends(),1);assert.equal(s.records.length,1);
  await assert.rejects(executePaymentReview(r,s.port,()=>{},s.now),/review/i);
  const unused=await preparePaymentReview(s.draft,s.port,s.now);s.live.allowanceRaw=1000n;
  await assert.rejects(executePaymentReview(unused,s.port,()=>{},s.now),/allowance.*changed/i);
  const next=await preparePaymentReview(s.draft,s.port,s.now);assert.equal(next.stage,'payment');assert.equal(next.plan.to.toLowerCase(),s.f.manifest.payments.toLowerCase());assert.equal(s.sends(),1);
 }
});
test('unavailable, altered calldata and expired observations never become payment drafts',()=>{
 const s=setup();s.f.payload.data.plan.to=s.f.request.tokenIn;assert.throws(()=>createPaymentDraft(s.f.payload,200,s.f.manifest,s.f.request,s.f.nowMs));
 const f=fixture('absent');assert.throws(()=>createPaymentDraft(f.payload,404,f.manifest,f.request,f.nowMs),/unavailable/i);
 assert.throws(()=>createPaymentDraft(fixture().payload,200,s.f.manifest,s.f.request,s.f.nowMs+20000));
});
test('fresh invoice, adapter bindings, decimals, canonicality and payer funding are release conditions',async()=>{
 for(const change of [({live}:ReturnType<typeof setup>)=>{live.invoice.status='paid';},({live}:ReturnType<typeof setup>)=>{live.invoice.recipients.reverse();},({live}:ReturnType<typeof setup>)=>{live.invoice.amountDueRaw++;},({live}:ReturnType<typeof setup>)=>{live.balanceRaw=1n;},({live}:ReturnType<typeof setup>)=>{live.router=live.usdc;},({live}:ReturnType<typeof setup>)=>{live.allowedToken=false;},({live}:ReturnType<typeof setup>)=>{live.decimals=18;},({live}:ReturnType<typeof setup>)=>{live.block.timestamp-=30n;},({port}:ReturnType<typeof setup>)=>{port.canonical=async()=>{throw Error('Orphaned block');};}]){
  const s=setup();change(s);await assert.rejects(preparePaymentReview(s.draft,s.port,s.now));assert.equal(s.sends(),0);
 }
});
test('review is immutable, expires, and rechecks simulation, gas budget and account before any signature',async()=>{
 for(const change of [({advance}:ReturnType<typeof setup>)=>advance(),({live}:ReturnType<typeof setup>)=>{live.invoice.status='cancelled';},({port}:ReturnType<typeof setup>)=>{port.estimate=async()=>{throw Error('Simulation reverted');};},({port}:ReturnType<typeof setup>)=>{port.estimate=async()=>({gas:30001n,maxFeePerGas:3n,maxPriorityFeePerGas:1n,nativeBalance:1000000n});},({port}:ReturnType<typeof setup>)=>{port.identity=async()=>({chainId:1});}]){
  const s=setup(),r=await preparePaymentReview(s.draft,s.port,s.now);assert.equal(Object.isFrozen(r.plan),true);assert.equal(Object.isFrozen(r.draft.input.invoice.recipients),true);change(s);await assert.rejects(executePaymentReview(r,s.port,()=>{},s.now));assert.equal(s.sends(),0);
 }
});
test('interrupted receipt tracking retains the submitted hash and never automatically repeats payment',async()=>{
 const s=setup();s.live.allowanceRaw=1000n;const r=await preparePaymentReview(s.draft,s.port,s.now);s.port.receipt=async()=>{throw Error('Disconnected');};
 await assert.rejects(executePaymentReview(r,s.port,p=>s.records.push(p),s.now),/Disconnected/);assert.equal(s.sends(),1);assert.equal((s.records[0] as any).hash,hash);
});
test('Arc USDC payment reserves its 18-decimal native spend in addition to gas, including approval review',async()=>{
 const f=fixture('direct');f.manifest.chainId=f.payload.chainId=f.payload.data.plan.chainId=f.payload.data.approval.chainId=5042002;
 f.payload.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,f.manifest.aqua as Address,f.manifest.router as Address,f.manifest.payments as Address]));
 const s=setup('direct'),draft=createPaymentDraft(f.payload,200,f.manifest,f.request,f.nowMs),spend=100n*10n**12n;
 s.port.identity=async()=>({account:draft.context.account,chainId:5042002});s.live.chainId=s.live.invoice.chainId=5042002;
 for(const allowance of [0n,1000n]){s.live.allowanceRaw=allowance;s.port.estimate=async()=>({gas:30000n,maxFeePerGas:3n,nativeBalance:spend+89999n});await assert.rejects(preparePaymentReview(draft,s.port,s.now),/gas/);
  s.port.estimate=async()=>({gas:30000n,maxFeePerGas:3n,nativeBalance:spend+90000n});const review=await preparePaymentReview(draft,s.port,s.now);assert.equal(review.estimate.nativeSpend,spend);
 }
 assert.equal(paymentNativeSpend(31337,f.request.tokenIn,f.manifest.usdc,100n),0n);assert.equal(paymentNativeSpend(5042002,f.manifest.tokens[1].address,f.manifest.usdc,100n),0n);
});
test('gas freshness failure and storage failure consume the review without automatic submission or lost hash',async()=>{
 const s=setup(),r=await preparePaymentReview(s.draft,s.port,s.now);let pending:unknown;
 await assert.rejects(executePaymentReview(r,s.port,p=>{pending=p;throw Error('Quota');},s.now),e=>{assert.equal((e as any).pending.hash,hash);return true;});assert.ok(pending);
 await assert.rejects(executePaymentReview(r,s.port,()=>{},s.now));assert.equal(s.sends(),1);
});
test('a quote expiring during the final identity check never reaches the wallet send method',async()=>{
 const s=setup(),r=await preparePaymentReview(s.draft,s.port,s.now);let identities=0;const original=s.port.identity;
 s.port.identity=async()=>{identities++;if(identities===3)s.advance();return original();};
 await assert.rejects(executePaymentReview(r,s.port,()=>{},s.now));assert.equal(s.sends(),0);
});
