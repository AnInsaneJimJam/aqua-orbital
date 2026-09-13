'use client';
import Link from '../components/AppLink';
import {useState,useEffect,useRef} from 'react';
import {ArrowRight,Check,Wallet} from 'lucide-react';
import {useStrategyPublication} from './useStrategyPublication';
import {StrategyAdminView} from './StrategyAdmin';
import type {StrategyProfileInput} from '@orbital/sdk';
import {presets} from '../content';
import styles from './Liquidity.module.css';
import {Select} from '../components/Select';
import TokenIcon from '../components/TokenIcon';
export {default as Liquidity} from './Strategies';

export function NewStrategy(){
 const [step,setStep]=useState(0),[allocation,setAllocation]=useState('10'),[preset,setPreset]=useState(1),[fee,setFee]=useState('500');
 const [selection,setSelection]=useState<string[]>(),[risk,setRisk]=useState(false),[shared,setShared]=useState(false);
 const publication=useStrategyPublication(),choice=presets[preset]!,heading=useRef<HTMLHeadingElement>(null);
 const selectedAddresses=publication.draft?publication.view?.allocations.map(t=>t.address.toLowerCase())??[]:selection??publication.assets.slice(0,2).map(t=>t.address.toLowerCase());
 const selected=publication.assets.filter(t=>selectedAddresses.includes(t.address.toLowerCase()));
 const validAmount=/^\d{1,7}$/.test(allocation)&&BigInt(allocation)>=10n&&BigInt(allocation)<=1000000n;
 const validSelection=selected.length>=2&&selected.length<=8;
 const pairs=selected.flatMap((a,i)=>selected.slice(i+1).map(b=>({key:`${a.address}:${b.address}`,label:`${a.symbol} ↔ ${b.symbol}`})));
 const shortfalls=validAmount?selected.filter(t=>t.balanceRaw!==undefined&&t.balanceRaw<BigInt(allocation)*10n**BigInt(t.decimals)):[];
 const demoNames=(publication.draft?publication.view?.allocations??[]:selected).filter(t=>t.mock).map(t=>t.symbol).join(', ');
 const selectionKey=selectedAddresses.join(',');
 useEffect(()=>{
  if(publication.draft&&publication.profile){
   setStep(3);setAllocation(publication.profile.allocation);setPreset(presets.findIndex(p=>p.name===publication.profile!.preset));setFee(String(publication.profile.feePpm));
   setSelection(publication.view!.allocations.map(t=>t.address.toLowerCase()));
  }else if(!publication.draft)setStep(s=>s===3?2:s);
 },[publication.draft,publication.profile]);
 useEffect(()=>{setRisk(false);setShared(false);},[allocation,preset,fee,selectionKey]);
 useEffect(()=>{if(step>0)heading.current?.focus();},[step]);
 function toggle(address:string){
  const value=address.toLowerCase();
  setSelection(selectedAddresses.includes(value)?selectedAddresses.filter(a=>a!==value):[...selectedAddresses,value]);
 }
 function prepare(){
  if(!publication.connected){publication.connect();return;}
  if(publication.wrongChain){void publication.switchNetwork?.();return;}
  publication.start({allocation,preset:choice.name as StrategyProfileInput['preset'],feePpm:Number(fee) as StrategyProfileInput['feePpm'],tokens:selected.map(t=>t.address)});
 }
 return <section className={`page ${styles.page}`}>
  <Link href="/liquidity" className="back-link"><span aria-hidden="true">←</span> Your liquidity</Link>
  <div className={styles.header}><div><h1>Provide <em>liquidity.</em></h1><p>Choose your tokens. Set your terms. Earn fees when traders swap.</p></div><span className={styles.custody}><Wallet size={16} aria-hidden="true"/> Held in your wallet</span></div>
  <ol className={styles.steps}>{['Assets','Concentration','Review','Publish'].map((name,i)=><li key={name} aria-current={step===i?'step':undefined} data-complete={i<step}><span>{i<step?<Check size={14} aria-hidden="true"/>:i+1}</span>{name}</li>)}</ol>
  <div className={styles.wizard}><div className={styles.form}>
   {step===0&&<>
    <div className={styles.sectionHeading}><h2>Build your basket.</h2><span>{selected.length} selected</span></div>
    <p className="hint">Choose at least two supported tokens. Every pair in your basket can trade in both directions.</p>
    {publication.assetsLoading?<p className="notice" role="status">Loading supported tokens…</p>:publication.assetsError?<div className="notice" role="alert"><p>{publication.assetsError}</p><button className="button secondary" onClick={publication.refreshAssets}>Retry assets</button></div>:<fieldset className={styles.assets}>
     <legend>Strategy tokens</legend>
     {publication.assets.map(t=>{
      const included=selectedAddresses.includes(t.address.toLowerCase());
      return <label key={t.address} className={styles.asset} data-selected={included}>
       <input type="checkbox" aria-label={`Include ${t.symbol}`} checked={included} disabled={!included&&selected.length>=8} onChange={()=>toggle(t.address)}/>
       <TokenIcon symbol={t.symbol} size={36}/><span className={styles.assetName}><strong>{t.symbol}</strong><small>{t.mock?'Demo token':`${publication.network} asset`}</small></span>
       <span className={styles.assetBalance}><small>Wallet balance</small><strong>{!publication.connected?'—':t.balance??(publication.balancesLoading?'Checking…':'Unavailable')}</strong></span>
      </label>;
     })}
    </fieldset>}
    {!publication.connected&&<button className={styles.textButton} onClick={publication.connect}>Connect wallet to see balances <ArrowRight size={14} aria-hidden="true"/></button>}
    {!publication.assetsLoading&&!publication.assetsError&&!validSelection&&<p className="notice" role="status">Choose at least two tokens to continue.</p>}
    <div className={styles.allocation}>
     <div className="field"><label htmlFor="allocation">Allocate per asset</label><div className={styles.amountInput}><input id="allocation" type="text" inputMode="numeric" autoComplete="off" maxLength={7} value={allocation} aria-describedby="allocation-help" aria-invalid={!validAmount} onChange={e=>setAllocation(e.target.value)}/><span>units each</span></div><span id="allocation-help" className="hint">Equal starting amounts. Choose 10–1,000,000 whole units per token.</span></div>
     {validAmount&&selected.length>0&&<p className={styles.allocationTotal}>{selected.length} tokens × {Number(allocation).toLocaleString()} units <strong>{(Number(allocation)*selected.length).toLocaleString()} total units</strong></p>}
    </div>
    <p className={`hint ${styles.gasNote}`}>Keep extra {publication.network==='Arc Testnet'?'USDC':'ETH'} for network fees. Your allocation stays in your wallet until a trade uses it.</p>
    {shortfalls.length>0&&<p className="notice">Not enough {shortfalls.map(t=>t.symbol).join(', ')} for this allocation. <Link href="/fund">Get tokens →</Link></p>}
    <button className="button full" onClick={()=>setStep(1)} disabled={!validAmount||!validSelection||!!publication.assetsError}>Choose concentration <ArrowRight size={16} aria-hidden="true"/></button>
   </>}
   {step===1&&<>
    <h2 ref={heading} tabIndex={-1}>Choose a profile.</h2><p className="hint">Decide how much of your liquidity to concentrate near equal prices.</p>
    <div className={styles.presets}>{presets.map((p,i)=><button key={p.name} className={styles.preset} aria-pressed={i===preset} onClick={()=>setPreset(i)}><strong>{p.name}</strong><span>{p.description}</span></button>)}</div>
    <div className="field"><label htmlFor="fee">Swap fee</label><Select id="fee" value={fee} onValueChange={setFee} options={[{value:'100',label:'0.01%'},{value:'500',label:'0.05%'},{value:'1000',label:'0.10%'}]}/><span className="hint">You receive this fee in the token the trader pays. Fees are already in your wallet after settlement.</span></div>
    <button className="button full" onClick={()=>setStep(2)} disabled={!validSelection||!validAmount}>Review strategy <ArrowRight size={16} aria-hidden="true"/></button>
   </>}
   {step===2&&<>
    <h2 ref={heading} tabIndex={-1}>Review your intent.</h2><p className="hint">Your strategy starts at equal prices. Trades will change the quantities you hold.</p>
    <dl className={styles.reviewAmounts}>{selected.map(t=><div key={t.address}><dt><TokenIcon symbol={t.symbol}/>{t.symbol}</dt><dd>{Number(allocation).toLocaleString()}</dd></div>)}</dl>
    {demoNames&&<p className="notice">This strategy includes {demoNames}: demo tokens with no redemption value.</p>}
    <div className="stack">
     <div className="row"><span>Per asset</span><strong>{allocation} units</strong></div><div className="row"><span>Concentration</span><strong>{choice.name}</strong></div><div className="row"><span>Fee</span><strong>{Number(fee)/10000}%</strong></div>
     <p className="notice">Aqua approval targets are capped at four times your initial allocation. This is a spending permission, not an extra deposit. Review each transaction before signing.</p>
     {shortfalls.length>0&&<p className="notice" role="alert">Fund {shortfalls.map(t=>t.symbol).join(', ')} before publication. <Link href="/fund">Get tokens →</Link></p>}
     <label className={styles.check}><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>I understand that other wallet activity can make this allocation unavailable.</label>
     <label className={styles.check}><input type="checkbox" checked={risk} onChange={e=>setRisk(e.target.checked)}/>I understand that a depeg can change the tokens and value I hold.</label>
     <button className="button full" disabled={!risk||!shared||!validAmount||!validSelection||shortfalls.length>0||publication.busy||(!publication.ready&&publication.connected&&!publication.wrongChain)} onClick={prepare}>{!publication.connected?'Connect wallet':publication.wrongChain?'Switch network':publication.busy?'Preparing configuration…':'Prepare publication'}</button>
     {publication.error&&<p className="notice" role="alert">{publication.error}</p>}{publication.assetsError&&<p className="notice" role="alert">{publication.assetsError}</p>}
    </div>
   </>}
   {step===3&&<>
    <h2 ref={heading} tabIndex={-1}>Publish from your wallet.</h2>
    {publication.restored&&<p className="notice">Saved publication restored. Completed onchain steps are checked before the next review.</p>}
    {publication.view&&<>
     <p className="hint">{publication.network} · {publication.view.allocations.length} tokens selected</p>
     <dl className={styles.allocations}>{publication.view.allocations.map(t=><div key={t.address}><dt><TokenIcon symbol={t.symbol}/>{t.symbol}</dt><dd>{t.amount} allocated · {t.cap} Aqua approval target (if needed)</dd></div>)}</dl>
     <details><summary>Quantized curve configuration</summary><p className="mono">{publication.view.hash}</p><p>Maker nonce {publication.view.nonce}</p><ol>{publication.view.ticks.map(t=><li key={t.key}><p>{t.share}% · Realized reference threshold: {t.threshold}</p><p className="mono">Key: {t.key}<br/>Radius: {t.radius}</p></li>)}</ol></details>
    </>}
    {publication.error&&<p className="notice" role="alert">{publication.error}</p>}
    {publication.active&&!publication.admin.pending?<div className="stack"><p className="notice">Strategy is active. The index will show its receipt shortly.</p><Link className="button full" href={`/liquidity/${publication.view!.hash}`}>View strategy</Link><button className="button secondary" onClick={()=>{publication.newDraft();setStep(0);}}>Create another strategy</button></div>:<>
     {publication.admin.review&&demoNames&&<p className="notice">This publication includes {demoNames}: demo tokens with no redemption value.</p>}
     <StrategyAdminView state={publication.admin} publication/>
     <button className="button secondary" disabled={publication.busy||publication.admin.busy||!!publication.admin.pending} onClick={publication.editDraft}>Edit unshipped configuration</button>
    </>}
   </>}
   {step>0&&!publication.draft&&<button className={styles.backButton} onClick={()=>setStep(step-1)}>← Back</button>}
  </div><aside className={styles.preview} aria-label="Strategy preview">
   <p className={styles.previewLabel}>Your strategy</p><h2>{selected.length<2?'Choose your basket':selected.length===2?'One pair. Both ways.':`${pairs.length} pairs. One strategy.`}</h2>
   <div className={styles.selectedTokens}>{selected.map(t=><span key={t.address}><TokenIcon symbol={t.symbol} size={24}/>{t.symbol}<strong>{validAmount?Number(allocation).toLocaleString():'—'}</strong></span>)}</div>
   {validSelection&&<details className={styles.pairs} open={selected.length<=3}><summary>Trading pairs ({pairs.length})</summary><ul>{pairs.map(pair=><li key={pair.key}>{pair.label}</li>)}</ul></details>}
   <div className={styles.previewProfile}><span>Concentration</span><strong>{choice.name}</strong></div>
   {step>0&&<><p className="hint">Each token’s allocation is split across these ranges.</p>{choice.shares.map((share,i)=><div className={styles.share} key={i}><span>{choice.thresholds[i]}</span><strong>{share}%</strong></div>)}<p className={`hint ${styles.previewNote}`}>Reference thresholds describe a single-coin depeg, not guaranteed price floors. Exact thresholds appear at publication.</p></>}
   <div className={styles.previewProfile}><span>Swap fee</span><strong>{Number(fee)/10000}%</strong></div>
   <p className={styles.previewNote}>Tokens stay in your wallet. You earn fees when a trade uses your strategy.</p>
   <Link className={styles.textButton} href="/docs#liquidity">How providing liquidity works <ArrowRight size={14} aria-hidden="true"/></Link>
  </aside></div>
 </section>;
}
