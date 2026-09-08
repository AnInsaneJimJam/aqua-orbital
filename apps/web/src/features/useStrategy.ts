'use client';
import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeStrategyDetail,strategyInventory,configFromDTO,orderFromDTO,type StrategyInput,type StrategyListRequest} from '@orbital/sdk';
import {hashSchema,manifestSchema,type StrategyDetailDTO,type DeploymentManifest,type StrategyReadDTO} from '@orbital/shared';
import {apiBase,request,requestPayload} from './api';

export type StrategyObservationView={block:string;hash:string;indexedAt:string;historical:boolean;stale:boolean};
export type StrategyDataView={hash:string;maker:string;router:string;configHash:string;network:string;tokens:string;fee:string;status:string;version:string;
 inventory:ReturnType<typeof strategyInventory>;ticks:{key:string;radius:string;classification:'Interior'|'Boundary';fullRange:boolean}[];
 receipts:{label:string;hash:string;href:string|null}[];canTrade:boolean;};
export type StrategyViewState={id:string;phase:'invalid'|'loading'|'unavailable'|'not-found'|'loaded';refreshing:boolean;refresh:()=>void;observation?:StrategyObservationView;strategy?:StrategyDataView;adminInput?:StrategyInput};
export type StrategyFilter=StrategyListRequest['status'];
export function useObservationTime(){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const update=()=>setNow(Date.now()),timer=setInterval(update,1000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
 return now;
}
export function strategyObservationView(v:Pick<StrategyDetailDTO,'asOf'|'freshness'|'historical'>,now:number):StrategyObservationView{
 const indexed=Date.parse(v.freshness.indexedAt);
 return {block:v.asOf.height,hash:v.asOf.hash,indexedAt:v.freshness.indexedAt,historical:v.historical,
  stale:v.freshness.stale||now-indexed>20000||indexed>now+1000};
}
function receiptHref(manifest:DeploymentManifest,hash:string){
 if(manifest.chainId===31337)return null;
 const url=new URL(manifest.explorerUrl);if(url.protocol!=='https:'||url.username||url.password)return null;
 url.pathname=`${url.pathname.replace(/\/$/,'')}/tx/${hash}`;url.search='';url.hash='';return url.href;
}
function strategyView(r:StrategyReadDTO,m:DeploymentManifest,observation:StrategyObservationView,refreshing:boolean):StrategyDataView{
 const inventory=strategyInventory(r,m),a=r.financial!.availability;
 const docked=a.every(v=>v.liveTokenCount===255),retired=r.lifecycle==='retired';
 const unavailable=inventory.some(v=>!v.live||!v.backed),limited=inventory.some(v=>v.limited);
 const status=docked?'Docked':retired?'Retired / not docked':unavailable?'Active / unavailable':limited?'Active / limited inventory':'Active / available';
 return {hash:r.orderHash,maker:r.maker,router:r.router,configHash:r.configHash,network:m.chainId===5042002?'Arc Testnet':m.chainId===31337?'Local Anvil':`Network ${m.chainId}`,
  tokens:inventory.map(v=>v.token.symbol).join(' / '),fee:r.config.feePpm===100?'0.01%':r.config.feePpm===500?'0.05%':'0.10%',
  status:refreshing||observation.stale||observation.historical?`Last observed: ${status}`:`${status} at observed block`,version:r.version,inventory,
  ticks:r.config.tickKeys.map((key,i)=>({key,radius:r.config.radiiInternal[i]!,fullRange:key===((1n<<64n)-1n).toString(),classification:(r.financial!.state.interiorTickMask&(1<<i))?'Interior':'Boundary'})),
  receipts:[{...r.activated,label:'Activation receipt'},...(r.version==='1'?[]:[{...r.updated,label:r.updated.event==='StrategyRetired'?'Retirement receipt':'Latest fill receipt'}])].map(v=>({label:v.label,hash:v.txHash,href:receiptHref(m,v.txHash)})),
  canTrade:!docked&&!retired&&!unavailable&&!refreshing&&!observation.stale&&!observation.historical};
}
/** Public reads only. Wallet signatures require a separate current-state review. */
export function useStrategy(id:string,expected?:{maker:string;deployment:DeploymentManifest}):StrategyViewState{
 const valid=hashSchema.safeParse(id).success,now=useObservationTime();
 const query=useQuery({queryKey:['strategy-detail',apiBase,id.toLowerCase(),expected?.maker.toLowerCase(),expected?JSON.stringify(expected.deployment):null],
  enabled:valid,retry:false,staleTime:0,refetchInterval:10000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,
  queryFn:async({signal})=>{
   const manifest=manifestSchema.parse(await request<unknown>('/deployment',signal));
   if(expected&&JSON.stringify(manifest)!==JSON.stringify(expected.deployment))throw Error('Strategy deployment changed');
   const response=await requestPayload(`/strategies/${id.toLowerCase()}`,signal),observation=decodeStrategyDetail(response.data,response.status,manifest,id);
   if(expected&&observation.data.strategy?.maker.toLowerCase()!==expected.maker.toLowerCase())throw Error('Strategy maker changed');
   return {manifest,observation};
  }});
 const state:StrategyViewState={id,phase:'loading',refreshing:query.isFetching,refresh:()=>{if(valid&&!query.isFetching)void query.refetch();}};
 if(!valid)return {...state,phase:'invalid'};
 if(query.isError)return {...state,phase:'unavailable'};
 if(!query.data)return state;
 const {manifest,observation:v}=query.data,observation=strategyObservationView(v,now);
 if(!v.data.strategy)return {...state,phase:'not-found',observation};
 return {...state,phase:'loaded',observation,strategy:strategyView(v.data.strategy,manifest,observation,query.isFetching),
  adminInput:{config:configFromDTO(v.data.strategy.config),order:orderFromDTO(v.data.strategy.order)}};
}
