// One development smoke flow, not a release or live-wallet test campaign.
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,erc20Abi,type Hex} from 'viem';
import {createStrategyAdminDraft,prepareStrategyAdminReview,executeStrategyAdminReview,decodeStrategyAdminReceipt,configFromDTO,orderFromDTO,
 lifecycleEventsAbi,aquaEventsAbi,type StrategyAdminLive,type StrategyAdminPort,type StrategyAdminIntent} from '../src/index';
import {strategyRecord,strategyManifest,maker,hash} from '../test/fixtures/strategy';
const r=strategyRecord(),input={config:configFromDTO(r.config),order:orderFromDTO(r.order)},timestamp=BigInt(Math.floor(Date.now()/1000));
const context={manifest:strategyManifest,chainId:strategyManifest.chainId,account:maker,now:timestamp};
let live:StrategyAdminLive={chainId:context.chainId,block:{number:15n,hash:hash(115),timestamp},config:input.config,maker,configHash:r.configHash as Hex,status:1,version:2n,
 availability:input.config.tokens.map((token,i)=>({token,liveTokenCount:3,allocation:input.config.initialAmountsRaw[i]!,allowance:0n}))};
const estimate={gas:25000n,maxFeePerGas:1000000000n,nativeBalance:10n**18n};
let sent=0;const stored:string[]=[];
const port:StrategyAdminPort={identity:async()=>({account:maker,chainId:context.chainId}),observe:async()=>structuredClone(live),canonical:async()=>{},estimate:async()=>estimate,
 send:async()=>hash(800+sent++),receipt:async hash=>({hash,status:'success',blockNumber:16n,blockHash:hashBlock,gasUsed:20000n,effectiveGasPrice:1000000000n,logs:[]})};
const hashBlock=hash(116);
async function action(intent:StrategyAdminIntent,kind:'approval'|'retire'|'dock'){
 const review=await prepareStrategyAdminReview(createStrategyAdminDraft(context,input,intent),port);assert.equal(review.kind,kind);
 const receipt=await executeStrategyAdminReview(review,port,p=>stored.push(p.hash));
 const topics=kind==='approval'?encodeEventTopics({abi:erc20Abi,eventName:'Approval',args:{owner:maker,spender:strategyManifest.aqua as Hex}}):kind==='retire'?encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyRetired',args:{maker,orderHash:r.orderHash as Hex}}):encodeEventTopics({abi:aquaEventsAbi,eventName:'Docked'});
 const data=kind==='approval'?encodeAbiParameters([{type:'uint256'}],[input.config.initialAmountsRaw[0]!*4n]):kind==='retire'?encodeAbiParameters([{type:'uint64'}],[3n]):encodeAbiParameters([{type:'address'},{type:'address'},{type:'bytes32'}],[maker,strategyManifest.router as Hex,r.orderHash as Hex]);
 receipt.logs=[{address:review.plan.to,topics:topics as Hex[],data,blockNumber:16n,blockHash:hashBlock,transactionHash:receipt.hash,logIndex:1,removed:false}];
 assert.equal(decodeStrategyAdminReceipt(receipt,review).kind,kind);console.log(`${kind}: reviewed, submitted once, hash saved, event decoded`);
}
await action({kind:'approve',token:input.config.tokens[0]!},'approval');
await action({kind:'deactivate'},'retire');live={...live,status:2,version:3n};
await action({kind:'deactivate'},'dock');
assert.equal(sent,3);assert.equal(new Set(stored).size,3);
console.log('Smoke passed: three explicit development-fixture actions. No real wallet or chain claim.');
