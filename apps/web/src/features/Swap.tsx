'use client';
import {useSwap,type SwapViewState} from './useSwap';
import {copy} from '../content';
import {SwapExecution} from './SwapExecution';
export function SwapView(state:SwapViewState){
 const {input,output,amount,error,symbols,setInput,setOutput,setAmount,quote}=state;
 const executing=!!(state.execution.review||state.execution.pending||state.execution.confirmed);
 return <div className="page"><div className="form-panel panel"><div className="row"><h1>Swap</h1><span className="pill">{state.network}</span></div><p className="hint">Trade stablecoin liquidity through Orbital.</p>
 <div className="field"><label htmlFor="amount">You pay</label><div className="row"><input id="amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off"/><select aria-label="Input token" value={input} onChange={e=>setInput(e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select></div></div>
 <div className="row" style={{justifyContent:'center'}}><button className="button secondary compact" aria-label="Reverse pair" onClick={state.reverse}>↓</button></div>
 <div className="field"><label htmlFor="output-token">You receive</label><select id="output-token" value={output} onChange={e=>setOutput(e.target.value)}>{symbols.filter(s=>s!==input).map(s=><option key={s}>{s}</option>)}</select>{state.quoteView&&!executing?<output className="mono" aria-label="Quoted output">{state.quoteView.output}</output>:<span className="hint">{executing?'Review and transaction amounts appear below.':'Output appears after a certified onchain quote.'}</span>}</div>
 {(input.startsWith('oUSD')||output.startsWith('oUSD'))&&<p className="hint">oUSD6 and oUSD18 are demo tokens — no redemption value.</p>}
 <hr className="divider"/><div className="row hint"><span>Slippage tolerance</span><span>0.50%</span></div><div className="row hint"><span>Network fee</span><span>{state.gasAsset} · estimated at review</span></div>
 {state.quoteView&&!state.execution.review&&!state.execution.pending&&!state.execution.confirmed&&<section aria-label="Quote observation" className="hint">
 <dl><dt>You pay</dt><dd className="mono">{state.quoteView.input}</dd><dt>Minimum received</dt><dd className="mono">{state.quoteView.minimum}</dd><dt>Trading fee · included in input</dt><dd className="mono">{state.quoteView.fee}</dd><dt>Recipient</dt><dd className="mono">{state.quoteView.recipient}</dd><dt>Approval</dt><dd>Not requested</dd></dl>
 <p className="notice">{copy.swap.readOnly}</p>
 <details><summary>Quote details</summary><p>{state.quoteView.historical?'Historical observation':'Observed'} at block {state.quoteView.block}.</p><p>Best result among {state.quoteView.inspected} inspected strategies.</p>{state.quoteView.truncated&&<p>The candidate scan reached its limit; other strategies may exist.</p>}<p className="mono">Strategy: {state.quoteView.orderHash}</p>{state.quoteView.alternatives.length>0&&<><p>Other inspected results</p><ul>{state.quoteView.alternatives.map(route=><li key={route.orderHash}><span className="mono">{route.output}</span></li>)}</ul></>}</details>
 </section>}
 {state.expired&&!executing&&<p role="status" className="notice">{copy.swap.expired}</p>}
 {state.empty&&<p role="status" className="notice">{copy.swap.empty}</p>}
 <div style={{margin:'20px 0'}}>{state.deploymentPending?<p className="hint" role="status">Checking deployment…</p>:state.deploymentError?<div className="notice">{state.deploymentError}</div>:null}</div>
 {error&&<p className="error" role="alert">{error}</p>}
 <SwapExecution state={state.execution} network={state.network}/>
 {!state.execution.review&&!state.execution.pending&&!state.execution.confirmed&&<>
 {state.quoteView&&<button className="button full" onClick={state.execution.prepare} disabled={!state.execution.canPrepare||state.pending}>Review swap</button>}
 <button className={`button full ${state.quoteView?'secondary':''}`} onClick={quote} disabled={state.disabled||state.execution.busy}>{state.actionLabel}</button>
 </>}
 <details><summary>How execution works</summary><p className="hint">The maker’s tokens remain in their wallet until settlement. Your wallet approves the Orbital router for the reviewed input. Minimum output and deadline are enforced onchain.</p></details></div></div>;
}
export default function Swap(){return <SwapView {...useSwap()}/>;}
