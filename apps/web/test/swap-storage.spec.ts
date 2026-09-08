import {test,expect} from '@playwright/test';
import {encodeFunctionData,erc20Abi,type Address} from 'viem';
import {createSwapDraft,createSwapReceiptIntent} from '@orbital/sdk';
import wire from '../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};
import {decodePendingSwap,encodePendingSwap,type PendingSwap} from '../src/features/swapStorage';

function record(stage:'approval'|'swap'):PendingSwap{
 const d=createSwapDraft(wire.observed,200,wire.manifest,wire.request,{deadlineSeconds:180},1700000003200);
 const intent=createSwapReceiptIntent(d),plan=stage==='swap'?intent.plan:{...intent.plan,to:wire.request.tokenIn as Address,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[intent.plan.to,BigInt(wire.request.amountInRaw)]})};
 return {schemaVersion:1,stage,plan,intent,transaction:{schemaVersion:1,chainId:plan.chainId,account:plan.account,label:plan.label,hash:`0x${'ab'.repeat(32)}`},tokenIn:wire.manifest.tokens.find(t=>t.address===wire.request.tokenIn)!,tokenOut:wire.manifest.tokens.find(t=>t.address===wire.request.tokenOut)!};
}
const decode=(p:PendingSwap)=>decodePendingSwap(encodePendingSwap(p),p.transaction.chainId,p.transaction.account);
test('saved swap and exact approval recovery reject altered destinations, spenders and amounts',()=>{
 for(const stage of ['approval','swap'] as const){const p=record(stage);expect(decode(p)).toEqual(p);
  expect(()=>decode({...p,plan:{...p.plan,to:p.tokenOut.address as Address}})).toThrow(/transaction mismatch/);
  expect(()=>decode({...p,plan:{...p.plan,data:'0x12345678'}})).toThrow(/transaction mismatch/);
 }
 const p=record('approval');
 for(const args of [[p.tokenOut.address,BigInt(wire.request.amountInRaw)],[p.intent.plan.to,BigInt(wire.request.amountInRaw)+1n]] as const)
  expect(()=>decode({...p,plan:{...p.plan,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:args as readonly [Address,bigint]})}})).toThrow(/transaction mismatch/);
});
test('saved swaps bind wallet, network, transaction hash and token precision',()=>{
 const p=record('swap'),raw=encodePendingSwap(p);
 expect(()=>decodePendingSwap(raw,p.transaction.chainId+1,p.transaction.account)).toThrow();
 expect(()=>decodePendingSwap(raw,p.transaction.chainId,p.tokenOut.address)).toThrow();
 expect(()=>decode({...p,transaction:{...p.transaction,hash:'0x1234'}})).toThrow();
 expect(()=>decode({...p,tokenOut:{...p.tokenOut,decimals:6}})).toThrow();
 expect(()=>decode({...p,intent:{...p.intent,minimumOutRaw:'1'}})).toThrow();
});
