'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useWallet} from '../wallet/WalletProvider';
import WalletControl from '../wallet/WalletControl';
import {selectedChain} from '../wallet/config';
import {copy} from '../content';
import styles from './Shell.module.css';
export function OrbitMark(){return <span className={styles.mark} aria-hidden="true"><i/></span>;}
export default function Shell({children}:{children:React.ReactNode}){
 const path=usePathname();const wallet=useWallet();
 return <><a className="skip" href="#main">Skip to content</a><header className={styles.header}><Link className={styles.brand} href="/" aria-label="Orbital home"><OrbitMark/>{copy.brand}</Link>
 <nav aria-label="Main navigation">{[['/swap','Swap'],['/liquidity','Liquidity'],['/pay','Payments']].map(([url,label])=><Link key={url} href={url!} aria-current={path.startsWith(url!)?'page':undefined}>{label}</Link>)}</nav>
 <WalletControl/></header>
 {wallet.error&&<div className="notice" role="alert">{wallet.error}</div>}
 <main id="main">{children}</main><footer className={styles.footer}><div><Link href="/proof">Build evidence</Link><a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">Read the paper ↗</a><span>{selectedChain.name}</span></div><p>{copy.disclosure}</p><small>{copy.attribution}</small></footer></>;
}
