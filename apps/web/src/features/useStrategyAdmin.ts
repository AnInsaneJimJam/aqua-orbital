'use client';
import {useEffect,useRef,useState} from 'react';
import {manifestSchema} from '@orbital/shared';
import {createStrategyAdminDraft,prepareStrategyAdminReview,executeStrategyAdminReview,decodeStrategyAdminReceipt,hashOrder,hashConfig,formatAmount,
 type StrategyAdminIntent,type StrategyAdminReview,type StrategyInput,type TransactionReceipt} from '@orbital/sdk';
import type {Address} from 'viem';
import {useWallet} from '../wallet/WalletProvider';
import {createStrategyAdminPort} from '../wallet/strategyAdminPort';
import {selectedChain} from '../wallet/config';
import {request,useDeployment} from './api';
import {readPendingStrategyAdmin,strategyAdminStorageKey,encodePendingStrategyAdmin,type PendingStrategyAdmin} from './strategyAdminStorage';

type Phase='idle'|'preparing'|'review'|'submitting'|'pending'|'confirmed'|'reverted'|'error'|'stale';
type Confirmation={hash:string;gas:string;kind:StrategyAdminReview['kind'];reset?:boolean;status:'success'|'reverted'};
type State={context:string;phase:Phase;review?:StrategyAdminReview;pending?:PendingStrategyAdmin;message?:string;confirmation?:Confirmation};
export type StrategyAdminViewState={phase:Phase;owner:boolean;enabled:boolean;wrongChain:boolean;busy:boolean;message?:string;confirmation?:Confirmation;
 pending?:{hash:string;account:string};tokens:{address:Address;symbol:string}[];
 review?:{kind:StrategyAdminReview['kind'];title:string;maker:string;network:string;target:string;gas:string;orderHash:string;amount?:string;spender?:string;reset?:boolean};
 prepare:(intent:StrategyAdminIntent)=>void;submit:()=>void;resume:()=>void;dismiss:()=>void;switchNetwork:()=>void};
