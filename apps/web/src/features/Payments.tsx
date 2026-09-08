'use client';
import {useState} from 'react';
import {keccak256,toHex,type Address} from 'viem';
import {parseAmount} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {useInvoiceAdmin} from './useInvoiceAdmin';
import {InvoiceAdminView} from './InvoiceAdmin';
export default function Payments(){
 const [amount,setAmount]=useState('5'),[expiry,setExpiry]=useState('24'),[reference,setReference]=useState('');
 const [recipients,setRecipients]=useState([{address:'',share:'100'}]);const wallet=useWallet();
 const intentKey=JSON.stringify([amount,expiry,reference,recipients]);
 const state=useInvoiceAdmin('create',intentKey,(account,now)=>({kind:'create',terms:{amountDueRaw:parseAmount(amount,6),expiresAt:now+BigInt(expiry)*3600n,
  recipients:recipients.map((r,i)=>(r.address||(i===0?account:'')) as Address),bps:recipients.map(r=>Number(parseAmount(r.share,2))),memoHash:keccak256(toHex(reference))}}));
 const locked=state.busy||!!state.pending;
 function changeRecipient(index:number,field:'address'|'share',value:string){setRecipients(rows=>rows.map((r,i)=>i===index?{...r,[field]:value}:r));}
 return <section className="page"><div className="page-head"><div><div className="eyebrow">USDC settlement</div><h1>A stablecoin payment, settled.</h1><p>Create an invoice. Let the payer settle directly or through an Orbital swap.</p></div></div>
  <div className="form-panel panel" style={{marginLeft:0}}><h2>Create an invoice</h2>
   <div className="field"><label htmlFor="invoice-amount">Amount due in USDC</label><input id="invoice-amount" inputMode="decimal" value={amount} maxLength={80} disabled={locked} onChange={e=>setAmount(e.target.value)}/></div>
   {recipients.map((r,i)=><div key={i} className="stack"><div className="field"><label htmlFor={`recipient-${i}`}>Recipient {i+1}</label><input id={`recipient-${i}`} value={r.address||(i===0?wallet.address??'':'')} maxLength={42} disabled={locked} onChange={e=>changeRecipient(i,'address',e.target.value)} placeholder={i===0?'Connect the merchant wallet':'0x…'}/></div>
    <div className="field"><label htmlFor={`share-${i}`}>Recipient {i+1} share (%)</label><input id={`share-${i}`} inputMode="decimal" value={r.share} maxLength={6} disabled={locked} onChange={e=>changeRecipient(i,'share',e.target.value)}/></div>
    {i>0&&<button className="button secondary" disabled={locked} onClick={()=>setRecipients(rows=>rows.filter((_,j)=>j!==i))}>Remove recipient {i+1}</button>}
   </div>)}
   {recipients.length<3&&<button className="button secondary" disabled={locked} onClick={()=>setRecipients(rows=>[...rows,{address:'',share:''}])}>Add recipient</button>}
   <p className="hint">Up to three recipients. Shares must total 100%. The last recipient receives any fractional-unit remainder.</p>
   <div className="field"><label htmlFor="expiry">Expires in</label><select id="expiry" value={expiry} disabled={locked} onChange={e=>setExpiry(e.target.value)}><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option></select></div>
   <div className="field"><label htmlFor="reference">Reference (optional)</label><input id="reference" value={reference} disabled={locked} onChange={e=>setReference(e.target.value)} maxLength={120}/><span className="hint">Only its hash goes onchain. Do not enter private invoice details.</span></div>
   <InvoiceAdminView state={state}/>
  </div></section>;
}
