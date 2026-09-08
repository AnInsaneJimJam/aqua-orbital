import {strategyReadSchema,strategyFinancialSchema,uintSchema,type DeploymentManifest,type StrategyReadDTO,type StrategyFinancialDTO} from '@orbital/shared';
import {configFromDTO,configToDTO,buildOrder,orderToDTO,hashOrder,hashConfig,type Config} from '@orbital/sdk';
import type {StrategyRecord} from '@orbital/db';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const wire=(value:unknown):unknown=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item));
const fail=():never=>{throw Error('STRATEGY_DATA_INVALID');};
export function strategyRecord(record:StrategyRecord,manifest:DeploymentManifest,pin:{height:string;hash:string}):StrategyReadDTO{
 const config=configFromDTO(record.config),order=buildOrder(config);
 if(config.chainId!==BigInt(manifest.chainId)||!same(config.router,manifest.router)||!same(record.router,manifest.router)
  ||!same(config.maker,record.maker)||!same(hashConfig(config),record.configHash)||!same(hashOrder(order),record.orderHash)
  ||config.tokens.some((token,i)=>!manifest.tokens.some(t=>same(t.address,token)&&t.decimals===config.decimals[i])))fail();
 const {feeTotals,...fields}=record;
 const dto=strategyReadSchema.parse({...fields,config:configToDTO(config),order:orderToDTO(order),tradeEligibilityVerified:false,financial:null});
 const a=dto.activated,u=dto.updated;
 if(a.event!=='StrategyActivated'||BigInt(a.blockNumber)<BigInt(manifest.startBlock)||BigInt(u.blockNumber)>BigInt(pin.height)||BigInt(a.blockNumber)>BigInt(u.blockNumber)
  ||(a.blockNumber===u.blockNumber&&(!same(a.blockHash,u.blockHash)||a.logIndex>u.logIndex))
  ||[a,u].some(s=>s.blockNumber===pin.height&&!same(s.blockHash,pin.hash)))fail();
 if(dto.version==='1'){
  if(dto.lifecycle!=='active'||u.event!=='StrategyActivated'||a.blockNumber!==u.blockNumber||!same(a.txHash,u.txHash)||a.logIndex!==u.logIndex)fail();
 }else if(BigInt(dto.version)<2n||u.event!==(dto.lifecycle==='active'?'OrbitalSwapExecuted':'StrategyRetired')
  ||(a.blockNumber===u.blockNumber&&a.logIndex>=u.logIndex))fail();
 return dto;
}
/** Coherence checks on authenticated contract getter outputs, not a new curve
 * solver or path certificate. All amounts remain integers in their stated units. */
export function strategyFinancial(record:StrategyRecord,dto:StrategyReadDTO,raw:{config?:unknown;state?:unknown;availability?:unknown}):StrategyFinancialDTO{
 const c=configFromDTO(dto.config),observedConfig=configFromDTO(wire(raw.config));
 if(!same(hashConfig(observedConfig),dto.configHash)||!same(hashOrder(buildOrder(observedConfig)),dto.orderHash))fail();
 const financial=strategyFinancialSchema.parse(wire({state:raw.state,availability:raw.availability})),s=financial.state,n=c.tokens.length;
 if(!same(s.maker,c.maker)||!same(s.configHash,dto.configHash)||s.version!==dto.version||s.status!==(dto.lifecycle==='active'?1:2)
  ||s.X.length!==n||s.principalInternal.length!==n||s.cumulativeFeeRaw.length!==n||financial.availability.length!==n)fail();
 const X=s.X.map(BigInt),P=s.principalInternal.map(BigInt),V=BigInt(s.virtualInternal),fees=s.cumulativeFeeRaw.map(BigInt);
 if(X.some((x,i)=>x>=(1n<<160n)||x<V||P[i]!==x-V)||BigInt(s.sumInternal)!==X.reduce((sum,x)=>sum+x,0n)
  ||wide(s.sumSquaresInternal)!==X.reduce((sum,x)=>sum+x*x,0n)||BigInt(s.boundarySigmaLower)>BigInt(s.boundarySigmaUpper))fail();
 let prefix=0;while(prefix<c.tickKeys.length&&!(s.interiorTickMask&(1<<prefix)))prefix++;
 if(prefix===c.tickKeys.length||s.interiorTickMask!==(((1<<c.tickKeys.length)-1)^((1<<prefix)-1)))fail();
 if(BigInt(s.interiorRadius)!==c.radiiInternal.slice(prefix).reduce((sum,r)=>sum+r,0n)
  ||BigInt(s.boundarySumNumerator)!==c.radiiInternal.slice(0,prefix).reduce((sum,r,i)=>sum+r*c.tickKeys[i]!,0n)
  ||(prefix===0&&(s.boundarySigmaLower!=='0'||s.boundarySigmaUpper!=='0')))fail();
 const totals=new Map<string,bigint>();
 for(const fee of record.feeTotals){uintSchema.parse(fee.amountRaw);const token=fee.token.toLowerCase();if(totals.has(token)||!c.tokens.some(t=>same(t,token)))fail();totals.set(token,BigInt(fee.amountRaw));}
 if(fees.some((fee,i)=>fee!==(totals.get(c.tokens[i]!.toLowerCase())??0n)))fail();
 let healthy=s.status===1;
 for(let i=0;i<n;i++){
  const a=financial.availability[i]!,scale=scaleFor(c,i),Q=BigInt(a.aquaAllocationRaw),required=P[i]!+fees[i]!*scale,actual=Q*scale,backed=actual>=required;
  if(!same(a.token,c.tokens[i]!)||Q>=(1n<<248n)||a.live!==(a.liveTokenCount===n)||a.backingValid!==backed
   ||wide(a.surplusInternal)!==(backed?actual-required:0n)||wide(a.deficitInternal)!==(backed?0n:required-actual))fail();
  healthy=healthy&&a.live&&backed;
 }
 for(let i=0;i<n;i++){
  const a=financial.availability[i]!,bounds=[P[i]!/scaleFor(c,i),BigInt(a.aquaAllocationRaw),BigInt(a.walletBalanceRaw),BigInt(a.aquaAllowanceRaw)],ceiling=healthy?bounds.reduce((a,b)=>a<b?a:b):0n;
  if(BigInt(a.fundingCeilingRaw)!==ceiling)fail();
 }
 return financial;
}
const scaleFor=(config:Config,i:number)=>10n**BigInt(18-config.decimals[i]!)*(1n<<64n);
const wide=(value:{hi:string;lo:string})=>(BigInt(value.hi)<<256n)+BigInt(value.lo);
