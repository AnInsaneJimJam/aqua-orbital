import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {decodeFunctionData,encodeFunctionResult,encodeAbiParameters,encodeEventTopics,erc20Abi,type Hex,type AbiEvent} from 'viem';
import {paymentsReadAbi,paymentsEventsAbi,lifecycleAbi,lifecycleEventsAbi,routerAbi,hashOrder,invoiceId,type Order} from '@orbital/sdk';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncDeploymentOnce,type MaterializationRpc} from '../../indexer/src/materializer.js';
import {createReadDependencies} from '../src/runtime.js';
import {paymentServiceFixture} from './payment-service-fixture.js';
import {address,hash,header} from './strategies-fixture.js';

type Call={jsonrpc:string;id:string|number;method:string;params:any[]};
export async function paymentRuntimeFixture(before:(batch:Call[])=>Promise<void>=async()=>{}){
 const f=paymentServiceFixture(),db=await isolatedDatabase(),timestamp=BigInt(Math.floor(Date.now()/1000));
 const m=f.input.manifest,invoice={...f.context.invoice,expiresAt:Number(timestamp+1000n),merchant:f.context.invoice.merchant as Hex,recipients:f.context.invoice.recipients as Hex[],memoHash:f.context.invoice.memoHash as Hex,payer:f.context.invoice.payer as Hex,routeHash:f.context.invoice.routeHash as Hex},id=invoiceId(31337n,m.payments as Hex,address(20),0n);
 const events=[...paymentsEventsAbi,...lifecycleEventsAbi] as readonly AbiEvent[];
 function event(name:string,logIndex:number,args:Record<string,unknown>){const abi=events.find(e=>e.name===name)!;return {blockNumber:1n,blockHash:hash(1),transactionHash:hash(101),transactionIndex:0,logIndex,address:name==='InvoiceCreated'?m.payments as Hex:m.router as Hex,
  topics:encodeEventTopics({abi:[abi],eventName:name,args} as never) as Hex[],data:encodeAbiParameters(abi.inputs.filter(i=>!i.indexed),abi.inputs.filter(i=>!i.indexed).map(i=>args[i.name!]))};}
 const logs=f.routing.records.map((record,i)=>event('StrategyActivated',i,{maker:record.maker,orderHash:record.orderHash,configHash:record.configHash}));
 logs.push(event('InvoiceCreated',logs.length,{invoiceId:id,merchant:invoice.merchant,amountDueRaw:invoice.amountDueRaw,expiresAt:invoice.expiresAt,recipients:invoice.recipients,bps:invoice.bps,memoHash:invoice.memoHash}));
 const indexRpc:MaterializationRpc={async getChainId(){return 31337;},async getBlockNumber(){return 5n;},async getBlock(n){return header(Number(n));},async getLogs(n){return n===1n?logs:[];},
  async call(request){const hash=`0x${request.data.slice(-64)}`;return encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:f.routing.observation(hash).config});}};
 for(let i=0;i<3;i++)await syncDeploymentOnce(db.pool,m,indexRpc);
 const batches:Call[][]=[];
 const rpc=createServer(async(req,res)=>{try{
  const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const batch=JSON.parse(Buffer.concat(chunks).toString()) as Call[];
  assert.ok(Array.isArray(batch)&&batch.length>0&&batch.length<=8);batches.push(batch);await before(batch);
  const response=batch.map(call=>{let result:unknown;
   if(call.method==='eth_chainId')result='0x7a69';else if(call.method==='eth_blockNumber')result='0x5';else if(call.method==='eth_getBlockByNumber')result={number:'0x3',hash:hash(3),timestamp:`0x${timestamp.toString(16)}`};
   else{
    assert.equal(call.method,'eth_call');assert.deepEqual(call.params[1],{blockHash:hash(3),requireCanonical:true});
    const decoded=decodeFunctionData({abi:[...paymentsReadAbi,...erc20Abi,...lifecycleAbi,...routerAbi],data:call.params[0].data});const name=decoded.functionName;
    if(name==='getInvoice'){assert.equal(decoded.args[0],id);result=encodeFunctionResult({abi:paymentsReadAbi,functionName:name,result:invoice});}
    else if(name==='USDC'||name==='ROUTER')result=encodeFunctionResult({abi:paymentsReadAbi,functionName:name,result:(name==='USDC'?m.usdc:m.router) as Hex});
    else if(name==='allowedToken')result=encodeFunctionResult({abi:paymentsReadAbi,functionName:name,result:true});
    else if(name==='balanceOf'||name==='allowance')result=encodeFunctionResult({abi:erc20Abi,functionName:name,result:name==='balanceOf'?f.context.balanceRaw:f.context.allowanceRaw});
    else if(name==='decimals')result=encodeFunctionResult({abi:erc20Abi,functionName:name,result:call.params[0].to.toLowerCase()===address(3).toLowerCase()?18:6});
    else if(name==='quote'){const amount=decoded.args[1] as bigint,order=decoded.args[0] as Order;result=encodeFunctionResult({abi:routerAbi,functionName:name,result:[amount,amount*3n/4n,hashOrder(order)]});}
    else{const observation=f.routing.observation(decoded.args![0] as string);result=encodeFunctionResult({abi:lifecycleAbi,functionName:name as 'getStrategyConfig',result:name==='getStrategyConfig'?observation.config:name==='getStrategyState'?observation.state:observation.availability} as never);}
   }
   return {jsonrpc:'2.0',id:call.id,result};
  });res.setHeader('content-type','application/json');res.end(JSON.stringify(response.reverse()));
 }catch{res.statusCode=500;res.end('invalid fixture request');}});
 await new Promise<void>(resolve=>rpc.listen(0,'127.0.0.1',resolve));
 const configured={...m,rpcUrl:`http://127.0.0.1:${(rpc.address() as AddressInfo).port}`},runtime=createReadDependencies(db.pool.options.connectionString!);
 return {f,db,configured,runtime,batches,timestamp,request:{...f.input.request,invoiceId:id},async close(){await runtime.close();rpc.closeAllConnections();await new Promise<void>(resolve=>rpc.close(()=>resolve()));await db.close();}};
}
