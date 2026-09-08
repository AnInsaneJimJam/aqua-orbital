'use client';
import {useEffect,useRef,useState} from 'react';
import {prepareStrategyProfile,configToDTO,configFromDTO,hashConfig,hashOrder,lifecycleAbi,aquaAbi,formatAmount,type StrategyProfileInput} from '@orbital/sdk';
import type {Address} from 'viem';
import {useWallet} from '../wallet/WalletProvider';
import {selectedChain} from '../wallet/config';
import {publicClient} from '../wallet/transactionPort';
import {useDeployment} from './api';
import {useStrategyAdmin} from './useStrategyAdmin';
type Prepared=ReturnType<typeof prepareStrategyProfile>;
type Draft={prepared:Prepared;profile:StrategyProfileInput;key:string};
const zeroHash=`0x${'0'.repeat(64)}`;
export function useStrategyPublication(){
 const wallet=useWallet(),deployment=useDeployment(),[draft,setDraft]=useState<Draft>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false),[restored,setRestored]=useState(false),[active,setActive]=useState(false);
 const key=wallet.address&&deployment.data?`orbital:publication:1:${deployment.data.chainId}:${deployment.data.router.toLowerCase()}:${wallet.address.toLowerCase()}`:undefined;
 const current=useRef(key);current.current=key;const mounted=useRef(true),working=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  setDraft(undefined);setError('');setStorageError(false);setActive(false);setRestored(false);if(!key||!wallet.address||!deployment.data)return;
  try{const raw=localStorage.getItem(key);if(raw){if(raw.length>16000)throw Error('Saved publication is too large');const parsed=JSON.parse(raw),saved=configFromDTO(parsed.config);
    const prepared=prepareStrategyProfile(deployment.data,wallet.address,saved.makerNonce,parsed.profile);
    if(parsed.schemaVersion!==1||hashConfig(saved)!==prepared.configHash)throw Error('Saved publication does not match its reviewed configuration');
    setDraft({key,prepared,profile:parsed.profile});setRestored(true);
  }}catch{setStorageError(true);setError('Saved publication could not be validated. Keep any transaction hashes and repair its recovery record before starting another draft.');}
 },[key]);
 const scoped=draft?.key===key?draft:undefined,admin=useStrategyAdmin(scoped?.prepared.orderHash??zeroHash,scoped?.prepared);
 useEffect(()=>{
  if(!scoped)return;let cancelled=false;
  const check=async()=>{try{const nonce=await publicClient.readContract({address:scoped.prepared.config.router,abi:lifecycleAbi,functionName:'nextMakerNonce',args:[scoped.prepared.config.maker]});
   if(nonce<=scoped.prepared.config.makerNonce)return;
   const state=await publicClient.readContract({address:scoped.prepared.config.router,abi:lifecycleAbi,functionName:'getStrategyState',args:[hashOrder(scoped.prepared.order)]});
   if(!cancelled)setActive(state.status===1);
  }catch{/* Publication review performs authoritative checks before any signature. */}};
  void check();return()=>{cancelled=true;};
 },[scoped,admin.confirmation]);
 async function start(profile:StrategyProfileInput){
  if(working.current||scoped||storageError||!key||!wallet.address||!deployment.data)return;working.current=true;setBusy(true);setError('');const captured=key;
  try{const identity=await wallet.identity();if(identity.chainId!==selectedChain.id||identity.account?.toLowerCase()!==wallet.address.toLowerCase())throw Error('Select the strategy network and wallet.');
   const nonce=await publicClient.readContract({address:deployment.data.router as Address,abi:lifecycleAbi,functionName:'nextMakerNonce',args:[wallet.address]});
   const prepared=prepareStrategyProfile(deployment.data,wallet.address,nonce,profile);
   if(current.current!==captured||!mounted.current)return;
   localStorage.setItem(captured,JSON.stringify({schemaVersion:1,profile,config:configToDTO(prepared.config)}));setDraft({key:captured,prepared,profile});setRestored(false);setActive(false);
  }catch(e){if(mounted.current&&current.current===captured)setError((e as {shortMessage?:string;message:string}).shortMessage??(e as Error).message);}
  finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 function newDraft(){if(!scoped||!active||admin.pending||admin.busy)return;try{localStorage.removeItem(scoped.key);setDraft(undefined);setActive(false);setError('');admin.dismiss();}catch{setError('The saved draft could not be cleared.');}}
 async function editDraft(){
  if(!scoped||admin.pending||admin.busy||working.current||!deployment.data)return;working.current=true;setBusy(true);const captured=key;
  try{const c=scoped.prepared.config,id=scoped.prepared.orderHash,rows=await Promise.all(c.tokens.map(token=>publicClient.readContract({address:deployment.data!.aqua as Address,abi:aquaAbi,functionName:'rawBalances',args:[c.maker,c.router,id,token]})));
   if(rows.some(([allocation,count])=>allocation!==0n||count!==0))throw Error('This allocation was already shipped. Resume activation before creating a replacement.');
   if(current.current!==captured||!mounted.current)return;localStorage.removeItem(scoped.key);setDraft(undefined);setRestored(false);setError('');admin.dismiss();
  }catch(e){if(mounted.current&&current.current===captured)setError((e as Error).message);}finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 const prepared=scoped?.prepared,view=prepared?{hash:prepared.orderHash,nonce:prepared.config.makerNonce.toString(),preset:scoped!.profile.preset,
  allocations:prepared.config.tokens.map((a,i)=>{const t=deployment.data!.tokens.find(t=>t.address.toLowerCase()===a.toLowerCase())!;return {symbol:t.symbol,amount:formatAmount(prepared.config.initialAmountsRaw[i]!,t.decimals),cap:formatAmount(prepared.config.initialAmountsRaw[i]!*4n,t.decimals)};}),
  ticks:prepared.ticks.map(t=>({key:t.key.toString(),radius:t.radius.toString(),share:t.share,threshold:t.threshold?`${t.threshold.lower}–${t.threshold.upper}`:'Full range'}))}:undefined;
 return {draft:!!scoped,profile:scoped?.profile,view,admin,active,restored,busy,error,network:selectedChain.name,ready:wallet.ready&&wallet.connected&&wallet.chainId===selectedChain.id&&deployment.data?.verified===true,
  editDraft:()=>{void editDraft();},start:(profile:StrategyProfileInput)=>{void start(profile);},newDraft,clearError:()=>{if(!restored)setError('');},connect:wallet.connect,switchNetwork:wallet.switchNetwork,connected:wallet.connected,wrongChain:wallet.connected&&wallet.chainId!==selectedChain.id};
}
