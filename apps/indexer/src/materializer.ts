import type pg from 'pg';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import {encodeAbiParameters,encodeEventTopics,decodeEventLog,decodeFunctionResult,encodeFunctionData,keccak256,toEventSelector,isAddress,type Address,type Hex,type AbiEvent} from 'viem';
import {buildOrder,hashConfig,hashOrder,configToDTO,configFromDTO,lifecycleAbi,lifecycleEventsAbi,paymentsEventsAbi,swapEventsAbi,type Config} from '@orbital/sdk';
import type {ReadRpc,RawLog,SyncResult} from './worker.js';
import {atomicDeploymentBlock,atomicSwapBackfill,pendingSwapBackfill,deploymentCursor,indexerSnapshot,reconcileCanonicalChain,type BlockHeader,type DeploymentScope,type ProjectionEvent} from '@orbital/db';

export type MaterializationRpc=Omit<ReadRpc,'getBlock'|'getLogs'>&{
 getChainId():Promise<number>;
 getBlock(number:bigint):Promise<BlockHeader&{transactions:readonly string[]}>;
 getLogs(number:bigint,emitters:readonly string[],blockHash:string):Promise<readonly RawLog[]>;
 call(request:{to:Address;data:Hex},block:{blockHash:Hex;requireCanonical:true}):Promise<Hex>;
};
const HASH=/^0x[0-9a-fA-F]{64}$/;
const ZERO=`0x${'0'.repeat(64)}`;
const equal=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const validAddress=(value:unknown):value is Address=>typeof value==='string'&&isAddress(value)&&BigInt(value)!==0n;
const allEvents=[...lifecycleEventsAbi,...paymentsEventsAbi,...swapEventsAbi] as readonly AbiEvent[];
export const MAX_BLOCK_LOGS=2000;
export const MAX_BLOCK_HYDRATIONS=32;

export function deploymentScope(input:DeploymentManifest):DeploymentScope{
 const manifest=manifestSchema.parse(input);
 if(!manifest.verified)throw Error('DEPLOYMENT_NOT_VERIFIED');
 const {chainId}=manifest;
 const roles={aqua:manifest.aqua.toLowerCase(),router:manifest.router.toLowerCase(),payments:manifest.payments.toLowerCase(),usdc:manifest.usdc.toLowerCase()};
 const id=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[BigInt(chainId),roles.aqua as Address,roles.router as Address,roles.payments as Address]));
 // Persist public identity only. RPC URLs may contain credentials and do not
 // belong in the database or error/notification payloads.
 const identity={chainId,...roles,startBlock:manifest.startBlock,tokens:manifest.tokens.map(t=>({address:t.address.toLowerCase(),decimals:t.decimals,mock:t.mock})).sort((a,b)=>a.address.localeCompare(b.address))};
 return {chainId,id,...roles,startBlock:BigInt(manifest.startBlock),identity};
}

