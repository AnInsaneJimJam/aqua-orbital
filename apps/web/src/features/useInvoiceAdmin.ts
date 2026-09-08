'use client';
import {useEffect,useRef,useState} from 'react';
import {manifestSchema} from '@orbital/shared';
import {createInvoiceAdminDraft,prepareInvoiceAdminReview,executeInvoiceAdminReview,decodeInvoiceAdminReceipt,validateInvoiceAdminReceiptIntent,invoiceRecipientAmounts,formatAmount,
 type InvoiceAdminIntent,type InvoiceAdminReview,type TransactionReceipt} from '@orbital/sdk';
import type {Address} from 'viem';
import {useWallet} from '../wallet/WalletProvider';
import {createInvoiceAdminPort} from '../wallet/invoiceAdminPort';
import {selectedChain} from '../wallet/config';
import {request,useDeployment} from './api';
import {readPendingInvoiceAdmin,invoiceAdminStorageKey,encodePendingInvoiceAdmin,type PendingInvoiceAdmin} from './invoiceAdminStorage';

type Phase='idle'|'preparing'|'review'|'submitting'|'pending'|'confirmed'|'reverted'|'error'|'stale';
type Confirmation={hash:string;gas:string;invoiceId?:string;kind:'create'|'cancel';status:'success'|'reverted'};
type State={context:string;phase:Phase;review?:InvoiceAdminReview;pending?:PendingInvoiceAdmin;message?:string;confirmation?:Confirmation};
export type InvoiceAdminViewState={kind:'create'|'cancel';phase:Phase;enabled:boolean;connected:boolean;wrongChain:boolean;busy:boolean;message?:string;confirmation?:Confirmation;
 pending?:{hash:string;account:string};review?:{amount:string;merchant:string;network:string;adapter:string;gas:string;deadline:string;recipients:{address:string;share:string;amount:string}[];memoHash:string;demo:boolean};
 prepare:()=>void;submit:()=>void;resume:()=>void;connect:()=>void;switchNetwork:()=>void};
