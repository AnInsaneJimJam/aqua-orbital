import {erc20Abi,type Abi,type Address,type Hex} from 'viem';
import {paymentsReadAbi,type InvoiceAdminPort,type InvoiceAdminLive,type TransactionPlan} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';
import {createWalletExecutionPort,publicClient as client} from './transactionPort';
export function createInvoiceAdminPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,verifyDeployment:()=>Promise<void>,recoveryPlan?:TransactionPlan):InvoiceAdminPort {
 const port=createWalletExecutionPort(wallet,current,recoveryPlan),{guard,canonical}=port;
 return {...port,observe:async draft=>{
  guard();await verifyDeployment();guard();const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
  if(chainId!==selectedChain.id||chainId!==draft.context.chainId||block.number===null||!block.hash)throw Error('Wrong invoice RPC network');
  const {manifest:m,account}=draft.context;
  const read=(abi:Abi,fn:string,to:Address,args?:readonly unknown[])=>port.read({hash:block.hash!},account,abi,fn,to,args);
  const [usdc,router,usdcDecimals,state]=await Promise.all([read(paymentsReadAbi,'USDC',m.payments as Address),read(paymentsReadAbi,'ROUTER',m.payments as Address),read(erc20Abi,'decimals',m.usdc as Address),
   draft.intent.kind==='create'?read(paymentsReadAbi,'nextMerchantNonce',m.payments as Address,[account]):read(paymentsReadAbi,'getInvoice',m.payments as Address,[draft.intent.invoice.id])]);
  await canonical({number:block.number,hash:block.hash});await verifyDeployment();guard();
  const live={chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},usdc,router,usdcDecimals} as InvoiceAdminLive;
  if(draft.intent.kind==='create')live.merchantNonce=state as bigint;
  else{
   const invoice=state as {merchant:Address;amountDueRaw:bigint;expiresAt:number;recipients:Address[];bps:number[];memoHash:Hex;status:number};
   if(invoice.status!==1)throw Error('Invoice is no longer unpaid. Refresh its terms.');
   live.invoice={...invoice,expiresAt:BigInt(invoice.expiresAt),status:'unpaid',chainId,adapter:m.payments as Address,id:draft.intent.invoice.id};
  }
  return live;
 }};
}
