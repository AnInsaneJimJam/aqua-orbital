import {isAddress, type Address, type Hex} from 'viem';
import type {TransactionPlan} from './index';

export type TransactionReceipt={hash:Hex;status:'success'|'reverted';blockNumber:bigint};
/** Wallet/provider boundary. A fixture port is not evidence of Privy execution. */
export type ExecutionPort={
 identity:()=>Promise<{account?:Address;chainId:number}>;
 estimate:(plan:TransactionPlan)=>Promise<{gas:bigint;maxFeePerGas:bigint;nativeBalance:bigint;nativeSpend?:bigint}>;
 send:(plan:TransactionPlan)=>Promise<Hex>;
 receipt:(hash:Hex)=>Promise<TransactionReceipt>;
};
/** Contains public chain data only; never store login identity or a private key. */
export type PendingTransaction={schemaVersion:1;hash:Hex;chainId:number;account:Address;label:string};
async function assertIdentity(plan:Pick<TransactionPlan,'account'|'chainId'>,port:ExecutionPort){
 const identity=await port.identity();
 if(identity.chainId!==plan.chainId)throw Error('The wallet network changed. Review again.');
 if(identity.account?.toLowerCase()!==plan.account.toLowerCase())throw Error('The active wallet changed. Review again.');
}
export async function executeReviewed(plan:TransactionPlan,port:ExecutionPort,persist:(record:PendingTransaction)=>void){
 if(!isAddress(plan.account)||!isAddress(plan.to)||BigInt(plan.to)===0n||!Number.isSafeInteger(plan.chainId)||plan.chainId<=0||plan.value!==0n||!/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(plan.data))throw Error('Invalid transaction plan');
 await assertIdentity(plan,port);
 const {gas,maxFeePerGas,nativeBalance,nativeSpend=0n}=await port.estimate(plan);
 if(gas<=0n||maxFeePerGas<0n||nativeSpend<0n||nativeBalance<gas*maxFeePerGas+nativeSpend)throw Error('Insufficient balance for gas and the reviewed spend.');
 await assertIdentity(plan,port);
 const hash=await port.send(plan);
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Wallet returned an invalid transaction hash');
 // A storage error must not cause automatic resubmission. Surface the hash even
 // when storage is unavailable so the controller can offer receipt recovery.
 const record:PendingTransaction={schemaVersion:1,hash,chainId:plan.chainId,account:plan.account,label:plan.label};
 try{persist(record);}catch{throw Object.assign(Error('Transaction submitted; recovery storage is unavailable.'),{pending:record});}
 return port.receipt(hash);
}
export async function resumeTransaction(record:PendingTransaction,port:ExecutionPort){
 if(record.schemaVersion!==1||!/^0x[0-9a-fA-F]{64}$/.test(record.hash)||!isAddress(record.account)||!Number.isSafeInteger(record.chainId)||record.chainId<=0)throw Error('Invalid pending transaction record');
 // Reading a public receipt does not require the original signer, only its chain.
 const identity=await port.identity();
 if(identity.chainId!==record.chainId)throw Error('Select the transaction network to resume tracking.');
 return port.receipt(record.hash);
}
