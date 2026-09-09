'use client';
import {useId} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {SlidersHorizontal,X} from 'lucide-react';
import {Select} from '../components/Select';
import dialog from '../components/Dialog.module.css';
import styles from './SwapSettings.module.css';
import type {useSwapSettings} from './useSwapSettings';

export function SwapSettings({state:s}:{state:ReturnType<typeof useSwapSettings>}){
 const helpId=useId(),slippageId=useId(),deadlineId=useId();
 return <Dialog.Root>
  <Dialog.Trigger asChild><button type="button" className={styles.trigger} aria-label="Swap settings" title="Swap settings"><SlidersHorizontal size={19} aria-hidden="true"/></button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className={dialog.overlay}/><Dialog.Content className={dialog.content}>
   <div className={dialog.header}><span className={dialog.icon}><SlidersHorizontal size={22} aria-hidden="true"/></span><Dialog.Close asChild><button type="button" className={dialog.close} aria-label="Close swap settings"><X size={20} aria-hidden="true"/></button></Dialog.Close></div>
   <Dialog.Title className={dialog.title}>Swap settings</Dialog.Title>
   <Dialog.Description className={dialog.description}>Choose your price tolerance and how long a transaction can remain valid.</Dialog.Description>
   <fieldset className={styles.presets} disabled={!s.ready}><legend>Slippage tolerance</legend>
    <p className={styles.help}>The most the price can move before your swap is rejected.</p>
    <div className={styles.options}>{[10,50,100].map(bps=><button key={bps} type="button" className="button secondary compact" aria-pressed={s.bps===String(bps)} onClick={()=>s.setBps(String(bps))}>{bps/100}%</button>)}</div>
    <div className={`field ${styles.custom}`}><label htmlFor={slippageId}>Custom slippage (basis points)</label><input id={slippageId} inputMode="numeric" value={s.bps} onChange={e=>s.setBps(e.target.value)} aria-invalid={s.invalid} aria-describedby={helpId}/><p id={helpId} className="hint">1–500 whole basis points. 100 basis points equals 1%.</p></div>
   </fieldset>
   {s.invalid&&<p className="error" role="alert">Choose 1–500 integer basis points and a supported deadline.</p>}
   {s.warning&&<p className="notice" role="status">High slippage: you may receive substantially less than the quoted amount.</p>}
   <div className="field"><label htmlFor={deadlineId}>Transaction deadline</label><Select id={deadlineId} aria-label="Transaction deadline" disabled={!s.ready} value={String(s.seconds)} onValueChange={value=>s.setSeconds(Number(value))} options={[{value:'60',label:'1 minute'},{value:'180',label:'3 minutes'},{value:'600',label:'10 minutes'}]}/><p className="hint">A transaction submitted after this window will fail.</p></div>
   {s.message&&<p className="notice" role="status">{s.message}</p>}
   <div className={dialog.footer}><button type="button" className={styles.reset} disabled={!s.ready} onClick={s.reset}>Reset settings</button><Dialog.Close asChild><button type="button" className="button">Done</button></Dialog.Close></div>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
