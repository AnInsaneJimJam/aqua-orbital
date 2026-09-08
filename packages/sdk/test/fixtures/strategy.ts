import {encodeAbiParameters,keccak256,type Address} from 'viem';
import type {DeploymentManifest,StrategyReadDTO} from '@orbital/shared';
import {buildOrder,hashConfig,hashOrder,type Config} from '../../src/codec';
import {configToDTO,orderToDTO} from '../../src/dto';
export const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
export const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as const;
export const maker=address(20),U=1n<<64n,WHOLE=10n**18n*U;
// Synthetic read-consistency fixtures, not a certified curve or deployed strategy.
export const strategyManifest:DeploymentManifest={chainId:5042002,rpcUrl:'https://rpc.testnet.arc.io',explorerUrl:'https://testnet.arcscan.app',verified:true,
 aqua:address(10),router:address(11),payments:address(12),usdc:address(1),startBlock:'10',tokens:[
 {address:address(1),symbol:'USDC',decimals:6,mock:false},{address:address(2),symbol:'oUSD6',decimals:6,mock:true},{address:address(3),symbol:'oUSD18',decimals:18,mock:true}]};
export function strategyRecord(nonce=0):StrategyReadDTO {
 const config:Config={schemaVersion:1,chainId:5042002n,router:address(11),maker,makerNonce:BigInt(nonce),tokens:[address(1),address(2),address(3)],decimals:[6,6,18],
  tickKeys:[3n*(1n<<32n)/2n,7n*(1n<<32n)/4n,(1n<<64n)-1n],radiiInternal:[100n,200n,400n].map(n=>n*WHOLE),feePpm:500,initialAmountsRaw:[300_000_000n,300_000_000n,300n*10n**18n]};
 const order=buildOrder(config),X=[300n*WHOLE+U,299n*WHOLE,301n*WHOLE],sum=X.reduce((a,b)=>a+b,0n),squares=X.reduce((a,b)=>a+b*b,0n),fees=[7n,8n,9n];
 const wide=(n:bigint)=>({hi:(n>>256n).toString(),lo:(n% (1n<<256n)).toString()});
 const financial={state:{maker,configHash:hashConfig(config),status:1 as const,version:'2',X:X.map(String),principalInternal:X.map(String),virtualInternal:'0',sumInternal:String(sum),sumSquaresInternal:wide(squares),
  interiorRadius:String(700n*WHOLE),boundarySumNumerator:'0',boundarySigmaLower:'0',boundarySigmaUpper:'0',interiorTickMask:7,slackBoundInternal:'0',cumulativeFeeRaw:fees.map(String)},
  availability:config.tokens.map((token,i)=>{const scale=10n**BigInt(18-config.decimals[i]!)*U,required=X[i]!+fees[i]!*scale,q=required/scale+1n;return {
   token,aquaAllocationRaw:String(q),liveTokenCount:3,walletBalanceRaw:String(q+10n),aquaAllowanceRaw:String(q),live:true,backingValid:true,surplusInternal:wide(q*scale-required),deficitInternal:wide(0n),fundingCeilingRaw:String(X[i]!/scale)};})};
 return {orderHash:hashOrder(order),router:address(11),maker,configHash:hashConfig(config),config:configToDTO(config),order:orderToDTO(order),lifecycle:'active',version:'2',tradeEligibilityVerified:false,financial,
  activated:{blockNumber:'12',blockHash:hash(112),txHash:hash(212+nonce),logIndex:nonce,event:'StrategyActivated'},
  updated:{blockNumber:'14',blockHash:hash(114),txHash:hash(214+nonce),logIndex:nonce,event:'OrbitalSwapExecuted'}};
}
export function strategyObservation(record=strategyRecord()) {
 const m=strategyManifest;
 return {schemaVersion:1 as const,status:'available' as const,code:'STRATEGIES_AVAILABLE' as const,financialExecutionEnabled:false as const,chainId:m.chainId,
  deploymentId:keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[BigInt(m.chainId),m.aqua as Address,m.router as Address,m.payments as Address])),
  asOf:{height:'15',hash:hash(115)},currentIndexedBlock:{height:'15',hash:hash(115)},historical:false,
  freshness:{indexedAt:'2026-09-08T06:00:00.000Z',ageMs:100,head:'17',stale:false},
  coverage:{fromBlock:'10',toBlock:'15',expectedBlocks:'6',canonicalBlocks:'6',coveredBlocks:'6',complete:true as const,scope:'registered_strategies' as const,unactivatedShipments:false as const},data:{strategy:record}};
}
export function strategyListing(records=[strategyRecord()]){
 return {...strategyObservation(),data:{items:records.map(r=>({...r,financial:null})),limit:6,nextCursor:null as string|null}};
}
