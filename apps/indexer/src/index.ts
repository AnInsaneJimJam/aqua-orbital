import {readFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {manifestSchema} from '@orbital/shared';
import {database,atomicBlock} from '@orbital/db';
if(!process.env.DEPLOYMENT_MANIFEST||!process.env.DATABASE_URL)throw Error('DEPLOYMENT_MANIFEST and DATABASE_URL are required. No fixture indexing fallback.');
const manifest=manifestSchema.parse(JSON.parse(await readFile(process.env.DEPLOYMENT_MANIFEST,'utf8')));
if(!manifest.verified)throw Error('Deployment is not verified');
if(process.argv.includes('--replay'))throw Error('Materialization replay is not yet implemented; refusing destructive reset.');
const pool=database(process.env.DATABASE_URL);const rpc=createPublicClient({transport:http(manifest.rpcUrl,{timeout:8000,retryCount:2})});
if(await rpc.getChainId()!==manifest.chainId)throw Error('RPC chain mismatch');
let running=true;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{running=false;});
try{
 while(running){
  const cursor=await pool.query('SELECT height FROM indexer_cursor WHERE chain_id=$1',[manifest.chainId]);
  const next=cursor.rows[0]?BigInt(cursor.rows[0].height)+1n:BigInt(manifest.startBlock);
  const head=await rpc.getBlockNumber();
  if(head>=next+2n){
   const block=await rpc.getBlock({blockNumber:next});
   const logs=await rpc.getLogs({address:[manifest.aqua,manifest.router,manifest.payments] as Address[],fromBlock:next,toBlock:next});
   if(logs.some(l=>l.blockHash!==block.hash))throw Error('RPC mixed block response');
   const canonical=await rpc.getBlock({blockNumber:next});if(canonical.hash!==block.hash)continue;
   await atomicBlock(pool,manifest.chainId,{number:next,hash:block.hash,parentHash:block.parentHash},logs.map(l=>({txHash:l.transactionHash,logIndex:l.logIndex,emitter:l.address,topic:l.topics[0]??'0x',payload:{topics:l.topics,data:l.data}})));
   console.log(JSON.stringify({event:'raw_block_indexed',block:next.toString(),hash:block.hash,logs:logs.length}));
  }else await new Promise(resolve=>setTimeout(resolve,2000));
 }
}finally{await pool.end();}
