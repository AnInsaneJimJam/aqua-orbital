import {encodeFunctionResult,type Hex} from 'viem';
import {buildOrder,hashOrder,hashConfig,configToDTO,lifecycleAbi,routerAbi,type Config} from '@orbital/sdk';
import type {StrategyReadSnapshot,StrategyRecord} from '@orbital/db';
import {readinessDeploymentScope} from '../src/deployment-scope.js';
import type {RoutingInput,StaticReadCall,StaticReadResult} from '../src/route-selection.js';
import {manifest,maker,address,hash,WHOLE,GRID,U} from './strategies-fixture.js';
// Explicit ABI-shaped unit fixtures. These are not authenticated chain observations.
export function routingFixture(count=6){
 const configs:Config[]=Array.from({length:count},(_,i)=>({schemaVersion:1,chainId:31337n,router:address(11),maker,makerNonce:BigInt(i),tokens:[address(1),address(2),address(3)],decimals:[6,6,18],tickKeys:[3n*GRID/2n,7n*GRID/4n,(1n<<64n)-1n],radiiInternal:[100n,200n,400n].map(r=>r*WHOLE),feePpm:[100,500,1000][i%3]!,initialAmountsRaw:[300_000_000n,300_000_000n,300n*10n**18n]}));
 const records:StrategyRecord[]=configs.map((c,i)=>{const receipt={blockNumber:'1',blockHash:hash(1),txHash:hash(101),logIndex:i,event:'StrategyActivated' as const};return {orderHash:hashOrder(buildOrder(c)),router:c.router,maker:c.maker,configHash:hashConfig(c),config:configToDTO(c),lifecycle:'active',version:'1',activated:receipt,updated:receipt,feeTotals:[]};});
 const scope=readinessDeploymentScope(manifest);
 const snapshot:StrategyReadSnapshot={code:'STRATEGIES_COMPLETE',chainId:31337,deploymentId:scope.id,currentCursor:{height:'3',hash:hash(3)},asOf:{height:'3',hash:hash(3)},indexedAt:new Date().toISOString(),coverage:{fromBlock:'1',toBlock:'3',expectedBlocks:'3',canonicalBlocks:'3',coveredBlocks:'3'},items:records,hasMore:false};
 const input:RoutingInput={manifest,snapshot,intent:{kind:'swap',wallet:address(22),recipient:address(23),tokenIn:address(1),tokenOut:address(3),amountInRaw:'9007199254740993',slippageBps:50,maxCrossings:16},blockTimestamp:'1700000003'};
 function observation(id:string){const index=records.findIndex(r=>r.orderHash===id),c=configs[index]!;
  const X=[300n*WHOLE,300n*WHOLE,300n*WHOLE],sq=X.reduce((s,x)=>s+x*x,0n);
  return {config:structuredClone(c),state:{maker:c.maker,configHash:hashConfig(c),status:1,version:1n,X,principalInternal:[...X],virtualInternal:0n,sumInternal:900n*WHOLE,sumSquaresInternal:{hi:sq>>256n,lo:sq% (1n<<256n)},interiorRadius:700n*WHOLE,boundarySumNumerator:0n,boundarySigmaLower:0n,boundarySigmaUpper:0n,interiorTickMask:7,slackBoundInternal:0n,cumulativeFeeRaw:[0n,0n,0n]},
   availability:c.tokens.map((token,i)=>{const q=X[i]!/(10n**BigInt(18-c.decimals[i]!)*U);return {token,aquaAllocationRaw:q,liveTokenCount:3,walletBalanceRaw:q,aquaAllowanceRaw:q,live:true,backingValid:true,surplusInternal:{hi:0n,lo:0n},deficitInternal:{hi:0n,lo:0n},fundingCeilingRaw:q};})};
 }
 function inspections(calls:StaticReadCall[],mutate?:(data:ReturnType<typeof observation>,id:string)=>void):StaticReadResult[]{return calls.map(request=>{const [id,name]=request.id.split(':') as [string,'getStrategyConfig'|'getStrategyState'|'getStrategyAvailability'];const r=observation(id);mutate?.(r,id);return {request,status:'fulfilled',data:encodeFunctionResult({abi:lifecycleAbi,functionName:name,result:name==='getStrategyConfig'?r.config:name==='getStrategyState'?r.state:r.availability} as never)};});}
 function quotes(calls:StaticReadCall[],out:(id:string)=>bigint=()=>20n*10n**18n):StaticReadResult[]{return calls.map(request=>{const id=request.id.split(':')[0]!;return {request,status:'fulfilled',data:encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[BigInt(input.intent.amountInRaw),out(id),id as Hex]})};});}
 return {input,configs,records,observation,inspections,quotes};
}