export async function syncDeploymentOnce(pool:pg.Pool,manifest:DeploymentManifest,rpc:MaterializationRpc):Promise<SyncResult>{
 const scope=deploymentScope(manifest);
 const snapshot=await indexerSnapshot(pool,scope.chainId);
 if(snapshot.status==='resync_required')return {status:'resync_required'};
 const cursor=await deploymentCursor(pool,scope);
 if(await rpc.getChainId()!==scope.chainId)throw Error('RPC_CHAIN_MISMATCH');
 const head=await rpc.getBlockNumber();
 if(snapshot.cursor){
  if(head<snapshot.cursor.height)return {status:'retry'};
  const canonical:BlockHeader[]=[];
  for(const stored of snapshot.blocks){const observed=await checkedBlock(rpc,stored.number);canonical.push(observed);if(observed.hash===stored.hash)break;}
  if(!canonical.length)throw Error('INDEXER_CURSOR_WITHOUT_BLOCKS');
  if((await checkedBlock(rpc,canonical[0]!.number)).hash!==canonical[0]!.hash)return {status:'retry'};
  const result=await reconcileCanonicalChain(pool,scope.chainId,snapshot.cursor,canonical);
  if(result.status==='cursor_changed')return {status:'retry'};
  if(result.status==='resync_required')return {status:'resync_required'};
  if(result.status==='rolled_back')return {status:'rolled_back',block:result.cursor!.height,hash:result.cursor!.hash,removedBlocks:result.removedBlocks};
 }
 const backfill=await pendingSwapBackfill(pool,scope);
 if(backfill){
  const block=await checkedBlock(rpc,backfill.block.number);
  if(block.hash!==backfill.block.hash)return {status:'retry'};
  const logs=canonicalLogs(backfill.events.map(event=>{
   const payload=event.payload as {version?:number;topics?:Hex[];data?:Hex};
   if(payload?.version!==1||!Array.isArray(payload.topics)||typeof payload.data!=='string')throw Error('INVALID_EVENT_ABI');
   return {blockNumber:block.number,blockHash:block.hash,transactionHash:event.txHash,transactionIndex:block.transactions.indexOf(event.txHash),logIndex:event.logIndex,address:event.emitter,topics:payload.topics,data:payload.data};
  }),block,scope);
  const configs=new Map(backfill.configs.map(row=>[row.order_hash,configFromDTO(row.config)]));
  const projections:ProjectionEvent[]=[];
  for(const log of logs){
   const event=decode(log,scope);if(!event)continue;
   if(event.eventName==='StrategyActivated'){
    const config=configs.get(String(event.args.orderHash));if(!config)throw Error('ACTIVATION_CONFIG_MISMATCH');
    authenticateConfig(config,event.args,scope,manifest);
   }
   projections.push(projection(log,event,scope,manifest,configs));
  }
  if((await checkedBlock(rpc,block.number)).hash!==block.hash)return {status:'retry'};
  try{await atomicSwapBackfill(pool,scope,block,backfill.events,projections);}
  catch(error){if(error instanceof Error&&['REORG_REQUIRES_REPLAY','BACKFILL_SOURCE_CHANGED'].includes(error.message))return {status:'retry'};throw error;}
  return {status:'backfilled',block:block.number,hash:block.hash,logs:logs.length};
 }
 const next=cursor?cursor.height+1n:scope.startBlock;
 if(head<next+2n)return {status:'idle'};
 const block=await checkedBlock(rpc,next);
 if(cursor&&block.parentHash!==cursor.hash)return {status:'retry'};
 const logs=canonicalLogs(await rpc.getLogs(next,[scope.aqua,scope.router,scope.payments],block.hash),block,scope);
 const decoded=logs.map(log=>({log,event:decode(log,scope)}));
 const activations=decoded.filter(item=>item.event?.eventName==='StrategyActivated');
 if(activations.length>MAX_BLOCK_HYDRATIONS)throw Error('BLOCK_HYDRATION_LIMIT');
 const configs=new Map<string,Config>();
 // Four requests at a time; no unbounded Promise.all over provider logs.
 for(let start=0;start<activations.length;start+=4){
  const results=await Promise.allSettled(activations.slice(start,start+4).map(async item=>{
   const args=item.event!.args;const orderHash=String(args.orderHash) as Hex;
   const raw=await rpc.call({to:scope.router as Address,data:encodeFunctionData({abi:lifecycleAbi,functionName:'getStrategyConfig',args:[orderHash]})},{blockHash:block.hash as Hex,requireCanonical:true});
   try{
    const config=decodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',data:raw}) as Config;
    authenticateConfig(config,args,scope,manifest);
    configs.set(orderHash,config);
   }catch{throw Error('ACTIVATION_CONFIG_MISMATCH');}
  }));
  const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 }
 const projections=decoded.filter(item=>item.event).map(item=>projection(item.log,item.event!,scope,manifest,configs));
 if((await checkedBlock(rpc,next)).hash!==block.hash)return {status:'retry'};
 try{
  await atomicDeploymentBlock(pool,scope,block,logs.map(log=>({txHash:log.transactionHash,logIndex:log.logIndex,emitter:log.address,topic:log.topics[0]??'0x',payload:{version:1,topics:log.topics,data:log.data}})),projections);
 }catch(error){if(error instanceof Error&&error.message==='REORG_REQUIRES_REPLAY')return {status:'retry'};throw error;}
 return {status:'indexed',block:next,hash:block.hash,logs:logs.length};
}

