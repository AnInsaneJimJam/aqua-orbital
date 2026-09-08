'use client';
import type {SwapExecutionView} from './useSwapExecution';
import styles from './SwapExecution.module.css';
export function SwapExecution({state:s,network}:{state:SwapExecutionView;network:string}){
 const r=s.review,c=s.confirmed;
 return <section aria-label="Swap execution" className={styles.execution}>
  {r&&<><h2>{r.stage==='approval'?'Review token approval':'Review swap'}</h2><dl className={styles.facts}>
   <dt>Network</dt><dd>{network}</dd><dt>You pay</dt><dd className="mono">{r.input}</dd><dt>Minimum received</dt><dd className="mono">{r.minimum}</dd>
   <dt>Trading fee · included</dt><dd className="mono">{r.fee}</dd><dt>Recipient</dt><dd className="mono">{r.recipient}</dd>
   <dt>Approval</dt><dd>{r.stage==='approval'?r.input:'Already sufficient'}</dd><dt>{r.stage==='approval'?'Approval gas budget':'Swap gas budget'}</dt><dd>{r.gas}</dd>
   <dt>Transaction deadline</dt><dd>{r.deadline}</dd><dt>Router / spender</dt><dd className="mono">{r.router}</dd>
  </dl>{r.stage==='approval'&&<p className="hint">This is an exact token approval. A fresh swap quote, gas estimate and separate signature follow its confirmation.</p>}
  <details><summary>Selected strategy</summary><p className="mono">{r.orderHash}</p><p>Maker: <span className="mono">{r.maker}</span></p><p>{r.ticks} ticks · maximum 16 crossings</p></details>
  <button className="button full" disabled={s.busy} onClick={s.submit}>{s.busy?'Confirm in wallet':r.stage==='approval'?`Approve ${r.input}`:'Submit reviewed swap'}</button></>}
  {s.pending&&<><p className="notice">Swap {s.pending.stage} submitted.</p><p className="mono">{s.pending.hash}</p><p className="hint">Payer: <span className="mono">{s.pending.account}</span></p><button className="button full" disabled={s.busy} onClick={s.resume}>Resume swap receipt</button></>}
  {c&&<div aria-label="Swap receipt"><h2>{c.reverted?'Transaction reverted':c.approval?'Approval confirmed':'Swap complete'}</h2>
   <dl className={styles.facts}>{c.input&&<><dt>Actual input</dt><dd className="mono">{c.input}</dd><dt>Actual output</dt><dd className="mono">{c.output}</dd><dt>Actual fee</dt><dd className="mono">{c.fee}</dd></>}<dt>Gas paid</dt><dd>{c.gas}</dd></dl>
   <details><summary>View transaction receipt</summary><p className="mono">{c.hash}</p>{c.crossings.length>0?<ol>{c.crossings.map((crossing,index)=><li key={index}>{crossing.direction} · tick <span className="mono">{crossing.key}</span></li>)}</ol>:!c.approval&&!c.reverted&&<p>No tick crossings were recorded.</p>}</details>
   {!s.pending&&<button className="button full" disabled={s.busy} onClick={c.approval?s.prepare:s.reset}>{c.approval?'Review fresh swap':'Swap again'}</button>}
  </div>}
  {s.busy&&!r&&!s.pending&&<p role="status">Checking the current strategy, funds and simulation…</p>}
  {s.expired&&<p className="notice" role="status">Swap review expired. Get a fresh quote before signing.</p>}
  {s.message&&<p className="notice" role="status">{s.message}</p>}
 </section>;
}
