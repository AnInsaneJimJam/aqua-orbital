import type {MaterializationRpc} from './materializer.js';
import type {Hex} from 'viem';
const RESPONSE_LIMIT=2*1024*1024;
class RetryTransport extends Error{}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RPC_INVALID_RESPONSE');return value as Record<string,unknown>;};
const text=(value:unknown)=>{if(typeof value!=='string')throw Error('RPC_INVALID_RESPONSE');return value;};
const quantity=(value:unknown)=>{const v=text(value);if(!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))throw Error('RPC_INVALID_RESPONSE');return BigInt(v);};
const safeNumber=(value:unknown)=>{const n=quantity(value);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('RPC_INVALID_RESPONSE');return Number(n);};
function parseLogs(logs:unknown){
 if(!Array.isArray(logs))throw Error('RPC_INVALID_RESPONSE');
 return logs.map(value=>{const log=object(value);if(!Array.isArray(log.topics)||typeof log.removed!=='boolean')throw Error('RPC_INVALID_RESPONSE');return {blockNumber:quantity(log.blockNumber),blockHash:text(log.blockHash),transactionHash:text(log.transactionHash),transactionIndex:safeNumber(log.transactionIndex),logIndex:safeNumber(log.logIndex),address:text(log.address),topics:log.topics.map(text),data:text(log.data),removed:log.removed};});
}

/** Explicit operator-selected read transport; never an automatic fallback or
 * replacement for the verified deployment's chain/address/source identity. */
export function indexerRpcUrl(manifestUrl:string,override?:string):string{
 if(override===undefined)return manifestUrl;
 try{
  const url=new URL(override);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();
  return url.href.replace(/\/$/,'');
 }catch{throw Error('INVALID_INDEXER_RPC_URL');}
}

/** Read-only RPC, fixed eight-second end-to-end request deadline, <=8 requests.
 * Only transport failures retry (250/750 ms), never application/RPC errors.
 * The URL comes from the server's verified manifest, never an HTTP user input.
 */
export function createMaterializationRpc(url:string,fetcher:typeof fetch=fetch,timeoutMs=8000):{rpc:MaterializationRpc;close:()=>void}{
 if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>8000)throw Error('INVALID_RPC_TIMEOUT');
 const endpoint=new URL(url);if(!['http:','https:'].includes(endpoint.protocol))throw Error('INVALID_RPC_URL');
 const shutdown=new AbortController();let active=0,sequence=0;
 async function request(method:string,params:unknown[]):Promise<unknown>{
  if(shutdown.signal.aborted)throw Error('RPC_CLOSED');
  if(active>=8)throw Error('RPC_CAPACITY');active++;
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),timeoutMs);
  const signal=AbortSignal.any([shutdown.signal,deadline.signal]);const id=++sequence;
  try{
   for(let attempt=0;attempt<3;attempt++){
    try{
     if(signal.aborted)throw Error('RPC_TIMEOUT');
     const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal});
     if(response.status===429||response.status>=500){await response.body?.cancel();throw new RetryTransport();}
     if(!response.ok){await response.body?.cancel();throw Error('RPC_HTTP_REJECTED');}
     if(Number(response.headers.get('content-length'))>RESPONSE_LIMIT){await response.body?.cancel();throw Error('RPC_RESPONSE_LIMIT');}
     const reader=response.body?.getReader();if(!reader)throw Error('RPC_INVALID_RESPONSE');
     const chunks:Uint8Array[]=[];let size=0;
     try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>RESPONSE_LIMIT){await reader.cancel();throw Error('RPC_RESPONSE_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
     const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     let parsed:Record<string,unknown>;try{parsed=object(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw Error('RPC_INVALID_RESPONSE');}
     if(parsed.jsonrpc!=='2.0'||parsed.id!==id)throw Error('RPC_INVALID_RESPONSE');
     if(parsed.error!==undefined)throw Error('RPC_REQUEST_REJECTED');
     if(!Object.hasOwn(parsed,'result'))throw Error('RPC_INVALID_RESPONSE');return parsed.result;
    }catch(error){
     if(signal.aborted)throw Error(shutdown.signal.aborted?'RPC_CLOSED':'RPC_TIMEOUT');
     if(!(error instanceof TypeError||error instanceof RetryTransport)||attempt===2)throw error instanceof TypeError||error instanceof RetryTransport?Error('RPC_TRANSPORT_UNAVAILABLE'):error;
     await new Promise<void>((resolve,reject)=>{const delay=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},attempt===0?250:750);function abort(){clearTimeout(delay);reject(Error(shutdown.signal.aborted?'RPC_CLOSED':'RPC_TIMEOUT'));}signal.addEventListener('abort',abort,{once:true});});
    }
   }
   throw Error('RPC_TRANSPORT_UNAVAILABLE');
  }finally{clearTimeout(timer);active--;}
 }
 const rpc:MaterializationRpc={
  async getChainId(){return safeNumber(await request('eth_chainId',[]));},
  async getBlockNumber(){return quantity(await request('eth_blockNumber',[]));},
  async getBlock(number){const block=object(await request('eth_getBlockByNumber',[`0x${number.toString(16)}`,false]));if(!Array.isArray(block.transactions))throw Error('RPC_INVALID_RESPONSE');return {number:quantity(block.number),hash:text(block.hash),parentHash:text(block.parentHash),transactions:block.transactions.map(text)};},
  async getLogs(_number,emitters,blockHash){
   if(!/^0x[0-9a-fA-F]{64}$/.test(blockHash))throw Error('RPC_BLOCK_HASH_REQUIRED');
   return parseLogs(await request('eth_getLogs',[{address:[...emitters],blockHash}]));
  },
  async getLogsRange(from,to,emitters){
   if(from<0n||to<from||to-from>=64n||to>=(1n<<256n))throw Error('INVALID_BLOCK_BATCH');
   return parseLogs(await request('eth_getLogs',[{address:[...emitters],fromBlock:`0x${from.toString(16)}`,toBlock:`0x${to.toString(16)}`} ]));
  },
  async call(call,block){const result=text(await request('eth_call',[call,block]));if(!/^0x(?:[0-9a-fA-F]{2})*$/.test(result))throw Error('RPC_INVALID_RESPONSE');return result as Hex;},
 };
 return {rpc,close:()=>shutdown.abort()};
}
