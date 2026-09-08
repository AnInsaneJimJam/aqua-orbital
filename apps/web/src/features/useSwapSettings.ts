'use client';
import {useEffect,useState} from 'react';
import {swapSettings,type SwapSettings} from '@orbital/sdk';
export const swapSettingsKey='orbital:swap-settings:1';
export function useSwapSettings(){
 const [bps,setBps]=useState('10'),[seconds,setSeconds]=useState(180),[ready,setReady]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  const load=()=>{try{const raw=localStorage.getItem(swapSettingsKey),v=raw?JSON.parse(raw):null;if(v&&v.schemaVersion!==1)throw Error();const s=swapSettings(v?.settings);setBps(String(s.slippageBps));setSeconds(s.deadlineSeconds);setMessage('');}catch{setBps('10');setSeconds(180);setMessage('Saved settings could not be read. Defaults apply to this session.');}setReady(true);};
  load();const storage=(event:StorageEvent)=>{if(event.key===swapSettingsKey||event.key===null)load();};window.addEventListener('storage',storage);return()=>window.removeEventListener('storage',storage);
 },[]);
 let value:SwapSettings|undefined;try{if(!/^[0-9]{1,3}$/.test(bps))throw Error();value=swapSettings({slippageBps:Number(bps),deadlineSeconds:seconds});}catch{}
 function update(nextBps:string,nextSeconds:number){setBps(nextBps);setSeconds(nextSeconds);setMessage('');
  try{if(!/^[0-9]{1,3}$/.test(nextBps))return;const settings=swapSettings({slippageBps:Number(nextBps),deadlineSeconds:nextSeconds});try{localStorage.setItem(swapSettingsKey,JSON.stringify({schemaVersion:1,settings}));}catch{setMessage('Settings apply to this session; device storage is unavailable.');}}catch{}
 }
 return {bps,seconds,ready,value,message,invalid:!value,warning:!!value&&value.slippageBps>100,setBps:(v:string)=>update(v,seconds),setSeconds:(v:number)=>update(bps,v),reset:()=>{setBps('10');setSeconds(180);setMessage('');try{localStorage.removeItem(swapSettingsKey);}catch{setMessage('Defaults apply to this session; device storage could not be reset.');}}};
}
