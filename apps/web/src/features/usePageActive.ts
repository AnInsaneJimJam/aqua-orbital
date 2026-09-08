'use client';
import {useEffect,useState} from 'react';
export function usePageActive(){
 const [active,setActive]=useState(true);
 useEffect(()=>{const update=()=>setActive(document.visibilityState==='visible');update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 return active;
}
