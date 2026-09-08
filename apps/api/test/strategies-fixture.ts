import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,getAddress,type AbiEvent,type Hex} from 'viem';
import {buildOrder,hashOrder,hashConfig,lifecycleAbi,lifecycleEventsAbi,swapEventsAbi,type Config} from '@orbital/sdk';
import type {DeploymentManifest} from '@orbital/shared';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {readStrategies,type StrategyTopics} from '../../../packages/db/src/strategy-reads.js';
import {deploymentScope,syncDeploymentOnce,type MaterializationRpc} from '../../indexer/src/materializer.js';
import type {StrategyReadDependencies} from '../src/strategies.js';
export const address=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
export const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
export const maker=address(20),otherMaker=address(21),taker=address(22),U=1n<<64n,WHOLE=10n**18n*U,GRID=1n<<32n;
export const manifest:DeploymentManifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'https://example.invalid',verified:true,
 aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'1',tokens:[
  {address:address(1),symbol:'USDC',decimals:6,mock:true},{address:address(2),symbol:'oUSD6',decimals:6,mock:true},{address:address(3),symbol:'oUSD18',decimals:18,mock:true}]};
export const topics:StrategyTopics={activated:encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyActivated'})[0]!,retired:encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyRetired'})[0]!,swap:encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted'})[0]!};
export const header=(n:number)=>({number:BigInt(n),hash:hash(n),parentHash:hash(n-1),transactions:[hash(100+n)]});
const events=[...lifecycleEventsAbi,...swapEventsAbi] as readonly AbiEvent[];
function event(n:number,logIndex:number,name:string,args:Record<string,unknown>){const b=header(n),abi=events.find(e=>e.name===name)!;return {
 blockNumber:b.number,blockHash:b.hash,transactionHash:b.transactions[0]!,transactionIndex:0,logIndex,address:manifest.router,
 topics:encodeEventTopics({abi:[abi],eventName:name,args} as never) as Hex[],data:encodeAbiParameters(abi.inputs.filter(i=>!i.indexed),abi.inputs.filter(i=>!i.indexed).map(i=>args[i.name!]))};}
// ABI-shaped contract reads and authentic event encoding over isolated PostgreSQL.
// This fixture tests read consistency, not a new mathematical/settlement oracle.
export async function strategyFixture({count=6,initialTip=3,retireFirst=false}:{count?:number;initialTip?:number;retireFirst?:boolean}={}){
 const db=await isolatedDatabase();let tip=0;
 const configs:Config[]=Array.from({length:count},(_,n)=>({schemaVersion:1,chainId:31337n,router:address(11),maker:n===count-1?otherMaker:maker,makerNonce:BigInt(n),
  tokens:manifest.tokens.map(t=>getAddress(t.address)),decimals:[6,6,18],tickKeys:[3n*GRID/2n,7n*GRID/4n,(1n<<64n)-1n],radiiInternal:[100n,200n,400n].map(n=>n*WHOLE),feePpm:500,
  initialAmountsRaw:[300_000_000n,300_000_000n,300n*10n**18n]}));
 const hashes=configs.map(c=>hashOrder(buildOrder(c)));
 const logMap=new Map<bigint,ReturnType<typeof event>[]>([[1n,configs.map((c,n)=>event(1,n,'StrategyActivated',{maker:c.maker,orderHash:hashes[n],configHash:hashConfig(c)}))]]);
 const gross=9007199254740993n,fee=(gross*500n+999999n)/1000000n,out=6000n;
 for(let k=0;k<2;k++)logMap.get(1n)!.push(event(1,count+k,'OrbitalSwapExecuted',{maker,orderHash:hashes[0],taker,recipient:taker,tokenInIndex:2,tokenOutIndex:0,grossInputRaw:gross,netInputRaw:gross-fee,feeRaw:fee,amountOutRaw:out,version:BigInt(k+2),crossedTickKeys:[],crossedInward:[]}));
 if(retireFirst)logMap.get(1n)!.push(event(1,count+2,'StrategyRetired',{maker,orderHash:hashes[0],version:4n}));
 const indexRpc:MaterializationRpc={async getChainId(){return 31337;},async getBlockNumber(){return BigInt(tip+2);},async getBlock(n){return header(Number(n));},async getLogs(n){return logMap.get(n)??[];},
  async call(request){const id=`0x${request.data.slice(-64)}`;const index=hashes.findIndex(h=>h.toLowerCase()===id.toLowerCase());return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:configs[index]!});}};
 async function advance(next:number){const prior=tip;tip=next;for(let n=prior;n<next;n++)await syncDeploymentOnce(db.pool,manifest,indexRpc);}
 await advance(initialTip);
 const calls:{pin:{height:string;hash:string};orderHash:string|null}[]=[];
 function observation(id:string){const index=hashes.findIndex(h=>h.toLowerCase()===id.toLowerCase()),c=configs[index]!;const swapped=index===0?2n:0n;
  const principal=[300n*WHOLE-swapped*out*10n**12n*U,300n*WHOLE,300n*WHOLE+swapped*(gross-fee)*U],X=[...principal],fees=[0n,0n,swapped*fee];
  const squares=X.reduce((sum,x)=>sum+x*x,0n),mask=(1<<c.tickKeys.length)-1;
  const state={maker:c.maker,configHash:hashConfig(c),status:index===0&&retireFirst?2:1,version:index===0?(retireFirst?4n:3n):1n,X,principalInternal:principal,virtualInternal:0n,sumInternal:X.reduce((sum,x)=>sum+x,0n),sumSquaresInternal:{hi:squares>>256n,lo:squares% (1n<<256n)},interiorRadius:700n*WHOLE,boundarySumNumerator:0n,boundarySigmaLower:0n,boundarySigmaUpper:0n,interiorTickMask:mask,slackBoundInternal:0n,cumulativeFeeRaw:fees};
  const availability=c.tokens.map((token,i)=>{const scale=10n**BigInt(18-c.decimals[i]!)*U,required=principal[i]!+fees[i]!*scale,Q=required/scale+1n,surplus=Q*scale-required;return {token,aquaAllocationRaw:Q,liveTokenCount:3,walletBalanceRaw:Q+77n,aquaAllowanceRaw:Q,live:true,backingValid:true,surplusInternal:{hi:surplus>>256n,lo:surplus%(1n<<256n)},deficitInternal:{hi:0n,lo:0n},fundingCeilingRaw:state.status===1?principal[i]!/scale:0n};});
  return {config:structuredClone(c),state,availability};
 }
 const dependencies:StrategyReadDependencies={readDatabase:(m,q)=>readStrategies(db.pool,deploymentScope(m),topics,q),async readRpc(_m,pin,id){calls.push({pin,orderHash:id});return {chainId:31337,head:BigInt(tip+2),block:{...pin,timestamp:1700000000n+BigInt(pin.height)},...(id?observation(id):{})};}};
 return {db,configs,hashes,dependencies,calls,observation,advance,close:()=>db.close()};
}
