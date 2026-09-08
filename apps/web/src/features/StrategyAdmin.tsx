'use client';
import type {StrategyAdminViewState} from './useStrategyAdmin';
import styles from './Strategy.module.css';
export function StrategyAdminView({state:s,publication=false}:{state:StrategyAdminViewState;publication?:boolean}){
 if(!s.owner&&!s.pending&&!s.confirmation)return null;
 const r=s.review;
 return <section aria-label="Strategy administration" className={styles.observation}>
  <h3>{publication?'Publication steps':'Manage your strategy'}</h3><p>{publication?'Review bounded approvals, publish the Aqua allocation, then activate Orbital. Each step requires its own wallet confirmation. Reload this page to resume your saved draft.':'Deactivation first retires the Orbital strategy, then docks its Aqua allocation. Each step needs its own review and wallet confirmation. Tokens are already in your wallet.'}</p>
  {r&&<div aria-label="Strategy action review"><h3>{r.title}</h3><dl className={styles.amounts}>
   <div><dt>Maker</dt><dd className="mono">{r.maker}</dd></div><div><dt>Network</dt><dd>{r.network}</dd></div><div><dt>Gas budget</dt><dd>{r.gas}</dd></div>
   {r.amount&&<div><dt>Allowance cap</dt><dd>{r.amount}</dd></div>}{r.spender&&<div><dt>Approval spender</dt><dd className="mono">{r.spender}</dd></div>}
   <div><dt>Contract</dt><dd className="mono">{r.target}</dd></div><div><dt>Strategy</dt><dd className="mono">{r.orderHash}</dd></div>
  </dl><p className="hint">{r.kind==='ship'?'Publishing advertises the exact reviewed allocation in Aqua. Tokens remain in your wallet. Activation is a separate step.':r.kind==='activate'?'Activation verifies the quantized curve and initial backing onchain. Configuration and nonce become immutable.':r.kind==='retire'?'Retirement is terminal. This order cannot be reactivated; a replacement needs a new nonce.':r.kind==='dock'?'Docking removes the advertised Aqua allocation and transfers no tokens.':r.reset?'This resets the token’s Aqua allowance to zero. Shared strategies temporarily lose access until you explicitly approve a new cap.':'This bounded allowance is four times the original token allocation. Approval changes cannot change the curve configuration.'}</p></div>}
  {s.pending&&<div className="notice"><p>Submitted strategy action</p><p className="mono">{s.pending.hash}</p><p className="mono">Maker: {s.pending.account}</p></div>}
  <div role="status" aria-live="polite">{s.message&&<p className="notice">{s.message}</p>}{s.phase==='preparing'&&<p>Checking current strategy state and gas…</p>}{s.phase==='submitting'&&<p>Rechecking the action. Confirm in your wallet when prompted.</p>}{s.phase==='stale'&&!s.pending&&<p>Review current strategy state before signing.</p>}</div>
  {s.confirmation&&<details><summary>{s.confirmation.status==='success'?'Confirmed strategy transaction':'Reverted strategy transaction'}</summary><p className="mono">{s.confirmation.hash}</p><p>Gas paid: {s.confirmation.gas}</p></details>}
  <div className={styles.actions}>{s.pending?<button className="button" disabled={s.busy} onClick={s.resume}>Resume strategy receipt</button>
   :s.wrongChain?<button className="button" onClick={s.switchNetwork}>Switch to strategy network</button>
   :r?<><button className="button" disabled={s.busy||!s.enabled} onClick={s.submit}>{s.busy?'Waiting for wallet…':`Confirm: ${r.title}`}</button><button className="button secondary" disabled={s.busy} onClick={s.dismiss}>Back to strategy</button></>
   :publication?<button className="button" disabled={s.busy||!s.enabled} onClick={()=>s.prepare({kind:'publish'})}>{s.busy?'Preparing review…':'Review next publication step'}</button>:<><button className="button" disabled={s.busy||!s.enabled} onClick={()=>s.prepare({kind:'deactivate'})}>{s.busy?'Preparing review…':'Review deactivation step'}</button>
    {s.tokens.map(t=><button key={t.address} className="button secondary" disabled={s.busy||!s.enabled} onClick={()=>s.prepare({kind:'approve',token:t.address})}>Update {t.symbol} approval</button>)}</>}
  </div>
 </section>;
}
