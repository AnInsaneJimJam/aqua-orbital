'use client';
import Link from '../components/AppLink';
import type {InvoiceAdminViewState} from './useInvoiceAdmin';
import styles from './Invoice.module.css';
import {TransactionLink} from '../components/TransactionLink';
/** Presentation receives reviewed facts only; no calldata or recipient arithmetic. */
export function InvoiceAdminView({state:s}:{state:InvoiceAdminViewState}){
 const r=s.review,c=s.confirmation;
 return <div className={styles.payment} aria-label={s.kind==='create'?'Invoice creation':'Invoice cancellation'}>
  {r&&<div className={styles.review} aria-label="Invoice action review"><h3>{s.kind==='create'?'Review invoice creation':'Review invoice cancellation'}</h3>
   <dl className={styles.terms}><div><dt>Amount due</dt><dd>{r.amount}</dd></div><div><dt>Merchant</dt><dd className="mono">{r.merchant}</dd></div>
    <div><dt>Network</dt><dd>{r.network}</dd></div><div><dt>Invoice deadline</dt><dd>{r.deadline}</dd></div><div><dt>Gas budget</dt><dd>{r.gas}</dd></div></dl>
   <h3>Settlement recipients</h3><ul className={styles.recipients}>{r.recipients.map(v=><li key={v.address}><span className="mono">{v.address}</span><div className={styles.split}><span>{v.share}</span><span>{v.amount}</span></div></li>)}</ul>
   <p className="hint">{s.kind==='create'?'Creating this invoice transfers no tokens and needs no token approval. The payer reviews settlement separately.':'Cancellation prevents future payment of this unpaid invoice. It does not transfer tokens.'}</p>
   {r.demo&&<p className="notice">Settlement uses a local demo token with no redemption value.</p>}
   <details><summary>Contract and reference</summary><p className="mono">{r.adapter}</p><p className="mono">{r.memoHash}</p></details>
  </div>}
  {s.pending&&<div className="notice"><p>Submitted invoice action</p><p className="mono">{s.pending.hash}</p><p>Merchant: <span className="mono">{s.pending.account}</span></p><TransactionLink hash={s.pending.hash} label="Track invoice transaction"/></div>}
  <div role="status" aria-live="polite">{s.message&&<p className="notice">{s.message}</p>}
   {s.phase==='preparing'&&<p>Checking invoice state and transaction gas…</p>}
   {s.phase==='submitting'&&<p>Rechecking the invoice action. Confirm in your wallet when prompted.</p>}
   {s.phase==='stale'&&s.connected&&!s.pending&&<p className="hint">Review the current terms again before signing.</p>}
  </div>
  {c&&<div><TransactionLink hash={c.hash} label="View invoice transaction"/><details><summary>{c.status==='success'?'Confirmed invoice transaction':'Reverted invoice transaction'}</summary><p className="mono">{c.hash}</p><p>Gas paid: {c.gas}</p></details>
   {c.invoiceId&&c.kind==='create'&&<><Link className="button full" href={`/pay/${c.invoiceId}`}>Open shareable invoice</Link><p className="hint">The indexed invoice page may take a moment to catch up with this receipt. Copy its page URL to share.</p></>}
  </div>}
  {s.pending?<button className="button full" disabled={s.busy} onClick={s.resume}>Resume invoice receipt</button>
   :!s.connected?<button className="button full" onClick={s.connect}>Connect merchant wallet</button>
   :s.wrongChain?<button className="button full" onClick={s.switchNetwork}>Switch to invoice network</button>
   :r?<button className="button full" disabled={s.busy||!s.enabled} onClick={s.submit}>{s.busy?'Waiting for wallet…':s.kind==='create'?'Confirm invoice creation':'Confirm invoice cancellation'}</button>
   :<button className="button full" disabled={s.busy||!s.enabled} onClick={s.prepare}>{s.busy?'Preparing review…':s.kind==='create'?'Review invoice':'Review cancellation'}</button>}
  {!s.enabled&&s.connected&&!s.wrongChain&&!s.pending&&<p className="hint">A verified deployment and eligible merchant action are required.</p>}
 </div>;
}
