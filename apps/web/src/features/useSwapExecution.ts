'use client';
import {useEffect,useRef,useState} from 'react';
import {manifestSchema,type DeploymentManifest,type QuoteRequest,type SwapQuoteObservationDTO,type Token} from '@orbital/shared';
import {createSwapDraft,createSwapReceiptIntent,decodeSwapReceipt,prepareSwapReview,executeSwapReview,formatAmount,type SwapReview,type TransactionReceipt} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {createSwapPort} from '../wallet/swapPort';
import {selectedChain} from '../wallet/config';
import {request} from './api';
import {encodePendingSwap,readPendingSwaps,swapStorageKey,type PendingSwap} from './swapStorage';
type Phase='idle'|'preparing'|'review'|'signing'|'pending'|'confirmed'|'reverted'|'error';
type Confirmed={hash:string;input?:string;output?:string;fee?:string;gas:string;crossings:{key:string;direction:string}[];approval:boolean;reverted:boolean};
type State={context:string;phase:Phase;review?:SwapReview;pending?:PendingSwap;message?:string;confirmed?:Confirmed};
export type SwapQuoteBundle={manifest:DeploymentManifest;requested:QuoteRequest;observation:SwapQuoteObservationDTO;tokenIn:Token;tokenOut:Token};
const errorText=(error:unknown)=>{const e=error as {shortMessage?:string;message?:string};return(e?.shortMessage??e?.message??'Swap unavailable. Try again.').split('\n')[0]!.slice(0,240);};
export function useSwapExecution(context:string,enabled:boolean,deadlineSeconds:number,fetchQuote:(signal:AbortSignal)=>Promise<SwapQuoteBundle>){
 const wallet=useWallet(),live=useRef(context),previous=useRef(context),epoch=useRef(0),mounted=useRef(true),lock=useRef(false),abort=useRef<AbortController|null>(null);live.current=context;
 const [state,setState]=useState<State>({context,phase:'idle'}),[busy,setBusy]=useState(false),[clock,setClock]=useState(0),[recoveryError,setRecoveryError]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;abort.current?.abort();};},[]);
 useEffect(()=>{if(previous.current!==context){previous.current=context;epoch.current++;abort.current?.abort();setState(s=>s.review?{...s,review:undefined,phase:s.pending?'pending':'idle'}:s);}},[context]);
 useEffect(()=>{
  if(!wallet.address)return;const account=wallet.address;
  const restore=()=>{try{const pending=readPendingSwaps(selectedChain.id,account);setRecoveryError(false);if(pending.length)setState(s=>s.pending?s:{context:live.current,phase:'pending',pending:pending[0],message:'A submitted swap action is saved. Resume its receipt before another signature.'});}catch{setRecoveryError(true);}};
  restore();window.addEventListener('storage',restore);return()=>window.removeEventListener('storage',restore);
 },[wallet.address]);
 useEffect(()=>{
  if(!state.review)return;const update=()=>setClock(Date.now()),timer=setTimeout(update,Math.max(0,state.review.expiresAtMs-Date.now()));
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[state.review]);
 const fresh=state.context===context&&(!state.review||Math.max(clock,Date.now())<state.review.expiresAtMs);
 function queued(){
  if(!wallet.address)return false;
  try{const records=readPendingSwaps(selectedChain.id,wallet.address);if(records.length){setState({context:live.current,phase:'pending',pending:records[0],message:'Resume the saved action before another signature.'});return true;}return false;}
  catch{setRecoveryError(true);return true;}
 }
 async function prepare(){
  if(lock.current||!enabled||state.pending||recoveryError)return;
  if(queued())return;
  lock.current=true;setBusy(true);const ticket=++epoch.current,controller=new AbortController(),end=Date.now()+30000,timer=setTimeout(()=>controller.abort(),30000);abort.current=controller;
  const current=()=>mounted.current&&epoch.current===ticket&&live.current===context&&!controller.signal.aborted&&Date.now()<end;
  setState({context,phase:'preparing'});
  try{
   const data=await fetchQuote(controller.signal);if(!current())throw Error('Swap review interrupted');
   const draft=createSwapDraft(data.observation,200,data.manifest,data.requested,{deadlineSeconds});
   const verify=async()=>{const manifest=manifestSchema.parse(await request('/deployment',controller.signal));if(JSON.stringify(manifest)!==JSON.stringify(data.manifest))throw Error('Deployment changed. Review again.');};
   const port=createSwapPort(wallet,current,verify),review=await prepareSwapReview(draft,port);
   if(current())setState({context,phase:'review',review});
  }catch(error){if(mounted.current&&epoch.current===ticket&&live.current===context)setState({context,phase:'error',message:errorText(error)});}
  finally{clearTimeout(timer);if(abort.current===controller)abort.current=null;lock.current=false;if(mounted.current)setBusy(false);}
 }
 async function submit(){
  const review=state.review;if(lock.current||!enabled||!fresh||!review||state.phase!=='review'||state.pending||recoveryError)return;
  if(queued())return;
  lock.current=true;setBusy(true);const ticket=++epoch.current;let submitted:PendingSwap|undefined;
  const current=()=>mounted.current&&epoch.current===ticket&&live.current===context;
  const verify=async()=>{const m=manifestSchema.parse(await request('/deployment'));if(JSON.stringify(m)!==JSON.stringify(review.draft.context.manifest))throw Error('Deployment changed. Review again.');};
  setState({context,phase:'signing',review});
  try{
   // Separate per-hash storage entries avoid assuming exclusive nonce ownership
   // or overwriting another tab's submitted transaction.
   const port=createSwapPort(wallet,current,verify),receipt=await executeSwapReview(review,port,transaction=>{
    const m=review.draft.context.manifest,i=review.draft.input;
    submitted={schemaVersion:1,transaction,stage:review.stage,plan:review.plan,intent:createSwapReceiptIntent(review.draft),tokenIn:m.tokens.find(t=>t.address.toLowerCase()===i.tokenIn.toLowerCase())!,tokenOut:m.tokens.find(t=>t.address.toLowerCase()===i.tokenOut.toLowerCase())!};
    if(mounted.current)setState({context,phase:'pending',pending:submitted});localStorage.setItem(swapStorageKey(submitted),encodePendingSwap(submitted));
   });if(submitted)finish(submitted,receipt);
  }catch(error){if(mounted.current&&(current()||submitted))setState({context,phase:submitted?'pending':'error',pending:submitted,message:errorText(error)});}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 function finish(p:PendingSwap,receipt:TransactionReceipt){
  const amount=(v:bigint,t:Token)=>`${formatAmount(v,t.decimals)} ${t.symbol}`,reverted=receipt.status==='reverted';
  // Never clear recovery state or claim success when settlement logs are absent.
  const actual=p.stage==='swap'&&!reverted?decodeSwapReceipt(receipt,p.intent):undefined;
  const confirmed:Confirmed={hash:receipt.hash,gas:receipt.gasUsed!==undefined&&receipt.effectiveGasPrice!==undefined?`${formatAmount(receipt.gasUsed*receipt.effectiveGasPrice,18)} ${selectedChain.nativeCurrency.symbol}`:'Unavailable',approval:p.stage==='approval',reverted,
   input:actual?amount(actual.grossInputRaw,p.tokenIn):undefined,output:actual?amount(actual.amountOutRaw,p.tokenOut):undefined,fee:actual?amount(actual.feeRaw,p.tokenIn):undefined,crossings:actual?.crossings.map(c=>({key:c.tickKey.toString(),direction:c.inward?'Inward':'Outward'}))??[]};
  let storage='',next:PendingSwap|undefined;try{localStorage.removeItem(swapStorageKey(p));next=readPendingSwaps(p.transaction.chainId,p.transaction.account)[0];}catch{storage=' Recovery storage could not be cleared.';}
  if(mounted.current)setState({context:live.current,phase:next?'pending':reverted?'reverted':'confirmed',pending:next,confirmed,message:(reverted?'Transaction reverted. Get a fresh quote before trying again.':p.stage==='approval'?'Approval confirmed. Review a fresh swap quote before trading.':'Displayed amounts come from the swap settlement receipt.')+storage});
 }
 async function resume(){
  const pending=state.pending;if(!pending||lock.current)return;lock.current=true;setBusy(true);
  try{const port=createSwapPort(wallet,()=>true,async()=>{},pending.plan);finish(pending,await port.receipt(pending.transaction.hash));}
  catch(error){if(mounted.current)setState(s=>({...s,message:errorText(error)}));}finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 const r=fresh?state.review:undefined,i=r?.draft.input,m=r?.draft.context.manifest;
 const inputToken=i&&m?.tokens.find(t=>t.address.toLowerCase()===i.tokenIn.toLowerCase()),outputToken=i&&m?.tokens.find(t=>t.address.toLowerCase()===i.tokenOut.toLowerCase());
 return {phase:state.phase,busy,pending:state.pending?{hash:state.pending.transaction.hash,account:state.pending.transaction.account,stage:state.pending.stage}:undefined,confirmed:state.confirmed,message:recoveryError?'Saved swap recovery could not be read. Check previous wallet activity before retrying.':state.message,
  expired:!!state.review&&!fresh,canPrepare:enabled&&!busy&&!state.pending&&!recoveryError,
  review:r&&i&&inputToken&&outputToken?{stage:r.stage,input:`${formatAmount(i.amountInRaw,inputToken.decimals)} ${inputToken.symbol}`,output:`${formatAmount(BigInt(i.quote.amountOutRaw),outputToken.decimals)} ${outputToken.symbol}`,minimum:`${formatAmount(i.minimumOutRaw,outputToken.decimals)} ${outputToken.symbol}`,fee:`${formatAmount(BigInt(i.quote.feeRaw),inputToken.decimals)} ${inputToken.symbol}`,router:m!.router,recipient:i.recipient,deadline:new Date(Number(i.deadline)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC'),gas:`${formatAmount(r.estimate.gas*r.estimate.maxFeePerGas,18)} ${selectedChain.nativeCurrency.symbol}`,maker:i.config.maker,ticks:i.config.tickKeys.length,orderHash:i.quote.orderHash}:undefined,
  prepare:()=>{void prepare();},submit:()=>{void submit();},resume:()=>{void resume();},reset:()=>{if(!lock.current&&!state.pending)setState({context,phase:'idle'});}};
}
export type SwapExecutionView=ReturnType<typeof useSwapExecution>;
