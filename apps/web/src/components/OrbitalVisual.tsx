'use client';
import {useEffect, useRef, useState} from 'react';
import {Pause, Play, ArrowUpRight} from 'lucide-react';
import {motion} from '../content';
import styles from './OrbitalVisual.module.css';

/** The supplied paper illustration is explanatory media, never a live pool chart. */
export default function OrbitalVisual(){
  const videoRef=useRef<HTMLVideoElement>(null);
  const frameRef=useRef<HTMLDivElement>(null);
  const userPaused=useRef(false);
  const [playing,setPlaying]=useState(false);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const video=videoRef.current,frame=frameRef.current;
    if(!video||!frame)return;
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible=false,disposed=false;
    const sync=()=>{
      if(disposed)return;
      if(!visible||document.hidden||preference.matches||userPaused.current||!motion.autoplayIllustration)video.pause();
      else void video.play().catch(()=>{if(!disposed)setPlaying(false);});
    };
    const observer=new IntersectionObserver(([entry])=>{visible=!!entry?.isIntersecting;sync();},{threshold:motion.visibilityThreshold});
    observer.observe(frame);
    preference.addEventListener('change',sync);
    document.addEventListener('visibilitychange',sync);
    return()=>{disposed=true;observer.disconnect();preference.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);video.pause();};
  },[]);
  const toggle=()=>{
    const video=videoRef.current;if(!video)return;
    if(!video.paused){userPaused.current=true;video.pause();}
    else {userPaused.current=false;void video.play().catch(()=>setPlaying(false));}
  };
  return <figure className={styles.figure} aria-label="Orbital geometry visualization">
    <div className={styles.figureHeader}><span>Fig. 01</span><span>The geometry of liquidity</span></div>
    <div ref={frameRef} className={styles.frame}>
      <div className={styles.corner} aria-hidden="true"/>
      <img className={styles.poster} src="/media/orbital-poster.jpg" width={1024} height={768} alt="A sphere surrounded by concentric orbital rings, from the Orbital paper."/>
      <video ref={videoRef} className={styles.video} width={1024} height={768} poster="/media/orbital-poster.jpg" preload="none" muted playsInline loop aria-hidden="true" style={failed?{visibility:'hidden'}:undefined} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>{setFailed(true);setPlaying(false);}}>
        <source src="/media/orbital.webm" type="video/webm" onError={()=>{setFailed(true);setPlaying(false);}}/>
      </video>
      <div className={styles.axis} aria-hidden="true"><span>+ Z</span><span>X —</span></div>
    </div>
    <figcaption className={styles.caption}>
      <a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">Visualization by Paradigm <ArrowUpRight size={12} aria-hidden="true"/></a>
      {failed?<span role="status">Still illustration</span>:<button type="button" onClick={toggle} aria-label={playing?'Pause orbital animation':'Play orbital animation'}>{playing?<Pause size={12} aria-hidden="true"/>:<Play size={12} aria-hidden="true"/>}{playing?'Pause':'Play'}</button>}
    </figcaption>
  </figure>;
}
