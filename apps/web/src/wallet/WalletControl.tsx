'use client';
import Link from '../components/AppLink';
import {useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Check,Coins,LogOut,Plus,Wallet,X} from 'lucide-react';
import {useWallet} from './WalletProvider';
import {selectedChain} from './config';
import styles from './WalletControl.module.css';
import dialog from '../components/Dialog.module.css';
export default function WalletControl(){
 const wallet=useWallet();const [slow,setSlow]=useState(false);
 useEffect(()=>{setSlow(false);if(wallet.ready)return;const timer=setTimeout(()=>setSlow(true),15000);return()=>clearTimeout(timer);},[wallet.ready]);
 const [open,setOpen]=useState(false);const [working,setBusy]=useState(false);const busy=working||!!wallet.connecting;
 async function createEmbeddedWallet(){setOpen(false);setBusy(true);try{await wallet.createEmbeddedWallet?.();}catch{/* Shared wallet alert presents the error. */}finally{setBusy(false);}}
 const createWalletControl=wallet.createEmbeddedWallet&&<button className="button secondary compact" disabled={busy} onClick={createEmbeddedWallet}><Plus size={16} aria-hidden="true"/>{busy?'Creating wallet…':'Create a Privy wallet'}</button>;
 if(!wallet.connected)return <div className={styles.connect}><button className="button secondary compact" aria-label={wallet.ready&&!wallet.connecting?'Connect wallet':undefined} disabled={busy||!wallet.ready&&!slow} onClick={slow&&!wallet.ready?()=>window.location.reload():wallet.connect}><Wallet size={16} aria-hidden="true"/>{wallet.connecting?'Connecting…':wallet.ready?'Connect Wallet':slow?'Retry wallet connection':'Loading wallet…'}</button>{createWalletControl}{slow&&!wallet.ready&&<p className="hint" role="status">Wallet setup is taking longer than expected. Retry when your connection is ready.</p>}</div>;
 return <Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger asChild><button className={`button secondary compact ${styles.trigger}`} aria-label="Manage connected wallet"><span className={styles.connectionDot} aria-hidden="true"/>{wallet.address?.slice(0,6)}…{wallet.address?.slice(-4)}</button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className={dialog.overlay}/><Dialog.Content className={dialog.content}>
   <div className={dialog.header}><span className={dialog.icon}><Wallet size={22} aria-hidden="true"/></span><Dialog.Close asChild><button type="button" className={dialog.close} aria-label="Close wallet dialog"><X size={20} aria-hidden="true"/></button></Dialog.Close></div>
   <Dialog.Title className={dialog.title}>Connected wallet</Dialog.Title>
   <Dialog.Description className={dialog.description}>Choose the wallet for your next transaction.</Dialog.Description>
   <p className={styles.network} data-wrong-network={wallet.chainId!==selectedChain.id}><span aria-hidden="true"/>{wallet.chainId===selectedChain.id?selectedChain.name:`Wrong network · switch to ${selectedChain.name}`}</p>
   <div className={styles.wallets}>{wallet.wallets.map(w=>{
    const selected=wallet.address?.toLowerCase()===w.address.toLowerCase();
    return <button type="button" className={styles.wallet} key={w.address} aria-pressed={selected} disabled={busy||!wallet.select} onClick={async()=>{setBusy(true);try{await wallet.select?.(w.address);}catch{/* Shared wallet alert presents the error. */}finally{setBusy(false);}}}>
     <span className={styles.walletHeading}><span>{w.kind==='privy'?'Privy wallet':w.kind==='local'?'Local Anvil fixture':'External wallet'}</span>{selected&&<span className={styles.selected} aria-hidden="true"><Check size={13}/>Active</span>}</span>
     <span className={styles.address}>{w.address}</span>
    </button>;
   })}</div>
   <div className={styles.actions}>{createWalletControl}<button className="button secondary" disabled={busy} onClick={()=>{wallet.connect();setOpen(false);}}><Plus size={16} aria-hidden="true"/>Connect another</button><Link className="button secondary" href="/fund" onClick={()=>setOpen(false)}><Coins size={16} aria-hidden="true"/>Get demo tokens</Link></div>
   <div className={dialog.footer}><button className={styles.disconnect} disabled={busy} onClick={()=>{wallet.disconnect();setOpen(false);}}><LogOut size={15} aria-hidden="true"/>Disconnect</button><Dialog.Close asChild><button className="button">Done</button></Dialog.Close></div>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
