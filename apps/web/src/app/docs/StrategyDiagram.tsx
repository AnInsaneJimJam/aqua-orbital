'use client';

import {useState} from 'react';
import styles from './page.module.css';

const assets=[
 {symbol:'USDC',texture:'usdc',x:340,y:58,color:'#80adf1'},
 {symbol:'oUSD6',texture:'ousd6',x:114,y:234,color:'#7ed2c8'},
 {symbol:'oUSD18',texture:'ousd18',x:566,y:234,color:'#e6d3a2'},
];
const pairs=[[0,1],[1,0],[0,2],[2,0],[1,2],[2,1]] as const;

export default function StrategyDiagram(){
 const [selected,setSelected]=useState(0);
 const [input,output]=pairs[selected]!;
 const from=assets[input]!,to=assets[output]!;
 return <figure className={styles.strategyFigure}>
  <div className={styles.diagramHeading}><span>One strategy. Six swap directions.</span><span className={styles.diagramLabel}>Shared inventory</span></div>
  <svg className={styles.strategySvg} viewBox="0 0 680 300" role="img" aria-label={`${from.symbol} goes into the maker’s strategy and ${to.symbol} comes out. All three assets share one strategy.`}>
   <defs><marker id="docs-swap-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="currentColor" strokeWidth="1.5"/></marker></defs>
   <ellipse cx="340" cy="163" rx="181" ry="113" fill="none" stroke="#262626" strokeDasharray="3 7"/>
   <ellipse cx="340" cy="163" rx="126" ry="77" fill="none" stroke="#222"/>
   {[[0,1],[0,2],[1,2]].map(([a,b])=><line key={`${a}-${b}`} x1={assets[a!]!.x} y1={assets[a!]!.y} x2={assets[b!]!.x} y2={assets[b!]!.y} stroke="#383838" strokeWidth="1.5"/>)}
   <line x1={from.x+(to.x-from.x)*0.13} y1={from.y+(to.y-from.y)*0.13} x2={from.x+(to.x-from.x)*0.84} y2={from.y+(to.y-from.y)*0.84} stroke="currentColor" strokeWidth="2" markerEnd="url(#docs-swap-arrow)"/>
   <rect x="272" y="140" width="136" height="48" rx="12" fill="#101010"/>
   <text x="340" y="157" textAnchor="middle" fill="#f5f5f2" fontSize="13" fontWeight="500">One Orbital</text><text x="340" y="177" textAnchor="middle" fill="#a3a3a3" fontSize="13">strategy</text>
   {assets.map((asset,index)=><g key={asset.symbol}>
    <circle cx={asset.x} cy={asset.y} r="28" fill="#101010" stroke={index===input||index===output?asset.color:'#383838'}/>
    <image href={`/brand/tokens/${asset.texture}.svg`} x={asset.x-15} y={asset.y-15} width="30" height="30"/>
    <text x={asset.x} y={asset.y+(index===0?-39:47)} textAnchor="middle" fill="#f5f5f2" fontSize="13">{asset.symbol}</text>
   </g>)}
  </svg>
  <div className={styles.pairControls}><label htmlFor="docs-swap-pair">Explore a direction</label><select id="docs-swap-pair" value={selected} onChange={event=>setSelected(Number(event.target.value))}>{pairs.map(([a,b],index)=><option key={index} value={index}>{assets[a]!.symbol} → {assets[b]!.symbol}</option>)}</select></div>
  <figcaption><p aria-live="polite"><strong>{from.symbol} goes in. {to.symbol} comes out.</strong> The next trade uses the strategy’s updated inventory, whichever pair it chooses.</p><span>Routing illustration, not a price quote. oUSD6 and oUSD18 are demo assets.</span></figcaption>
 </figure>;
}
