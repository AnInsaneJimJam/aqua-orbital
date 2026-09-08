import Link from 'next/link';
import {ArrowDownRight, ArrowUpRight} from 'lucide-react';
import OrbitalVisual from '../components/OrbitalVisual';
import {copy} from '../content';
import styles from './page.module.css';

const journeys = [
  {number:'01', name:'Swap', description:'Move between stablecoins.', href:'/swap'},
  {number:'02', name:'Provide liquidity', description:'Find your concentration.', href:'/liquidity/new'},
  {number:'03', name:'Get paid', description:'Create an invoice. Settle in USDC.', href:'/pay'},
];

export default function Home(){return <div className={styles.landing}>
  <section className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <div className={styles.tag}><span/>Multi-token concentrated liquidity</div>
      <h1 id="hero-title">A new shape<br/>for <em>liquidity.</em></h1>
      <p>{copy.heroBody}</p>
      <div className={styles.actions}>
        <Link className="button" href="/swap">Start a swap <ArrowUpRight size={18} aria-hidden="true"/></Link>
        <Link className={styles.secondaryAction} href="/liquidity/new">Provide liquidity <ArrowUpRight size={16} aria-hidden="true"/></Link>
      </div>
      <a className={styles.paperLink} href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">Inspired by the Orbital paper <ArrowUpRight size={13} aria-hidden="true"/></a>
    </div>
    <OrbitalVisual/>
  </section>
  <section className={styles.explore} aria-label="Explore Orbital">
    <div className={styles.exploreLabel}>Your next move <ArrowDownRight size={16} aria-hidden="true"/></div>
    <div className={styles.journeys}>{journeys.map(journey=><Link key={journey.number} href={journey.href} className={styles.journey}>
      <span className={styles.number}>{journey.number}</span>
      <div><h2>{journey.name}</h2><p>{journey.description}</p></div>
      <ArrowUpRight size={20} aria-hidden="true"/>
    </Link>)}</div>
  </section>
</div>;}
