import {createPublicClient,http,erc20Abi,decodeFunctionResult,encodeFunctionData,encodeFunctionResult,type Abi,type Address,type Hex} from 'viem';
import {paymentsReadAbi,type PaymentPort,type PaymentLiveState,type PaymentBlock,type TransactionPlan} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';

// Use the configured application RPC, never a URL supplied by a quote or invoice.
const client=createPublicClient({chain:selectedChain,transport:http(undefined,{timeout:10000,retryCount:0})});
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function createPaymentPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,verifyDeployment:()=>Promise<void>,recoveryPlan?:TransactionPlan):PaymentPort {
 let submittedPlan=recoveryPlan;
 const guard=()=>{if(!current())throw Error('Payment inputs or wallet changed. Review again.');};
 async function canonical(block:Pick<PaymentBlock,'number'|'hash'>){
  guard();const value=await client.getBlock({blockNumber:block.number});guard();
  if(!value.hash||!same(value.hash,block.hash))throw Error('Chain reorganized. Refresh the payment.');
 }
 return {
  identity:async()=>{guard();const identity=await wallet.identity();guard();return identity;},
  canonical,
  observe:async draft=>{
   guard();await verifyDeployment();guard();
   const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
   if(chainId!==selectedChain.id||chainId!==draft.context.chainId||block.number===null||!block.hash)throw Error('Wrong payment RPC network');
   const {manifest:m,account}=draft.context,r=draft.request;
   async function read(abi:Abi,functionName:string,to:Address,args?:readonly unknown[]){
    const data=encodeFunctionData({abi,functionName,args});
    const result=await client.call({account,to,data,value:0n,blockHash:block.hash!,requireCanonical:true,batch:false});guard();
    if(!result.data)throw Error('Empty payment RPC result');
    const decoded=decodeFunctionResult({abi,functionName,data:result.data});
    if(encodeFunctionResult({abi,functionName,result:decoded}).toLowerCase()!==result.data.toLowerCase())throw Error('Noncanonical payment RPC result');
    return decoded;
   }
   const [raw,usdc,router,allowedToken,balanceRaw,allowanceRaw,decimals,usdcDecimals]=await Promise.all([
    read(paymentsReadAbi,'getInvoice',m.payments as Address,[r.invoiceId]),read(paymentsReadAbi,'USDC',m.payments as Address),read(paymentsReadAbi,'ROUTER',m.payments as Address),read(paymentsReadAbi,'allowedToken',m.payments as Address,[r.tokenIn]),
    read(erc20Abi,'balanceOf',r.tokenIn as Address,[account]),read(erc20Abi,'allowance',r.tokenIn as Address,[account,m.payments]),read(erc20Abi,'decimals',r.tokenIn as Address),read(erc20Abi,'decimals',m.usdc as Address)
   ]);
   const invoice=raw as {merchant:Address;amountDueRaw:bigint;expiresAt:number;recipients:Address[];bps:number[];memoHash:Hex;status:number};
   if(invoice.status!==1)throw Error('Invoice is no longer unpaid. Refresh its terms.');
   await canonical({number:block.number,hash:block.hash});
   return {chainId,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},invoice:{...invoice,expiresAt:BigInt(invoice.expiresAt),status:'unpaid',chainId,adapter:m.payments as Address,id:r.invoiceId as Hex},usdc,router,allowedToken,balanceRaw,allowanceRaw,decimals,usdcDecimals} as PaymentLiveState;
  },
  estimate:async plan=>{
   guard();const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
   if(chainId!==plan.chainId||block.number===null||!block.hash)throw Error('Wrong payment RPC network');
   const tx={account:plan.account,to:plan.to,data:plan.data,value:plan.value};
   // No balance/allowance/state overrides. Approval is simulated separately;
   // payment only becomes reviewable after the actual allowance exists.
   await client.call({...tx,blockHash:block.hash,requireCanonical:true,batch:false});guard();
   const [gas,fees,nativeBalance]=await Promise.all([client.estimateGas({...tx,blockNumber:block.number}),client.estimateFeesPerGas(),client.getBalance({address:plan.account,blockNumber:block.number})]);
   await canonical({number:block.number,hash:block.hash});guard();
   return {gas:(gas*120n+99n)/100n,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,nativeBalance};
  },
  send:async(plan,fees)=>{guard();submittedPlan=Object.freeze({...plan});return wallet.send(plan,fees);},
  receipt:async hash=>{
   // Public recovery survives account changes and never asks for a signature.
   if(await client.getChainId()!==selectedChain.id)throw Error('Wrong receipt RPC network');
   const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:120000,pollingInterval:2000});
   if(!same(receipt.transactionHash,hash))throw Error('Transaction was replaced. Check the submitted hash before retrying.');
   const tx=await client.getTransaction({hash}),expected=submittedPlan;
   if(!expected||!tx.to||!same(tx.from,expected.account)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==expected.value)throw Error('Receipt transaction does not match the reviewed action');
   const block=await client.getBlock({blockNumber:receipt.blockNumber});
   if(!block.hash||!same(block.hash,receipt.blockHash))throw Error('Receipt is no longer canonical');
   return {hash:receipt.transactionHash,status:receipt.status,blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice};
  }
 };
}
