'use client';
import Link from 'next/link';
import {useInvoices} from './useInvoices';
export function InvoiceHistory(){
 const s=useInvoices();
 return <section className="stack" aria-label="Your invoices" style={{marginTop:40}}><div className="row"><h2>Your invoices</h2><button className="button secondary" disabled={s.refreshing||!s.connected} onClick={s.restart}>Refresh invoices</button></div>
 {!s.connected?<p>Connect a wallet to view its merchant invoices.</p>:<><p className="mono">Merchant: {s.address}</p>
 {s.error?<p className="notice" role="status">Invoice history is unavailable. Refresh to restart the canonical listing.</p>:s.loading?<p role="status">Reading invoice history…</p>:!s.items?.length?<p>No invoices found on this page.</p>:s.items.map(i=><article className="panel" key={i.id}><div className="row"><h3>{i.amount}</h3><span className="pill">{i.status}</span></div><p>{i.recipients} settlement recipient{i.recipients===1?'':'s'} · Expires {i.expiry}</p><p className="mono">{i.id}</p><Link className="button secondary" href={`/pay/${i.id}`}>Open invoice</Link></article>)}
 {s.block&&<p className="hint">{s.historical?'Historical page':'History'} at block {s.block}.{s.stale?' Index is catching up; refresh before relying on its status.':''} Payments always check current onchain terms.</p>}
 <nav className="row" aria-label="Invoice pages"><button className="button secondary" disabled={!s.hasPrevious||s.refreshing} onClick={s.previous}>Previous invoices</button><span>Page {s.page}</span><button className="button secondary" disabled={!s.hasNext||s.refreshing} onClick={s.next}>Next invoices</button></nav></>}
 </section>;
}
