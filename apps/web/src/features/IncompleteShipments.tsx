'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeShipmentList} from '@orbital/sdk';
import {manifestSchema} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {request,requestPayload} from './api';
export function IncompleteShipments(){
 const wallet=useWallet(),scope=`${wallet.address}:${wallet.chainId}`,[nav,setNav]=useState<{scope:string;pages:(string|undefined)[];page:number}>({scope,pages:[undefined],page:0});
 const current=nav.scope===scope?nav:{scope,pages:[undefined],page:0},cursor=current.pages[current.page];
 const query=useQuery({queryKey:['shipments',scope,cursor],enabled:!!wallet.address&&wallet.connected,retry:false,refetchInterval:cursor?false:10000,queryFn:async({signal})=>{
  const m=manifestSchema.parse(await request('/deployment',signal)),response=await requestPayload(`/makers/${wallet.address!.toLowerCase()}/shipments${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,signal);
  return decodeShipmentList(response.data,response.status,m,wallet.address!);
 }});
 if(!wallet.connected)return null;
 const data=query.isError?undefined:query.data;
 return <section className="stack" aria-label="Incomplete Aqua allocations" style={{marginTop:32}}><h2>Incomplete Aqua allocations</h2><p className="hint">These receipt-backed shipments have no Orbital activation at the observed block. Their config commitment does not reveal tick parameters. A matching draft saved in this browser can resume publication.</p>
 {query.isPending?<p>Checking Aqua receipts…</p>:query.isError?<p className="notice">Aqua shipment history is unavailable. Refresh to restart the listing.</p>:!data?.data.items.length?<p>No incomplete allocations on this page.</p>:data.data.items.map(s=><article className="panel" key={s.hash}><h3>{s.status==='docked'?'Docked before activation':'Awaiting activation'}</h3><p className="mono">{s.hash}</p><details><summary>Commitment and receipt</summary><p className="mono">Config: {s.configHash}</p><p className="mono">Shipped: {s.created.txHash}</p>{s.docked&&<p className="mono">Docked: {s.docked.txHash}</p>}</details>{s.status==='incomplete'&&<Link className="button secondary" href="/liquidity/new">Open saved publication</Link>}</article>)}
 {data&&<p className="hint">Canonical shipment history through block {data.asOf.height}.</p>}
 <div className="row"><button className="button secondary" disabled={query.isFetching} onClick={()=>{setNav({scope,pages:[undefined],page:0});void query.refetch();}}>Refresh allocations</button><button className="button secondary" disabled={!current.page||query.isFetching} onClick={()=>setNav({...current,page:current.page-1})}>Previous allocations</button><button className="button secondary" disabled={!data?.data.nextCursor||query.isFetching} onClick={()=>{if(data?.data.nextCursor)setNav({...current,pages:[...current.pages.slice(0,current.page+1),data.data.nextCursor],page:current.page+1});}}>Next allocations</button></div>
 </section>;
}