const message=(error:unknown)=>{const e=error as {shortMessage?:string;message?:string};return (e?.shortMessage??e?.message??'Strategy action could not be checked. Try again.').split('\n')[0]!.slice(0,240);};
export function useStrategyAdmin(id:string,input?:StrategyInput,onReceipt?:()=>void):StrategyAdminViewState{
 const wallet=useWallet(),deployment=useDeployment(),owner=!!input&&wallet.address?.toLowerCase()===input.config.maker.toLowerCase();
 const context=JSON.stringify([id,input?hashConfig(input.config):null,wallet.ready,wallet.connected,wallet.address,wallet.chainId,wallet.kind,deployment.data]);
 const liveContext=useRef(context);liveContext.current=context;
 const mounted=useRef(true),busy=useRef(false),epoch=useRef(0),previous=useRef(context),abort=useRef<AbortController|null>(null);
 const [state,setState]=useState<State>({context,phase:'idle'}),[active,setActive]=useState(false),[clock,setClock]=useState(0),[storageError,setStorageError]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;abort.current?.abort();};},[]);
 useEffect(()=>{if(previous.current===context)return;previous.current=context;epoch.current++;abort.current?.abort();setState(s=>s.review?{...s,review:undefined,phase:s.pending?'pending':'stale'}:s);},[context]);
 useEffect(()=>{
  if(!wallet.address)return;
  try{const saved=readPendingStrategyAdmin(selectedChain.id,wallet.address).find(p=>hashOrder(p.input.order).toLowerCase()===id.toLowerCase());
   if(saved)setState(s=>s.pending?s:{context,phase:'pending',pending:saved,message:'A submitted strategy action is saved. Resume its receipt before another signature.'});setStorageError(false);
  }catch{setStorageError(true);setState(s=>({...s,message:'Strategy recovery storage could not be read. Check previous wallet activity and repair the saved record before retrying.'}));}
 },[wallet.address,id,context]);
 useEffect(()=>{
  if(!state.review)return;const update=()=>setClock(Date.now()),timer=setTimeout(update,Math.max(0,state.review.expiresAtMs-Date.now()));
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[state.review]);
 const fresh=state.context===context&&(!state.review||Math.max(clock,Date.now())<state.review.expiresAtMs),wrongChain=wallet.connected&&wallet.chainId!==selectedChain.id;
 const enabled=owner&&wallet.ready&&wallet.connected&&!wrongChain&&!storageError&&deployment.data?.verified===true&&deployment.data.chainId===selectedChain.id;
 async function prepare(intent:StrategyAdminIntent){
  if(busy.current||!enabled||state.pending||!wallet.address||!input)return;busy.current=true;setActive(true);
  const ticket=++epoch.current,controller=new AbortController(),deadline=Date.now()+30000,timer=setTimeout(()=>controller.abort(),30000);abort.current=controller;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===context&&!controller.signal.aborted&&Date.now()<deadline;
  setState({context,phase:'preparing'});
  try{
   const manifest=manifestSchema.parse(await request('/deployment',controller.signal));if(!manifest.verified||manifest.chainId!==selectedChain.id)throw Error('Verified strategy deployment unavailable');
   const draft=createStrategyAdminDraft({manifest,account:wallet.address,chainId:manifest.chainId,now:BigInt(Math.floor(Date.now()/1000))},input,intent);
   const verify=async()=>{const latest=manifestSchema.parse(await request('/deployment',controller.signal));if(JSON.stringify(latest)!==JSON.stringify(manifest))throw Error('Deployment changed. Review again.');};
   const review=await prepareStrategyAdminReview(draft,createStrategyAdminPort(wallet,current,verify));if(current())setState({context,phase:'review',review});
  }catch(error){if(mounted.current&&ticket===epoch.current&&liveContext.current===context)setState({context,phase:'error',message:message(error)});}
  finally{clearTimeout(timer);if(abort.current===controller)abort.current=null;busy.current=false;if(mounted.current)setActive(false);}
 }
 function finish(pending:PendingStrategyAdmin,receipt:TransactionReceipt){
  if(receipt.status==='success')decodeStrategyAdminReceipt(receipt,pending);
  const confirmation:Confirmation={kind:pending.kind,reset:pending.reset,hash:receipt.hash,status:receipt.status,
   gas:receipt.gasUsed!==undefined&&receipt.effectiveGasPrice!==undefined?`${formatAmount(receipt.gasUsed*receipt.effectiveGasPrice,18)} ${selectedChain.nativeCurrency.symbol}`:'Unavailable'};
  let storage='';try{localStorage.removeItem(strategyAdminStorageKey(pending));}catch{storage=' Recovery storage could not be cleared.';}
  if(mounted.current){setState({context:liveContext.current,phase:receipt.status==='success'?'confirmed':'reverted',confirmation,message:(receipt.status==='reverted'?'Transaction reverted. Review current strategy state before retrying.':pending.kind==='retire'?'Strategy retirement confirmed. Review the next step to dock its Aqua allocation.':pending.kind==='dock'?'Aqua docking confirmed. Your tokens remain in your wallet.':pending.reset?'Allowance reset confirmed. Review the token again to set its bounded cap.':'Bounded Aqua approval confirmed.')+storage});onReceipt?.();}
 }
 async function submit(){
  const review=state.review;if(busy.current||!enabled||!fresh||!review||state.phase!=='review'||state.pending)return;
  busy.current=true;setActive(true);const ticket=++epoch.current;let submitted:PendingStrategyAdmin|undefined;
  const current=()=>mounted.current&&ticket===epoch.current&&liveContext.current===context;
  const verify=async()=>{const m=manifestSchema.parse(await request('/deployment'));if(JSON.stringify(m)!==JSON.stringify(review.context.manifest))throw Error('Deployment changed. Review again.');};
  setState({context,phase:'submitting',review});
  try{
   const receipt=await executeStrategyAdminReview(review,createStrategyAdminPort(wallet,current,verify),transaction=>{
    submitted={schemaVersion:1,kind:review.kind,context:review.context,input:review.input,token:review.token,reset:review.reset,plan:review.plan,transaction};
    if(mounted.current)setState({context,phase:'pending',pending:submitted});localStorage.setItem(strategyAdminStorageKey(submitted),encodePendingStrategyAdmin(submitted));
   });if(submitted)finish(submitted,receipt);
  }catch(error){if(mounted.current&&(current()||submitted))setState({context,phase:submitted?'pending':'error',pending:submitted,message:message(error)});}
  finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 async function resume(){
  const pending=state.pending;if(!pending||busy.current)return;busy.current=true;setActive(true);setState(s=>({...s,phase:'pending',message:'Checking the saved strategy receipt…'}));
  try{
   const manifest=manifestSchema.parse(await request('/deployment'));if(JSON.stringify(manifest)!==JSON.stringify(pending.context.manifest)||!manifest.verified)throw Error('Saved action belongs to another deployment. Keep its hash and check that deployment before retrying.');
   finish(pending,await createStrategyAdminPort(wallet,()=>true,async()=>{},pending.plan).receipt(pending.transaction.hash));
  }catch(error){if(mounted.current)setState(s=>({...s,message:message(error)}));}finally{busy.current=false;if(mounted.current)setActive(false);}
 }
 const r=fresh?state.review:undefined,token=r?.token?r.context.manifest.tokens.find(t=>t.address.toLowerCase()===r.token!.toLowerCase()):undefined;
 const index=token&&r?r.input.config.tokens.findIndex(t=>t.toLowerCase()===token.address.toLowerCase()):-1;
 return {phase:state.pending?state.phase:fresh?state.phase:'stale',owner,enabled,wrongChain,busy:active,message:state.message,confirmation:state.confirmation,
  pending:state.pending?{hash:state.pending.transaction.hash,account:state.pending.transaction.account}:undefined,
  tokens:input?input.config.tokens.map(address=>({address,symbol:deployment.data?.tokens.find(t=>t.address.toLowerCase()===address.toLowerCase())?.symbol??'Token'})):[],
  review:r?{kind:r.kind,title:r.kind==='retire'?'Retire strategy':r.kind==='dock'?'Dock Aqua allocation':r.reset?'Reset Aqua allowance':'Update Aqua approval',maker:r.plan.account,network:selectedChain.name,target:r.plan.to,orderHash:hashOrder(r.input.order),
   gas:`${formatAmount(r.estimate.gas*r.estimate.maxFeePerGas,18)} ${selectedChain.nativeCurrency.symbol}`,reset:r.reset,
   amount:token?`${formatAmount(r.reset?0n:r.input.config.initialAmountsRaw[index]!*4n,token.decimals)} ${token.symbol}`:undefined,spender:r.kind==='approval'?r.context.manifest.aqua:undefined}:undefined,
  prepare:intent=>{void prepare(intent);},submit:()=>{void submit();},resume:()=>{void resume();},dismiss:()=>{if(!busy.current&&!state.pending){epoch.current++;setState({context,phase:'idle'});}},
  switchNetwork:()=>{void wallet.switchNetwork?.().catch(error=>{if(mounted.current)setState(s=>({...s,message:message(error)}));});}};
}
