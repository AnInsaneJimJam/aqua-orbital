'use client';
import Link from '../components/AppLink';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeShipmentList,lifecycleAbi} from '@orbital/sdk';
import {manifestSchema} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {request,requestPayload,useDeployment} from './api';
import {publicClient} from '../wallet/transactionPort';
import {readPublicationDraft} from './publicationStorage';
import styles from './Strategy.module.css';
export function SavedPublication(){
 const wallet=useWallet(),deployment=useDeployment(),m=deployment.data;
 const query=useQuery({queryKey:['saved-publication',wallet.address,wallet.chainId,m],enabled:wallet.connected&&!!wallet.address&&!!m?.verified&&wallet.chainId===m.chainId,
  retry:false,refetchInterval:10000,queryFn:async()=>{
   const saved=readPublicationDraft(m!,wallet.address!);if(!saved)return null;
   const c=saved.prepared.config,nonce=await publicClient.readContract({address:c.router,abi:lifecycleAbi,functionName:'nextMakerNonce',args:[c.maker]});
   return nonce===c.makerNonce?c.tokens.map(a=>m!.tokens.find(t=>t.address.toLowerCase()===a.toLowerCase())!.symbol).join(' / '):null;
  }});
 if(!wallet.connected||!m||wallet.chainId!==m.chainId||(!query.data&&!query.isError))return null;
 return <section className="panel" aria-label="Saved publication"><h3>{query.isError?'Check your saved publication':'Finish publishing your strategy'}</h3>
  {query.isError?<p>Its saved configuration or onchain status could not be checked. Open it to review the recovery state.</p>:<><p>{query.data}</p><p>Approvals alone do not publish a strategy. Continue your saved draft to publish the allocation and activate trading.</p></>}
  <Link className="button" href="/liquidity/new">Continue publication</Link>
 </section>;
}
export function IncompleteShipments(){
 const wallet=useWallet(),scope=`${wallet.address}:${wallet.chainId}`,[nav,setNav]=useState<{scope:string;pages:(string|undefined)[];page:number}>({scope,pages:[undefined],page:0});
 const current=nav.scope===scope?nav:{scope,pages:[undefined],page:0},cursor=current.pages[current.page];
 const query=useQuery({queryKey:['shipments',scope,cursor],enabled:!!wallet.address&&wallet.connected,retry:false,refetchInterval:cursor?false:10000,queryFn:async({signal})=>{
  const m=manifestSchema.parse(await request('/deployment',signal)),response=await requestPayload(`/makers/${wallet.address!.toLowerCase()}/shipments${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,signal);
  return decodeShipmentList(response.data,response.status,m,wallet.address!);
 }});
 if(!wallet.connected)return null;
 const data=query.isError?undefined:query.data;
 if(data&&!data.data.items.length&&!current.page)return null;
 return <section className={styles.unfinished} aria-label="Incomplete Aqua allocations"><h2>Unfinished publications</h2><p className="hint">Resume activation with the matching strategy draft saved in this browser.</p>
 {query.isPending?<p>Checking Aqua receipts…</p>:query.isError?<p className="notice">Aqua shipment history is unavailable. Refresh to restart the listing.</p>:!data?.data.items.length?<p>No incomplete allocations on this page.</p>:data.data.items.map(s=><article className="panel" key={s.hash}><h3>{s.status==='docked'?'Docked before activation':'Awaiting activation'}</h3><p className="mono">{s.hash}</p><details><summary>Commitment and receipt</summary><p className="mono">Config: {s.configHash}</p><p className="mono">Shipped: {s.created.txHash}</p>{s.docked&&<p className="mono">Docked: {s.docked.txHash}</p>}</details>{s.status==='incomplete'&&<Link className="button secondary" href="/liquidity/new">Open saved publication</Link>}</article>)}
 {data&&<p className="hint">Canonical shipment history through block {data.asOf.height}.</p>}
 <div className={styles.actions}><button className="button secondary" disabled={query.isFetching} onClick={()=>{setNav({scope,pages:[undefined],page:0});void query.refetch();}}>Refresh allocations</button><button className="button secondary" disabled={!current.page||query.isFetching} onClick={()=>setNav({...current,page:current.page-1})}>Previous allocations</button><button className="button secondary" disabled={!data?.data.nextCursor||query.isFetching} onClick={()=>{if(data?.data.nextCursor)setNav({...current,pages:[...current.pages.slice(0,current.page+1),data.data.nextCursor],page:current.page+1});}}>Next allocations</button></div>
 </section>;
}
