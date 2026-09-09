'use client';
import Link from '../components/AppLink';
import {ArrowRight,ArrowUpRight,Coins,RotateCw} from 'lucide-react';
import {TransactionLink} from '../components/TransactionLink';
import {useDemoFunding} from './useDemoFunding';
import styles from './Funding.module.css';
export default function Funding(){
 const s=useDemoFunding();
 return <section className={`page ${styles.page}`}>
  <div className="page-head"><div><div className="eyebrow">{s.network}</div><h1>Demo tokens</h1><p>Fund your wallet, then try a swap or provide liquidity.</p></div><span className={styles.pageIcon}><Coins size={24} aria-hidden="true"/></span></div>
  <div className={styles.funding}>
   {!s.local&&<section className={`panel ${styles.gas}`} aria-label="Testnet USDC funding"><div><span className={styles.tokenMark}>$</span><h2>Start with USDC</h2><p>Use testnet USDC for settlement and network fees. Choose Arc Testnet in the Circle faucet.</p></div><a className="button secondary" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Open Circle faucet <ArrowUpRight size={16} aria-hidden="true"/></a></section>}
   <section className="panel" aria-label="Demo token faucet">
    <div className={styles.sectionHead}><div><h2>Get demo tokens</h2><p>1,000 units of each token, once every 24 hours.</p></div>{s.connected&&<button className="icon-button" aria-label="Refresh balances" title="Refresh balances" disabled={s.busy} onClick={s.refresh}><RotateCw size={17} aria-hidden="true"/></button>}</div>
    <p className="notice">Demo tokens have no redemption value. Use them to explore Orbital on {s.network}.</p>
    {s.address&&<div className={styles.wallet}><span>Receiving wallet</span><span className="mono">{s.address}</span></div>}
    {s.local&&<p className="hint">Your local wallet uses test ETH for gas. Local USDC is also a demo token.</p>}
    {!s.connected?<div className={styles.connect}><p>Connect your wallet to see balances and request tokens.</p><button className="button" onClick={s.connect}>Connect wallet</button></div>:<>
     {s.wrongChain&&<button className="button full" onClick={s.switchNetwork}>Switch to {s.network}</button>}
     <div className={styles.tokens}>{s.assets.map(t=><article className={styles.token} key={t.address}><div className={styles.tokenTitle}><span className={styles.tokenMark}>{t.symbol==='USDC'?'$':t.symbol==='oUSD6'?'6':'18'}</span><h3>{t.symbol}</h3></div><div className={styles.balance}><span>Your balance</span><strong>{t.balance}</strong></div><button className="button secondary full" disabled={!s.enabled||s.busy||!!s.pending||!!s.review} onClick={()=>s.prepare(t.address)}>Review {t.symbol} faucet</button></article>)}</div>
     {!s.assets.length&&<p className="notice">Demo token claims become available when a verified deployment is configured.</p>}
     {s.review&&<section className="review-panel" aria-label="Faucet review"><div className="eyebrow">Confirm your request</div><h2>Review demo funding</h2><dl className={styles.terms}><div><dt>You receive</dt><dd>1,000 {s.review.symbol}</dd></div><div><dt>Network</dt><dd>{s.network}</dd></div><div><dt>Recipient</dt><dd className="mono">{s.review.account}</dd></div><div><dt>Gas budget</dt><dd>{s.review.gas}</dd></div><div><dt>Token approval</dt><dd>None</dd></div></dl><details><summary>Token contract</summary><p className="mono">{s.review.token}</p></details><button className="button full" disabled={s.busy} onClick={s.submit}>Claim reviewed demo tokens</button><button className="text-button" disabled={s.busy} onClick={s.dismiss}>Back to funding</button></section>}
     {s.pending&&<div className="review-panel"><p>Request submitted</p><TransactionLink hash={s.pending}/><p className="mono">{s.pending}</p><button className="button full" disabled={s.busy} onClick={s.resume}>Resume faucet receipt</button></div>}
    </>}
    <div role="status" aria-live="polite">{s.busy&&<p className="hint">Checking funding and wallet confirmation…</p>}{s.message&&<p className="notice">{s.message}</p>}</div>
   </section>
  </div>
  <nav className={styles.next} aria-label="After funding"><Link className="inline-link" href="/swap">Go to swap <ArrowRight size={16} aria-hidden="true"/></Link><Link className="inline-link" href="/liquidity/new">Provide liquidity <ArrowRight size={16} aria-hidden="true"/></Link></nav>
 </section>;
}
