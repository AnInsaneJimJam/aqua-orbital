import {encodeFunctionData,encodeEventTopics,encodeAbiParameters,erc20Abi,zeroAddress,type Address} from 'viem';
import {manifestSchema,hashSchema} from '@orbital/shared';
import {buildDemoFaucetTx,type PlanContext} from './plans';
import {demoTokenAbi} from './generated/abi';
import type {TransactionPlan} from './codec';
import type {TransactionReceipt} from './execution';
/** Local settlement tokens are explicitly separate from the Arc USDC faucet. */
export function buildFundingFaucetTx(context:PlanContext,token:Address,nextMintAt:bigint):TransactionPlan{
 const m=manifestSchema.parse(context.manifest),entry=m.tokens.find(t=>t.address.toLowerCase()===token.toLowerCase());
 if(token.toLowerCase()!==m.usdc.toLowerCase())return buildDemoFaucetTx(context,{token,nextMintAt});
 if(!m.verified||m.chainId!==31337||context.chainId!==31337||!entry?.mock||entry.decimals!==6||entry.symbol!=='USDC'||context.now<0n||nextMintAt<0n||nextMintAt>context.now)throw Error('Local settlement fixture unavailable');
 return {chainId:31337,account:context.account,to:token,value:0n,data:encodeFunctionData({abi:demoTokenAbi,functionName:'faucet'}),label:'Claim 1,000 local USDC fixtures'};
}
export function validateFundingPlan(context:PlanContext,token:Address,plan:TransactionPlan){
 const expected=buildFundingFaucetTx(context,token,0n);
 if(plan.chainId!==expected.chainId||plan.account.toLowerCase()!==expected.account.toLowerCase()||plan.to.toLowerCase()!==expected.to.toLowerCase()||plan.value!==0n||plan.data.toLowerCase()!==expected.data.toLowerCase()||plan.label!==expected.label)throw Error('Invalid saved faucet request');return expected;
}
export function decodeFundingReceipt(receipt:TransactionReceipt,context:PlanContext,token:Address,plan:TransactionPlan){
 validateFundingPlan(context,token,plan);const asset=context.manifest.tokens.find(t=>t.address.toLowerCase()===token.toLowerCase())!;
 if(receipt.status!=='success'||!hashSchema.safeParse(receipt.hash).success||!hashSchema.safeParse(receipt.blockHash).success||!receipt.logs)throw Error('Faucet receipt unavailable');
 const topics=encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:zeroAddress,to:plan.account}}),data=encodeAbiParameters([{type:'uint256'}],[1000n*10n**BigInt(asset.decimals)]);
 const logs=receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase()&&l.topics[0]===topics[0]);
 if(logs.length!==1)throw Error('Faucet mint was not established');const l=logs[0]!;
 if(l.removed||l.blockNumber!==receipt.blockNumber||l.blockHash!==receipt.blockHash||l.transactionHash!==receipt.hash||l.data!==data||l.topics.length!==topics.length||l.topics.some((t,i)=>t.toLowerCase()!==(topics[i] as string).toLowerCase()))throw Error('Faucet mint receipt mismatch');
 return {symbol:asset.symbol,amount:'1000',hash:receipt.hash};
}
