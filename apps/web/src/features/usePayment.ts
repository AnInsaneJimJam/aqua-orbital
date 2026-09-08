'use client';
import {useEffect,useRef,useState} from 'react';
import {manifestSchema,paymentQuoteRequestSchema} from '@orbital/shared';
import {createPaymentDraft,preparePaymentReview,executePaymentReview,formatAmount,parseAmount,type PaymentReview,type TransactionReceipt} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {createPaymentPort} from '../wallet/paymentPort';
import {selectedChain} from '../wallet/config';
import {request,requestQuotePayload,useDeployment} from './api';
import {decodePendingPayment,encodePendingPayment,paymentStorageKey,type PendingPayment} from './paymentStorage';

type Phase='idle'|'preparing'|'review'|'submitting'|'pending'|'confirmed'|'reverted'|'error'|'stale';
type Confirmation={hash:string;gas:string;status:'success'|'reverted'};
type State={context:string;phase:Phase;review?:PaymentReview;pending?:PendingPayment;message?:string;confirmation?:Confirmation};
export type PaymentViewState={phase:Phase;enabled:boolean;connected:boolean;wrongChain:boolean;token:string;tokens:string[];maximum:string;busy:boolean;message?:string;confirmation?:Confirmation;pending?:{hash:string;stage:string;account:string;network:string};
 review?:{stage:'approval'|'payment';input:string;maximum:string;minimum:string;fee:string;refund:string;approval:string;spender:string;network:string;payer:string;gas:string;expires:string;transactionDeadline?:string;demo:boolean;recipients:{address:string;amount:string}[]};
 setToken:(value:string)=>void;setMaximum:(value:string)=>void;prepare:()=>void;submit:()=>void;resume:()=>void};
