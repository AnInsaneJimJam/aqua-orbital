'use client';
import type {PaymentViewState} from './usePayment';
import styles from './Invoice.module.css';
/** Presentation receives amounts and callbacks only. It never selects a spender
 * or constructs a transaction, so the existing template can be redesigned. */
export function PaymentView({state:s}:{state:PaymentViewState}){
 const r=s.review;
 return <div className={styles.payment} aria-label="Pay invoice">
  <h3>Pay invoice</h3>
  {!s.enabled&&<p className="hint">{!s.connected?'Connect a wallet using the shared wallet control to check payment availability.':s.wrongChain?'Switch your wallet to the invoice network to continue.':'Refresh the invoice and verified deployment to check payment availability.'}</p>}
  {s.enabled&&<div className={styles.fields}>
   <label>Payment token<select value={s.token} onChange={e=>s.setToken(e.target.value)} disabled={s.busy||!!s.pending}>{s.tokens.map(t=><option key={t}>{t}</option>)}</select></label>
   <label>Maximum input<input value={s.maximum} onChange={e=>s.setMaximum(e.target.value)} disabled={s.busy||!!s.pending} inputMode="decimal" autoComplete="off" placeholder="0.00"/></label>
  </div>}
  {r&&<div aria-label="Payment review">
   <h3>{r.stage==='approval'?'Review token approval':'Review payment'}</h3>
   {r.demo&&<p className="notice">The input asset is a demo token with no redemption value.</p>}
   <dl className={styles.terms}>
    <div><dt>Network</dt><dd>{r.network}</dd></div><div><dt>Payer</dt><dd className="mono">{r.payer}</dd></div>
    <div><dt>Amount to spend</dt><dd>{r.input}</dd></div><div><dt>Your input ceiling</dt><dd>{r.maximum}</dd></div>
    <div><dt>Minimum settlement</dt><dd>{r.minimum}</dd></div><div><dt>Curve fee (included)</dt><dd>{r.fee}</dd></div>
    <div><dt>Estimated USDC refund</dt><dd>{r.refund}</dd></div><div><dt>Token approval</dt><dd>{r.approval}</dd></div>
    <div><dt>{r.stage==='approval'?'Approval gas budget':'Payment gas budget'}</dt><dd>{r.gas}</dd></div>
   </dl>
   <h3>Settlement recipients</h3><ul className={styles.recipients}>{r.recipients.map(v=><li key={v.address}><span className="mono">{v.address}</span><div>{v.amount}</div></li>)}</ul>
   {r.stage==='approval'&&<p className="hint">This approval permits the invoice adapter to spend the amount shown. Payment needs a fresh quote, its own gas estimate and a separate confirmation.</p>}
   <details><summary>Approval and review details</summary><p>Spender</p><p className="mono">{r.spender}</p><p>Review expires: {r.expires}</p></details>
  </div>}
  {s.pending&&<div className="notice"><p>Submitted {s.pending.stage} · {s.pending.network}</p><p className="mono">{s.pending.hash}</p><p>Payer: <span className="mono">{s.pending.account}</span></p></div>}
  {s.confirmation&&<details><summary>{s.confirmation.status==='success'?'Confirmed transaction':'Reverted transaction'}</summary><p className="mono">{s.confirmation.hash}</p><p>Gas paid: {s.confirmation.gas}</p></details>}
  <div role="status" aria-live="polite">
   {s.message&&<p className="notice">{s.message}</p>}
   {s.phase==='stale'&&!s.pending&&<p className="hint">Get a fresh quote before reviewing the payment.</p>}
   {s.phase==='preparing'&&<p>Checking the quote, wallet funds and simulation…</p>}
   {s.phase==='submitting'&&<p>Rechecking the reviewed action. Confirm in your wallet when prompted.</p>}
  </div>
  {s.pending?<button className="button full" onClick={s.resume} disabled={s.busy}>Resume receipt tracking</button>
   :r?<button className="button full" onClick={s.submit} disabled={s.busy||!s.enabled}>{s.busy?'Waiting for wallet…':r.stage==='approval'?`Approve ${r.approval}`:`Pay ${r.input}`}</button>
   :<button className="button full" onClick={s.prepare} disabled={!s.enabled||s.busy||!s.maximum.trim()}>{!s.enabled?'Payment unavailable':s.busy?'Preparing review…':'Get payment quote'}</button>}
 </div>;
}
