import {erc20Abi,type Abi,type Address,type Hex} from 'viem';
import {lifecycleAbi,routerAbi,takerData,type Config,type SwapPort,type SwapLiveState,type TransactionPlan} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';
import {createWalletExecutionPort,publicClient as client} from './transactionPort';
export function createSwapPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,verifyDeployment:()=>Promise<void>,recoveryPlan?:TransactionPlan):SwapPort {
 const port=createWalletExecutionPort(wallet,current,recoveryPlan),{guard,canonical}=port;
 return {...port,observe:async draft=>{
  guard();await verifyDeployment();guard();
  const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
  if(chainId!==selectedChain.id||chainId!==draft.context.chainId||block.number===null||!block.hash)throw Error('Wrong swap RPC network');
  const {input:i,context:c}=draft,router=c.manifest.router as Address,hash=i.quote.orderHash as Hex;
  const read=(abi:Abi,name:string,to:Address,args?:readonly unknown[])=>port.read({hash:block.hash!},c.account,abi,name,to,args);
  const inputIndex=i.config.tokens.findIndex(t=>t.toLowerCase()===i.tokenIn.toLowerCase()),outputIndex=i.config.tokens.findIndex(t=>t.toLowerCase()===i.tokenOut.toLowerCase());
  const data=takerData({taker:c.account,recipient:i.recipient,minimum:i.minimumOutRaw,deadline:i.deadline,input:inputIndex,output:outputIndex,maxCrossings:i.maxCrossings});
  const [config,state,available,balanceRaw,allowanceRaw,inputDecimals,outputDecimals,quote]=await Promise.all([
   read(lifecycleAbi,'getStrategyConfig',router,[hash]),read(lifecycleAbi,'getStrategyState',router,[hash]),read(lifecycleAbi,'getStrategyAvailability',router,[hash]),
   read(erc20Abi,'balanceOf',i.tokenIn,[c.account]),read(erc20Abi,'allowance',i.tokenIn,[c.account,router]),read(erc20Abi,'decimals',i.tokenIn),read(erc20Abi,'decimals',i.tokenOut),
   read(routerAbi,'quote',router,[i.order,i.amountInRaw,data])
  ]);
  const s=state as {maker:Address;configHash:Hex;status:number;version:bigint},a=available as {token:Address;live:boolean;liveTokenCount:number;backingValid:boolean;fundingCeilingRaw:bigint}[],q=quote as readonly [bigint,bigint,Hex];
  if(a.length!==i.config.tokens.length||a.some((v,n)=>v.token.toLowerCase()!==i.config.tokens[n]!.toLowerCase()))throw Error('Invalid maker inventory response');
  await canonical({number:block.number,hash:block.hash});
  return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},config:config as Config,maker:s.maker,configHash:s.configHash,status:s.status,version:s.version,balanceRaw,allowanceRaw,inputDecimals,outputDecimals,
   liveTokens:a.every(v=>v.live&&v.liveTokenCount===a.length),backingValid:a.every(v=>v.backingValid),outputFundingRaw:a[outputIndex]!.fundingCeilingRaw,quotedInputRaw:q[0],quotedOutputRaw:q[1],quotedOrderHash:q[2]} as SwapLiveState;
 }};
}
