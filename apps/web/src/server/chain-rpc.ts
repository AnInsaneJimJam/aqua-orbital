import {readFile} from 'node:fs/promises';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';

const BODY_LIMIT=256*1024,RESPONSE_LIMIT=2*1024*1024;
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v);
const address=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v)&&v.length<=66;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const block=(v:unknown):boolean=>quantity(v)||['latest','pending','safe','finalized','earliest'].includes(v as string)
 ||object(v)&&Object.keys(v).every(k=>['blockHash','requireCanonical'].includes(k))&&hash(v.blockHash)&&v.requireCanonical===true;
type RpcRequest={jsonrpc:'2.0';id:string|number;method:string;params?:unknown[]};
function validRequest(v:unknown,manifest:DeploymentManifest):v is RpcRequest{
 if(!object(v)||v.jsonrpc!=='2.0'||!(typeof v.id==='string'&&v.id.length<=100||typeof v.id==='number'&&Number.isSafeInteger(v.id))
  ||typeof v.method!=='string'||v.params!==undefined&&!Array.isArray(v.params)||Object.keys(v).some(k=>!['jsonrpc','id','method','params'].includes(k)))return false;
 const p=(v.params??[]) as unknown[];
 switch(v.method){
  case 'eth_chainId':case 'eth_blockNumber':case 'eth_gasPrice':case 'eth_maxPriorityFeePerGas':return p.length===0;
  case 'eth_getBalance':case 'eth_getCode':case 'eth_getTransactionCount':return p.length===2&&address(p[0])&&block(p[1]);
  case 'eth_getTransactionByHash':case 'eth_getTransactionReceipt':return p.length===1&&hash(p[0]);
  case 'eth_getBlockByNumber':return p.length===2&&(quantity(p[0])||typeof p[0]==='string'&&block(p[0]))&&typeof p[1]==='boolean';
  case 'eth_getBlockByHash':return p.length===2&&hash(p[0])&&typeof p[1]==='boolean';
  case 'eth_feeHistory':return p.length===3&&quantity(p[0])&&BigInt(p[0] as string)<=1024n&&block(p[1])&&Array.isArray(p[2])&&p[2].length<=100&&p[2].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100);
  case 'eth_call':case 'eth_estimateGas':{
   if(p.length<(v.method==='eth_call'?2:1)||p.length>2||p.length===2&&!block(p[1])||!object(p[0]))return false;
   const tx=p[0],allowed=[manifest.aqua,manifest.router,manifest.payments,...manifest.tokens.map(t=>t.address)].map(a=>a.toLowerCase());
   if(typeof tx.to!=='string'||!allowed.includes(tx.to.toLowerCase()))return false;
   return Object.entries(tx).every(([key,value])=>{
    if(key==='to'||key==='from')return address(value);
    if(key==='data'||key==='input')return typeof value==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(value)&&value.length<=131074;
    if(['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'].includes(key))return quantity(value);
    return key==='value'&&value==='0x0';
   });
  }
  default:return false; // No wallet, signing, broadcast, logs, debug or admin methods.
 }
}
async function boundedText(body:ReadableStream<Uint8Array>|null,limit:number,signal:AbortSignal){
 if(!body)throw Error('EMPTY_BODY');const reader=body.getReader(),parts:Uint8Array[]=[];let length=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{if(signal.aborted)throw Error('RPC_TIMEOUT');for(;;){const r=await reader.read();if(signal.aborted)throw Error('RPC_TIMEOUT');if(r.done)break;length+=r.value.length;if(length>limit){await reader.cancel();throw Error('BODY_LIMIT');}parts.push(r.value);}}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
const failure=(message:string,status:number)=>Response.json({jsonrpc:'2.0',id:null,error:{code:-32600,message}},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});

/** Fixed verified deployment provider. Browser input can select neither an RPC
 * URL nor a signer. Canonical pins/calldata pass through unchanged; no caching. */
export function createChainRpcHandler(load:()=>Promise<DeploymentManifest>,fetcher:typeof fetch=fetch){
 let active=0,windowAt=0,used=0;
 return async(request:Request)=>{
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site'),url=new URL(request.url);
  const allowedOrigins=(process.env.PUBLIC_APP_URL??url.origin).split(',');
  if(url.search||site==='cross-site'||origin!==null&&!allowedOrigins.includes(origin))return failure('Same-origin RPC request required.',403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return failure('JSON request required.',415);
  const now=Date.now();if(now-windowAt>=60000){windowAt=now;used=0;}
  if(active>=16||used>=600)return failure('RPC read capacity reached. Try again shortly.',429);
  active++;used++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  const signal=AbortSignal.any([request.signal,controller.signal]);
  try{
   if(Number(request.headers.get('content-length'))>BODY_LIMIT)return failure('RPC request is too large.',413);
   const manifest=manifestSchema.parse(await load());
   if(!manifest.verified||manifest.chainId!==5042002) return failure('Verified Arc deployment unavailable.',503);
   const endpoint=new URL(manifest.rpcUrl);
   if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('RPC_CONFIGURATION');
   const body=JSON.parse(await boundedText(request.body,BODY_LIMIT,signal));
   if(!validRequest(body,manifest))return failure('Unsupported RPC read or simulation.',400);
   const upstream=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal,redirect:'error',cache:'no-store'});
   if(!upstream.ok){await upstream.body?.cancel();return failure('Arc RPC is temporarily unavailable. Try again shortly.',503);}
   const value=JSON.parse(await boundedText(upstream.body,RESPONSE_LIMIT,signal));
   if(!object(value)||value.jsonrpc!=='2.0'||value.id!==body.id||Object.hasOwn(value,'result')===Object.hasOwn(value,'error'))throw Error('RPC_RESPONSE');
   return Response.json(value,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return failure('Arc read could not complete. Refresh and try again.',503);}
  finally{clearTimeout(timer);active--;}
 };
}
export const chainRpc=createChainRpcHandler(async()=>{
 const path=process.env.DEPLOYMENT_MANIFEST;if(!path)throw Error('DEPLOYMENT_UNAVAILABLE');
 return manifestSchema.parse(JSON.parse(await readFile(path,'utf8')));
});
