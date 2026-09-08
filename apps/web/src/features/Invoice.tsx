'use client';
import Link from 'next/link';
import {copy} from '../content';
import {useInvoice, type InvoiceViewState} from './useInvoice';
import {usePayment} from './usePayment';
import {PaymentView} from './Payment';
import {useInvoiceAdmin} from './useInvoiceAdmin';
import {InvoiceAdminView} from './InvoiceAdmin';
import {useWallet} from '../wallet/WalletProvider';
import type {ReactNode} from 'react';
import styles from './Invoice.module.css';

export function InvoiceView({state,payment,administration}: {state: InvoiceViewState;payment?:ReactNode;administration?:ReactNode}) {
  const {phase, terms, observation} = state;
  const unavailable = phase === 'unavailable', invalid = phase === 'invalid', absent = phase === 'not-found';
  return <section className="page">
    <Link href="/pay">← Payments</Link>
    <div className={styles.header}><h1>Invoice</h1><p className="mono">{state.id}</p></div>
    <div className={`panel ${styles.card}`} aria-busy={state.refreshing}>
      {phase !== 'loaded' ? <div className="empty" role="status">
        <h2>{invalid ? 'Invalid identifier' : unavailable ? 'Invoice unavailable' : absent ? 'Invoice not found' : 'Checking invoice history…'}</h2>
        <p>{invalid ? copy.invoice.invalid : unavailable ? copy.invoice.unavailable : absent ? `No invoice with this identifier was found in the indexed history through block ${observation!.block}.` : copy.invoice.loading}</p>
      </div> : terms && <>
        <div className="eyebrow">{terms.network} · USDC settlement</div>
        <h2 className={styles.amount}>{terms.amount}</h2>
        <p className="pill">{terms.status}</p>
        {terms.demo && <p className="notice">{copy.invoice.demoSettlement}</p>}
        <dl className={styles.terms}>
          <div><dt>Merchant</dt><dd className="mono">{terms.merchant}</dd></div>
          <div><dt>Invoice deadline</dt><dd>{terms.deadline}</dd></div>
        </dl>
        <h3>Recipients</h3>
        <ul className={styles.recipients}>{terms.recipients.map(r => <li key={r.address}>
          <div className="mono">{r.address}</div><div className={styles.split}><span>{r.share}</span><span className="mono">{r.amount}</span></div>
        </li>)}</ul>
        {terms.payment && <div className={styles.payment}>
          <h3>{terms.payment.label}</h3>
          <dl className={styles.terms}><div><dt>Payer</dt><dd className="mono">{terms.payment.payer}</dd></div>
            <div><dt>Amount spent</dt><dd className="mono">{terms.payment.input}</dd></div>
            <div><dt>USDC refund</dt><dd className="mono">{terms.payment.refund}</dd></div></dl>
          {terms.payment.inputDemo && <p className="hint">{copy.invoice.demoInput}</p>}
        </div>}
        <p className="hint">{copy.invoice.readOnly}</p>
        {payment}
        {administration}
        <details><summary>Receipt details</summary><div className="stack">
          {terms.receipts.map(r => <div key={r.label}>{r.href ? <a href={r.href} target="_blank" rel="noopener noreferrer">{r.label}</a> : <span>{r.label}</span>}<div className="mono">{r.hash}</div></div>)}
          <div>Invoice adapter<div className="mono">{terms.adapter}</div></div>
          <div>Reference hash<div className="mono">{terms.memoHash}</div></div>
        </div></details>
      </>}
      {observation && <div className={styles.observation} role="status">
        <p>{observation.historical ? `Historical observation at block ${observation.block}.` : `Indexed through block ${observation.block}.`}</p>
        {observation.stale && <p className="notice">{copy.invoice.stale}</p>}
        <details><summary>Index observation</summary><p className="mono">{observation.hash}</p><p>Index checked: {observation.indexedAt}</p></details>
      </div>}
      <button className={`button secondary ${styles.refresh}`} disabled={invalid || state.refreshing} onClick={state.refresh}>Refresh invoice</button>
    </div>
  </section>;
}
export default function Invoice({id}: {id: string}) {
 const state=useInvoice(id),eligible=state.payable===true;
 const payment=usePayment(id,eligible,state.refresh);
 const wallet=useWallet(),invoice=state.adminInvoice,merchant=invoice?.merchant.toLowerCase()===wallet.address?.toLowerCase();
 const admin=useInvoiceAdmin('cancel',id,()=>{if(!invoice)throw Error('Refresh the invoice before cancelling');return {kind:'cancel',invoice};},!!invoice&&invoice.status==='unpaid'&&merchant,state.refresh);
 const paymentView=state.terms?.status==='Unpaid at indexed block'||payment.pending||payment.confirmation?<PaymentView state={payment}/>:null;
 const adminView=merchant&&invoice?.status==='unpaid'||admin.pending||admin.confirmation?<InvoiceAdminView state={admin}/>:null;
 // Keep submitted receipt recovery visible even if an invoice refresh fails.
 return <><InvoiceView state={state} payment={paymentView} administration={adminView}/>{state.phase!=='loaded'&&(payment.pending||admin.pending)&&<section className="page"><div className="panel">{payment.pending&&<PaymentView state={payment}/>} {admin.pending&&<InvoiceAdminView state={admin}/>}</div></section>}</>;
}
