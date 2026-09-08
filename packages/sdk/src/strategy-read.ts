import {manifestSchema,hashSchema,strategyDetailSchema,strategyListSchema,strategyFiltersSchema,strategyCursorSchema,
 type DeploymentManifest,type StrategyReadDTO,type StrategyDetailDTO,type StrategyListDTO} from '@orbital/shared';
import {encodeAbiParameters,keccak256,type Address} from 'viem';
import {buildOrder,encodeOrder,hashConfig,hashOrder,formatAmount} from './codec';
import {configFromDTO,orderFromDTO} from './dto';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const fail=(message:string):never=>{throw Error(message);};
const wide=(v:{hi:string;lo:string})=>(BigInt(v.hi)<<256n)+BigInt(v.lo);
const scale=(decimals:number)=>10n**BigInt(18-decimals)*(1n<<64n);

function observation(v:StrategyDetailDTO|StrategyListDTO,m:DeploymentManifest){
 const id=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[BigInt(m.chainId),m.aqua as Address,m.router as Address,m.payments as Address]));
 if(!m.verified||v.chainId!==m.chainId||!same(v.deploymentId,id)||v.coverage.fromBlock!==m.startBlock)fail('Strategy deployment mismatch');
 const c=v.coverage,pin=BigInt(v.asOf.height),current=BigInt(v.currentIndexedBlock.height),start=BigInt(c.fromBlock),head=BigInt(v.freshness.head);
 if(pin<start||pin>current||v.historical!==(pin<current)||(pin===current&&!same(v.asOf.hash,v.currentIndexedBlock.hash)))fail('Invalid strategy observation');
 if(head<pin+2n||v.freshness.stale!==(v.status==='stale')||v.freshness.stale!==(v.freshness.ageMs>10000||head!==current+2n))fail('Invalid strategy freshness');
 if(c.toBlock!==v.asOf.height||BigInt(c.expectedBlocks)!==pin-start+1n||c.expectedBlocks!==c.canonicalBlocks||c.expectedBlocks!==c.coveredBlocks)fail('Incomplete strategy history');
}
function record(r:StrategyReadDTO,m:DeploymentManifest,pin:StrategyDetailDTO['asOf']){
 const c=configFromDTO(r.config),o=buildOrder(c),a=r.activated,u=r.updated;
 if(c.chainId!==BigInt(m.chainId)||!same(c.router,m.router)||!same(r.router,m.router)||!same(c.maker,r.maker)||!same(hashConfig(c),r.configHash)
  ||!same(hashOrder(o),r.orderHash)||!same(encodeOrder(o),encodeOrder(orderFromDTO(r.order)))
  ||c.tokens.some((token,i)=>!m.tokens.some(t=>same(t.address,token)&&t.decimals===c.decimals[i])))fail('Invalid strategy identity');
 if(a.event!=='StrategyActivated'||BigInt(a.blockNumber)<BigInt(m.startBlock)||BigInt(u.blockNumber)>BigInt(pin.height)||BigInt(a.blockNumber)>BigInt(u.blockNumber)
  ||(a.blockNumber===u.blockNumber&&(!same(a.blockHash,u.blockHash)||a.logIndex>u.logIndex))
  ||[a,u].some(s=>s.blockNumber===pin.height&&!same(s.blockHash,pin.hash)))fail('Invalid strategy receipt order');
 if(r.version==='1'){
  if(r.lifecycle!=='active'||u.event!=='StrategyActivated'||a.blockNumber!==u.blockNumber||!same(a.txHash,u.txHash)||a.logIndex!==u.logIndex)fail('Invalid initial strategy version');
 }else if(BigInt(r.version)<2n||u.event!==(r.lifecycle==='active'?'OrbitalSwapExecuted':'StrategyRetired')||(a.blockNumber===u.blockNumber&&a.logIndex>=u.logIndex))fail('Invalid strategy update');
 if(!r.financial)return;
 const s=r.financial.state,n=c.tokens.length,availability=r.financial.availability;
 if(!same(s.maker,c.maker)||!same(s.configHash,r.configHash)||s.version!==r.version||s.status!==(r.lifecycle==='active'?1:2)
  ||s.X.length!==n||s.principalInternal.length!==n||s.cumulativeFeeRaw.length!==n||availability.length!==n)fail('Strategy state identity mismatch');
 const X=s.X.map(BigInt),P=s.principalInternal.map(BigInt),V=BigInt(s.virtualInternal),fees=s.cumulativeFeeRaw.map(BigInt);
 if(X.some((x,i)=>x>=(1n<<160n)||x<V||P[i]!==x-V)||BigInt(s.sumInternal)!==X.reduce((a,b)=>a+b,0n)
  ||wide(s.sumSquaresInternal)!==X.reduce((a,b)=>a+b*b,0n)||BigInt(s.boundarySigmaLower)>BigInt(s.boundarySigmaUpper))fail('Invalid principal bookkeeping');
 let prefix=0;while(prefix<c.tickKeys.length&&!(s.interiorTickMask&(1<<prefix)))prefix++;
 if(prefix===c.tickKeys.length||s.interiorTickMask!==(((1<<c.tickKeys.length)-1)^((1<<prefix)-1))
  ||BigInt(s.interiorRadius)!==c.radiiInternal.slice(prefix).reduce((a,b)=>a+b,0n)
  ||BigInt(s.boundarySumNumerator)!==c.radiiInternal.slice(0,prefix).reduce((sum,r,i)=>sum+r*c.tickKeys[i]!,0n)
  ||(prefix===0&&(s.boundarySigmaLower!=='0'||s.boundarySigmaUpper!=='0')))fail('Invalid tick classification');
 let healthy=s.status===1;
 availability.forEach((a,i)=>{
  const Q=BigInt(a.aquaAllocationRaw),required=P[i]!+fees[i]!*scale(c.decimals[i]!),actual=Q*scale(c.decimals[i]!),backed=actual>=required;
  if(!same(a.token,c.tokens[i]!)||Q>=(1n<<248n)||(a.liveTokenCount===255&&Q!==0n)||a.live!==(a.liveTokenCount===n)||a.backingValid!==backed
   ||wide(a.surplusInternal)!==(backed?actual-required:0n)||wide(a.deficitInternal)!==(backed?0n:required-actual))fail('Invalid Aqua backing');
  healthy=healthy&&a.live&&backed;
 });
 availability.forEach((a,i)=>{
  const bounds=[P[i]!/scale(c.decimals[i]!),BigInt(a.aquaAllocationRaw),BigInt(a.walletBalanceRaw),BigInt(a.aquaAllowanceRaw)];
  const ceiling=healthy?bounds.reduce((a,b)=>a<b?a:b):0n;
  if(BigInt(a.fundingCeilingRaw)!==ceiling)fail('Invalid output capacity');
 });
}
export function decodeStrategyDetail(input:unknown,httpStatus:number,configured:DeploymentManifest,requestedHash:string):StrategyDetailDTO{
 const m=manifestSchema.parse(configured),id=hashSchema.parse(requestedHash),v=strategyDetailSchema.parse(input),r=v.data.strategy;observation(v,m);
 if(httpStatus!==(r?200:404))fail('Strategy response status mismatch');
 if(!r){if(v.code!=='STRATEGY_NOT_FOUND'||v.retryable!==false||v.field!=='hash')fail('Invalid strategy absence');}
 else{
  if(v.code!==(v.status==='stale'?'STRATEGIES_STALE':'STRATEGIES_AVAILABLE')||!same(r.orderHash,id)||!r.financial)fail('Invalid strategy detail');
  record(r,m,v.asOf);
 }
 return v;
}
export type StrategyListRequest={maker:string;status:'all'|'active'|'retired';limit:number;cursor?:string};
type Cursor=ReturnType<typeof strategyCursorSchema.parse>;
const position=(r:StrategyReadDTO)=>({blockNumber:r.updated.blockNumber,logIndex:r.updated.logIndex,orderHash:r.orderHash.toLowerCase()});
function compare(a:Cursor['after'],b:Cursor['after']){
 if(BigInt(a.blockNumber)!==BigInt(b.blockNumber))return BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:1;
 return a.logIndex-b.logIndex||(a.orderHash.toLowerCase()<b.orderHash.toLowerCase()?-1:same(a.orderHash,b.orderHash)?0:1);
}
function cursor(encoded:string,v:StrategyListDTO,filters:Cursor['filters']):Cursor{
 if(encoded.length>1024||!/^[A-Za-z0-9_-]+$/.test(encoded))fail('Invalid strategy cursor');
 // Cursors contain only schema-limited ASCII data. Browser and Node use the
 // same canonical base64url bytes, without introducing a browser Buffer shim.
 const json=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
 const c=strategyCursorSchema.parse(JSON.parse(json));
 if(btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==encoded||c.chainId!==v.chainId||!same(c.deploymentId,v.deploymentId)
  ||JSON.stringify(c.filters)!==JSON.stringify(filters)||c.pin.height!==v.asOf.height||!same(c.pin.hash,v.asOf.hash))fail('Strategy cursor scope mismatch');
 return c;
}
export function decodeStrategyList(input:unknown,httpStatus:number,configured:DeploymentManifest,request:StrategyListRequest):StrategyListDTO{
 const m=manifestSchema.parse(configured),v=strategyListSchema.parse(input);observation(v,m);
 const filters=strategyFiltersSchema.parse({maker:request.maker.toLowerCase(),status:request.status});
 if(httpStatus!==200||v.code!==(v.status==='stale'?'STRATEGIES_STALE':'STRATEGIES_AVAILABLE')||v.data.limit!==request.limit||v.data.items.length>request.limit)fail('Strategy listing mismatch');
 let previous=request.cursor?cursor(request.cursor,v,filters).after:undefined;
 for(const r of v.data.items){
  record(r,m,v.asOf);
  if(r.financial!==null||!same(r.maker,filters.maker!)||(filters.status!=='all'&&r.lifecycle!==filters.status))fail('Strategy listing filter mismatch');
  const p=position(r);if(previous&&compare(p,previous)>=0)fail('Strategy pagination order mismatch');previous=p;
 }
 if(v.data.nextCursor){const next=cursor(v.data.nextCursor,v,filters);if(!v.data.items.length||compare(next.after,position(v.data.items.at(-1)!))!==0)fail('Invalid strategy continuation');}
 return v;
}

