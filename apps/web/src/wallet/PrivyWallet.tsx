'use client';
import {useState,type ReactNode} from 'react';
import {PrivyProvider,usePrivy,useWallets} from '@privy-io/react-auth';
import {WagmiProvider,createConfig,useSetActiveWallet} from '@privy-io/wagmi';
import {isAddress,type Address} from 'viem';
import {http,useAccount} from 'wagmi';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {selectedChain} from './config';
import {TransactionBridge} from './WalletProvider';
const config=createConfig({chains:[selectedChain],transports:{[selectedChain.id]:http()},ssr:true});
function Bridge({children}:{children:ReactNode}){
 const {login,logout,connectWallet,authenticated,ready}=usePrivy();const {wallets}=useWallets();const {address}=useAccount();
 const {setActiveWallet}=useSetActiveWallet();const [error,setError]=useState<string>();
 const active=wallets.find(w=>w.address.toLowerCase()===address?.toLowerCase());
 async function select(address:Address){
  const next=wallets.find(w=>w.address.toLowerCase()===address.toLowerCase());
  if(!next)throw Error('Wallet is no longer connected');
  setError(undefined);try{await setActiveWallet(next);}catch(e){setError(e instanceof Error?e.message:'Unable to select wallet');throw e;}
 }
 return <TransactionBridge ready={ready} error={error} kind={active?.walletClientType==='privy'?'privy':'external'} wallets={wallets.filter(w=>isAddress(w.address)).map(w=>({address:w.address as Address,kind:w.walletClientType==='privy'?'privy':'external'}))} select={select} connect={()=>authenticated?connectWallet():login()} disconnect={()=>{void logout();}}>{children}</TransactionBridge>;
}
export default function PrivyWallet({appId,children}:{appId:string;children:ReactNode}){
 const [query]=useState(()=>new QueryClient());
 return <PrivyProvider appId={appId} config={{loginMethods:['email','wallet'],defaultChain:selectedChain,supportedChains:[selectedChain],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'},showWalletUIs:true},appearance:{theme:'light',accentColor:'#6653CF'}}}>
  <QueryClientProvider client={query}><WagmiProvider config={config}><Bridge>{children}</Bridge></WagmiProvider></QueryClientProvider>
 </PrivyProvider>;
}
