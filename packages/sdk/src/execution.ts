import {isAddress, type Address, type Hex} from 'viem';
import type {TransactionPlan} from './index';

export type ReceiptLog={address:Address;topics:Hex[];data:Hex;blockNumber:bigint;blockHash:Hex;transactionHash:Hex;logIndex:number;removed:boolean};
export type TransactionReceipt={hash:Hex;repricedFrom?:Hex;status:'success'|'reverted';blockNumber:bigint;blockHash?:Hex;gasUsed?:bigint;effectiveGasPrice?:bigint;logs?:ReceiptLog[]};
export type TransactionFees={gas:bigint;maxFeePerGas:bigint;maxPriorityFeePerGas?:bigint};
export type TransactionEstimate=TransactionFees&{nativeBalance:bigint;nativeSpend?:bigint};
/** Wallet/provider boundary. A fixture port is not evidence of Privy execution. */
export type ExecutionPort={
 identity:()=>Promise<{account?:Address;chainId:number}>;
 estimate:(plan:TransactionPlan)=>Promise<TransactionEstimate>;
 send:(plan:TransactionPlan,fees?:TransactionFees)=>Promise<Hex>;
 receipt:(hash:Hex)=>Promise<TransactionReceipt>;
};
/** Contains public chain data only; never store login identity or a private key. */
export type PendingTransaction={schemaVersion:1;hash:Hex;chainId:number;account:Address;label:string};
async function assertIdentity(plan:Pick<TransactionPlan,'account'|'chainId'>,port:ExecutionPort){
 const identity=await port.identity();
 if(identity.chainId!==plan.chainId)throw Error('The wallet network changed. Review again.');
 if(identity.account?.toLowerCase()!==plan.account.toLowerCase())throw Error('The active wallet changed. Review again.');
}
async function checkedReceipt(hash:Hex,port:ExecutionPort){
 const receipt=await port.receipt(hash);
 if(typeof receipt.hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(receipt.hash)||(receipt.hash.toLowerCase()!==hash.toLowerCase()&&receipt.repricedFrom?.toLowerCase()!==hash.toLowerCase())||!['success','reverted'].includes(receipt.status)||typeof receipt.blockNumber!=='bigint'||receipt.blockNumber<0n)throw Error('RPC returned an invalid or mismatched transaction receipt');
 for(const value of [receipt.gasUsed,receipt.effectiveGasPrice])if(value!==undefined&&(typeof value!=='bigint'||value<0n))throw Error('RPC returned invalid receipt gas');
 return receipt;
}
export async function executeReviewed(plan:TransactionPlan,port:ExecutionPort,persist:(record:PendingTransaction)=>void){
 plan=Object.freeze({...plan});
 if(!isAddress(plan.account)||BigInt(plan.account)===0n||!isAddress(plan.to)||BigInt(plan.to)===0n||!Number.isSafeInteger(plan.chainId)||plan.chainId<=0||plan.value!==0n||!/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(plan.data))throw Error('Invalid transaction plan');
 await assertIdentity(plan,port);
 const estimate=Object.freeze({...await port.estimate(plan)});
 const {gas,maxFeePerGas,maxPriorityFeePerGas,nativeBalance,nativeSpend=0n}=estimate;
 if(gas<=0n||maxFeePerGas<0n||(maxPriorityFeePerGas!==undefined&&(maxPriorityFeePerGas<0n||maxPriorityFeePerGas>maxFeePerGas))||nativeSpend<0n||nativeBalance<gas*maxFeePerGas+nativeSpend)throw Error('Insufficient balance for gas and the reviewed spend.');
 await assertIdentity(plan,port);
 const hash=await port.send(plan,Object.freeze({gas,maxFeePerGas,...(maxPriorityFeePerGas===undefined?{}:{maxPriorityFeePerGas})}));
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Wallet returned an invalid transaction hash');
 // A storage error must not cause automatic resubmission. Surface the hash even
 // when storage is unavailable so the controller can offer receipt recovery.
 const record:PendingTransaction={schemaVersion:1,hash,chainId:plan.chainId,account:plan.account,label:plan.label};
 try{persist(record);}catch{throw Object.assign(Error('Transaction submitted; recovery storage is unavailable.'),{pending:record});}
 return checkedReceipt(hash,port);
}
export async function resumeTransaction(record:PendingTransaction,port:ExecutionPort){
 if(record.schemaVersion!==1||!/^0x[0-9a-fA-F]{64}$/.test(record.hash)||!isAddress(record.account)||!Number.isSafeInteger(record.chainId)||record.chainId<=0)throw Error('Invalid pending transaction record');
 // Reading a public receipt does not require the original signer, only its chain.
 const identity=await port.identity();
 if(identity.chainId!==record.chainId)throw Error('Select the transaction network to resume tracking.');
 return checkedReceipt(record.hash,port);
}
