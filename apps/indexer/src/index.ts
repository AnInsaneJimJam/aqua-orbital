import {readFile} from 'node:fs/promises';
import {manifestSchema} from '@orbital/shared';
import {database} from '@orbital/db';
import {syncDeploymentOnce} from './materializer.js';
import {createMaterializationRpc} from './rpc.js';
if(!process.env.DEPLOYMENT_MANIFEST||!process.env.DATABASE_URL)throw Error('DEPLOYMENT_MANIFEST and DATABASE_URL are required. No fixture indexing fallback.');
const manifest=manifestSchema.parse(JSON.parse(await readFile(process.env.DEPLOYMENT_MANIFEST,'utf8')));
if(!manifest.verified)throw Error('Deployment is not verified');
if(process.argv.includes('--replay'))throw Error('Full destructive materialization rebuild is not implemented. Bounded canonical reorg rollback/replay runs automatically.');
const pollMs=Number(process.env.INDEXER_POLL_MS??'1000');
if(!Number.isSafeInteger(pollMs)||pollMs<250||pollMs>10000)throw Error('Invalid INDEXER_POLL_MS');
const pool=database(process.env.DATABASE_URL);
const {rpc,close}=createMaterializationRpc(manifest.rpcUrl);
let running=true;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{running=false;close();});
try{
 if(await rpc.getChainId()!==manifest.chainId)throw Error('RPC_CHAIN_MISMATCH');
 while(running){
  const started=Date.now();
  try{
   const result=await syncDeploymentOnce(pool,manifest,rpc);
   if(result.status!=='idle')console.log(JSON.stringify({event:`indexer_${result.status}`,chainId:manifest.chainId,...result,block:result.block?.toString(),elapsedMs:Date.now()-started}));
   if(result.status==='resync_required'){process.exitCode=1;break;}
   if(result.status==='indexed'||result.status==='backfilled'||result.status==='rolled_back')continue;
  }catch(error){
   // Do not log arbitrary provider errors, RPC URLs or connection strings.
   const code=error instanceof Error&&/^[A-Z][A-Z_]+$/.test(error.message)?error.message:'RPC_OR_DATABASE_UNAVAILABLE';
   console.error(JSON.stringify({event:'indexer_error',chainId:manifest.chainId,code,elapsedMs:Date.now()-started}));
  }
  await new Promise(resolve=>setTimeout(resolve,pollMs));
 }
}finally{close();await pool.end();}
