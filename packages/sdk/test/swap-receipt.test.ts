import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeAbiParameters,encodeEventTopics,type Hex} from 'viem';
import {createSwapDraft} from '../src/swap-review';
import {createSwapReceiptIntent,decodeSwapReceipt} from '../src/swap-receipt';
import {swapEventsAbi} from '../src/generated/abi';
import type {TransactionReceipt} from '../src/execution';
const hash=`0x${'ab'.repeat(32)}` as Hex,blockHash=`0x${'cd'.repeat(32)}` as Hex;
function fixture(){
 const f=JSON.parse(readFileSync(new URL('./fixtures/swap-quote-observation.json',import.meta.url),'utf8')),draft=createSwapDraft(f.observed,200,f.manifest,f.request,{deadlineSeconds:180},1700000003200),intent=createSwapReceiptIntent(draft),i=draft.input;
 const args={maker:i.config.maker,orderHash:i.quote.orderHash as Hex,taker:draft.context.account,recipient:i.recipient,tokenInIndex:0,tokenOutIndex:2,grossInputRaw:i.amountInRaw,netInputRaw:i.amountInRaw-BigInt(i.quote.feeRaw),feeRaw:BigInt(i.quote.feeRaw),amountOutRaw:BigInt(i.quote.amountOutRaw)+7n,version:BigInt(i.quote.stateVersion)+2n,crossedTickKeys:[i.config.tickKeys[1]!],crossedInward:[true]};
 const receipt:TransactionReceipt={hash,status:'success',blockNumber:5n,blockHash,gasUsed:40000n,effectiveGasPrice:2n,logs:[]};
 const encode=()=>{receipt.logs=[{address:i.config.router,topics:encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted',args}) as Hex[],data:encodeAbiParameters(swapEventsAbi[0].inputs.filter(v=>!v.indexed),[args.recipient,args.tokenInIndex,args.tokenOutIndex,args.grossInputRaw,args.netInputRaw,args.feeRaw,args.amountOutRaw,args.version,args.crossedTickKeys,args.crossedInward]),blockNumber:5n,blockHash,transactionHash:hash,logIndex:3,removed:false}];};
 encode();return {intent,args,receipt,encode};
}
test('swap success uses actual receipt output, fee and ordered crossings, not the quote estimate',()=>{
 const f=fixture(),result=decodeSwapReceipt(f.receipt,f.intent);
 assert.equal(result.amountOutRaw,f.args.amountOutRaw);assert.equal(result.grossInputRaw,f.args.grossInputRaw);assert.equal(result.feeRaw,f.args.feeRaw);assert.equal(result.gasPaid,80000n);assert.deepEqual(result.crossings,[{tickKey:f.args.crossedTickKeys[0],inward:true}]);
});
test('reverts, absent/duplicate events and wrong emitter or provenance never report a successful swap',()=>{
 for(const mutate of [(r:TransactionReceipt)=>{r.status='reverted';},(r:TransactionReceipt)=>{r.logs=[];},(r:TransactionReceipt)=>{r.logs!.push({...r.logs![0]!});},(r:TransactionReceipt)=>{r.logs![0]!.address='0x0000000000000000000000000000000000000011';},(r:TransactionReceipt)=>{r.logs![0]!.blockHash=hash;},(r:TransactionReceipt)=>{r.logs![0]!.transactionHash=blockHash;},(r:TransactionReceipt)=>{r.logs![0]!.removed=true;},(r:TransactionReceipt)=>{r.logs![0]!.data+='00';}]){const f=fixture();mutate(f.receipt);assert.throws(()=>decodeSwapReceipt(f.receipt,f.intent));}
});
test('receipt roles, exact input, conservative minimum, fee arithmetic and crossing bounds remain bound to review',()=>{
 for(const mutate of [(a:ReturnType<typeof fixture>['args'])=>{a.tokenOutIndex=1;},(a:ReturnType<typeof fixture>['args'])=>{a.recipient=a.maker;},(a:ReturnType<typeof fixture>['args'])=>{a.grossInputRaw++;},(a:ReturnType<typeof fixture>['args'])=>{a.netInputRaw++;},(a:ReturnType<typeof fixture>['args'])=>{a.feeRaw++;},(a:ReturnType<typeof fixture>['args'])=>{a.amountOutRaw=1n;},(a:ReturnType<typeof fixture>['args'])=>{a.version=0n;},(a:ReturnType<typeof fixture>['args'])=>{a.crossedInward=[];},(a:ReturnType<typeof fixture>['args'])=>{a.crossedTickKeys=[123n];}]){const f=fixture();mutate(f.args);f.encode();assert.throws(()=>decodeSwapReceipt(f.receipt,f.intent));}
});
test('altering recovered receipt intent cannot change the plan, token metadata or spend constraints',()=>{
 for(const mutate of [(i:ReturnType<typeof fixture>['intent'])=>{i.plan.data+='00';},(i:ReturnType<typeof fixture>['intent'])=>{i.minimumOutRaw='1';},(i:ReturnType<typeof fixture>['intent'])=>{i.config.decimals[0]=18;},(i:ReturnType<typeof fixture>['intent'])=>{i.request.recipient=i.config.maker;}]){const f=fixture(),intent=structuredClone(f.intent);mutate(intent);assert.throws(()=>decodeSwapReceipt(f.receipt,intent));}
});