function message(error:unknown){const e=error as {shortMessage?:string;message?:string};return (e?.shortMessage??e?.message??'Payment could not be checked. Try again.').split('\n')[0]!.slice(0,240);}
export function usePayment(id:string,eligible:boolean,onReceipt:()=>void):PaymentViewState {
 const wallet=useWallet(),deployment=useDeployment(),[token,setToken]=useState('USDC'),[maximum,setMaximum]=useState('');
 const context=JSON.stringify([id,eligible,wallet.ready,wallet.connected,wallet.address,wallet.chainId,wallet.kind,token,maximum,deployment.data]);
 const liveContext=useRef(context);liveContext.current=context;
 const mounted=useRef(true),busy=useRef(false),epoch=useRef(0),previousContext=useRef(context),preparingAbort=useRef<AbortController|null>(null);
 const [state,setState]=useState<State>({context,phase:'idle'}),[clock,setClock]=useState(0),[active,setActive]=useState(false),[recoveryError,setRecoveryError]=useState<string|null>(null);
 const key=wallet.address?paymentStorageKey(selectedChain.id,wallet.address,id):null;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
 useEffect(()=>{
  if(previousContext.current===context)return;
  previousContext.current=context;epoch.current++;preparingAbort.current?.abort();
  // Returning to a previous address/input is a new intent, never revival of an
  // earlier review. Already-submitted records and receipt tracking survive.
  setState(s=>s.review?{...s,review:undefined,phase:s.pending?'pending':'stale'}:s);
 },[context]);
 useEffect(()=>{
  // Submitted hashes survive unsigned input changes and remain public to track.
  if(!key)return;
  try{const saved=localStorage.getItem(key);if(saved){const pending=decodePendingPayment(saved,selectedChain.id,wallet.address!,id);setState(s=>s.pending?s:{context,phase:'pending',pending,message:'A submitted transaction is saved. Resume receipt tracking before another payment.'});}setRecoveryError(null);}
  catch{setRecoveryError(key);setState(s=>({...s,message:'Payment recovery storage could not be read. Check previous wallet activity and repair the saved record before retrying.'}));}
 },[key,id,wallet.address,context]);
 useEffect(()=>{
  if(!state.review)return;
  const update=()=>setClock(Date.now()),timer=setTimeout(update,Math.max(0,state.review.expiresAtMs-Date.now()));
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[state.review]);
 const fresh=state.context===context&&(!state.review||Math.max(clock,Date.now())<state.review.expiresAtMs);
 const wrongChain=wallet.connected&&wallet.chainId!==selectedChain.id;
 const enabled=eligible&&wallet.ready&&wallet.connected&&!wrongChain&&recoveryError!==key&&deployment.data?.verified===true&&deployment.data.chainId===selectedChain.id;
 async function prepare(){
  if(busy.current||!enabled||state.pending)return;
  busy.current=true;setActive(true);const ticket=++epoch.current,controller=new AbortController(),end=Date.now()+30000,timer=setTimeout(()=>controller.abort(),30000);
  preparingAbort.current=controller;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===context&&!controller.signal.aborted&&Date.now()<end;
  setState({context,phase:'preparing'});
  try{
   const manifest=manifestSchema.parse(await request('/deployment',controller.signal));
   if(!manifest.verified||manifest.chainId!==selectedChain.id)throw Error('Verified deployment unavailable');
   const asset=manifest.tokens.find(t=>t.symbol===token);if(!asset||manifest.tokens.filter(t=>t.symbol===token).length!==1)throw Error('Select a supported input token');
   const intent=paymentQuoteRequestSchema.parse({invoiceId:id,payer:wallet.address,tokenIn:asset.address,maxInputRaw:parseAmount(maximum,asset.decimals).toString(),maxCrossings:16});
   const response=await requestQuotePayload('/quotes/payment',controller.signal,intent);
   const verify=async()=>{const latest=manifestSchema.parse(await request('/deployment',controller.signal));if(JSON.stringify(latest)!==JSON.stringify(manifest))throw Error('Deployment changed. Review again.');};
   await verify();if(!current())throw Error('Payment review interrupted. Try again.');
   const draft=createPaymentDraft(response.data,response.status,manifest,intent),port=createPaymentPort(wallet,current,verify);
   const review=await preparePaymentReview(draft,port);
   if(current())setState({context,phase:'review',review});
  }catch(error){if(mounted.current&&ticket===epoch.current&&liveContext.current===context)setState({context,phase:'error',message:message(error)});}
  finally{clearTimeout(timer);if(preparingAbort.current===controller)preparingAbort.current=null;busy.current=false;if(mounted.current)setActive(false);}
 }
 async function submit(){
  const review=state.review;if(busy.current||!enabled||!fresh||!review||state.phase!=='review'||state.pending)return;
  busy.current=true;setActive(true);const ticket=++epoch.current,submissionContext=context;let submitted:PendingPayment|undefined;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===submissionContext;
  const verify=async()=>{const latest=manifestSchema.parse(await request('/deployment'));if(JSON.stringify(latest)!==JSON.stringify(review.draft.context.manifest))throw Error('Deployment changed. Review again.');};
  const port=createPaymentPort(wallet,current,verify);
  setState({context,phase:'submitting',review});
  try{
   const receipt=await executePaymentReview(review,port,transaction=>{
    submitted={transaction,invoiceId:review.draft.request.invoiceId as `0x${string}`,stage:review.stage,plan:review.plan};
    if(mounted.current)setState({context:submissionContext,phase:'pending',pending:submitted});
    localStorage.setItem(paymentStorageKey(transaction.chainId,transaction.account,submitted.invoiceId),encodePendingPayment(submitted));
   });
   if(submitted)finish(submitted,receipt);
  }catch(error){if(mounted.current&&(current()||submitted))setState({context:submissionContext,phase:submitted?'pending':'error',pending:submitted,message:message(error)});}
  finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 function finish(pending:PendingPayment,receipt:TransactionReceipt){
  const {status}=receipt,confirmation={hash:receipt.hash,status,gas:receipt.gasUsed!==undefined&&receipt.effectiveGasPrice!==undefined?`${formatAmount(receipt.gasUsed*receipt.effectiveGasPrice,18)} ${selectedChain.nativeCurrency.symbol}`:'Unavailable'};
  let storage='';try{localStorage.removeItem(paymentStorageKey(pending.transaction.chainId,pending.transaction.account,pending.invoiceId));}catch{storage=' Recovery storage could not be cleared.';}
  if(mounted.current){setState({context:liveContext.current,phase:status==='success'?'confirmed':'reverted',confirmation,message:(status==='reverted'?'Transaction reverted. Refresh the quote to review another attempt.':pending.stage==='approval'?'Approval confirmed. Get a fresh quote and review the payment separately.':'Payment transaction confirmed. Refresh the invoice for receipt-backed settlement details.')+storage});onReceipt();}
 }
 async function resume(){
  const pending=state.pending;if(!pending||busy.current)return;busy.current=true;setActive(true);
  setState(s=>({...s,phase:'pending',message:'Checking the saved transaction receipt…'}));
  try{const port=createPaymentPort(wallet,()=>true,async()=>{},pending.plan),receipt=await port.receipt(pending.transaction.hash);finish(pending,receipt);}
  catch(error){if(mounted.current)setState(s=>({...s,message:message(error)}));}finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 const r=fresh||state.phase==='submitting'?state.review:undefined,d=r?.draft.observation.data;
 return {phase:state.pending?state.phase:fresh?state.phase:'stale',enabled,connected:wallet.connected,wrongChain,token,tokens:deployment.data?.tokens.map(t=>t.symbol)??['USDC','oUSD6','oUSD18'],maximum,busy:active,message:state.message,confirmation:state.confirmation,
  pending:state.pending?{hash:state.pending.transaction.hash,stage:state.pending.stage,account:state.pending.transaction.account,network:selectedChain.name}:undefined,
  review:r&&d?{stage:r.stage,input:`${formatAmount(BigInt(d.amountInRaw),d.tokenIn.decimals)} ${d.tokenIn.symbol}`,maximum:`${maximum} ${token}`,minimum:`${formatAmount(BigInt(d.minimumOutRaw),6)} USDC`,fee:`${formatAmount(BigInt(d.feeRaw),d.tokenIn.decimals)} ${d.tokenIn.symbol}`,refund:`${formatAmount(BigInt(d.refundRaw),6)} USDC`,approval:r.stage==='approval'?`${formatAmount(BigInt(d.amountInRaw),d.tokenIn.decimals)} ${d.tokenIn.symbol}`:'Already sufficient',spender:r.draft.context.manifest.payments,network:selectedChain.name,payer:r.plan.account,gas:`${formatAmount(r.estimate.gas*r.estimate.maxFeePerGas,18)} ${selectedChain.nativeCurrency.symbol}`,expires:new Date(r.expiresAtMs).toISOString().replace('T',' ').replace('.000Z',' UTC'),transactionDeadline:r.draft.input.kind==='swap'?new Date(Number(r.draft.input.deadline)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC'):undefined,demo:d.tokenIn.mock,recipients:d.invoice.recipients.map(v=>({address:v.address,amount:formatAmount(BigInt(v.amountRaw),6)+' USDC'}))}:undefined,
  setToken,setMaximum,prepare:()=>{void prepare();},submit:()=>{void submit();},resume:()=>{void resume();}};
}
