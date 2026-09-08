'use client';
import {useSwap,type SwapViewState} from './useSwap';
export function SwapView(state:SwapViewState){
 const {input,output,amount,error,symbols,setInput,setOutput,setAmount,quote}=state;
 return <div className="page"><div className="form-panel panel"><div className="row"><h1>Swap</h1><span className="pill">{state.network}</span></div><p className="hint">Trade stablecoin liquidity through Orbital.</p>
 <div className="field"><label htmlFor="amount">You pay</label><div className="row"><input id="amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off"/><select aria-label="Input token" value={input} onChange={e=>setInput(e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select></div></div>
 <div className="row" style={{justifyContent:'center'}}><button className="button secondary compact" aria-label="Reverse pair" onClick={state.reverse}>↓</button></div>
 <div className="field"><label htmlFor="output-token">You receive</label><select id="output-token" value={output} onChange={e=>setOutput(e.target.value)}>{symbols.filter(s=>s!==input).map(s=><option key={s}>{s}</option>)}</select><span className="hint">Output appears after a certified onchain quote.</span></div>
 {(input.startsWith('oUSD')||output.startsWith('oUSD'))&&<p className="hint">oUSD6 and oUSD18 are demo tokens — no redemption value.</p>}
 <hr className="divider"/><div className="row hint"><span>Slippage tolerance</span><span>0.50%</span></div><div className="row hint"><span>Network fee</span><span>{state.gasAsset} · estimated at review</span></div>
 <div style={{margin:'20px 0'}}>{state.deploymentPending?<p className="hint" role="status">Checking deployment…</p>:state.deploymentError?<div className="notice">{state.deploymentError}</div>:null}</div>
 {error&&<p className="error" role="alert">{error}</p>}
 <button className="button full" onClick={quote} disabled={state.disabled}>{state.actionLabel}</button>
 <details><summary>How execution works</summary><p className="hint">The maker’s tokens remain in their wallet until settlement. Your wallet approves the Orbital router for the reviewed input. Minimum output and deadline are enforced onchain.</p></details></div></div>;
}
export default function Swap(){return <SwapView {...useSwap()}/>;}
