// Manual bounded diagnostic. Reads the actual Arc deployment, but all indexing
// writes go into a fresh isolated test schema which is removed on completion.
import {readFile,writeFile} from 'node:fs/promises';
import {isolatedDatabase} from '../../../packages/db/test/helpers.ts';
import {syncDeploymentOnce} from '../src/materializer.ts';
import {createMaterializationRpc} from '../src/rpc.ts';
if(process.env.INDEXER_PROFILE_LIVE!=='1')throw Error('Set INDEXER_PROFILE_LIVE=1 for the explicitly requested bounded live read diagnostic.');
const maxBlocks=Number(process.env.INDEXER_PROFILE_BLOCKS??'64');
if(![16,64].includes(maxBlocks))throw Error('Profile requires exactly 16 or 64 blocks');
const manifest=JSON.parse(await readFile(new URL('../../../deployments/5042002/manifest.json',import.meta.url),'utf8'));
if(manifest.chainId!==5042002||!manifest.verified)throw Error('Verified Arc manifest required');
const url='https://rpc.blockdaemon.testnet.arc.io',events=[];
const db=await isolatedDatabase();let start=performance.now();
const instrumented=new WeakSet();
function instrument(client){
 if(instrumented.has(client))return;instrumented.add(client);const original=client.query;
 client.query=function(...args){const at=performance.now();let saved=false;const done=()=>{if(!saved){saved=true;events.push({kind:'sql',name:String(args[0]).match(/^\s*\w+/)?.[0].trim()??'query',atMs:at-start,ms:performance.now()-at});}};
  const last=args.length-1;if(typeof args[last]==='function'){const callback=args[last];args[last]=(...values)=>{done();return callback(...values);};}
  try{const result=Reflect.apply(original,this,args);if(result?.then)return result.finally(done);return result;}catch(error){done();throw error;}
 };
}
db.pool.on('connect',instrument);const client=await db.pool.connect();instrument(client);client.release();
const transport=createMaterializationRpc(url);
const rpc=Object.fromEntries(Object.entries(transport.rpc).map(([name,read])=>[name,async(...args)=>{const at=performance.now();try{return await read(...args);}finally{events.push({kind:'rpc',name,atMs:at-start,ms:performance.now()-at});}}]));
try{
 start=performance.now();const result=await syncDeploymentOnce(db.pool,manifest,rpc,{maxBlocks});const ms=performance.now()-start;
 const groups={};for(const e of events){const k=e.kind+':'+e.name;const g=groups[k]??={count:0,totalMs:0,maxMs:0};g.count++;g.totalMs+=e.ms;g.maxMs=Math.max(g.maxMs,e.ms);}
 const report={observedAt:new Date().toISOString(),scope:'actual-Arc-RPC-isolated-PostgreSQL-profile',maxBlocks,rpcUrl:url,startBlock:manifest.startBlock,result:{...result,block:result.block?.toString()},elapsedMs:ms,groups,events};
 await writeFile(new URL(`./profile-live-${maxBlocks}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,events:undefined},null,2));
}finally{transport.close();await db.close();}