async function checkedBlock(rpc:MaterializationRpc,number:bigint){
 const block=await rpc.getBlock(number);
 if(block.number!==number||!HASH.test(block.hash)||!HASH.test(block.parentHash)||!Array.isArray(block.transactions)||block.transactions.some(tx=>!HASH.test(tx)))throw Error('RPC_INVALID_BLOCK_HEADER');
 return {...block,hash:block.hash.toLowerCase(),parentHash:block.parentHash.toLowerCase(),transactions:block.transactions.map(tx=>tx.toLowerCase())};
}
function authenticateConfig(config:Config,args:Record<string,unknown>,scope:DeploymentScope,manifest:DeploymentManifest){
 if(config.chainId!==BigInt(scope.chainId)||!equal(config.router,scope.router)||!equal(config.maker,String(args.maker))||!equal(hashConfig(config),String(args.configHash))||!equal(hashOrder(buildOrder(config)),String(args.orderHash))||config.tokens.some((token,i)=>!manifest.tokens.some(allowed=>equal(allowed.address,token)&&allowed.decimals===config.decimals[i])))throw Error('ACTIVATION_CONFIG_MISMATCH');
}
function canonicalLogs(input:readonly RawLog[],block:Awaited<ReturnType<typeof checkedBlock>>,scope:DeploymentScope){
 if(input.length>MAX_BLOCK_LOGS)throw Error('BLOCK_LOG_LIMIT');
 const unique=new Map<number,RawLog>();
 for(const raw of input){
  if(raw.blockNumber!==block.number||!HASH.test(raw.blockHash)||!equal(raw.blockHash,block.hash)||raw.removed||!Number.isSafeInteger(raw.logIndex)||raw.logIndex<0||!Number.isSafeInteger(raw.transactionIndex)||raw.transactionIndex!<0||!HASH.test(raw.transactionHash)||!equal(block.transactions[raw.transactionIndex!]??'',raw.transactionHash)||![scope.aqua,scope.router,scope.payments].some(emitter=>equal(emitter,raw.address))||raw.topics.length>4||raw.topics.some(topic=>!HASH.test(topic))||!/^0x(?:[0-9a-fA-F]{2})*$/.test(raw.data)||raw.data.length>32770)throw Error('RPC_INVALID_BLOCK_LOG');
  const log={...raw,blockHash:raw.blockHash.toLowerCase(),transactionHash:raw.transactionHash.toLowerCase(),address:raw.address.toLowerCase(),topics:raw.topics.map(topic=>topic.toLowerCase()),data:raw.data.toLowerCase()};
  const prior=unique.get(log.logIndex);
  if(prior&&JSON.stringify({...prior,blockNumber:prior.blockNumber.toString()})!==JSON.stringify({...log,blockNumber:log.blockNumber.toString()}))throw Error('CONFLICTING_BLOCK_LOG');
  unique.set(log.logIndex,log);
 }
 return [...unique.values()].sort((a,b)=>a.logIndex-b.logIndex);
}
type Decoded={eventName:string;args:Record<string,unknown>};
function decode(log:RawLog,scope:DeploymentScope):Decoded|null{
 const entry=allEvents.find(event=>equal(toEventSelector(event),log.topics[0]??''));
 if(!entry)return null;
 const routerEvent=entry.name.startsWith('Strategy')||entry.name==='OrbitalSwapExecuted';
 if(log.address!==(routerEvent?scope.router:scope.payments))throw Error('EVENT_EMITTER_MISMATCH');
 try{
  const decoded=decodeEventLog({abi:[entry],topics:log.topics as [Hex,...Hex[]],data:log.data as Hex,strict:true}) as Decoded;
  // Strict decoding alone permits some trailing payloads; re-encode to require
  // the exact canonical ABI emitted by the compiled event definition.
  const fields=entry.inputs.filter(input=>!input.indexed);
  if(!equal(encodeAbiParameters(fields,fields.map(field=>decoded.args[field.name!])),log.data))throw Error('data');
  const topics=encodeEventTopics({abi:[entry],eventName:entry.name,args:decoded.args} as never) as Hex[];
  if(topics.length!==log.topics.length||topics.some((topic,i)=>!equal(topic,log.topics[i]!)))throw Error('topics');
  return decoded;
 }catch{throw Error('INVALID_EVENT_ABI');}
}
function projection(log:RawLog,event:Decoded,scope:DeploymentScope,manifest:DeploymentManifest,configs:Map<string,Config>):ProjectionEvent{
 const a=event.args;const maker=String(a.maker??a.merchant).toLowerCase();
 if(!validAddress(maker))throw Error('INVALID_EVENT_ARGUMENTS');
 const base={maker,entityId:String(a.orderHash??a.invoiceId).toLowerCase(),txHash:log.transactionHash,logIndex:log.logIndex};
 switch(event.eventName){
  case 'StrategyActivated':{
   const config=configs.get(String(a.orderHash));if(!config)throw Error('ACTIVATION_CONFIG_MISMATCH');
   return {...base,kind:'strategy_activated',configHash:String(a.configHash),config:configToDTO(config),makerNonce:config.makerNonce.toString(),tokens:config.tokens.map(token=>token.toLowerCase())};
  }
  case 'StrategyRetired':if(BigInt(String(a.version))<2n)throw Error('INVALID_EVENT_ARGUMENTS');return {...base,kind:'strategy_retired',version:String(a.version)};
  case 'OrbitalSwapExecuted':{
   if(!validAddress(a.taker)||!validAddress(a.recipient))throw Error('INVALID_EVENT_ARGUMENTS');
   return {...base,kind:'strategy_swap',taker:String(a.taker).toLowerCase(),recipient:String(a.recipient).toLowerCase(),tokenInIndex:Number(a.tokenInIndex),tokenOutIndex:Number(a.tokenOutIndex),grossInputRaw:String(a.grossInputRaw),netInputRaw:String(a.netInputRaw),feeRaw:String(a.feeRaw),amountOutRaw:String(a.amountOutRaw),version:String(a.version),crossedTickKeys:(a.crossedTickKeys as bigint[]).map(String),crossedInward:a.crossedInward as boolean[]};
  }
  case 'InvoiceCreated':{
   const addresses=a.recipients as Address[],bps=a.bps as number[];
   if(BigInt(String(a.amountDueRaw))<=0n||BigInt(String(a.amountDueRaw))>=(1n<<160n)/(10n**12n*(1n<<64n))||Number(a.expiresAt)<=0||addresses.length<1||addresses.length>3||addresses.length!==bps.length||new Set(addresses.map(value=>value.toLowerCase())).size!==addresses.length||addresses.some(value=>!validAddress(value)||equal(value,scope.payments))||bps.some(value=>value<=0)||bps.reduce((sum,value)=>sum+value,0)!==10000)throw Error('INVALID_EVENT_ARGUMENTS');
   return {...base,kind:'invoice_created',amountDueRaw:String(a.amountDueRaw),expiresAt:String(a.expiresAt),memoHash:String(a.memoHash),recipients:addresses.map((value,i)=>({address:value.toLowerCase(),bps:bps[i]!}))};
  }
  case 'InvoiceCancelled':return {...base,kind:'invoice_cancelled'};
  case 'InvoicePaid':{
   const token=String(a.tokenIn).toLowerCase(),route=String(a.routeHash).toLowerCase();
   if(!validAddress(a.payer)||!manifest.tokens.some(value=>equal(value.address,token))||BigInt(String(a.amountInRaw))<=0n||(route===ZERO?token!==scope.usdc||String(a.amountInRaw)!==String(a.receivedRaw)||BigInt(String(a.refundRaw))!==0n:token===scope.usdc))throw Error('INVALID_EVENT_ARGUMENTS');
   return {...base,kind:'invoice_paid',payer:String(a.payer).toLowerCase(),tokenIn:token,inputRaw:String(a.amountInRaw),receivedRaw:String(a.receivedRaw),refundRaw:String(a.refundRaw),routeHash:route};
  }
  default:throw Error('INVALID_EVENT_ABI');
 }
}
