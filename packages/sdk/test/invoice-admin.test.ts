import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeAbiParameters,encodeEventTopics,type Address,type Hex} from 'viem';
import {createInvoiceAdminDraft,prepareInvoiceAdminReview,executeInvoiceAdminReview,decodeInvoiceAdminReceipt,type InvoiceAdminPort} from '../src/invoice-admin';
import {paymentsEventsAbi} from '../src/generated/abi';
import type {InvoiceSnapshot} from '../src/plans';
import type {TransactionReceipt} from '../src/execution';
const wire=JSON.parse(readFileSync(new URL('./fixtures/payment-observations.json',import.meta.url),'utf8'))[0];
const hash=`0x${'ab'.repeat(32)}` as Hex,blockHash=`0x${'cd'.repeat(32)}` as Hex,id=`0x${'ef'.repeat(32)}` as Hex;
function setup(kind:'create'|'cancel'='create'){
 const manifest=structuredClone(wire.manifest),account=wire.request.payer as Address;let clock=wire.nowMs,sends=0;
 const terms={amountDueRaw:5_000_001n,expiresAt:BigInt(Math.floor(clock/1000))+3600n,recipients:[account,manifest.aqua as Address],bps:[9000,1000],memoHash:hash};
 const invoice:InvoiceSnapshot={...terms,chainId:manifest.chainId,adapter:manifest.payments,id,merchant:account,status:'unpaid'};
 const draft=createInvoiceAdminDraft({manifest,account,chainId:manifest.chainId,now:BigInt(Math.floor(clock/1000))},kind==='create'?{kind,terms}:{kind,invoice});
 const live={chainId:manifest.chainId,block:{number:4n,hash:blockHash,timestamp:BigInt(Math.floor(clock/1000))},usdc:manifest.usdc,router:manifest.router,usdcDecimals:6,merchantNonce:3n,invoice};
 const port:InvoiceAdminPort={identity:async()=>({account,chainId:manifest.chainId}),observe:async()=>structuredClone(live),canonical:async()=>{},
  estimate:async()=>({gas:30000n,maxFeePerGas:3n,maxPriorityFeePerGas:1n,nativeBalance:1000000n}),send:async()=>{sends++;return hash;},receipt:async()=>({hash,status:'success',blockNumber:5n})};
 return {draft,live,port,account,terms,now:()=>clock,advance:()=>{clock+=20000;},sends:()=>sends};
}
test('invoice create and cancellation require separate immutable reviewed signatures',async()=>{
 for(const kind of ['create','cancel'] as const){const s=setup(kind),r=await prepareInvoiceAdminReview(s.draft,s.port,s.now);assert.equal(s.sends(),0);assert.equal(r.kind,kind);assert(Object.isFrozen(r));assert(Object.isFrozen(r.draft.intent));
  const saved:unknown[]=[];await executeInvoiceAdminReview(r,s.port,p=>saved.push(p),s.now);assert.equal(s.sends(),1);assert.equal(saved.length,1);
  await assert.rejects(()=>executeInvoiceAdminReview(r,s.port,()=>{},s.now),/new|expired|review/i);assert.equal(s.sends(),1);
 }
});
test('creation refuses changed nonce and cancellation refuses changed status or terms',async()=>{
 const c=setup(),r=await prepareInvoiceAdminReview(c.draft,c.port,c.now);c.live.merchantNonce++;
 await assert.rejects(()=>executeInvoiceAdminReview(r,c.port,()=>{},c.now),/nonce|changed/i);assert.equal(c.sends(),0);
 for(const change of ['status','amountDueRaw'] as const){const s=setup('cancel'),review=await prepareInvoiceAdminReview(s.draft,s.port,s.now);
  if(change==='status')s.live.invoice.status='paid';else s.live.invoice.amountDueRaw++;
  await assert.rejects(()=>executeInvoiceAdminReview(review,s.port,()=>{},s.now),/invoice|changed/i);assert.equal(s.sends(),0);
 }
});
test('invoice administration rejects wrong account, chain, metadata, stale blocks and absent gas',async()=>{
 const changes=[(s:ReturnType<typeof setup>)=>{s.port.identity=async()=>({account:s.live.usdc,chainId:s.live.chainId});},
  (s:ReturnType<typeof setup>)=>{s.live.chainId=999;},(s:ReturnType<typeof setup>)=>{s.live.usdcDecimals=18;},
  (s:ReturnType<typeof setup>)=>{s.live.router=s.live.usdc;},(s:ReturnType<typeof setup>)=>{s.advance();},
  (s:ReturnType<typeof setup>)=>{s.port.estimate=async()=>({gas:1n,maxFeePerGas:2n,nativeBalance:1n});}];
 for(const change of changes){const s=setup();change(s);await assert.rejects(()=>prepareInvoiceAdminReview(s.draft,s.port,s.now));assert.equal(s.sends(),0);}
});
test('invoice review expires, detects a reorg and retains its reviewed gas caps',async()=>{
 for(const kind of ['expiry','reorg','gas'] as const){const s=setup(),r=await prepareInvoiceAdminReview(s.draft,s.port,s.now);
  if(kind==='expiry')s.advance();else if(kind==='reorg')s.port.canonical=async()=>{throw Error('reorg');};else s.port.estimate=async()=>({...r.estimate,gas:r.estimate.gas+1n});
  await assert.rejects(()=>executeInvoiceAdminReview(r,s.port,()=>{},s.now));assert.equal(s.sends(),0);
 }
});
test('only the unpaid merchant may cancel, including after invoice expiry',async()=>{
 const s=setup('cancel'),ctx={...s.draft.context,now:s.terms.expiresAt+1n};
 assert.doesNotThrow(()=>createInvoiceAdminDraft(ctx,s.draft.intent));
 assert.throws(()=>createInvoiceAdminDraft({...ctx,account:s.live.usdc},s.draft.intent),/merchant/);
});
test('malformed shares, duplicate recipients and forged drafts cannot authorize signatures',async()=>{
 const s=setup();for(const terms of [{...s.terms,bps:[8000,1000]},{...s.terms,recipients:[s.account,s.account]},{...s.terms,amountDueRaw:0n}])assert.throws(()=>createInvoiceAdminDraft(s.draft.context,{kind:'create',terms}));
 await assert.rejects(()=>prepareInvoiceAdminReview(structuredClone(s.draft),s.port,s.now));
});
function receipt(kind:'create'|'cancel',s:ReturnType<typeof setup>,invoiceId=id):TransactionReceipt {
 const eventName=kind==='create'?'InvoiceCreated':'InvoiceCancelled';
 const topics=encodeEventTopics({abi:paymentsEventsAbi,eventName,args:{invoiceId,merchant:s.account}}) as Hex[];
 const data=kind==='create'?encodeAbiParameters([{type:'uint256'},{type:'uint40'},{type:'address[]'},{type:'uint16[]'},{type:'bytes32'}],[s.terms.amountDueRaw,Number(s.terms.expiresAt),s.terms.recipients,s.terms.bps,s.terms.memoHash]):'0x';
 return {hash,status:'success',blockNumber:5n,blockHash,gasUsed:30000n,effectiveGasPrice:2n,logs:[{address:s.draft.context.manifest.payments as Address,topics,data,blockNumber:5n,blockHash,transactionHash:hash,logIndex:0,removed:false}]};
}
test('creation uses the receipt event ID when concurrent transactions changed the predicted nonce',async()=>{
 const s=setup(),review=await prepareInvoiceAdminReview(s.draft,s.port,s.now),r=receipt('create',s);
 assert.notEqual(id,review.predictedInvoiceId);const result=decodeInvoiceAdminReceipt(r,{kind:'create',plan:review.plan});
 assert.equal(result.invoiceId,id);assert.equal(result.gasPaid,60000n);
});
test('creation receipts require exact terms, one event and canonical log provenance',async()=>{
 const s=setup(),review=await prepareInvoiceAdminReview(s.draft,s.port,s.now),intent={kind:'create' as const,plan:review.plan};
 for(const mutation of ['absent','duplicate','removed','hash','adapter','terms','padding','reverted'] as const){const r=receipt('create',s),log=r.logs![0]!;
  if(mutation==='absent')r.logs=[];if(mutation==='duplicate')r.logs!.push({...log});if(mutation==='removed')log.removed=true;if(mutation==='hash')log.transactionHash=id;
  if(mutation==='adapter')log.address=s.account;if(mutation==='terms')log.data=('0x'+log.data.slice(2,65)+'2'+log.data.slice(66)) as Hex;
  if(mutation==='padding')log.data=(log.data+'00') as Hex;if(mutation==='reverted')r.status='reverted';
  assert.throws(()=>decodeInvoiceAdminReceipt(r,intent),mutation);
 }
});
test('cancellation receipt binds both merchant and exact invoice ID',async()=>{
 const s=setup('cancel'),review=await prepareInvoiceAdminReview(s.draft,s.port,s.now),intent={kind:'cancel' as const,plan:review.plan};
 assert.equal(decodeInvoiceAdminReceipt(receipt('cancel',s),intent).invoiceId,id);
 assert.throws(()=>decodeInvoiceAdminReceipt(receipt('cancel',s,hash),intent));
});
