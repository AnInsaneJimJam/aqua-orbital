'use client';
import {useState} from 'react';
import Link from './AppLink';
import {usePathname} from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {Menu,X} from 'lucide-react';
import {useWallet} from '../wallet/WalletProvider';
import WalletControl from '../wallet/WalletControl';
import {selectedChain} from '../wallet/config';
import {copy} from '../content';
import styles from './Shell.module.css';

const destinations=[['/swap','Swap'],['/liquidity','Liquidity'],['/pay','Payments'],['/fund','Demo Tokens']] as const;

export default function Shell({children}:{children:React.ReactNode}){
 const path=usePathname(),wallet=useWallet();
 const [menuOpen,setMenuOpen]=useState(false);
 const wrongNetwork=wallet.connected&&wallet.chainId!==selectedChain.id;
 function navigation(){return destinations.map(([url,label])=><Link key={url} href={url} onClick={()=>setMenuOpen(false)} aria-current={path===url||path.startsWith(`${url}/`)?'page':undefined}>{label}</Link>);}
 return <div className={styles.frame}>
  <a className="skip" href="#main">Skip to content</a>
  <header className={styles.header}>
   <Link className={styles.brand} href="/" aria-label="Orbital Swap home"><img src="/brand/orbital.svg" width={34} height={34} alt=""/>{copy.brand}</Link>
   <nav className={styles.desktopNavigation} aria-label="Main navigation">{navigation()}</nav>
   <div className={styles.walletArea}>
    <span className={styles.network} data-wrong-network={wrongNetwork}><i aria-hidden="true"/>{wrongNetwork?'Wrong network':selectedChain.name}</span>
    <WalletControl/>
   </div>
   <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <Dialog.Trigger asChild><button type="button" className={styles.menuTrigger} aria-label="Open navigation" aria-expanded={menuOpen}><Menu size={22} aria-hidden="true"/></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className={styles.menuOverlay}/><Dialog.Content className={styles.menuContent}>
     <div className={styles.menuHeading}><Dialog.Title>Explore Orbital Swap</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="Close navigation"><X size={20} aria-hidden="true"/></button></Dialog.Close></div>
     <Dialog.Description className="hint">Stablecoin swaps on {selectedChain.name}.</Dialog.Description>
     <nav className={styles.mobileNavigation} aria-label="Main navigation">{navigation()}</nav>
     <span className={styles.network} data-wrong-network={wrongNetwork}><i aria-hidden="true"/>{wrongNetwork?`Wrong network · use ${selectedChain.name}`:selectedChain.name}</span>
    </Dialog.Content></Dialog.Portal>
   </Dialog.Root>
  </header>
  {wallet.error&&<div className="notice" role="alert">{wallet.error}</div>}
  <main id="main" tabIndex={-1} className={styles.main}>{children}</main>
  <footer className={styles.footer}><nav aria-label="Resources"><Link href="/docs">Docs</Link>{path!=='/docs'&&<Link href="/proof">Protocol notes</Link>}<a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">Orbital paper ↗</a></nav><small>{copy.attribution}</small></footer>
 </div>;
}
