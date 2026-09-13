'use client';
import Link from '../components/AppLink';
import type {ReactNode} from 'react';
import type {DeploymentManifest} from '@orbital/shared';
import {IncompleteShipments,SavedPublication} from './IncompleteShipments';
import {copy} from '../content';
import {useStrategies,type StrategiesViewState} from './useStrategies';
import {useStrategy} from './useStrategy';
import {StrategyInventory,StrategyObservation} from './Strategy';
import styles from './Strategy.module.css';
import {Select} from '../components/Select';
import TokenIcon from '../components/TokenIcon';

function StrategyCard({item,deployment}:{item:NonNullable<StrategiesViewState['items']>[number];deployment:DeploymentManifest}){
 const state=useStrategy(item.hash,{maker:item.maker,deployment});
 return <article className={styles.strategyCard} aria-label={`Strategy ${item.hash}`}>
  <div className={styles.cardHeader}><h2>{item.tokens}</h2><Link className="button secondary" href={`/liquidity/${item.hash}`}>Manage strategy</Link></div>
  <p className={`hint ${styles.cardMeta}`}>{item.lifecycle} · {item.fee} swap fee</p>
  {state.strategy?<><p className="pill">{state.strategy.status}</p><StrategyInventory strategy={state.strategy} compact/>
   <p className="hint">{copy.strategy.capacity}</p></>:<p role="status">{state.phase==='loading'?'Checking current inventory…':'Inventory unavailable. Open or refresh the strategy to check again.'}</p>}
  {state.observation&&<StrategyObservation observation={state.observation} refreshing={state.refreshing}/>}
 </article>;
}
export function StrategiesView({state,cards}:{state:StrategiesViewState;cards?:ReactNode}){
 return <section className={`page ${styles.page}`}>
  <div className={styles.landingHeader}><h1>Put your stablecoins<br/><em>to work.</em></h1><p>Manage the strategies funded by your wallet.</p></div>
  <div className={styles.workspace}><div className={styles.registry}><h2>Your strategies</h2>
  {state.phase==='disconnected'?<div className={`empty ${styles.empty}`}><div className={styles.emptyTokens} aria-hidden="true">{['USDC','oUSD6','oUSD18'].map(symbol=><TokenIcon key={symbol} symbol={symbol} size={36}/>)}</div><h3>Your wallet is your starting point.</h3><p>Connect a wallet to view its strategies and publish a new allocation.</p><button className="button secondary" onClick={state.connect}>Connect wallet</button></div>:<>
   <SavedPublication/>
   <div className={styles.filters}><div className="field"><label htmlFor="strategy-status">Strategy status</label><Select id="strategy-status" value={state.filter} onValueChange={v=>state.setFilter(v as StrategiesViewState['filter'])} options={[{value:'all',label:'All registered'},{value:'active',label:'Active registrations'},{value:'retired',label:'Retired registrations'}]}/></div>
    <button className="button secondary" disabled={state.refreshing} onClick={state.restart}>Restart listing</button></div>
   <p className="hint">Strategies share your wallet balance. Their available amounts cannot be added together.</p>
   {state.phase==='loaded'?<div className={styles.list}>{cards}</div>:<div className={`empty ${styles.empty}`} role="status"><h3>{state.phase==='loading'?'Checking registered strategies…':state.phase==='unavailable'?'Strategy list unavailable':state.filter==='all'?'No registered strategies in this wallet.':'No registered strategies match this filter.'}</h3>
    <p>{state.phase==='unavailable'?'The indexed page could not be checked. Restart the listing to request a fresh canonical page.':state.phase==='empty'?'This describes the indexed history only. It does not rule out an unactivated shipment or a recently submitted transaction.':'Reading the verified deployment and this wallet’s registered history.'}</p></div>}
   {state.observation&&<div className={styles.observation} role="status"><details><summary>Registry observation</summary><p>{state.observation.historical?`Historical registry page at block ${state.observation.block}.`:`Registry page at block ${state.observation.block}.`}</p><p>Index checked: {state.observation.indexedAt}</p></details>{state.observation.stale&&<p className="notice">{copy.strategy.stale}</p>}</div>}
   {(state.hasPrevious||state.hasNext)&&<nav className={styles.pagination} aria-label="Strategy pages"><button className="button secondary" disabled={!state.hasPrevious||state.refreshing} onClick={state.previous}>Previous page</button><span>Page {state.page}</span><button className="button secondary" disabled={!state.hasNext||state.refreshing} onClick={state.next}>Next page</button></nav>}
  </>}
  </div><aside className={styles.create}><h2>New strategy</h2><p>Choose two or more supported tokens.</p><p className="hint">Every pair in your basket trades both ways. Set equal starting amounts, a concentration profile and your swap fee. Your tokens stay in your wallet.</p><Link className="button full" href="/liquidity/new">Create strategy <span aria-hidden="true">+</span></Link></aside></div>
 </section>;
}
export default function Strategies(){const state=useStrategies();return <><StrategiesView state={state} cards={state.items?.map(item=><StrategyCard key={`${state.deployment!.chainId}:${state.deployment!.router}:${item.hash}`} item={item} deployment={state.deployment!}/>)}/><div className={styles.additional}><IncompleteShipments/></div></>;}
