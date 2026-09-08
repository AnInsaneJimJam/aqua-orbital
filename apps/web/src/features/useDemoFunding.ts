'use client';
import {useEffect,useRef,useState} from 'react';
import {manifestSchema,hashSchema,type DeploymentManifest} from '@orbital/shared';
import {buildFundingFaucetTx,validateFundingPlan,validateReceiptRecoveryDeployment,decodeFundingReceipt,executeReviewed,demoTokenAbi,formatAmount,type PlanContext,type TransactionPlan,type PendingTransaction,type TransactionEstimate,type TransactionReceipt} from '@orbital/sdk';
import {erc20Abi,type Address} from 'viem';
import {useWallet} from '../wallet/WalletProvider';
import {createWalletExecutionPort,publicClient as client} from '../wallet/transactionPort';
import {selectedChain} from '../wallet/config';
import {request,useDeployment} from './api';
type Saved={context:PlanContext;token:Address;plan:TransactionPlan;transaction:PendingTransaction};
type Review={context:PlanContext;token:Address;plan:TransactionPlan;estimate:TransactionEstimate;expires:number};
const key=(chain:number,account:string)=>`orbital:funding:1:${chain}:${account.toLowerCase()}`;
export function useDemoFunding(){
 const wallet=useWallet(),deployment=useDeployment(),[review,setReview]=useState<Review>(),[pending,setPending]=useState<Saved>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[blocked,setBlocked]=useState(false),[balances,setBalances]=useState<{scope:string;values:Record<string,string>}>();
 const scope=JSON.stringify([wallet.address,wallet.chainId,wallet.kind,deployment.data]),current=useRef(scope);current.current=scope;
 const mounted=useRef(true),working=useRef(false),reviewScope=useRef('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setReview(undefined);setPending(undefined);setBlocked(false);setMessage('');if(!wallet.address)return;
  try{const raw=localStorage.getItem(key(selectedChain.id,wallet.address));if(!raw)return;if(raw.length>16000)throw Error('Invalid recovery');const p=JSON.parse(raw);
   const saved:Saved={...p,context:{...p.context,manifest:manifestSchema.parse(p.context.manifest),now:BigInt(p.context.now)},plan:{...p.plan,value:0n}};
   if(p.plan.value!=='0'||p.transaction.schemaVersion!==1||p.transaction.chainId!==selectedChain.id||p.transaction.account.toLowerCase()!==wallet.address.toLowerCase()||saved.plan.account.toLowerCase()!==wallet.address.toLowerCase()||!hashSchema.safeParse(saved.transaction.hash).success)throw Error('Recovery scope mismatch');
   validateFundingPlan(saved.context,saved.token,saved.plan);setPending(saved);
  }catch{setBlocked(true);setMessage('Saved faucet receipt could not be validated. Check its transaction before requesting tokens again.');}
 },[scope]);
 const assets=deployment.data?.tokens.filter(t=>t.mock&&(t.symbol==='oUSD6'||t.symbol==='oUSD18'||selectedChain.id===31337&&t.address.toLowerCase()===deployment.data!.usdc.toLowerCase()))??[];
 async function refresh(){if(!wallet.address||!deployment.data)return;const snapshot=scope;try{const block=await client.getBlock(),pairs=await Promise.all(assets.map(async t=>[t.address,formatAmount(await client.readContract({address:t.address as Address,abi:erc20Abi,functionName:'balanceOf',args:[wallet.address!],blockNumber:block.number}),t.decimals)] as const));if(current.current===snapshot&&mounted.current)setBalances({scope:snapshot,values:Object.fromEntries(pairs)});}catch{if(current.current===snapshot&&mounted.current)setBalances(undefined);}}
 useEffect(()=>{void refresh();},[scope]);
 const enabled=wallet.ready&&wallet.connected&&wallet.chainId===selectedChain.id&&deployment.data?.verified===true&&!blocked;
 async function freshManifest(expected?:DeploymentManifest){const m=manifestSchema.parse(await request('/deployment'));if(m.chainId!==selectedChain.id||!m.verified||expected&&JSON.stringify(m)!==JSON.stringify(expected))throw Error('Funding deployment changed');return m;}
 async function prepare(token:Address){
  if(working.current||!enabled||pending||!wallet.address)return;working.current=true;setBusy(true);setReview(undefined);setMessage('');const captured=scope,isCurrent=()=>mounted.current&&current.current===captured;
  try{const manifest=await freshManifest(),port=createWalletExecutionPort(wallet,isCurrent),block=await client.getBlock();
   const [next,amount,cooldown,chain]=await Promise.all(['nextMintAt','FAUCET_AMOUNT','COOLDOWN','CHAIN_ID'].map(fn=>port.read({hash:block.hash!},wallet.address!,demoTokenAbi,fn,token,fn==='nextMintAt'?[wallet.address]:undefined)));
   const asset=manifest.tokens.find(t=>t.address.toLowerCase()===token.toLowerCase());if(!asset||amount!==1000n*10n**BigInt(asset.decimals)||cooldown!==86400n||chain!==BigInt(selectedChain.id))throw Error('Unexpected faucet configuration');
   const context={manifest,account:wallet.address,chainId:selectedChain.id,now:block.timestamp},plan=buildFundingFaucetTx(context,token,next as bigint),estimate=await port.estimate(plan);
   if(estimate.nativeBalance<estimate.gas*estimate.maxFeePerGas)throw Error(`Fund ${selectedChain.nativeCurrency.symbol} for gas first.`);await port.canonical({number:block.number,hash:block.hash!});
   if(isCurrent()){reviewScope.current=captured;setReview({context,token,plan,estimate,expires:Number(block.timestamp)*1000+20000});}
  }catch(e){if(isCurrent())setMessage((e as {shortMessage?:string}).shortMessage??(e as Error).message);}finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 async function finish(saved:Saved,receipt:TransactionReceipt){
  const result=receipt.status==='success'?decodeFundingReceipt(receipt,saved.context,saved.token,saved.plan):null;
  localStorage.removeItem(key(saved.transaction.chainId,saved.transaction.account));if(mounted.current){setPending(undefined);setMessage(result?`${result.amount} ${result.symbol} received. Receipt: ${result.hash}`:`Faucet transaction reverted: ${receipt.hash}`);void refresh();}
 }
 async function submit(){
  const r=review;if(!r||working.current||pending||!enabled||reviewScope.current!==scope)return;working.current=true;setBusy(true);setReview(undefined);let saved:Saved|undefined;const captured=scope,isCurrent=()=>mounted.current&&current.current===captured;
  try{const port=createWalletExecutionPort(wallet,isCurrent);const receipt=await executeReviewed(r.plan,{...port,estimate:async plan=>{
    if(Date.now()>=r.expires)throw Error('Faucet review expired. Review again.');await freshManifest(r.context.manifest);const next=await client.readContract({address:r.token,abi:demoTokenAbi,functionName:'nextMintAt',args:[r.plan.account]}),block=await client.getBlock();buildFundingFaucetTx({...r.context,now:block.timestamp},r.token,next);
    const estimate=await port.estimate(plan);if(estimate.gas>r.estimate.gas||estimate.maxFeePerGas>r.estimate.maxFeePerGas||(estimate.maxPriorityFeePerGas??0n)>(r.estimate.maxPriorityFeePerGas??0n)||Date.now()>=r.expires)throw Error('Faucet budget changed or review expired. Review again.');return {...r.estimate,nativeBalance:estimate.nativeBalance};
   }},transaction=>{saved={context:r.context,token:r.token,plan:r.plan,transaction};if(mounted.current)setPending(saved);localStorage.setItem(key(transaction.chainId,transaction.account),JSON.stringify(saved,(_,v)=>typeof v==='bigint'?v.toString():v));});if(saved)await finish(saved,receipt);
  }catch(e){if(mounted.current&&(isCurrent()||saved))setMessage((e as {shortMessage?:string}).shortMessage??(e as Error).message);}finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 async function resume(){const p=pending;if(!p||working.current)return;working.current=true;setBusy(true);try{validateReceiptRecoveryDeployment(p.context.manifest,await freshManifest());await finish(p,await createWalletExecutionPort(wallet,()=>true,p.plan).receipt(p.transaction.hash));}catch(e){if(mounted.current)setMessage((e as Error).message);}finally{working.current=false;if(mounted.current)setBusy(false);}}
 const r=reviewScope.current===scope?review:undefined;
 return {wrongChain:wallet.connected&&wallet.chainId!==selectedChain.id,switchNetwork:()=>{void wallet.switchNetwork?.().catch(e=>setMessage(e instanceof Error?e.message:'Network change rejected'));},enabled,busy,pending:pending?.transaction.hash,message,network:selectedChain.name,local:selectedChain.id===31337,address:wallet.address,connected:wallet.connected,connect:wallet.connect,
  assets:assets.map(t=>({address:t.address as Address,symbol:t.symbol,balance:balances?.scope===scope?balances.values[t.address]:'Unavailable'})),refresh:()=>{void refresh();},
  review:r?{symbol:r.context.manifest.tokens.find(t=>t.address.toLowerCase()===r.token.toLowerCase())!.symbol,account:r.plan.account,token:r.token,gas:`${formatAmount(r.estimate.gas*r.estimate.maxFeePerGas,18)} ${selectedChain.nativeCurrency.symbol}`} :undefined,
  prepare:(token:Address)=>{void prepare(token);},submit:()=>{void submit();},resume:()=>{void resume();},dismiss:()=>setReview(undefined)};
}
