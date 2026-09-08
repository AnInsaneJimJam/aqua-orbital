'use client';
import {createContext,useContext,useState,type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WagmiProvider,createConfig,http,useAccount,useConnect,useDisconnect,useConfig} from 'wagmi';
import {getAccount,getWalletClient} from 'wagmi/actions';
import {injected} from 'wagmi/connectors';
import type {Address,Hex} from 'viem';
import type {TransactionPlan,TransactionFees} from '@orbital/sdk';
import {selectedChain} from './config';
const PublicContent=createContext<ReactNode>(null);
function LoadingWallet(){return <>{useContext(PublicContent)}</>;}
const PrivyWallet=dynamic(()=>import('./PrivyWallet'),{ssr:false,loading:LoadingWallet});
const wagmiConfig=createConfig({chains:[selectedChain],transports:{[selectedChain.id]:http()},connectors:[injected()],ssr:true});
export type WalletOption={address:Address;kind:'external'|'privy'};
export type Session={ready:boolean;address?:Address;chainId?:number;connected:boolean;kind:'external'|'privy'|'none';wallets:WalletOption[];select?:(address:Address)=>Promise<void>;connect:()=>void;disconnect:()=>void;identity:()=>Promise<{account?:Address;chainId:number}>;send:(plan:TransactionPlan,fees?:TransactionFees)=>Promise<Hex>;error?:string};
const Context=createContext<Session>({ready:false,connected:false,kind:'none',wallets:[],connect:()=>{},disconnect:()=>{},identity:async()=>({chainId:selectedChain.id}),send:async()=>{throw Error('Connect a wallet first');}});
export const useWallet=()=>useContext(Context);
export function SessionProvider({value,children}:{value:Session;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export function TransactionBridge({children,connect,disconnect,kind,error,ready=true,wallets,select}:{children:ReactNode;connect:()=>void;disconnect:()=>void;kind:'external'|'privy';error?:string;ready?:boolean;wallets?:WalletOption[];select?:(address:Address)=>Promise<void>}){
 const account=useAccount(),config=useConfig();
 async function identity(){
  const current=getAccount(config);
  if(!current.isConnected||!current.address)return {chainId:current.chainId??selectedChain.id};
  const client=await getWalletClient(config),[chainId,addresses]=await Promise.all([client.getChainId(),client.getAddresses()]);
  const latest=getAccount(config);
  if(latest.address?.toLowerCase()!==current.address.toLowerCase()||latest.connector?.uid!==current.connector?.uid||latest.chainId!==chainId||addresses[0]?.toLowerCase()!==current.address.toLowerCase())throw Error('Wallet changed. Review again.');
  return {account:current.address,chainId};
 }
 async function send(plan:TransactionPlan,fees?:TransactionFees){
  const live=await identity();
  if(!live.account)throw Error('Connect a wallet first');
  if(live.chainId!==plan.chainId||plan.chainId!==selectedChain.id)throw Error(`Switch your wallet to ${selectedChain.name}`);
  if(plan.account.toLowerCase()!==live.account.toLowerCase()||plan.value!==0n)throw Error('Transaction no longer matches the active wallet');
  const connectorId=getAccount(config).connector?.uid,client=await getWalletClient(config);
  const [liveChain,liveAddresses]=await Promise.all([client.getChainId(),client.getAddresses()]);
  const current=getAccount(config);
  if(liveChain!==plan.chainId||current.chainId!==plan.chainId||current.connector?.uid!==connectorId||current.address?.toLowerCase()!==plan.account.toLowerCase()||liveAddresses[0]?.toLowerCase()!==plan.account.toLowerCase())throw Error('Wallet changed. Review the transaction again.');
  return client.sendTransaction({account:plan.account,chain:selectedChain,to:plan.to,data:plan.data,value:0n,...fees});
 }
 return <SessionProvider value={{ready,address:account.address,chainId:account.chainId,connected:account.isConnected,kind:account.isConnected?kind:'none',wallets:wallets??(account.address?[{address:account.address,kind}]:[]),select,connect,disconnect,identity,send,error}}>{children}</SessionProvider>;
}
function External({children}:{children:ReactNode}){
 const {connect,connectors,error}=useConnect();const {disconnect}=useDisconnect();
 return <TransactionBridge kind="external" connect={()=>{if(connectors[0])connect({connector:connectors[0]});}} disconnect={()=>disconnect()} error={error?.message}>{children}</TransactionBridge>;
}
export default function WalletProvider({children}:{children:ReactNode}){
 const [query]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}}));
 const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
 if(appId)return <QueryClientProvider client={query}><PublicContent.Provider value={children}><PrivyWallet appId={appId}>{children}</PrivyWallet></PublicContent.Provider></QueryClientProvider>;
 return <QueryClientProvider client={query}><WagmiProvider config={wagmiConfig}><External>{children}</External></WagmiProvider></QueryClientProvider>;
}
