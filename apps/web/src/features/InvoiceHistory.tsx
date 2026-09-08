'use client';
import Link from 'next/link';
import {RotateCw} from 'lucide-react';
import styles from './Payments.module.css';
import {useInvoices} from './useInvoices';
export function InvoiceHistory(){
 const s=useInvoices();
 return <section className={styles.history} aria-label="Your invoices"><div className={styles.historyHeader}><h2>Your invoices</h2><button className={styles.refresh} aria-label="Refresh invoices" title="Refresh invoices" disabled={s.refreshing||!s.connected} onClick={s.restart}><RotateCw size={16} aria-hidden="true"/></button></div>
 {!s.connected?<p className={styles.empty}>Connect your wallet to see your invoices.</p>:<>
 {s.error?<p className="notice" role="status">Invoice history is unavailable. Refresh to restart the canonical listing.</p>:s.loading?<p role="status">Reading invoice history…</p>:!s.items?.length?<p>No invoices found on this page.</p>:s.items.map(i=><article className={`panel ${styles.invoice}`} key={i.id}><div className="row"><h3>{i.amount}</h3><span className="pill">{i.status}</span></div><p>{i.recipients} settlement recipient{i.recipients===1?'':'s'} · Expires {i.expiry}</p><Link href={`/pay/${i.id}`}>Open invoice ↗</Link></article>)}
 {s.block&&<p className="hint">{s.historical?'Historical page':'History'} at block {s.block}.{s.stale?' Index is catching up; refresh before relying on its status.':''}</p>}
 {(s.hasPrevious||s.hasNext)&&<nav className="row" aria-label="Invoice pages"><button className="button secondary" disabled={!s.hasPrevious||s.refreshing} onClick={s.previous}>Previous invoices</button><span>Page {s.page}</span><button className="button secondary" disabled={!s.hasNext||s.refreshing} onClick={s.next}>Next invoices</button></nav>}</>}
 </section>;
}
