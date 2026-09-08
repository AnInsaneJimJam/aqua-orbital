import {erc20Abi,type Address} from 'viem';
import type {DeploymentManifest,Token} from '@orbital/shared';
import type {Session} from './WalletProvider';
import {createWalletExecutionPort,publicClient as client} from './transactionPort';
import {selectedChain} from './config';
export async function readSwapBalance(wallet:Pick<Session,'identity'|'send'>,manifest:DeploymentManifest,token:Token,current:()=>boolean){
 const port=createWalletExecutionPort(wallet,current),identity=await port.identity();
 if(!identity.account||identity.chainId!==selectedChain.id||manifest.chainId!==selectedChain.id||!manifest.verified)throw Error('Select the supported wallet network');
 const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);port.guard();
 if(chainId!==manifest.chainId||block.number===null||!block.hash)throw Error('Balance RPC network unavailable');
 const [amountRaw,decimals]=await Promise.all([port.read({hash:block.hash},identity.account,erc20Abi,'balanceOf',token.address as Address,[identity.account]),port.read({hash:block.hash},identity.account,erc20Abi,'decimals',token.address as Address)]);
 await port.canonical({number:block.number,hash:block.hash});const finalIdentity=await port.identity(),now=Date.now(),timestamp=Number(block.timestamp)*1000;
 if(finalIdentity.account?.toLowerCase()!==identity.account.toLowerCase()||finalIdentity.chainId!==identity.chainId||typeof amountRaw!=='bigint'||amountRaw<0n||decimals!==token.decimals||!Number.isSafeInteger(timestamp)||timestamp>now+1000||now-timestamp>=20000)throw Error('Balance observation is stale or inconsistent');
 return {amountRaw,blockNumber:block.number,blockHash:block.hash,expiresAtMs:timestamp+20000,token};
}
