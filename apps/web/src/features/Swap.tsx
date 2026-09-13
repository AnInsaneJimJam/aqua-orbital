'use client';
import Link from '../components/AppLink';
import {ArrowDown,RotateCw} from 'lucide-react';
import {useSwap,type SwapViewState} from './useSwap';
import {copy} from '../content';
import {SwapExecution} from './SwapExecution';
import {SwapSettings} from './SwapSettings';
import {Select} from '../components/Select';
import styles from './Swap.module.css';
export function SwapView(state:SwapViewState){
 const {input,output,amount,error,symbols,setInput,setOutput,setAmount,quote}=state;
 const executing=!!(state.execution.review||state.execution.pending||state.execution.confirmed);
 return <section className={`page ${styles.page}`}>
 <header className={styles.intro}><h1>Swap <em>stablecoins.</em></h1><p>A simple way to move between stablecoins.</p></header>
 <div className={styles.card}>
  <div className={styles.heading}><h2>Swap</h2><SwapSettings state={state.settings}/></div>
  <div className={styles.assetBox}>
   <label htmlFor="amount">Sell</label>
   <div className={styles.amountRow}><input id="amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off"/><Select compact className={styles.tokenSelect} aria-label="Input token" value={input} onValueChange={setInput} options={symbols.map(s=>({value:s,label:s,tokenSymbol:s}))}/></div>
   <div className={styles.balanceRow}><span aria-label="Input balance">Balance: {state.balance.loading&&!state.balance.data?'Checking…':state.balance.canRefresh?state.balance.label:'—'}</span>{state.balance.canRefresh&&<div><button className={styles.max} disabled={state.maxDisabled} onClick={state.max}>{state.maxBusy?'Estimating…':'Max'}</button><button className={styles.refresh} aria-label="Refresh balance" title="Refresh balance" disabled={state.balance.loading} onClick={()=>{void state.balance.refresh();}}><RotateCw size={14} aria-hidden="true"/></button></div>}</div>
  </div>
  <div className={styles.reverseRow}><button className={`button secondary ${styles.reverse}`} aria-label="Reverse pair" onClick={state.reverse}><ArrowDown size={18} aria-hidden="true"/></button></div>
  <div className={`${styles.assetBox} ${styles.receiveBox}`}>
   <label htmlFor="output-token">Buy</label>
   <div className={styles.amountRow}>{state.quoteView&&!executing?<output className={styles.output} aria-label="Quoted output">{state.quoteView.output}</output>:<span className={styles.placeholder} aria-label="No quoted output">0.00</span>}<Select compact className={styles.tokenSelect} id="output-token" value={output} onValueChange={setOutput} options={symbols.filter(s=>s!==input).map(s=>({value:s,label:s,tokenSymbol:s}))}/></div>
   <p className={styles.assetHint}>{executing?'See the reviewed amounts below.':'Output is confirmed by a fresh quote.'}</p>
  </div>
  {state.maxMessage&&<div className="notice" role="status"><p>{state.maxMessage}</p>{state.conservativeAmount&&<><p>Gas could not be estimated. This editable amount leaves 0.05 USDC; more may be needed.</p><button className="button secondary compact" onClick={state.useConservative}>Use editable amount · {state.conservativeAmount}</button></>}</div>}
  {!executing&&<div className={styles.facts}><div><span>Slippage tolerance</span><span>{state.settings.value?`${state.settings.value.slippageBps/100}%`:'Choose valid settings'}</span></div><div><span>Network fee</span><span>{state.gasAsset} · estimated at review</span></div></div>}
  {state.quoteView&&!executing&&<section aria-label="Quote observation">
   <dl className={styles.quoteFacts}><div><dt>Minimum received</dt><dd>{state.quoteView.minimum}</dd></div><div><dt>Trading fee · included in input</dt><dd>{state.quoteView.fee}</dd></div></dl>
   <details><summary>Quote details</summary><p>You pay: {state.quoteView.input}</p><p>Recipient: <span className="mono">{state.quoteView.recipient}</span></p><p>Approval: Not requested</p><p>{state.quoteView.historical?'Historical observation':'Observed'} at block {state.quoteView.block} · {state.quoteView.inspected} strategies checked.</p><p>Maker: <span className="mono">{state.quoteView.maker}</span></p><p>{state.quoteView.ticks} ticks · maximum 16 crossings</p>{state.quoteView.truncated&&<p>The scan reached its limit; other strategies may exist.</p>}<p className="mono"><Link href={`/liquidity/${state.quoteView.orderHash}`}>Strategy: {state.quoteView.orderHash}</Link></p>{state.quoteView.alternatives.length>0&&<><p>Other inspected results</p><ul>{state.quoteView.alternatives.map(route=><li key={route.orderHash}>{route.output}</li>)}</ul></>}</details>
  </section>}
  {state.expired&&!executing&&<p role="status" className="notice">{copy.swap.expired}</p>}
  {state.empty&&<p role="status" className="notice">{state.emptyMessage}</p>}
  {state.deploymentPending?<p className="hint" role="status">Checking deployment…</p>:state.deploymentError?<div className="notice">{state.deploymentError}</div>:null}
  {error&&<p className="error" role="alert">{error}</p>}
  <SwapExecution state={state.execution} network={state.network}/>
  {!executing&&<>
   {state.quoteView&&<button className="button full" onClick={state.execution.prepare} disabled={!state.execution.canPrepare}>Review swap</button>}
   <button className={state.quoteView?styles.refreshQuote:'button full'} onClick={quote} disabled={state.disabled||state.execution.busy}>{state.actionLabel}</button>
  </>}
  <p className={styles.network}>On {state.network}</p>
 </div><p className={styles.footnote}>Tokens stay in the maker’s wallet until settlement.</p></section>;
}
export default function Swap(){return <SwapView {...useSwap()}/>;}
