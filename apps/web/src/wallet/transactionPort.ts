import {createPublicClient,http,decodeFunctionResult,encodeFunctionData,encodeFunctionResult,type Abi,type Address} from 'viem';
import type {ExecutionPort,TransactionPlan,PaymentBlock,ReceiptLog} from '@orbital/sdk';
import type {Session} from './WalletProvider';
import {selectedChain} from './config';
// Never select a financial RPC from an invoice or quote response.
export const publicClient=createPublicClient({chain:selectedChain,transport:http(undefined,{timeout:10000,retryCount:0})});
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function createWalletExecutionPort(wallet:Pick<Session,'identity'|'send'>,current:()=>boolean,recoveryPlan?:TransactionPlan){
 const client=publicClient;let submittedPlan=recoveryPlan;
 const guard=()=>{if(!current())throw Error('Inputs or wallet changed. Review again.');};
 async function canonical(block:Pick<PaymentBlock,'number'|'hash'>){
  guard();const value=await client.getBlock({blockNumber:block.number});guard();
  if(!value.hash||!same(value.hash,block.hash))throw Error('Chain reorganized. Refresh the review.');
 }
 async function read(block:Pick<PaymentBlock,'hash'>,account:Address,abi:Abi,functionName:string,to:Address,args?:readonly unknown[]){
  guard();const data=encodeFunctionData({abi,functionName,args});
  const result=await client.call({account,to,data,value:0n,blockHash:block.hash,requireCanonical:true,batch:false});guard();
  if(!result.data||result.data.length>524290)throw Error('Invalid contract RPC result');
  const decoded=decodeFunctionResult({abi,functionName,data:result.data});
  if(encodeFunctionResult({abi,functionName,result:decoded}).toLowerCase()!==result.data.toLowerCase())throw Error('Noncanonical contract RPC result');return decoded;
 }
 const execution:ExecutionPort={
  identity:async()=>{guard();const identity=await wallet.identity();guard();return identity;},
  estimate:async plan=>{
   guard();const [chainId,block]=await Promise.all([client.getChainId(),client.getBlock()]);guard();
   if(chainId!==plan.chainId||block.number===null||!block.hash)throw Error('Wrong transaction RPC network');
   const tx={account:plan.account,to:plan.to,data:plan.data,value:plan.value};
   // Exact calldata, without balance, allowance or state overrides.
   await client.call({...tx,blockHash:block.hash,requireCanonical:true,batch:false});guard();
   const [gas,fees,nativeBalance]=await Promise.all([client.estimateGas({...tx,blockNumber:block.number}),client.estimateFeesPerGas(),client.getBalance({address:plan.account,blockNumber:block.number})]);
   await canonical({number:block.number,hash:block.hash});guard();
   return {gas:(gas*120n+99n)/100n,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,nativeBalance};
  },
  send:async(plan,fees)=>{guard();submittedPlan=Object.freeze({...plan});return wallet.send(plan,fees);},
  receipt:async hash=>{
   // Public recovery survives changes to the active account or feature inputs.
   if(await client.getChainId()!==selectedChain.id)throw Error('Wrong receipt RPC network');
   const expected=submittedPlan;
   // Inspect the original transaction before waiting. Repricing may change fees,
   // but it cannot change the sender, nonce, destination, calldata or value.
   let original;try{original=await client.getTransaction({hash});}catch{/* The wallet may return before RPC propagation. */}
   const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:120000,pollingInterval:2000,
    onReplaced:replacement=>{if(same(replacement.replacedTransaction.hash,hash))original=replacement.replacedTransaction;}});
   const actualHash=receipt.transactionHash,tx=await client.getTransaction({hash:actualHash});
   if(!same(actualHash,hash)){
    if(!original||!expected||!original.to||!same(original.hash,hash)||!same(original.from,expected.account)||!same(original.to,expected.to)||!same(original.input,expected.data)||original.value!==expected.value||tx.nonce!==original.nonce)throw Error('Replacement identity unavailable. Keep the original hash and check your wallet activity.');
   }
   if(!expected||!tx.to||!tx.blockHash||!same(tx.hash,actualHash)||!same(tx.blockHash,receipt.blockHash)||tx.blockNumber!==receipt.blockNumber||!same(tx.from,expected.account)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==expected.value
    ||!receipt.to||!same(receipt.from,expected.account)||!same(receipt.to,expected.to)||!['success','reverted'].includes(receipt.status)||typeof receipt.gasUsed!=='bigint'||receipt.gasUsed<0n||typeof receipt.effectiveGasPrice!=='bigint'||receipt.effectiveGasPrice<0n)throw Error('Receipt transaction does not match the reviewed action');
   const block=await client.getBlock({blockNumber:receipt.blockNumber});
   if(!block.hash||!same(block.hash,receipt.blockHash))throw Error('Receipt is no longer canonical');
   return {hash:receipt.transactionHash,...(!same(actualHash,hash)?{repricedFrom:hash}:{}),status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice,logs:receipt.logs as ReceiptLog[]};
  }
 };
 return {...execution,canonical,read,guard};
}
