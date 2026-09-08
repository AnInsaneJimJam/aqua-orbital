// Local Docker service only. Atomic snapshots contain public development-chain data.
import {open,rename} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const url='http://anvil:8545',path='/data/state.json';
let id=0,closing=false,wake,instance;
async function rpc(method,params=[]){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok||body.error)throw Error('Local snapshot RPC unavailable');return body.result;
}
async function snapshot(){
 const identity=await rpc('anvil_metadata');
 if(identity.clientVersion!=='anvil/v1.5.1'||identity.chainId!==31337||identity.forkedNetwork!==null||instance&&identity.instanceId!==instance)throw Error('Local snapshot node identity changed');
 instance??=identity.instanceId;
 // Snapshot serialization of 128 historical states can span a mining interval.
 // Pause this owned local node while taking a consistent copy; submitted user
 // transactions stay queued and ordinary three-second mining resumes afterward.
 try{
 await rpc('anvil_setIntervalMining',[0]);
 const before=await rpc('anvil_metadata');
 const encoded=await rpc('anvil_dumpState',[true]),after=await rpc('anvil_metadata');
 if(before.instanceId!==after.instanceId||before.latestBlockHash!==after.latestBlockHash)throw Error('Chain advanced during snapshot; retrying');
 if(typeof encoded!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(encoded))throw Error('Invalid local snapshot');
 let bytes=gunzipSync(Buffer.from(encoded.slice(2),'hex'));const state=JSON.parse(bytes.toString('utf8'));
 if(!state.accounts||!Array.isArray(state.blocks)||!Array.isArray(state.transactions)||BigInt(state.best_block_number)!==BigInt(after.latestBlockNumber))throw Error('Incomplete local snapshot');
 // The pinned node serializes its hash-keyed block map, including old startup
 // genesis blocks and orphan headers. Loading duplicates can arbitrarily change
 // the number-to-hash map. Retain one canonical header per height before saving.
 const groups=new Map(),canonicalHashes=new Map();
 for(const block of state.blocks){const number=BigInt(block.header.number);if(number>BigInt(state.best_block_number))continue;const key=number.toString();groups.set(key,[...(groups.get(key)??[]),block]);}
 const blocks=[];
 for(const [number,candidates] of groups){
  if(candidates.length===1){blocks.push(candidates[0]);continue;}
  let canonical;
  if(number==='0'&&BigInt(state.best_block_number)>0n){const first=await rpc('eth_getBlockByNumber',['0x1',false]);canonical=await rpc('eth_getBlockByHash',[first.parentHash,false]);}
  else canonical=await rpc('eth_getBlockByNumber',['0x'+BigInt(number).toString(16),false]);
  const matches=candidates.filter(b=>Object.entries(b.header).every(([key,value])=>JSON.stringify(value)===JSON.stringify(canonical?.[key])));
  if(matches.length!==1)throw Error('Cannot authenticate a unique canonical snapshot header');
  blocks.push(matches[0]);canonicalHashes.set(number,canonical.hash);
 }
 state.blocks=blocks;
 state.transactions=state.transactions.filter(tx=>BigInt(tx.block_number)<=BigInt(state.best_block_number)&&(!canonicalHashes.has(String(tx.block_number))||canonicalHashes.get(String(tx.block_number))===tx.block_hash));
 bytes=Buffer.from(JSON.stringify(state));
 const file=await open(path+'.tmp','w',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 await rename(path+'.tmp',path);
 const directory=await open('/data','r');try{await directory.sync();}finally{await directory.close();}
 console.log(`Local snapshot saved at block ${after.latestBlockNumber} (${bytes.length} bytes)`);
 }finally{await rpc('anvil_setIntervalMining',[3]);}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{closing=true;wake?.();});
do{
 try{await snapshot();}catch(error){console.error(error.message);}
 if(!closing)await new Promise(resolve=>{const timer=setTimeout(resolve,30000);wake=()=>{clearTimeout(timer);resolve();};});
}while(!closing);
try{await snapshot();}catch(error){console.error(`Final snapshot failed: ${error.message}`);process.exitCode=1;}
