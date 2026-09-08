import {erc20Abi,type Abi,type Address,type Hex} from 'viem';
import {paymentsReadAbi,type PaymentPort,type PaymentLiveState,type TransactionPlan} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';
import {createWalletExecutionPort,publicClient as client} from './transactionPort';
export function createPaymentPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,verifyDeployment:()=>Promise<void>,recoveryPlan?:TransactionPlan):PaymentPort {
 const port=createWalletExecutionPort(wallet,current,recoveryPlan),{guard,canonical}=port;
 return {...port,
  observe:async draft=>{
   guard();await verifyDeployment();guard();
   const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
   if(chainId!==selectedChain.id||chainId!==draft.context.chainId||block.number===null||!block.hash)throw Error('Wrong payment RPC network');
   const {manifest:m,account}=draft.context,r=draft.request;
   const read=(abi:Abi,functionName:string,to:Address,args?:readonly unknown[])=>port.read({hash:block.hash!},account,abi,functionName,to,args);
   const [raw,usdc,router,allowedToken,balanceRaw,allowanceRaw,decimals,usdcDecimals]=await Promise.all([
    read(paymentsReadAbi,'getInvoice',m.payments as Address,[r.invoiceId]),read(paymentsReadAbi,'USDC',m.payments as Address),read(paymentsReadAbi,'ROUTER',m.payments as Address),read(paymentsReadAbi,'allowedToken',m.payments as Address,[r.tokenIn]),
    read(erc20Abi,'balanceOf',r.tokenIn as Address,[account]),read(erc20Abi,'allowance',r.tokenIn as Address,[account,m.payments]),read(erc20Abi,'decimals',r.tokenIn as Address),read(erc20Abi,'decimals',m.usdc as Address)
   ]);
   const invoice=raw as {merchant:Address;amountDueRaw:bigint;expiresAt:number;recipients:Address[];bps:number[];memoHash:Hex;status:number};
   if(invoice.status!==1)throw Error('Invoice is no longer unpaid. Refresh its terms.');
   await canonical({number:block.number,hash:block.hash});
   return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},invoice:{...invoice,expiresAt:BigInt(invoice.expiresAt),status:'unpaid',chainId,adapter:m.payments as Address,id:r.invoiceId as Hex},usdc,router,allowedToken,balanceRaw,allowanceRaw,decimals,usdcDecimals} as PaymentLiveState;
  }
 };
}
