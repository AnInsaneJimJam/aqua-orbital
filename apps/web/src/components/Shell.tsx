'use client';
import Link from './AppLink';
import {usePathname} from 'next/navigation';
import {useWallet} from '../wallet/WalletProvider';
import WalletControl from '../wallet/WalletControl';
import {selectedChain} from '../wallet/config';
import {copy} from '../content';
import styles from './Shell.module.css';
import OrbitMark from './OrbitMark';
export default function Shell({children}:{children:React.ReactNode}){
 const path=usePathname();const wallet=useWallet();
 return <div className={styles.frame}><a className="skip" href="#main">Skip to content</a><header className={styles.header}><Link className={styles.brand} href="/" aria-label="Orbital home"><OrbitMark className={styles.mark}/>{copy.brand}</Link>
 <nav aria-label="Main navigation">{[['/swap','Swap'],['/liquidity','Liquidity'],['/pay','Payments'],['/fund','Demo tokens'],['/proof','Protocol notes']].map(([url,label])=><Link key={url} href={url!} aria-current={path===url||path.startsWith(`${url}/`)?'page':undefined}>{label}</Link>)}</nav>
 <WalletControl/></header>
 {wallet.error&&<div className="notice" role="alert">{wallet.error}</div>}
 <main id="main" tabIndex={-1} className={styles.main}>{children}</main><footer className={styles.footer}><div className={styles.footerTop}><nav aria-label="Resources"><a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">Paper ↗</a><span className={styles.network}><i aria-hidden="true"/>{selectedChain.name}</span></nav><small>{copy.attribution}</small></div></footer></div>;
}
