import {erc20Abi,type Address,type Hex} from 'viem';
import {lifecycleAbi,aquaAbi,hashOrder,hashConfig,type StrategyAdminPort,type StrategyAdminLive,type Config,type TransactionPlan} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';
import {createWalletExecutionPort,publicClient as client} from './transactionPort';
export function createStrategyAdminPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,verifyDeployment:()=>Promise<void>,recoveryPlan?:TransactionPlan):StrategyAdminPort{
 const port=createWalletExecutionPort(wallet,current,recoveryPlan),{guard,canonical}=port;
 return {...port,observe:async draft=>{
  guard();await verifyDeployment();guard();const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
  if(chainId!==selectedChain.id||chainId!==draft.context.chainId||block.number===null||!block.hash)throw Error('Wrong strategy RPC network');
  const {manifest:m,account}=draft.context,id=hashOrder(draft.input.order);
  const read=(fn:string)=>port.read({hash:block.hash!},account,lifecycleAbi,fn,m.router as Address,[id]);
  if(draft.intent.kind==='publish'){
   const nextNonce=await port.read({hash:block.hash},account,lifecycleAbi,'nextMakerNonce',m.router as Address,[account]) as bigint;
   if(nextNonce<=draft.input.config.makerNonce){
    const availability=await Promise.all(draft.input.config.tokens.map(async token=>{
     const [raw,allowance,balance]=await Promise.all([
      port.read({hash:block.hash!},account,aquaAbi,'rawBalances',m.aqua as Address,[account,m.router,id,token]),
      port.read({hash:block.hash!},account,erc20Abi,'allowance',token,[account,m.aqua]),
      port.read({hash:block.hash!},account,erc20Abi,'balanceOf',token,[account])]);
     const [allocation,liveTokenCount]=raw as readonly [bigint,number];return {token,allocation,liveTokenCount,allowance:allowance as bigint,walletBalance:balance as bigint};
    }));
    await canonical({number:block.number,hash:block.hash});await verifyDeployment();guard();
    return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},config:draft.input.config,maker:account,configHash:hashConfig(draft.input.config),status:0,version:0n,nextNonce,availability};
   }
  }
  const [config,state,availability]=await Promise.all([read('getStrategyConfig'),read('getStrategyState'),read('getStrategyAvailability')]);
  await canonical({number:block.number,hash:block.hash});await verifyDeployment();guard();
  const s=state as {maker:Address;configHash:Hex;status:1|2;version:bigint},a=availability as {token:Address;liveTokenCount:number;aquaAllocationRaw:bigint;aquaAllowanceRaw:bigint}[];
  return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},config:config as Config,maker:s.maker,configHash:s.configHash,status:s.status,version:s.version,
   availability:a.map(v=>({token:v.token,liveTokenCount:v.liveTokenCount,allocation:v.aquaAllocationRaw,allowance:v.aquaAllowanceRaw}))} satisfies StrategyAdminLive;
 }};
}
