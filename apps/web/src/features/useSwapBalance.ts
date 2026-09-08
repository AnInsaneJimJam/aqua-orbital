'use client';
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import {formatAmount} from '@orbital/sdk';
import {useWallet} from '../wallet/WalletProvider';
import {readSwapBalance} from '../wallet/balancePort';
import {selectedChain} from '../wallet/config';
import {request} from './api';
export function useSwapBalance(manifest:DeploymentManifest|undefined,symbol:string,active:boolean){
 const wallet=useWallet(),key=JSON.stringify([manifest,symbol,wallet.address,wallet.chainId,wallet.connected]),live=useRef(key);live.current=key;
 const enabled=!!manifest?.verified&&wallet.connected&&wallet.chainId===selectedChain.id&&manifest.chainId===selectedChain.id;
 const query=useQuery({queryKey:['swap-balance',key],enabled:enabled&&active,retry:false,refetchOnWindowFocus:false,refetchInterval:active?10000:false,gcTime:0,
  queryFn:async({signal})=>{const current=()=>!signal.aborted&&live.current===key;
   const m=manifestSchema.parse(await request('/deployment',signal));if(!current()||JSON.stringify(m)!==JSON.stringify(manifest))throw Error('Deployment changed');
   const tokens=m.tokens.filter(t=>t.symbol===symbol);if(tokens.length!==1)throw Error('Token metadata unavailable');
   const result=await readSwapBalance(wallet,m,tokens[0]!,current),final=manifestSchema.parse(await request('/deployment',signal));
   if(!current()||JSON.stringify(m)!==JSON.stringify(final))throw Error('Deployment changed');return result;
  }});
 const [clock,setClock]=useState(0);useEffect(()=>{if(!query.data)return;const update=()=>setClock(Date.now()),timer=setTimeout(update,Math.max(0,query.data.expiresAtMs-Date.now()));document.addEventListener('visibilitychange',update);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);};},[query.data]);
 const data=enabled&&!query.isError&&query.data&&Math.max(clock,Date.now())<query.data.expiresAtMs?query.data:undefined;
 return {data,canRefresh:enabled,loading:enabled&&query.isFetching,label:data?`${formatAmount(data.amountRaw,data.token.decimals)} ${data.token.symbol}`:enabled?'Unavailable':'Connect on the supported network',refresh:query.refetch};
}
