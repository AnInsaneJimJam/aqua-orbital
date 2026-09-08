'use client';
import Link from 'next/link';
import {useDemoFunding} from './useDemoFunding';
export default function Funding(){
 const s=useDemoFunding();
 return <section className="page" style={{maxWidth:570}}><div className="page-head"><div><div className="eyebrow">{s.network}</div><h1>Demo funding</h1></div></div><div className="panel">
 <p className="notice">Demo tokens have no redemption value. The faucet gives 1,000 units per token, once every 24 hours.</p>
 {s.address&&<p className="mono">Your wallet: {s.address}</p>}
 {!s.local&&<p>Get testnet USDC for settlement and gas from the <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>. Select Arc Testnet and use your wallet address above.</p>}
 {s.local&&<p className="hint">Local USDC is a demo token. Your local wallet has test ETH for gas.</p>}
 {!s.connected?<button className="button full" onClick={s.connect}>Connect wallet</button>:<>
 <>{s.wrongChain&&<button className="button full" onClick={s.switchNetwork}>Switch to {s.network}</button>}</><div className="stack">{s.assets.map(t=><div key={t.address}><div className="row"><h3>{t.symbol}</h3><span>Balance: {t.balance}</span></div><button className="button secondary" disabled={!s.enabled||s.busy||!!s.pending||!!s.review} onClick={()=>s.prepare(t.address)}>Review {t.symbol} faucet</button></div>)}</div>
 {!s.assets.length&&<p className="notice">Demo token claims become available when a verified deployment is configured.</p>}
 {s.review&&<section aria-label="Faucet review"><h2>Review demo funding</h2><dl><dt>You receive</dt><dd>1,000 {s.review.symbol}</dd><dt>Network</dt><dd>{s.network}</dd><dt>Recipient</dt><dd className="mono">{s.review.account}</dd><dt>Token contract</dt><dd className="mono">{s.review.token}</dd><dt>Gas budget</dt><dd>{s.review.gas}</dd><dt>Token approval</dt><dd>None</dd></dl><button className="button full" disabled={s.busy} onClick={s.submit}>Claim reviewed demo tokens</button><button className="button secondary" disabled={s.busy} onClick={s.dismiss}>Back to funding</button></section>}
 {s.pending&&<><p className="mono">Submitted: {s.pending}</p><button className="button full" disabled={s.busy} onClick={s.resume}>Resume faucet receipt</button></>}
 <button className="button secondary" disabled={s.busy} onClick={s.refresh}>Refresh balances</button></>}
 <div role="status" aria-live="polite">{s.busy&&<p>Checking funding and wallet confirmation…</p>}{s.message&&<p className="notice mono">{s.message}</p>}</div>
 <p><Link href="/swap">Go to swap</Link> · <Link href="/liquidity/new">Provide liquidity</Link></p></div></section>;
}
