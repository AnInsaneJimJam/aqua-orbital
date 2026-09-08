import {decodeAbiParameters,encodeAbiParameters,decodeEventLog,encodeEventTopics,type Address,type Hex} from 'viem';
import {hashSchema,manifestSchema,nonzeroAddressSchema,uintSchema,type DeploymentManifest} from '@orbital/shared';
import {aquaEventsAbi,hashOrder,encodeOrder,orderComponents,program,orderToDTO} from '@orbital/sdk';
import type {readShipmentEvents} from '@orbital/db';
import type {StrategyReadDependencies} from './strategies.js';
export type ShipmentDependencies={strategies:StrategyReadDependencies;events:(m:DeploymentManifest,pin:{height:string;hash:string},maker:string,limit:number,after?:{height:string;logIndex:number;hash:string})=>ReturnType<typeof readShipmentEvents>};
const fail=(code:string,status=503)=>({httpStatus:status,schemaVersion:1,status:'unavailable',code,financialExecutionEnabled:false,data:null});
export async function getShipments(configured:DeploymentManifest|null,makerInput:string,query:Record<string,unknown>,deps?:ShipmentDependencies){
 try{
  const m=manifestSchema.parse(configured),maker=nonzeroAddressSchema.parse(makerInput).toLowerCase(),limit=6;
  if(!m.verified||!deps)return fail('SHIPMENTS_UNAVAILABLE');
  if(Object.keys(query).some(k=>k!=='cursor')||query.cursor!==undefined&&(typeof query.cursor!=='string'||query.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(query.cursor)))return fail('INVALID_SHIPMENT_QUERY',400);
  const identity=JSON.stringify([m.chainId,m.aqua.toLowerCase(),m.router.toLowerCase(),maker]);let cursor:any;
  if(query.cursor){cursor=JSON.parse(Buffer.from(query.cursor as string,'base64url').toString('utf8'));if(Buffer.from(JSON.stringify(cursor)).toString('base64url')!==query.cursor||cursor.scope!==identity||!hashSchema.safeParse(cursor.pin?.hash).success||!uintSchema.safeParse(cursor.pin?.height).success||!uintSchema.safeParse(cursor.after?.height).success||!hashSchema.safeParse(cursor.after?.hash).success||!Number.isSafeInteger(cursor.after?.logIndex)||cursor.after.logIndex<0)return fail('INVALID_SHIPMENT_CURSOR',400);}
  const request={kind:'list' as const,filters:{maker,status:'all' as const},limit:1,...(cursor?{pin:cursor.pin}:{})};
  const before=await deps.strategies.readDatabase(m,request);if(before.code!=='STRATEGIES_COMPLETE'||!before.asOf||!before.indexedAt)return fail('SHIPMENT_HISTORY_UNAVAILABLE',cursor?409:503);
  const pin=before.asOf,{rows,hasMore}=await deps.events(m,pin,maker,limit,cursor?.after);
  const items=rows.map(row=>{
   const p=row.payload,decoded=decodeEventLog({abi:aquaEventsAbi,data:p.data,topics:p.topics,strict:true});
   if(decoded.eventName!=='Shipped'||decoded.args.maker.toLowerCase()!==maker||decoded.args.app.toLowerCase()!==m.router.toLowerCase())throw Error('Shipment identity');
   const order=decodeAbiParameters([{type:'tuple',components:orderComponents}],decoded.args.strategy)[0];
   if(encodeOrder(order)!==decoded.args.strategy||hashOrder(order)!==decoded.args.strategyHash||order.maker.toLowerCase()!==maker||order.traits!==((1n<<254n)|(0x0028002800280028n<<160n))||order.data.length!==218)throw Error('Canonical Orbital order required');
   const commitment=('0x'+order.data.slice(86,150)) as Hex;
   if(order.data.slice(82).toLowerCase()!==program(commitment).slice(2).toLowerCase())throw Error('Program commitment mismatch');
   const first='0x'+order.data.slice(2,42),second='0x'+order.data.slice(42,82);
   if(BigInt(first)>=BigInt(second)||[first,second].some(a=>!m.tokens.some(t=>t.address.toLowerCase()===a.toLowerCase())))throw Error('Unknown leading pair');
   const receipt=(height:string,blockHash:string,txHash:string,logIndex:number)=>({height,blockHash,txHash,logIndex});
   let docked=null;if(row.dock_payload){const d=decodeEventLog({abi:aquaEventsAbi,data:row.dock_payload.data,topics:row.dock_payload.topics,strict:true});if(d.eventName!=='Docked'||d.args.maker.toLowerCase()!==maker||d.args.app.toLowerCase()!==m.router.toLowerCase()||d.args.strategyHash!==decoded.args.strategyHash||row.dock_height===row.height&&row.dock_log_index<=row.log_index)throw Error('Dock identity');docked=receipt(row.dock_height,row.dock_block_hash,row.dock_tx_hash,row.dock_log_index);}
   return {hash:decoded.args.strategyHash,maker,router:m.router,configHash:commitment,order:orderToDTO(order),status:docked?'docked':'incomplete',created:receipt(row.height,row.block_hash,row.tx_hash,row.log_index),docked};
  });
  const [rpc,after]=await Promise.all([deps.strategies.readRpc(m,pin,null),deps.strategies.readDatabase(m,{...request,pin})]);
  if(rpc.chainId!==m.chainId||rpc.block.hash!==pin.hash||rpc.head<BigInt(pin.height)+2n||after.code!=='STRATEGIES_COMPLETE'||JSON.stringify(after.asOf)!==JSON.stringify(pin)||JSON.stringify(after.coverage)!==JSON.stringify(before.coverage)||!after.indexedAt||!after.currentCursor)return fail('SHIPMENT_HISTORY_CHANGED',409);
  const age=Date.now()-Math.min(Date.parse(before.indexedAt),Date.parse(after.indexedAt));if(age>10000||age< -1000)return fail('SHIPMENT_INDEX_STALE');
  const last=items.at(-1),nextCursor=hasMore&&last?Buffer.from(JSON.stringify({scope:identity,pin,after:{height:last.created.height,logIndex:last.created.logIndex,hash:last.hash}})).toString('base64url'):null;
  return {httpStatus:200,schemaVersion:1,status:'available',code:'SHIPMENTS_AVAILABLE',financialExecutionEnabled:false,chainId:m.chainId,maker,router:m.router,aqua:m.aqua,asOf:pin,coverage:{...before.coverage,complete:true},data:{items,nextCursor,limit}};
 }catch{return fail('SHIPMENTS_UNAVAILABLE');}
}
