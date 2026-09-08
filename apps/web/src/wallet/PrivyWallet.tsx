'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {PrivyProvider,useConnectWallet,useCreateWallet,useLogin,usePrivy,useWallets} from '@privy-io/react-auth';
import {WagmiProvider,createConfig,useSetActiveWallet} from '@privy-io/wagmi';
import {isAddress,type Address} from 'viem';
import {http,useAccount,useConnectors} from 'wagmi';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {selectedChain} from './config';
import {TransactionBridge} from './WalletProvider';
import styles from './WalletControl.module.css';
const config=createConfig({chains:[selectedChain],transports:{[selectedChain.id]:http()},ssr:true});
function Bridge({children}:{children:ReactNode}){
 const {logout,authenticated,ready,user}=usePrivy();const {wallets,ready:walletsReady}=useWallets();const {address}=useAccount();const connectors=useConnectors();
 const {setActiveWallet}=useSetActiveWallet();const [error,setError]=useState<string>();
 const [requestedAddress,setRequestedAddress]=useState<Address>();
 const selecting=useRef(false),creating=useRef(false);
 const active=wallets.find(w=>w.address.toLowerCase()===address?.toLowerCase());
 const hasEmbedded=wallets.some(w=>w.walletClientType==='privy')||user?.linkedAccounts.some(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum');
 const {login}=useLogin({onComplete:()=>setError(undefined),onError:()=>setError('Sign-in did not complete. Open Connect wallet to try again.')});
 const {connectWallet}=useConnectWallet({onSuccess:({wallet})=>{setError(undefined);if(isAddress(wallet.address))setRequestedAddress(wallet.address);},onError:()=>setError('Wallet connection did not complete. You can try again.')});
 const {createWallet}=useCreateWallet({onSuccess:({wallet})=>{setError(undefined);if(isAddress(wallet.address))setRequestedAddress(wallet.address);},onError:()=>setError('Privy wallet creation did not complete. You can try again.')});
 async function select(address:Address){
  const next=wallets.find(w=>w.address.toLowerCase()===address.toLowerCase());
  if(!next)throw Error('Wallet is no longer connected');
  setError(undefined);try{await setActiveWallet(next);try{sessionStorage.setItem('orbital:active-wallet',next.address);}catch{/* Preference storage is optional. */}}catch(e){setError(e instanceof Error?e.message:'Unable to select wallet');throw e;}
 }
 async function createEmbeddedWallet(){
  if(!ready||!walletsReady||!authenticated)throw Error('Sign in before creating a Privy wallet');
  if(hasEmbedded||creating.current)return;
  creating.current=true;setError(undefined);
  try{await createWallet();}catch(e){setError('Privy wallet creation did not complete. You can try again.');throw e;}finally{creating.current=false;}
 }
 useEffect(()=>{
  if(!ready||!walletsReady||selecting.current||!wallets.length||!connectors.length)return;
  if(requestedAddress&&active?.address.toLowerCase()===requestedAddress.toLowerCase()){setRequestedAddress(undefined);return;}
  if(!requestedAddress&&active)return;
  let saved:string|null=null;try{saved=sessionStorage.getItem('orbital:active-wallet');}catch{}
  // New wallets become connector-ready after the creation callback. Retry when
  // Privy's connector list changes; never create another wallet during recovery.
  const next=requestedAddress?wallets.find(w=>w.address.toLowerCase()===requestedAddress.toLowerCase()):wallets.find(w=>w.address.toLowerCase()===saved?.toLowerCase())??wallets.find(w=>w.walletClientType==='privy')??wallets[0];
  if(!next)return;
  selecting.current=true;void select(next.address as Address).finally(()=>{selecting.current=false;}).catch(()=>{});
 },[ready,walletsReady,active,wallets,connectors,requestedAddress]);
 return <TransactionBridge ready={ready&&walletsReady} error={error} kind={active?.walletClientType==='privy'?'privy':'external'} wallets={wallets.filter(w=>isAddress(w.address)).map(w=>({address:w.address as Address,kind:w.walletClientType==='privy'?'privy':'external'}))} select={async address=>{setRequestedAddress(undefined);await select(address);}} createEmbeddedWallet={ready&&walletsReady&&authenticated&&!hasEmbedded?createEmbeddedWallet:undefined} connect={()=>{setError(undefined);authenticated?connectWallet():login();}} disconnect={()=>{setRequestedAddress(undefined);void logout().catch(e=>setError(e instanceof Error?e.message:'Unable to disconnect'));}}>{children}</TransactionBridge>;
}
export default function PrivyWallet({appId,children}:{appId:string;children:ReactNode}){
 const [query]=useState(()=>new QueryClient());
 return <PrivyProvider appId={appId} config={{loginMethods:['email','wallet'],defaultChain:selectedChain,supportedChains:[selectedChain],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'},showWalletUIs:true},appearance:{theme:'dark',accentColor:'#c5f36b',logo:<img src="/brand/orbital.svg" alt="Orbital" width={80} height={80} className={styles.privyLogo}/>,walletChainType:'ethereum-only'}}}>
  <QueryClientProvider client={query}><WagmiProvider config={config}><Bridge>{children}</Bridge></WagmiProvider></QueryClientProvider>
 </PrivyProvider>;
}
