'use client';
import Link from 'next/link';
import type {ReactNode} from 'react';
import type {DeploymentManifest} from '@orbital/shared';
import {IncompleteShipments} from './IncompleteShipments';
import {copy} from '../content';
import {useStrategies,type StrategiesViewState} from './useStrategies';
import {useStrategy} from './useStrategy';
import {StrategyInventory,StrategyObservation} from './Strategy';
import styles from './Strategy.module.css';

function StrategyCard({item,deployment}:{item:NonNullable<StrategiesViewState['items']>[number];deployment:DeploymentManifest}){
 const state=useStrategy(item.hash,{maker:item.maker,deployment});
 return <article className="panel" aria-label={`Strategy ${item.hash}`}>
  <div className={styles.cardHeader}><h2>{item.tokens}</h2><Link className="button secondary" href={`/liquidity/${item.hash}`}>Manage strategy</Link></div>
  <p className={styles.hash}>{item.hash}</p><p>{item.lifecycle} · {item.fee} swap fee · Registry update at block {item.updatedBlock}</p>
  {state.strategy?<><p className="pill">{state.strategy.status}</p><StrategyInventory strategy={state.strategy} compact/>
   <p className="hint">{copy.strategy.capacity}</p></>:<p role="status">{state.phase==='loading'?'Checking current inventory…':'Inventory unavailable. Open or refresh the strategy to check again.'}</p>}
  {state.observation&&<StrategyObservation observation={state.observation} refreshing={state.refreshing}/>}
 </article>;
}
export function StrategiesView({state,cards}:{state:StrategiesViewState;cards?:ReactNode}){
 return <section className={`page ${styles.page}`}>
  <div className="page-head"><div><div className="eyebrow">Maker-owned strategies</div><h1>Your liquidity, still yours.</h1><p>Publish an Orbital strategy from your wallet. Tokens move only when a swap settles.</p></div><Link className="button" href="/liquidity/new">Create strategy <span aria-hidden="true">+</span></Link></div>
  {state.phase==='disconnected'?<div className="panel empty"><h2>Your wallet is your starting point.</h2><p>Connect a wallet to view its strategies and publish a new allocation.</p><button className="button secondary" onClick={state.connect}>Connect wallet</button></div>:<>
   <p className="mono">{state.address}</p><div className={styles.filters}><label>Strategy status<select value={state.filter} onChange={e=>state.setFilter(e.target.value as StrategiesViewState['filter'])}><option value="all">All registered</option><option value="active">Active registrations</option><option value="retired">Retired registrations</option></select></label>
    <button className="button secondary" disabled={state.refreshing} onClick={state.restart}>Restart listing</button></div>
   <p className="hint">Unactivated shipments are not included in this index.</p><p className="hint">Each card checks inventory separately and shows its own observation block. These allocations share the maker’s wallet; their capacities cannot be added together.</p>
   {state.phase==='loaded'?<div className={styles.list}>{cards}</div>:<div className="panel empty" role="status"><h2>{state.phase==='loading'?'Checking registered strategies…':state.phase==='unavailable'?'Strategy list unavailable':state.filter==='all'?'No registered strategies in this wallet.':'No registered strategies match this filter.'}</h2>
    <p>{state.phase==='unavailable'?'The indexed page could not be checked. Restart the listing to request a fresh canonical page.':state.phase==='empty'?'This describes the indexed history only. It does not rule out an unactivated shipment or a recently submitted transaction.':'Reading the verified deployment and this wallet’s registered history.'}</p></div>}
   {state.observation&&<div className={styles.observation} role="status"><p>{state.observation.historical?`Historical registry page at block ${state.observation.block}.`:`Registry page at block ${state.observation.block}.`}</p>{state.observation.stale&&<p className="notice">{copy.strategy.stale}</p>}<p>Index checked: {state.observation.indexedAt}</p></div>}
   <nav className={styles.pagination} aria-label="Strategy pages"><button className="button secondary" disabled={!state.hasPrevious||state.refreshing} onClick={state.previous}>Previous page</button><span>Page {state.page}</span><button className="button secondary" disabled={!state.hasNext||state.refreshing} onClick={state.next}>Next page</button></nav>
  </>}
 </section>;
}
export default function Strategies(){const state=useStrategies();return <><StrategiesView state={state} cards={state.items?.map(item=><StrategyCard key={`${state.deployment!.chainId}:${state.deployment!.router}:${item.hash}`} item={item} deployment={state.deployment!}/>)}/><section className="page"><IncompleteShipments/></section></>;}
