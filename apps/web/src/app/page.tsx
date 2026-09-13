import Link from '../components/AppLink';
import {ArrowRight,ArrowUpRight} from 'lucide-react';
import Saturn from '../components/Saturn';
import styles from './page.module.css';

const journeys=[
 {number:'01',name:'Choose your stablecoins',description:'Select the asset you have and the asset you need. Review a fresh quote, including fees and the minimum you’ll receive.',href:'/swap',action:'Explore swaps'},
 {number:'02',name:'Liquidity stays with you',description:'Allocate stablecoins to a strategy through Aqua. Your tokens remain in your wallet until a trade settles; your wallet balance and allowances determine availability.',href:'/liquidity',action:'Explore liquidity'},
 {number:'03',name:'Get paid in USDC',description:'Create an invoice with fixed USDC terms. Customers can pay directly or swap a supported stablecoin, with settlement and any refund in one transaction.',href:'/pay',action:'Explore payments'},
];

export default function Home(){return <div className={styles.landing}>
 <section className={styles.hero} aria-labelledby="hero-title">
  <h1 id="hero-title">The best swap<br/>for <em>stablecoins.</em></h1>
  <p className={styles.subtitle}>Stablecoin swaps. Powered by Orbital.</p>
  <div className={styles.artwork}><Saturn/></div>
  <div className={styles.actions}>
   <Link className="button" href="/swap">Swap Stablecoin <ArrowRight size={20} aria-hidden="true"/></Link>
   <Link className="button secondary" href="/docs">Docs <ArrowRight size={20} aria-hidden="true"/></Link>
  </div>
 </section>
 <section className={styles.explore} aria-labelledby="how-title">
  <div className={styles.sectionHeading}><h2 id="how-title">How Orbital Swap <em>works.</em></h2><p>Stablecoin liquidity, shaped around you.</p></div>
  <div className={styles.journeys}>{journeys.map(journey=><article key={journey.number} className={styles.journey}>
   <span className={styles.number}>{journey.number}</span>
   <div><h3>{journey.name}</h3><p>{journey.description}</p></div>
   <Link href={journey.href}>{journey.action}<ArrowUpRight size={18} aria-hidden="true"/></Link>
  </article>)}</div>
 </section>
</div>;}
