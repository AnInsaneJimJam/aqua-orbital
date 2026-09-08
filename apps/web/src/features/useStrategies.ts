'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeStrategyList} from '@orbital/sdk';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {apiBase,request,requestPayload} from './api';
import {strategyObservationView,useObservationTime,type StrategyFilter,type StrategyObservationView} from './useStrategy';

export type StrategiesViewState={phase:'disconnected'|'loading'|'unavailable'|'empty'|'loaded';address?:string;connect:()=>void;refreshing:boolean;
 filter:StrategyFilter;setFilter:(value:StrategyFilter)=>void;restart:()=>void;previous:()=>void;next:()=>void;hasPrevious:boolean;hasNext:boolean;page:number;
 observation?:StrategyObservationView;items?:{hash:string;maker:string;tokens:string;fee:string;lifecycle:string;updatedBlock:string}[];deployment?:DeploymentManifest;};
export function useStrategies():StrategiesViewState{
 const wallet=useWallet(),now=useObservationTime(),[filter,setFilter]=useState<StrategyFilter>('all');
 const scope=`${apiBase}:${wallet.address?.toLowerCase()??''}:${wallet.chainId}:${filter}`;
 const [navigation,setNavigation]=useState<{scope:string;pages:(string|undefined)[];index:number;generation:number}>({scope,pages:[undefined],index:0,generation:0});
 const nav=navigation.scope===scope?navigation:{scope,pages:[undefined],index:0,generation:0};
 const cursor=nav.pages[nav.index],query=useQuery({queryKey:['maker-strategies',scope,cursor,nav.generation],enabled:wallet.connected&&!!wallet.address,retry:false,staleTime:0,
  refetchOnWindowFocus:true,queryFn:async({signal})=>{
   const manifest=manifestSchema.parse(await request<unknown>('/deployment',signal));
   const args={maker:wallet.address!.toLowerCase(),status:filter,limit:6,cursor};
   const search=new URLSearchParams({status:filter,limit:'6'});if(cursor)search.set('cursor',cursor);
   const response=await requestPayload(`/makers/${args.maker}/strategies?${search}`,signal);
   return {manifest,observation:decodeStrategyList(response.data,response.status,manifest,args)};
  }});
 const state:StrategiesViewState={phase:'loading',address:wallet.address,connect:wallet.connect,refreshing:query.isFetching,filter,setFilter,
  restart:()=>setNavigation({scope,pages:[undefined],index:0,generation:nav.generation+1}),
  previous:()=>{if(nav.index>0&&!query.isFetching)setNavigation({...nav,index:nav.index-1});},
  next:()=>{const next=query.data?.observation.data.nextCursor;if(next&&!query.isFetching&&!query.isError)setNavigation({...nav,pages:[...nav.pages.slice(0,nav.index+1),next],index:nav.index+1});},
  hasPrevious:nav.index>0,hasNext:!query.isError&&!!query.data?.observation.data.nextCursor,page:nav.index+1};
 if(!wallet.connected||!wallet.address)return {...state,phase:'disconnected',refreshing:false};
 if(query.isError)return {...state,phase:'unavailable'};
 if(!query.data)return state;
 const {manifest,observation:v}=query.data;
 return {...state,phase:v.data.items.length?'loaded':'empty',observation:strategyObservationView(v,now),deployment:manifest,
  items:v.data.items.map(r=>({hash:r.orderHash,maker:r.maker,tokens:r.config.tokens.map(a=>manifest.tokens.find(t=>t.address.toLowerCase()===a.toLowerCase())!.symbol).join(' / '),
   fee:r.config.feePpm===100?'0.01%':r.config.feePpm===500?'0.05%':'0.10%',lifecycle:r.lifecycle==='active'?'Active registration':'Retired registration',updatedBlock:r.updated.blockNumber}))};
}
