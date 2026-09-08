'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {PrivyProvider,usePrivy,useWallets} from '@privy-io/react-auth';
import {WagmiProvider,createConfig,useSetActiveWallet} from '@privy-io/wagmi';
import {isAddress,type Address} from 'viem';
import {http,useAccount} from 'wagmi';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {selectedChain} from './config';
import {TransactionBridge} from './WalletProvider';
const config=createConfig({chains:[selectedChain],transports:{[selectedChain.id]:http()},ssr:true});
function Bridge({children}:{children:ReactNode}){
 const {login,logout,connectWallet,authenticated,ready}=usePrivy();const {wallets,ready:walletsReady}=useWallets();const {address}=useAccount();
 const {setActiveWallet}=useSetActiveWallet();const [error,setError]=useState<string>();
 const selecting=useRef(false);
 const active=wallets.find(w=>w.address.toLowerCase()===address?.toLowerCase());
 async function select(address:Address){
  const next=wallets.find(w=>w.address.toLowerCase()===address.toLowerCase());
  if(!next)throw Error('Wallet is no longer connected');
  setError(undefined);try{await setActiveWallet(next);try{sessionStorage.setItem('orbital:active-wallet',next.address);}catch{/* Preference storage is optional. */}}catch(e){setError(e instanceof Error?e.message:'Unable to select wallet');throw e;}
 }
 useEffect(()=>{
  if(!ready||!walletsReady||!authenticated||active||selecting.current||!wallets.length)return;
  let saved:string|null=null;try{saved=sessionStorage.getItem('orbital:active-wallet');}catch{}
  const next=wallets.find(w=>w.address.toLowerCase()===saved?.toLowerCase())??wallets.find(w=>w.walletClientType==='privy')??wallets[0]!;
  selecting.current=true;void select(next.address as Address).finally(()=>{selecting.current=false;}).catch(()=>{});
 },[ready,walletsReady,authenticated,active,wallets]);
 return <TransactionBridge ready={ready&&walletsReady} error={error} kind={active?.walletClientType==='privy'?'privy':'external'} wallets={wallets.filter(w=>isAddress(w.address)).map(w=>({address:w.address as Address,kind:w.walletClientType==='privy'?'privy':'external'}))} select={select} connect={()=>authenticated?connectWallet():login()} disconnect={()=>{void logout().catch(e=>setError(e instanceof Error?e.message:'Unable to disconnect'));}}>{children}</TransactionBridge>;
}
export default function PrivyWallet({appId,children}:{appId:string;children:ReactNode}){
 const [query]=useState(()=>new QueryClient());
 return <PrivyProvider appId={appId} config={{loginMethods:['email','wallet'],defaultChain:selectedChain,supportedChains:[selectedChain],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'},showWalletUIs:true},appearance:{theme:'light',accentColor:'#6653CF'}}}>
  <QueryClientProvider client={query}><WagmiProvider config={config}><Bridge>{children}</Bridge></WagmiProvider></QueryClientProvider>
 </PrivyProvider>;
}
