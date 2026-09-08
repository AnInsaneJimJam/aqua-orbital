'use client';
import {useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {useWallet} from './WalletProvider';
import {selectedChain} from './config';
import styles from './WalletControl.module.css';
export default function WalletControl(){
 const wallet=useWallet();const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 if(!wallet.connected)return <button className="button secondary compact" disabled={!wallet.ready} onClick={wallet.connect}>{wallet.ready?'Connect wallet':'Loading wallet…'}</button>;
 return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button className="button secondary compact" aria-label="Manage connected wallet">{wallet.address?.slice(0,6)}…{wallet.address?.slice(-4)}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={styles.content}><Dialog.Title>Connected wallet</Dialog.Title><Dialog.Description>Select the wallet to use for your next review.</Dialog.Description>
  <p className="hint">{wallet.chainId===selectedChain.id?selectedChain.name:`Wrong network · switch to ${selectedChain.name}`}</p>
  <div className="stack">{wallet.wallets.map(w=><button className={`${styles.wallet} button secondary`} key={w.address} aria-pressed={wallet.address?.toLowerCase()===w.address.toLowerCase()} disabled={busy||!wallet.select} onClick={async()=>{setBusy(true);try{await wallet.select?.(w.address);}catch{/* Shared wallet alert presents the error. */}finally{setBusy(false);}}}><span>{w.kind==='privy'?'Privy wallet':'External wallet'}</span><span className="mono">{w.address}</span></button>)}</div>
  <div className={styles.actions}><button className="button secondary" onClick={()=>{wallet.connect();setOpen(false);}}>Connect another</button><button className="button secondary" onClick={()=>{wallet.disconnect();setOpen(false);}}>Disconnect</button></div>
  <Dialog.Close asChild><button className="button full">Done</button></Dialog.Close>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
