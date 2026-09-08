'use client';
import Link from 'next/link';
import {ArrowDown,RotateCw} from 'lucide-react';
import {useSwap,type SwapViewState} from './useSwap';
import {copy} from '../content';
import {SwapExecution} from './SwapExecution';
import {SwapSettings} from './SwapSettings';
import styles from './Swap.module.css';
export function SwapView(state:SwapViewState){
 const {input,output,amount,error,symbols,setInput,setOutput,setAmount,quote}=state;
 const executing=!!(state.execution.review||state.execution.pending||state.execution.confirmed);
 return <section className={`page ${styles.page}`}><div className={`panel ${styles.card}`}>
  <div className={styles.heading}><div><h1>Swap</h1><span className="pill">{state.network}</span></div><SwapSettings state={state.settings}/></div>
  <div className={styles.assetBox}>
   <label htmlFor="amount">You pay</label>
   <div className={styles.amountRow}><input id="amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off"/><select aria-label="Input token" value={input} onChange={e=>setInput(e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select></div>
   <div className={styles.balanceRow}><span aria-label="Input balance">Balance: {state.balance.loading&&!state.balance.data?'Checking…':state.balance.label}</span><div><button className={styles.max} disabled={state.maxDisabled} onClick={state.max}>{state.maxBusy?'Estimating…':'Max'}</button><button className={styles.refresh} aria-label="Refresh balance" title="Refresh balance" disabled={!state.balance.canRefresh||state.balance.loading} onClick={()=>{void state.balance.refresh();}}><RotateCw size={14} aria-hidden="true"/></button></div></div>
  </div>
  <div className={styles.reverseRow}><button className={`button secondary ${styles.reverse}`} aria-label="Reverse pair" onClick={state.reverse}><ArrowDown size={18} aria-hidden="true"/></button></div>
  <div className={styles.assetBox}>
   <label htmlFor="output-token">You receive</label>
   <div className={styles.amountRow}>{state.quoteView&&!executing?<output className={styles.output} aria-label="Quoted output">{state.quoteView.output}</output>:<span className={styles.placeholder}>—</span>}<select id="output-token" value={output} onChange={e=>setOutput(e.target.value)}>{symbols.filter(s=>s!==input).map(s=><option key={s}>{s}</option>)}</select></div>
   <p className={styles.assetHint}>{executing?'See the reviewed amounts below.':input.startsWith('oUSD')||output.startsWith('oUSD')?'Demo tokens · No redemption value':'Output is confirmed by a fresh quote.'}</p>
  </div>
  {state.maxMessage&&<div className="notice" role="status"><p>{state.maxMessage}</p>{state.conservativeAmount&&<><p>Gas could not be estimated. This editable amount leaves 0.05 USDC; more may be needed.</p><button className="button secondary compact" onClick={state.useConservative}>Use editable amount · {state.conservativeAmount}</button></>}</div>}
  {!executing&&<div className={styles.facts}><div><span>Slippage tolerance</span><span>{state.settings.value?`${state.settings.value.slippageBps/100}%`:'Choose valid settings'}</span></div><div><span>Network fee</span><span>{state.gasAsset} · estimated at review</span></div></div>}
  {state.quoteView&&!executing&&<section aria-label="Quote observation">
   <dl className={styles.quoteFacts}><div><dt>Minimum received</dt><dd>{state.quoteView.minimum}</dd></div><div><dt>Trading fee · included in input</dt><dd>{state.quoteView.fee}</dd></div></dl>
   <details><summary>Quote details</summary><p>You pay: {state.quoteView.input}</p><p>Recipient: <span className="mono">{state.quoteView.recipient}</span></p><p>Approval: Not requested</p><p>{state.quoteView.historical?'Historical observation':'Observed'} at block {state.quoteView.block} · {state.quoteView.inspected} strategies checked.</p><p>Maker: <span className="mono">{state.quoteView.maker}</span></p><p>{state.quoteView.ticks} ticks · maximum 16 crossings</p>{state.quoteView.truncated&&<p>The scan reached its limit; other strategies may exist.</p>}<p className="mono"><Link href={`/liquidity/${state.quoteView.orderHash}`}>Strategy: {state.quoteView.orderHash}</Link></p>{state.quoteView.alternatives.length>0&&<><p>Other inspected results</p><ul>{state.quoteView.alternatives.map(route=><li key={route.orderHash}>{route.output}</li>)}</ul></>}</details>
  </section>}
  {state.expired&&!executing&&<p role="status" className="notice">{copy.swap.expired}</p>}
  {state.empty&&<p role="status" className="notice">{copy.swap.empty}</p>}
  {state.deploymentPending?<p className="hint" role="status">Checking deployment…</p>:state.deploymentError?<div className="notice">{state.deploymentError}</div>:null}
  {error&&<p className="error" role="alert">{error}</p>}
  <SwapExecution state={state.execution} network={state.network}/>
  {!executing&&<>
   {state.quoteView&&<button className="button full" onClick={state.execution.prepare} disabled={!state.execution.canPrepare}>Review swap</button>}
   <button className={state.quoteView?styles.refreshQuote:'button full'} onClick={quote} disabled={state.disabled||state.execution.busy}>{state.actionLabel}</button>
  </>}
 </div><div className={styles.footnote}><span>Tokens stay in the maker’s wallet until settlement.</span><Link href="/fund">Get demo tokens ↗</Link></div></section>;
}
export default function Swap(){return <SwapView {...useSwap()}/>;}
