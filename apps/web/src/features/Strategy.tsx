'use client';
import Link from '../components/AppLink';
import type {ReactNode} from 'react';
import {copy} from '../content';
import {useStrategy,type StrategyViewState,type StrategyObservationView,type StrategyDataView} from './useStrategy';
import styles from './Strategy.module.css';
import {useStrategyAdmin} from './useStrategyAdmin';
import {StrategyAdminView} from './StrategyAdmin';
import TokenIcon from '../components/TokenIcon';

export function StrategyObservation({observation,refreshing}:{observation:StrategyObservationView;refreshing:boolean}){
 return <div className={styles.observation} role="status">
  {refreshing&&<p>Checking for updated observations…</p>}
  {observation.stale&&<p className="notice">{copy.strategy.stale}</p>}
  <details><summary>Observation details</summary><p>{observation.historical?`Historical observation at block ${observation.block}.`:`Inventory observed at block ${observation.block}.`}</p><p className="mono">{observation.hash}</p><p>Index checked: {observation.indexedAt}</p></details>
 </div>;
}
export function StrategyInventory({strategy,compact=false}:{strategy:StrategyDataView;compact?:boolean}){
 return <div className={styles.inventory}>{strategy.inventory.map(row=><section key={row.token.address} aria-label={`${row.token.symbol} inventory`} className={styles.asset}>
  <h3><TokenIcon symbol={row.token.symbol}/>{row.token.symbol}</h3>
  <dl className={styles.amounts}>
   <div><dt>Available output ceiling</dt><dd>{row.available} {row.token.symbol}</dd></div>
   <div><dt>Cumulative fees received</dt><dd>{row.fees} {row.token.symbol}</dd></div>
  </dl><details><summary>Principal &amp; backing</summary><dl className={styles.amounts}><div><dt>Principal inventory</dt><dd>{row.principal} {row.token.symbol}</dd></div>
   {!compact&&<><div><dt>Aqua advertised allocation</dt><dd>{row.allocation} {row.token.symbol}</dd></div>
    <div><dt>Maker wallet balance</dt><dd>{row.wallet} {row.token.symbol}</dd></div>
    <div><dt>Allowance to Aqua</dt><dd>{row.allowance} {row.token.symbol}</dd></div></>}
  </dl>
  {row.fractionalPrincipal&&!compact&&<p className="hint">Principal includes a fraction below the token’s transferable unit. The output ceiling is rounded down.</p>}</details>
  {!row.live&&<p className="notice">Aqua allocation is not live.</p>}{!row.backed&&<p className="notice">Aqua allocation does not cover principal and recorded fees.</p>}
 </section>)}</div>;
}
export function StrategyView({state,administration}:{state:StrategyViewState;administration?:ReactNode}){
 const {strategy,observation}=state;
 return <section className={`page ${styles.page}`}>
  <Link href="/liquidity" className="back-link"><span aria-hidden="true">←</span> Your liquidity</Link>
  <div className={styles.header}><h1>Strategy <em>details.</em></h1></div>
  <div className={administration?styles.detailWorkspace:undefined}><div className={styles.detail} aria-busy={state.refreshing}>
   {state.phase!=='loaded'?<div className="empty" role="status"><h2>{state.phase==='invalid'?'Invalid identifier':state.phase==='unavailable'?'Strategy unavailable':state.phase==='not-found'?'Strategy not found':'Checking strategy history…'}</h2>
    <p>{state.phase==='invalid'?copy.strategy.invalid:state.phase==='not-found'?`No registered strategy with this identifier was found through block ${observation!.block}. Unactivated shipments are not included.`:state.phase==='unavailable'?copy.strategy.unavailable:'Reading the verified deployment and registered strategy history.'}</p></div>:strategy&&<>
    <div className="eyebrow">{strategy.network}</div><h2>{strategy.tokens}</h2><p className="pill">{strategy.status}</p>
    <dl className={styles.identity}><div><dt>Maker</dt><dd className="mono">{strategy.maker}</dd></div><div><dt>Swap fee</dt><dd>{strategy.fee}</dd></div><div><dt>State version</dt><dd>{strategy.version}</dd></div></dl>
    <p>{copy.strategy.custody}</p><StrategyInventory strategy={strategy}/><p className="hint">{copy.strategy.capacity}</p><p className="hint">{copy.strategy.fees}</p>
    <div className={styles.receiptLinks}>{strategy.receipts.filter(r=>r.href).map(r=><a className="inline-link" key={r.label} href={r.href!} target="_blank" rel="noopener noreferrer">{r.label}<span aria-hidden="true">↗</span></a>)}</div>
    <details className={styles.technical}><summary>Configuration and receipts</summary><p className="mono">{state.id}</p>
     <p>Concentration is defined by these immutable tick keys and radii. No preset name is inferred from an unknown profile.</p>
     <ol className={styles.ticks}>{strategy.ticks.map((tick,i)=><li key={tick.key}><strong>Tick {i+1} · {tick.classification}</strong><p>{tick.fullRange?'Full-range anchor':`Quantized tick key: ${tick.key}`}</p><p className="mono">Radius (internal units): {tick.radius}</p></li>)}</ol>
     <div className="stack">{strategy.receipts.map(r=><div key={r.label}><span>{r.label}</span><div className="mono">{r.hash}</div></div>)}
      <div>Configuration hash<div className="mono">{strategy.configHash}</div></div><div>Orbital router<div className="mono">{strategy.router}</div></div></div>
    </details>
   </>}
   {observation&&<StrategyObservation observation={observation} refreshing={state.refreshing}/>}
   <div className={styles.actions}><button className="button secondary" disabled={state.phase==='invalid'||state.refreshing} onClick={state.refresh}>Refresh strategy</button></div>
  </div>{administration&&<aside className={styles.manage}>{administration}</aside>}</div>
 </section>;
}
export default function Strategy({id}:{id:string}){
 const state=useStrategy(id),admin=useStrategyAdmin(id,state.adminInput,state.refresh);
 return <StrategyView state={state} administration={(admin.pending||state.phase==='loaded'&&(admin.owner||admin.confirmation))&&<StrategyAdminView state={admin}/>}/>;
}
