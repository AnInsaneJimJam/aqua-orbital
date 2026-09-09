'use client';
import {useState} from 'react';
import {keccak256,toHex,type Address} from 'viem';
import {parseAmount} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {useInvoiceAdmin} from './useInvoiceAdmin';
import {InvoiceHistory} from './InvoiceHistory';
import styles from './Payments.module.css';
import {InvoiceAdminView} from './InvoiceAdmin';
import {Select} from '../components/Select';
export default function Payments(){
 const [amount,setAmount]=useState('5'),[expiry,setExpiry]=useState('24'),[reference,setReference]=useState('');
 const [recipients,setRecipients]=useState([{address:'',share:'100'}]);const wallet=useWallet();
 const intentKey=JSON.stringify([amount,expiry,reference,recipients]);
 const state=useInvoiceAdmin('create',intentKey,(account,now)=>({kind:'create',terms:{amountDueRaw:parseAmount(amount,6),expiresAt:now+BigInt(expiry)*3600n,
  recipients:recipients.map((r,i)=>(r.address||(i===0?account:'')) as Address),bps:recipients.map(r=>Number(parseAmount(r.share,2))),memoHash:keccak256(toHex(reference))}}));
 const locked=state.busy||!!state.pending;
 function changeRecipient(index:number,field:'address'|'share',value:string){setRecipients(rows=>rows.map((r,i)=>i===index?{...r,[field]:value}:r));}
 return <section className="page"><div className="page-head"><div><h1>Payments</h1><p>Create an invoice. Get paid in USDC.</p></div></div>
  <div className={styles.workspace}><div className="panel"><h2>Create an invoice</h2>
   <div className="field"><label htmlFor="invoice-amount">Amount due in USDC</label><input id="invoice-amount" className={styles.amountInput} inputMode="decimal" autoComplete="off" value={amount} maxLength={80} disabled={locked} onChange={e=>setAmount(e.target.value)}/><span className="hint">Your customer can pay with any supported token.</span></div>
   <details><summary>Recipients &amp; splits</summary>{recipients.map((r,i)=><div key={i} className={styles.recipient}><div className="field"><label htmlFor={`recipient-${i}`}>Recipient {i+1}</label><input id={`recipient-${i}`} className="mono" autoComplete="off" spellCheck={false} value={r.address||(i===0?wallet.address??'':'')} maxLength={42} disabled={locked} onChange={e=>changeRecipient(i,'address',e.target.value)} placeholder={i===0?'Connect the merchant wallet':'0x…'}/></div>
    <div className="field"><label htmlFor={`share-${i}`}>Recipient {i+1} share (%)</label><input id={`share-${i}`} inputMode="decimal" value={r.share} maxLength={6} disabled={locked} onChange={e=>changeRecipient(i,'share',e.target.value)}/></div>
    {i>0&&<button className="button secondary" disabled={locked} onClick={()=>setRecipients(rows=>rows.filter((_,j)=>j!==i))}>Remove recipient {i+1}</button>}
   </div>)}
   {recipients.length<3&&<button className="button secondary" disabled={locked} onClick={()=>setRecipients(rows=>[...rows,{address:'',share:''}])}>Add recipient</button>}
   <p className="hint">Up to three recipients. Shares must total 100%. The last recipient receives any fractional-unit remainder.</p></details>
   <div className="field"><label htmlFor="expiry">Expires in</label><Select id="expiry" value={expiry} disabled={locked} onValueChange={setExpiry} options={[{value:'1',label:'1 hour'},{value:'24',label:'24 hours'},{value:'168',label:'7 days'}]}/></div>
   <details><summary>Add a reference</summary><div className="field"><label htmlFor="reference">Reference (optional)</label><input id="reference" value={reference} disabled={locked} onChange={e=>setReference(e.target.value)} maxLength={120}/><span className="hint">Only its hash goes onchain. Do not enter private invoice details.</span></div></details>
   <InvoiceAdminView state={state}/>
  </div><InvoiceHistory/></div></section>;
}
