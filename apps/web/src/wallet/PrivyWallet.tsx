'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {PrivyProvider,useConnectWallet,useCreateWallet,useLogin,useModalStatus,usePrivy,useWallets} from '@privy-io/react-auth';
import {WagmiProvider,createConfig,useSetActiveWallet} from '@privy-io/wagmi';
import {isAddress,type Address} from 'viem';
import {useAccount,useConnectors} from 'wagmi';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {selectedChain} from './config';
import {readTransport} from './readTransport';
import {TransactionBridge} from './WalletProvider';
import styles from './WalletControl.module.css';
const config=createConfig({chains:[selectedChain],transports:{[selectedChain.id]:readTransport()},ssr:true});
function Bridge({children}:{children:ReactNode}){
 const {logout,authenticated,ready,user}=usePrivy();const {wallets,ready:walletsReady}=useWallets();const {address}=useAccount();const connectors=useConnectors();
 const {setActiveWallet}=useSetActiveWallet();const [error,setError]=useState<string>();
 const [requestedAddress,setRequestedAddress]=useState<Address>();
 const selecting=useRef(false),creating=useRef(false),connecting=useRef(false),modalOpened=useRef(false),lastAutoSelection=useRef('');
 const [connectionBusy,setConnectionBusy]=useState(false),[selectionBusy,setSelectionBusy]=useState(false);const {isOpen}=useModalStatus();
 function connectionFinished(){connecting.current=false;setConnectionBusy(false);}
 const active=wallets.find(w=>w.address.toLowerCase()===address?.toLowerCase());
 const hasEmbedded=wallets.some(w=>w.walletClientType==='privy')||user?.linkedAccounts.some(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum');
 const {login}=useLogin({onComplete:()=>{connectionFinished();setError(undefined);lastAutoSelection.current='';},onError:()=>{connectionFinished();setError('Sign-in did not complete. Finish or dismiss any open wallet request before trying again.');}});
 const {connectWallet}=useConnectWallet({onSuccess:({wallet})=>{connectionFinished();setError(undefined);lastAutoSelection.current='';if(isAddress(wallet.address))setRequestedAddress(wallet.address);},onError:()=>{connectionFinished();setError('Wallet connection did not complete. Finish or dismiss any open wallet request before trying again.');}});
 const {createWallet}=useCreateWallet({onSuccess:({wallet})=>{setError(undefined);if(isAddress(wallet.address))setRequestedAddress(wallet.address);},onError:()=>setError('Privy wallet creation did not complete. You can try again.')});
 async function select(address:Address){
  if(selecting.current)return;
  const next=wallets.find(w=>w.address.toLowerCase()===address.toLowerCase());
  if(!next)throw Error('Wallet is no longer connected');
  selecting.current=true;setSelectionBusy(true);setError(undefined);
  try{await setActiveWallet(next);try{sessionStorage.setItem('orbital:active-wallet',next.address);}catch{/* Preference storage is optional. */}}
  catch(e){setError('Wallet selection did not complete. Finish or dismiss the request in your wallet, then select it again.');throw e;}
  finally{selecting.current=false;setSelectionBusy(false);}
 }
 function connect(){if(!ready||!walletsReady||connecting.current||selecting.current||isOpen)return;connecting.current=true;modalOpened.current=false;setConnectionBusy(true);setError(undefined);
  try{authenticated?connectWallet():login();}catch{connectionFinished();setError('Unable to open wallet connection. Finish any open wallet request, then retry.');}
 }
 useEffect(()=>{if(isOpen)modalOpened.current=true;else if(modalOpened.current){modalOpened.current=false;connectionFinished();}},[isOpen]);
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
  const key=`${next.address.toLowerCase()}:${connectors.map(c=>c.uid).sort().join(',')}`;
  if(lastAutoSelection.current===key)return;lastAutoSelection.current=key;
  // A failed selection must not retry on every render and enqueue another
  // wallet_requestPermissions. Retry only for new connectors or a user action.
  void select(next.address as Address).catch(()=>{});
 },[ready,walletsReady,active,wallets,connectors,requestedAddress,selectionBusy]);
 return <TransactionBridge ready={ready&&walletsReady} connecting={connectionBusy||selectionBusy||isOpen} error={error} kind={active?.walletClientType==='privy'?'privy':'external'} wallets={wallets.filter(w=>isAddress(w.address)).map(w=>({address:w.address as Address,kind:w.walletClientType==='privy'?'privy':'external'}))} select={async address=>{setRequestedAddress(undefined);await select(address);}} createEmbeddedWallet={ready&&walletsReady&&authenticated&&!hasEmbedded?createEmbeddedWallet:undefined} connect={connect} disconnect={()=>{setRequestedAddress(undefined);lastAutoSelection.current='';void logout().catch(e=>setError(e instanceof Error?e.message:'Unable to disconnect'));}}>{children}</TransactionBridge>;
}
export default function PrivyWallet({appId,children}:{appId:string;children:ReactNode}){
 const [query]=useState(()=>new QueryClient());
 return <PrivyProvider appId={appId} config={{loginMethods:['email','wallet'],defaultChain:selectedChain,supportedChains:[selectedChain],externalWallets:{coinbaseWallet:{config:{preference:{options:'eoaOnly'}}}},embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'},showWalletUIs:true},appearance:{theme:'dark',accentColor:'#c5f36b',logo:<img src="/brand/orbital.svg" alt="Orbital" width={80} height={80} className={styles.privyLogo}/>,walletChainType:'ethereum-only',walletList:['detected_ethereum_wallets','metamask','coinbase_wallet','wallet_connect']}}}>
  <QueryClientProvider client={query}><WagmiProvider config={config}><Bridge>{children}</Bridge></WagmiProvider></QueryClientProvider>
 </PrivyProvider>;
}
