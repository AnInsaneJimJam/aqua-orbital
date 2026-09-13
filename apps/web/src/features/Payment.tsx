'use client';
import type {PaymentViewState} from './usePayment';
import {Select} from '../components/Select';
import {TransactionLink} from '../components/TransactionLink';
import styles from './Invoice.module.css';
/** Presentation receives amounts and callbacks only. It never selects a spender
 * or constructs a transaction, so the existing template can be redesigned. */
export function PaymentView({state:s}:{state:PaymentViewState}){
 const r=s.review;
 return <div className={styles.payment} aria-label="Pay invoice">
  <h3>Pay invoice</h3>
  {!s.enabled&&<p className="hint">{!s.connected?'Connect a wallet using the shared wallet control to check payment availability.':s.wrongChain?'Switch your wallet to the invoice network to continue.':'Refresh the invoice and verified deployment to check payment availability.'}</p>}
  {s.enabled&&<div className={styles.fields}>
   <div className="field"><label htmlFor="payment-token">Payment token</label><Select id="payment-token" value={s.token} onValueChange={s.setToken} disabled={s.busy||!!s.pending} options={s.tokens.map(t=>({value:t,label:t,tokenSymbol:t}))}/></div>
   <div className="field"><label htmlFor="payment-amount">Amount to pay</label>
    <output id="payment-amount" aria-label="Calculated payment amount" className={styles.calculated}>{r?.input??(s.busy?'Preparing review…':s.quotedInput??(s.quoting?'Calculating…':'Quote unavailable'))}</output>
    <p className="hint">Calculated from the current quote. The recipient receives the invoice amount in USDC.</p>
   </div>
   <details><summary>Advanced options</summary><div className="field"><label htmlFor="payment-limit">Spending limit (optional)</label><input id="payment-limit" value={s.maximum} onChange={e=>s.setMaximum(e.target.value)} disabled={s.busy||!!s.pending} inputMode="decimal" autoComplete="off" placeholder="Automatic"/><p className="hint">Limit the {s.token} used to calculate a quote. Leave blank to use your available token balance. Approval covers only the reviewed amount; gas is checked separately.</p></div></details>
  </div>}
  {r&&<div className={styles.review} aria-label="Payment review">
   <h3>{r.stage==='approval'?'Review token approval':'Review payment'}</h3>
   {r.demo&&<p className="notice">The input asset is a demo token with no redemption value.</p>}
   <dl className={styles.terms}>
    <div><dt>Network</dt><dd>{r.network}</dd></div><div><dt>Payer</dt><dd className="mono">{r.payer}</dd></div>
    <div><dt>Amount to spend</dt><dd>{r.input}</dd></div>
    <div><dt>Minimum settlement</dt><dd>{r.minimum}</dd></div><div><dt>Curve fee (included)</dt><dd>{r.fee}</dd></div>
    <div><dt>Estimated USDC refund</dt><dd>{r.refund}</dd></div><div><dt>Token approval</dt><dd>{r.approval}</dd></div>
    <div><dt>{r.stage==='approval'?'Approval gas budget':'Payment gas budget'}</dt><dd>{r.gas}</dd></div>
   </dl>
   <h3>Settlement recipients</h3><ul className={styles.recipients}>{r.recipients.map(v=><li key={v.address}><span className="mono">{v.address}</span><div>{v.amount}</div></li>)}</ul>
   {r.stage==='approval'&&<p className="hint">This approval permits the invoice adapter to spend the amount shown. Payment needs a fresh quote, its own gas estimate and a separate confirmation.</p>}
   <details><summary>Approval and review details</summary><p>Spender</p><p className="mono">{r.spender}</p><p>Review expires: {r.expires}</p>{r.transactionDeadline&&<p>Transaction deadline: {r.transactionDeadline}</p>}</details>
  </div>}
  {s.pending&&<div className="notice"><p>Submitted {s.pending.stage} · {s.pending.network}</p><p className="mono">{s.pending.hash}</p><p>Payer: <span className="mono">{s.pending.account}</span></p><TransactionLink hash={s.pending.hash} label="Track transaction"/></div>}
  {s.confirmation&&<div><TransactionLink hash={s.confirmation.hash} label="View transaction receipt"/><details><summary>{s.confirmation.status==='success'?'Confirmed transaction':'Reverted transaction'}</summary><p className="mono">{s.confirmation.hash}</p><p>Gas paid: {s.confirmation.gas}</p></details></div>}
  <div role="status" aria-live="polite">
   {s.message&&<p className="notice">{s.message}</p>}
   {s.quoteMessage&&!r&&!s.pending&&<p className="notice">{s.quoteMessage}</p>}
   {s.phase==='stale'&&!s.pending&&<p className="hint">Get a fresh quote before reviewing the payment.</p>}
   {s.phase==='preparing'&&<p>Checking the quote, wallet funds and simulation…</p>}
   {s.phase==='submitting'&&<p>Rechecking the reviewed action. Confirm in your wallet when prompted.</p>}
  </div>
  {s.pending?<button className="button full" onClick={s.resume} disabled={s.busy}>Resume receipt tracking</button>
   :r?<button className="button full" onClick={s.submit} disabled={s.busy||!s.enabled}>{s.busy?'Waiting for wallet…':r.stage==='approval'?`Approve ${r.approval}`:`Pay ${r.input}`}</button>
   :<button className="button full" onClick={s.quotedInput?s.prepare:s.refreshQuote} disabled={!s.enabled||s.busy||(!s.quotedInput&&s.quoting)}>{!s.enabled?'Payment unavailable':s.busy?'Preparing review…':s.quotedInput?'Review payment':s.quoting?'Calculating payment…':'Retry quote'}</button>}
 </div>;
}
