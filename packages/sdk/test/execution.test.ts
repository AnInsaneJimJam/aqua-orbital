import test from 'node:test';
import assert from 'node:assert/strict';
import {executeReviewed, resumeTransaction, type ExecutionPort, type PendingTransaction, type TransactionPlan} from '../src/index';
const account='0x0000000000000000000000000000000000000001' as const;
const hash=`0x${'ab'.repeat(32)}` as const;
const plan:TransactionPlan={chainId:31337,account,to:'0x0000000000000000000000000000000000000002',data:'0x12345678',value:0n,label:'Test transfer'};
function port(overrides:Partial<ExecutionPort>={}):ExecutionPort {
 return {identity:async()=>({account,chainId:31337}),estimate:async()=>({gas:21000n,maxFeePerGas:3n,nativeBalance:100000n}),send:async()=>hash,receipt:async()=>({hash,status:'success',blockNumber:2n}),...overrides};
}
test('persists a submitted hash before waiting and resumes without sending again',async()=>{
 let pending:PendingTransaction|undefined;let sends=0;
 const p=port({send:async()=>{sends++;return hash;},receipt:async()=>{throw Error('RPC offline');}});
 await assert.rejects(executeReviewed(plan,p,v=>{pending=v;}),/RPC offline/);
 assert.equal(pending?.hash,hash);assert.equal(sends,1);
 const receipt=await resumeTransaction(pending!,port({send:async()=>{throw Error('must not resubmit');}}));
 assert.equal(receipt.status,'success');
});
test('wrong network and insufficient gas never request a signature',async()=>{
 const send=async()=>{assert.fail('unexpected signature');return hash;};
 await assert.rejects(executeReviewed(plan,port({identity:async()=>({account,chainId:1}),send}),()=>{}),/network/i);
 await assert.rejects(executeReviewed(plan,port({estimate:async()=>({gas:21000n,maxFeePerGas:5n,nativeBalance:1n}),send}),()=>{}),/gas/i);
});
test('account changes during gas estimation invalidate review',async()=>{
 let changed=false;
 const p=port({identity:async()=>({account:changed?plan.to:account,chainId:31337}),estimate:async()=>{changed=true;return {gas:21000n,maxFeePerGas:1n,nativeBalance:99999n};},send:async()=>{assert.fail('unexpected signature');return hash;}});
 await assert.rejects(executeReviewed(plan,p,()=>{}),/wallet/i);
});
test('rejected signatures are propagated without a pending receipt',async()=>{
 let stored=false;
 await assert.rejects(executeReviewed(plan,port({send:async()=>{throw Object.assign(Error('User rejected request'),{code:4001});}}),()=>{stored=true;}),/rejected/);
 assert.equal(stored,false);
});
test('receipt failure is distinct from signature rejection and cannot report success',async()=>{
 const result=await executeReviewed(plan,port({receipt:async()=>({hash,status:'reverted',blockNumber:3n})}),()=>{});
 assert.equal(result.status,'reverted');
});
test('resume rejects malformed or cross-network receipts',async()=>{
 await assert.rejects(resumeTransaction({schemaVersion:1,hash,chainId:1,account,label:'Swap'},port()),/network/i);
 await assert.rejects(resumeTransaction({schemaVersion:1,hash:'0x12',chainId:31337,account,label:'Swap'},port()),/record/i);
});
test('asynchronous execution retains a frozen copy of the reviewed transaction',async()=>{
 const mutable={...plan};
 const p=port({estimate:async tx=>{
  mutable.to=account; mutable.data='0xdeadbeef';
  assert.equal(Object.isFrozen(tx),true);
  return {gas:21000n,maxFeePerGas:1n,nativeBalance:99999n};
 },send:async tx=>{assert.equal(tx.to,plan.to);assert.equal(tx.data,plan.data);return hash;}});
 await executeReviewed(mutable,p,()=>{});
});
test('mismatched receipt hashes cannot report confirmation of the reviewed transaction',async()=>{
 const other=`0x${'cd'.repeat(32)}` as const;
 await assert.rejects(executeReviewed(plan,port({receipt:async()=>({hash:other,status:'success',blockNumber:2n})}),()=>{}),/receipt/i);
 await assert.rejects(resumeTransaction({schemaVersion:1,hash,chainId:31337,account,label:'Swap'},port({receipt:async()=>({hash:other,status:'success',blockNumber:2n})})),/receipt/i);
});
