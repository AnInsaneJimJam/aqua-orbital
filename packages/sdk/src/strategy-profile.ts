import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import type {Address} from 'viem';
import {validateConfig,buildOrder,hashConfig,hashOrder,type Config} from './codec';
const Q=1n<<128n,U=1n<<64n,GRID=1n<<32n,FULL=(1n<<64n)-1n;
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
export function integerSqrt(value:bigint):bigint{
 if(value<0n)throw Error('Negative square root');if(value<2n)return value;
 let x=1n<<BigInt(Math.ceil(value.toString(2).length/2));for(;;){const next=(x+value/x)/2n;if(next>=x)return x;x=next;}
}
function rootRatio(a:bigint,b:bigint){const scaled=a*Q*Q,lo=integerSqrt(scaled/b);return {lo,hi:lo*lo*b===scaled?lo:lo+1n};}
/** Directed integer counterpart of TickGeometry.coefficients for preparation.
 * Activation independently runs StrategyInitializer and its feasibility checks. */
export function profileCoefficients(n:number,key:bigint){
 if(!Number.isInteger(n)||n<2||n>8)throw Error('Unsupported token count');
 const count=BigInt(n),inv=rootRatio(1n,count),equalLo=Q-inv.hi,equalHi=Q-inv.lo;
 if(key===FULL)return {equalLo,equalHi,virtualLo:0n};
 const distance=count*GRID-key,den=count*GRID*GRID,num=den-distance*distance;
 if(n<2||n>8||key>=(count-1n)*GRID||num<=0n||num*GRID<den)throw Error('Unsupported quantized cap');
 const sigma=rootRatio(num,den),transverse=rootRatio(count-1n,count),center=key*(Q/GRID)/count,offset=ceil(sigma.hi*transverse.hi,Q);
 return {equalLo,equalHi,virtualLo:center>offset?center-offset:0n};
}
/** ceil(GRID*b_depeg(p)); squaring proves the integer quotient, no floats. */
function depegKey(numerator:bigint,denominator:bigint){
 const a=(numerator+2n*denominator)*GRID,d=numerator*numerator+2n*denominator*denominator;
 return 3n*GRID-integerSqrt(a*a/d);
}
function realizedThreshold(key:bigint){
 const scale=1_000_000_000n,distance=3n*GRID-key;let lo=0n,hi=scale;
 while(lo<hi){const mid=(lo+hi)/2n,a=(mid+2n*scale)*GRID,d=mid*mid+2n*scale*scale;if(a*a>=distance*distance*d)hi=mid;else lo=mid+1n;}
 const display=(v:bigint)=>`${v/scale}.${(v%scale).toString().padStart(9,'0')}`;
 return {lower:display(lo>0n?lo-1n:0n),upper:display(lo)};
}
export const strategyPresets={
 Wide:{shares:[50,30,20],prices:[90,99],denominators:[100,100]},
 Balanced:{shares:[10,30,60],prices:[95,99],denominators:[100,100]},
 Focused:{shares:[10,20,70],prices:[99,999],denominators:[100,1000]},
} as const;
export type StrategyPreset=keyof typeof strategyPresets;
export type StrategyProfileInput={allocation:string;preset:StrategyPreset;feePpm:100|500|1000};
export function prepareStrategyProfile(configured:DeploymentManifest,maker:Address,makerNonce:bigint,profile:StrategyProfileInput){
 const manifest=manifestSchema.parse(configured);
 if(!manifest.verified||![31337,5042002].includes(manifest.chainId))throw Error('Verified strategy deployment required');
 if(!/^[0-9]{1,7}$/.test(profile.allocation)||BigInt(profile.allocation)<10n||BigInt(profile.allocation)>1_000_000n)throw Error('Allocate 10–1,000,000 whole units per asset');
 const preset=strategyPresets[profile.preset];if(!preset)throw Error('Unknown concentration preset');
 const expected=[['USDC',6],['oUSD6',6],['oUSD18',18]] as const;
 const tokens=expected.map(([symbol,decimals])=>{
  const matches=manifest.tokens.filter(t=>t.symbol===symbol&&t.decimals===decimals&&(symbol!=='USDC'||t.address.toLowerCase()===manifest.usdc.toLowerCase()));
  if(matches.length!==1)throw Error(`Deployment needs one ${symbol} token`);return matches[0]!;
 }).sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
 const capital=BigInt(profile.allocation)*10n**18n*U;
 const ticks=[{key:FULL,share:preset.shares[0],reference:'Full range'},...preset.prices.map((p,i)=>({key:depegKey(BigInt(p),BigInt(preset.denominators[i]!)),share:preset.shares[i+1]!,reference:`${p/preset.denominators[i]!} reference`}))]
  .sort((a,b)=>a.key<b.key?-1:1).map(t=>{
   const c=profileCoefficients(3,t.key),budget=capital*BigInt(t.share)/100n-(t.key===FULL?0n:4n);
   return {...t,radius:budget*Q/(c.equalHi-c.virtualLo),coefficients:c,threshold:t.key===FULL?null:realizedThreshold(t.key)};
  });
 const radius=ticks.reduce((sum,t)=>sum+t.radius,0n),equal=ticks.at(-1)!.coefficients;
 const coordinate=ceil(radius*equal.equalHi,Q),virtual=ticks.reduce((sum,t)=>sum+t.radius*t.coefficients.virtualLo/Q,0n),principal=coordinate-virtual;
 const raw=tokens.map(t=>ceil(principal,10n**BigInt(18-t.decimals)*U)),anchor=ticks.at(-1)!.radius;
 if(principal<=0n||raw.some((v,i)=>v>BigInt(profile.allocation)*10n**BigInt(tokens[i]!.decimals))||anchor*equal.equalLo/Q+U<10n**18n*U
  ||tokens.some(t=>ceil(ceil(anchor*equal.equalHi,Q),10n**BigInt(18-t.decimals)*U)<10n**BigInt(t.decimals)))throw Error('The rounded configuration cannot fund the requested allocation');
 const config:Config={schemaVersion:1,chainId:BigInt(manifest.chainId),router:manifest.router as Address,maker,makerNonce,tokens:tokens.map(t=>t.address as Address),decimals:tokens.map(t=>t.decimals),
  tickKeys:ticks.map(t=>t.key),radiiInternal:ticks.map(t=>t.radius),feePpm:profile.feePpm,initialAmountsRaw:raw};
 validateConfig(config);const order=buildOrder(config);
 return {config,order,configHash:hashConfig(config),orderHash:hashOrder(order),ticks:ticks.map(({coefficients,...t})=>t),principalInternal:principal,coordinateInternal:coordinate,virtualInternal:virtual};
}
