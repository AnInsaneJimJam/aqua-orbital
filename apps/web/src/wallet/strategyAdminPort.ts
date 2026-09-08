import type {Address,Hex} from 'viem';
import {lifecycleAbi,hashOrder,type StrategyAdminPort,type StrategyAdminLive,type Config,type TransactionPlan} from '@orbital/sdk';
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
  const [config,state,availability]=await Promise.all([read('getStrategyConfig'),read('getStrategyState'),read('getStrategyAvailability')]);
  await canonical({number:block.number,hash:block.hash});await verifyDeployment();guard();
  const s=state as {maker:Address;configHash:Hex;status:1|2;version:bigint},a=availability as {token:Address;liveTokenCount:number;aquaAllocationRaw:bigint;aquaAllowanceRaw:bigint}[];
  return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},config:config as Config,maker:s.maker,configHash:s.configHash,status:s.status,version:s.version,
   availability:a.map(v=>({token:v.token,liveTokenCount:v.liveTokenCount,allocation:v.aquaAllocationRaw,allowance:v.aquaAllowanceRaw}))} satisfies StrategyAdminLive;
 }};
}
