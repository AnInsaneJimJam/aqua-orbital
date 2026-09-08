'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {useWallet} from './WalletProvider';
import {selectedChain} from './config';
import styles from './WalletControl.module.css';
export default function WalletControl(){
 const wallet=useWallet();const [slow,setSlow]=useState(false);
 useEffect(()=>{setSlow(false);if(wallet.ready)return;const timer=setTimeout(()=>setSlow(true),15000);return()=>clearTimeout(timer);},[wallet.ready]);
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 async function createEmbeddedWallet(){setOpen(false);setBusy(true);try{await wallet.createEmbeddedWallet?.();}catch{/* Shared wallet alert presents the error. */}finally{setBusy(false);}}
 const createWalletControl=wallet.createEmbeddedWallet&&<button className="button secondary compact" disabled={busy} onClick={createEmbeddedWallet}>{busy?'Creating wallet…':'Create a Privy wallet'}</button>;
 if(!wallet.connected)return <div><button className="button secondary compact" disabled={busy||!wallet.ready&&!slow} onClick={slow&&!wallet.ready?()=>window.location.reload():wallet.connect}>{wallet.ready?'Connect wallet':slow?'Retry wallet connection':'Loading wallet…'}</button>{createWalletControl}{slow&&!wallet.ready&&<p className="hint" role="status">Wallet setup is taking longer than expected. Retry when your connection is ready.</p>}</div>;
 return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button className="button secondary compact" aria-label="Manage connected wallet">{wallet.address?.slice(0,6)}…{wallet.address?.slice(-4)}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={styles.content}><Dialog.Title>Connected wallet</Dialog.Title><Dialog.Description>Select the wallet to use for your next review.</Dialog.Description>
  <p className="hint">{wallet.chainId===selectedChain.id?selectedChain.name:`Wrong network · switch to ${selectedChain.name}`}</p>
  <div className="stack">{wallet.wallets.map(w=><button className={`${styles.wallet} button secondary`} key={w.address} aria-pressed={wallet.address?.toLowerCase()===w.address.toLowerCase()} disabled={busy||!wallet.select} onClick={async()=>{setBusy(true);try{await wallet.select?.(w.address);}catch{/* Shared wallet alert presents the error. */}finally{setBusy(false);}}}><span>{w.kind==='privy'?'Privy wallet':w.kind==='local'?'Local Anvil fixture':'External wallet'}</span><span className="mono">{w.address}</span></button>)}</div>
  <Link className="button secondary" href="/fund" onClick={()=>setOpen(false)}>Get demo tokens</Link><div className={styles.actions}>{createWalletControl}<button className="button secondary" disabled={busy} onClick={()=>{wallet.connect();setOpen(false);}}>Connect another</button><button className="button secondary" disabled={busy} onClick={()=>{wallet.disconnect();setOpen(false);}}>Disconnect</button></div>
  <Dialog.Close asChild><button className="button full">Done</button></Dialog.Close>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
