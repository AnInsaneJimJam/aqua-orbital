'use client';
import {useState} from 'react';
import {parseAmount} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {selectedChain} from '../wallet/config';
import {useDeployment,request} from './api';

/** Financial orchestration stays here; SwapView receives values and callbacks. */
export function useSwap(){
 const wallet=useWallet(),deployment=useDeployment();
 const [input,setInput]=useState('oUSD18'),[output,setOutput]=useState('USDC');
 const [amount,setAmount]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const symbols=deployment.data?.tokens.map(t=>t.symbol)??['USDC','oUSD6','oUSD18'];
 async function quote(){
  setError('');if(!wallet.address){wallet.connect();return;}
  if(!deployment.data)return;
  const tokenIn=deployment.data.tokens.find(t=>t.symbol===input),tokenOut=deployment.data.tokens.find(t=>t.symbol===output);
  if(!tokenIn||!tokenOut||tokenIn.address===tokenOut.address){setError('Select two different assets');return;}
  if(wallet.chainId!==deployment.data.chainId){setError(`Switch to ${selectedChain.name}`);return;}
  try{
   setPending(true);const amountInRaw=parseAmount(amount,tokenIn.decimals);
   if(amountInRaw===0n)throw Error('Enter an amount greater than zero');
   await request('/quotes/swap',undefined,{wallet:wallet.address,recipient:wallet.address,tokenIn:tokenIn.address,tokenOut:tokenOut.address,amountInRaw:amountInRaw.toString(),slippageBps:50,maxCrossings:16});
   setError('Quote review is not enabled in this build. No transaction was requested.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to prepare quote');}finally{setPending(false);}
 }
 return {input,output,amount,error,pending,symbols,network:selectedChain.name,gasAsset:selectedChain.nativeCurrency.symbol,
  setInput:(value:string)=>{if(value===output)setOutput(input);setInput(value);setError('');},
  setOutput:(value:string)=>{setOutput(value);setError('');},setAmount,
  reverse:()=>{setInput(output);setOutput(input);setError('');},quote,
  deploymentPending:deployment.isPending,deploymentError:deployment.error?.message,
  disabled:!wallet.ready||pending||(!deployment.data&&wallet.connected),
  actionLabel:!wallet.ready?'Loading wallet…':pending?'Preparing quote…':!wallet.connected?'Connect wallet':!deployment.data?'Quotes unavailable':'Review swap'};
}
export type SwapViewState=ReturnType<typeof useSwap>;
