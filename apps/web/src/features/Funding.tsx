'use client';
import Link from '../components/AppLink';
import {ArrowRight,ArrowUpRight,RotateCw} from 'lucide-react';
import TokenIcon from '../components/TokenIcon';
import {TransactionLink} from '../components/TransactionLink';
import {useDemoFunding} from './useDemoFunding';
import styles from './Funding.module.css';
export default function Funding(){
 const s=useDemoFunding();
 return <section className={`page ${styles.page}`}>
  <header className={styles.intro}><h1>Demo <em>tokens.</em></h1><p>Explore Orbital Swap on {s.network}.</p><p className={styles.disclaimer}>For testing only. Demo tokens have no real monetary value.</p></header>
  <section className={styles.funding} aria-label="Demo token faucet">
   <div className={styles.columnLabels} aria-hidden="true"><span>Token</span><span>Wallet balance</span><span>Action</span></div>
   {!s.local&&<section className={`${styles.token} ${styles.gas}`} aria-label="Testnet USDC funding"><div className={styles.tokenTitle}><TokenIcon symbol="USDC" size={36}/><div><h3>USDC</h3><p>Settlement &amp; network fees</p></div></div><p className={styles.faucetHint}>Choose Arc Testnet in the Circle faucet.</p><a className="button secondary compact" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Open Circle faucet <ArrowUpRight size={15} aria-hidden="true"/></a></section>}
   <div className={styles.tokens}>{s.assets.map(t=><article className={styles.token} key={t.address}><div className={styles.tokenTitle}><TokenIcon symbol={t.symbol} size={36}/><div><h3>{t.symbol}</h3><p>Demo token</p></div></div><div className={styles.balance}><span>Wallet balance</span><strong>{s.connected?t.balance:'—'}</strong></div><button className="button secondary compact" disabled={!s.enabled||s.busy||!!s.pending||!!s.review} onClick={()=>s.prepare(t.address)}>Review {t.symbol} faucet</button></article>)}</div>
   {!s.assets.length&&<p className="hint">Demo token claims become available when a verified deployment is configured.</p>}
   <div className={styles.sectionHead}><p>1,000 units of each demo token, once every 24 hours.</p>{s.connected&&<button className="icon-button" aria-label="Refresh balances" title="Refresh balances" disabled={s.busy} onClick={s.refresh}><RotateCw size={17} aria-hidden="true"/></button>}</div>
   <p className={styles.disclaimer}>Demo tokens have no redemption value. Use them to explore Orbital on {s.network}.</p>
   {s.local&&<p className="hint">Your local wallet uses test ETH for gas. Local USDC is also a demo token.</p>}
   {!s.connected?<div className={styles.connect}><p>Connect your wallet to see balances and request tokens.</p><button className="button" onClick={s.connect}>Connect wallet</button></div>:<>
    {s.address&&<div className={styles.wallet}><span>Receiving wallet</span><span className="mono">{s.address}</span></div>}
    {s.wrongChain&&<button className="button" onClick={s.switchNetwork}>Switch to {s.network}</button>}
    {s.review&&<section className={`review-panel ${styles.review}`} aria-label="Faucet review"><div className="eyebrow">Confirm your request</div><h2>Review demo funding</h2><dl className={styles.terms}><div><dt>You receive</dt><dd>1,000 {s.review.symbol}</dd></div><div><dt>Network</dt><dd>{s.network}</dd></div><div><dt>Recipient</dt><dd className="mono">{s.review.account}</dd></div><div><dt>Gas budget</dt><dd>{s.review.gas}</dd></div><div><dt>Token approval</dt><dd>None</dd></div></dl><details><summary>Token contract</summary><p className="mono">{s.review.token}</p></details><button className="button full" disabled={s.busy} onClick={s.submit}>Claim reviewed demo tokens</button><button className="text-button" disabled={s.busy} onClick={s.dismiss}>Back to funding</button></section>}
    {s.pending&&<div className={`review-panel ${styles.review}`}><p>Request submitted</p><TransactionLink hash={s.pending}/><p className="mono">{s.pending}</p><button className="button full" disabled={s.busy} onClick={s.resume}>Resume faucet receipt</button></div>}
   </>}
   <div role="status" aria-live="polite">{s.busy&&<p className="hint">Checking funding and wallet confirmation…</p>}{s.message&&<p className="notice">{s.message}</p>}</div>
  </section>
  <nav className={styles.next} aria-label="After funding"><Link className="inline-link" href="/swap">Go to swap <ArrowRight size={16} aria-hidden="true"/></Link><Link className="inline-link" href="/liquidity/new">Provide liquidity <ArrowRight size={16} aria-hidden="true"/></Link></nav>
 </section>;
}
