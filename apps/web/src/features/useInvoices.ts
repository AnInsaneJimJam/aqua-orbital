'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeInvoiceList,formatAmount} from '@orbital/sdk';
import {manifestSchema} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {apiBase,request,requestPayload} from './api';
export function useInvoices(){
 const wallet=useWallet(),scope=`${apiBase}:${wallet.address?.toLowerCase()}:${wallet.chainId}`;
 const [navigation,setNavigation]=useState<{scope:string;pages:(string|undefined)[];index:number;generation:number}>({scope,pages:[undefined],index:0,generation:0});
 const nav=navigation.scope===scope?navigation:{scope,pages:[undefined],index:0,generation:0},cursor=nav.pages[nav.index];
 const query=useQuery({queryKey:['maker-invoices',scope,cursor,nav.generation],enabled:!!wallet.address&&wallet.connected,retry:false,refetchInterval:cursor?false:10000,
  queryFn:async({signal})=>{const manifest=manifestSchema.parse(await request('/deployment',signal)),search=new URLSearchParams({limit:'6'});if(cursor)search.set('cursor',cursor);
   const response=await requestPayload(`/makers/${wallet.address!.toLowerCase()}/invoices?${search}`,signal);
   return decodeInvoiceList(response.data,response.status,manifest,{merchant:wallet.address!,limit:6,cursor});}});
 const data=query.isError?undefined:query.data;
 return {connected:wallet.connected,address:wallet.address,loading:query.isPending,refreshing:query.isFetching,error:query.isError,connect:wallet.connect,page:nav.index+1,
  items:data?.data.items.map(i=>({id:i.invoiceId,amount:`${formatAmount(BigInt(i.amountDueRaw),6)} USDC`,status:i.status==='unpaid'&&BigInt(i.expiresAt)*1000n<BigInt(Date.now())?'Expired':i.status==='unpaid'?'Unpaid':i.status==='paid'?'Paid':'Cancelled',expiry:new Date(Number(i.expiresAt)*1000).toLocaleString(),recipients:i.recipients.length,receipt:i.updated.txHash})),
  block:data?.asOf.height,stale:data?.freshness.stale,historical:data?.historical,
  restart:()=>setNavigation({scope,pages:[undefined],index:0,generation:nav.generation+1}),
  hasPrevious:nav.index>0,hasNext:!!data?.data.nextCursor,
  previous:()=>{if(nav.index>0&&!query.isFetching)setNavigation({...nav,index:nav.index-1});},
  next:()=>{const next=data?.data.nextCursor;if(next&&!query.isFetching)setNavigation({...nav,pages:[...nav.pages.slice(0,nav.index+1),next],index:nav.index+1});}};
}