/** Exact accounting display. Principal may contain fractions below an ERC-20
 * quantum; capacity is separately floored. No price or path certificate. */
function principalAmount(internal:bigint):string{
 // internal/(2^64*10^18) = internal*5^64/10^82, exactly.
 const scaled=internal*5n**64n,base=10n**82n,whole=scaled/base,fraction=(scaled%base).toString().padStart(82,'0').replace(/0+$/,'');
 return `${whole}${fraction?'.'+fraction:''}`;
}
export function strategyInventory(r:StrategyReadDTO,m:DeploymentManifest){
 if(!r.financial)fail('Strategy inventory unavailable');
 return r.config.tokens.map((address,i)=>{
  const token=m.tokens.find(t=>same(t.address,address));if(!token)fail('Unknown strategy token');
  const a=r.financial!.availability[i]!,s=r.financial!.state,amount=(v:string)=>formatAmount(BigInt(v),token!.decimals);
  return {token:token!,principal:principalAmount(BigInt(s.principalInternal[i]!)),fees:amount(s.cumulativeFeeRaw[i]!),allocation:amount(a.aquaAllocationRaw),
   wallet:amount(a.walletBalanceRaw),allowance:amount(a.aquaAllowanceRaw),available:amount(a.fundingCeilingRaw),
   fractionalPrincipal:BigInt(s.principalInternal[i]!)%scale(token!.decimals)!==0n,live:a.live,backed:a.backingValid,
   limited:BigInt(a.fundingCeilingRaw)<BigInt(s.principalInternal[i]!)/scale(token!.decimals)};
 });
}