const message=(error:unknown)=>{const e=error as {shortMessage?:string;message?:string};return (e?.shortMessage??e?.message??'Invoice action could not be checked. Try again.').split('\n')[0]!.slice(0,240);};
/** Orchestration only. SDK owns terms/calldata/receipts; presentation owns layout. */
export function useInvoiceAdmin(kind:'create'|'cancel',intentKey:string,makeIntent:(account:Address,now:bigint)=>InvoiceAdminIntent,eligible=true,onReceipt?:()=>void):InvoiceAdminViewState {
 const wallet=useWallet(),deployment=useDeployment();
 const context=JSON.stringify([kind,intentKey,eligible,wallet.ready,wallet.connected,wallet.address,wallet.chainId,wallet.kind,deployment.data]);
 const liveContext=useRef(context);liveContext.current=context;
 const mounted=useRef(true),busy=useRef(false),epoch=useRef(0),previous=useRef(context),abort=useRef<AbortController|null>(null);
 const [state,setState]=useState<State>({context,phase:'idle'}),[active,setActive]=useState(false),[clock,setClock]=useState(0),[storageError,setStorageError]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;abort.current?.abort();};},[]);
 useEffect(()=>{
  if(previous.current===context)return;previous.current=context;epoch.current++;abort.current?.abort();
  setState(s=>s.review?{...s,review:undefined,phase:s.pending?'pending':'stale'}:s);
 },[context]);
 useEffect(()=>{
  if(!wallet.address)return;
  try{
   const saved=readPendingInvoiceAdmin(selectedChain.id,wallet.address).find(p=>{const intent=validateInvoiceAdminReceiptIntent(p);return p.kind===kind&&(kind==='create'||intent.kind==='cancel'&&intent.invoiceId.toLowerCase()===intentKey.toLowerCase());});
   if(saved)setState(s=>s.pending?s:{context,phase:'pending',pending:saved,message:'A submitted invoice action is saved. Resume its receipt before another signature.'});
   setStorageError(false);
  }catch{setStorageError(true);setState(s=>({...s,message:'Invoice recovery storage could not be read. Check previous wallet activity and repair the saved record before retrying.'}));}
 },[wallet.address,kind,intentKey,context]);
 useEffect(()=>{
  if(!state.review)return;const update=()=>setClock(Date.now()),timer=setTimeout(update,Math.max(0,state.review.expiresAtMs-Date.now()));
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[state.review]);
 const fresh=state.context===context&&(!state.review||Math.max(clock,Date.now())<state.review.expiresAtMs);
 const wrongChain=wallet.connected&&wallet.chainId!==selectedChain.id;
 const enabled=eligible&&wallet.ready&&wallet.connected&&!wrongChain&&!storageError&&deployment.data?.verified===true&&deployment.data.chainId===selectedChain.id;
 async function prepare(){
  if(busy.current||!enabled||state.pending||!wallet.address)return;busy.current=true;setActive(true);
  const ticket=++epoch.current,controller=new AbortController(),deadline=Date.now()+30000,timer=setTimeout(()=>controller.abort(),30000);abort.current=controller;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===context&&!controller.signal.aborted&&Date.now()<deadline;
  setState({context,phase:'preparing'});
  try{
   const manifest=manifestSchema.parse(await request('/deployment',controller.signal));if(!manifest.verified||manifest.chainId!==selectedChain.id)throw Error('Verified invoice deployment unavailable');
   const now=BigInt(Math.floor(Date.now()/1000)),intent=makeIntent(wallet.address,now),draft=createInvoiceAdminDraft({manifest,account:wallet.address,chainId:manifest.chainId,now},intent);
   const verify=async()=>{const latest=manifestSchema.parse(await request('/deployment',controller.signal));if(JSON.stringify(latest)!==JSON.stringify(manifest))throw Error('Deployment changed. Review again.');};
   const review=await prepareInvoiceAdminReview(draft,createInvoiceAdminPort(wallet,current,verify));
   if(current())setState({context,phase:'review',review});
  }catch(error){if(mounted.current&&ticket===epoch.current&&liveContext.current===context)setState({context,phase:'error',message:message(error)});}
  finally{clearTimeout(timer);if(abort.current===controller)abort.current=null;busy.current=false;if(mounted.current)setActive(false);}
 }
 function finish(pending:PendingInvoiceAdmin,receipt:TransactionReceipt){
  const event=receipt.status==='success'?decodeInvoiceAdminReceipt(receipt,pending):undefined;
  const confirmation:Confirmation={kind:pending.kind,hash:receipt.hash,status:receipt.status,invoiceId:event?.invoiceId,
   gas:receipt.gasUsed!==undefined&&receipt.effectiveGasPrice!==undefined?`${formatAmount(receipt.gasUsed*receipt.effectiveGasPrice,18)} ${selectedChain.nativeCurrency.symbol}`:'Unavailable'};
  let storage='';try{localStorage.removeItem(invoiceAdminStorageKey(pending));}catch{storage=' Recovery storage could not be cleared.';}
  if(mounted.current){setState({context:liveContext.current,phase:receipt.status==='success'?'confirmed':'reverted',confirmation,
   message:(receipt.status==='reverted'?'Transaction reverted. Review the current invoice state before retrying.':pending.kind==='create'?'Invoice created. Its confirmed identifier is ready to share.':'Invoice cancellation confirmed. Refreshing indexed terms.')+storage});onReceipt?.();}
 }
 async function submit(){
  const review=state.review;if(busy.current||!enabled||!fresh||!review||state.phase!=='review'||state.pending)return;
  busy.current=true;setActive(true);const ticket=++epoch.current;let submitted:PendingInvoiceAdmin|undefined;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===context;
  const verify=async()=>{const m=manifestSchema.parse(await request('/deployment'));if(JSON.stringify(m)!==JSON.stringify(review.draft.context.manifest))throw Error('Deployment changed. Review again.');};
  setState({context,phase:'submitting',review});
  try{
   const receipt=await executeInvoiceAdminReview(review,createInvoiceAdminPort(wallet,current,verify),transaction=>{
    submitted={schemaVersion:1,kind:review.kind,plan:review.plan,transaction};
    if(mounted.current)setState({context,phase:'pending',pending:submitted});
    localStorage.setItem(invoiceAdminStorageKey(submitted),encodePendingInvoiceAdmin(submitted));
   });if(submitted)finish(submitted,receipt);
  }catch(error){if(mounted.current&&(current()||submitted))setState({context,phase:submitted?'pending':'error',pending:submitted,message:message(error)});}
  finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 async function resume(){
  const pending=state.pending;if(!pending||busy.current)return;busy.current=true;setActive(true);setState(s=>({...s,phase:'pending',message:'Checking the saved invoice receipt…'}));
  try{
   const manifest=manifestSchema.parse(await request('/deployment'));
   if(!manifest.verified||manifest.chainId!==pending.plan.chainId||manifest.payments.toLowerCase()!==pending.plan.to.toLowerCase())throw Error('Saved action belongs to another deployment. Keep its hash and check that deployment before retrying.');
   const receipt=await createInvoiceAdminPort(wallet,()=>true,async()=>{},pending.plan).receipt(pending.transaction.hash);finish(pending,receipt);
  }catch(error){if(mounted.current)setState(s=>({...s,message:message(error)}));}finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 const r=fresh?state.review:undefined,terms=r&&(r.draft.intent.kind==='create'?r.draft.intent.terms:r.draft.intent.invoice);
 return {kind,phase:state.pending?state.phase:fresh?state.phase:'stale',enabled,connected:wallet.connected,wrongChain,busy:active,message:state.message,confirmation:state.confirmation,
  pending:state.pending?{hash:state.pending.transaction.hash,account:state.pending.transaction.account}:undefined,
  review:r&&terms?{amount:`${formatAmount(terms.amountDueRaw,6)} USDC`,merchant:r.plan.account,network:selectedChain.name,adapter:r.plan.to,
   gas:`${formatAmount(r.estimate.gas*r.estimate.maxFeePerGas,18)} ${selectedChain.nativeCurrency.symbol}`,deadline:new Date(Number(terms.expiresAt)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC'),memoHash:terms.memoHash,
   demo:r.draft.context.manifest.tokens.find(t=>t.address.toLowerCase()===r.draft.context.manifest.usdc.toLowerCase())?.mock===true,
   recipients:invoiceRecipientAmounts(terms).map(v=>({address:v.address,share:`${v.bps/100}%`,amount:`${formatAmount(v.amountRaw,6)} USDC`}))}:undefined,
  prepare:()=>{void prepare();},submit:()=>{void submit();},resume:()=>{void resume();},connect:wallet.connect,
  switchNetwork:()=>{void wallet.switchNetwork?.().catch(error=>{if(mounted.current)setState(s=>({...s,message:message(error)}));});}};
}
