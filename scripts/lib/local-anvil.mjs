import {spawn,execFile} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rmdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,delimiter,join} from 'node:path';
import {promisify} from 'node:util';
import {createHash,randomInt} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {validateLocalIdentity} from './local-deployment.mjs';
const fail=code=>{throw Error(code);};
async function executable(){
 const path=Object.entries(process.env).find(([k])=>k.toUpperCase()==='PATH')?.[1]??'';
 for(const directory of path.split(delimiter)){
  if(!directory)continue;const candidate=resolve(directory,process.platform==='win32'?'anvil.exe':'anvil');
  try{await access(candidate);return candidate;}catch{}
 }
 fail('ANVIL_UNAVAILABLE');
}
async function freePort(){
 const server=createServer();server.unref();
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
 const {port}=server.address();await new Promise((yes,no)=>server.close(error=>error?no(error):yes()));
 if(port===8545) return freePort();return port;
}
/** Creates the only RPC target this module can use. No attach, fork, key or
 * address option exists. The private development mnemonic stays inside Anvil. */
export async function startOwnedAnvil(){
 const binary=await executable(),binarySha256=createHash('sha256').update(await readFile(binary)).digest('hex');
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','PATHEXT','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','USERPROFILE'].includes(key.toUpperCase())));
 const {stdout:version}=await promisify(execFile)(binary,['--version'],{windowsHide:true,env:environment,timeout:5000,maxBuffer:8192});
 if(!/^anvil Version:/m.test(version))fail('ANVIL_BINARY_IDENTITY');
 const port=await freePort(),rpcUrl=`http://127.0.0.1:${port}`,directory=await mkdtemp(join(tmpdir(),'orbital-owned-anvil-'));
 const baseFee=1000000000+randomInt(1000000000),timestamp=Math.floor(Date.now()/1000);
 const args=['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--gas-limit','30000000','--accounts','3','--mnemonic-random','--block-base-fee-per-gas',String(baseFee),'--timestamp',String(timestamp),'--quiet'];
 const child=spawn(binary,args,{cwd:directory,env:environment,windowsHide:true,stdio:'ignore'});
 let stopped=false,spawnError=false,id=0;const runDeadline=performance.now()+300000;
 child.on('error',()=>{spawnError=true;});
 const alive=()=>!stopped&&!spawnError&&child.exitCode===null&&child.signalCode===null;
 const exited=new Promise(resolve=>child.once('exit',resolve));
 async function close(){
  if(stopped)return;stopped=true;
  if(!spawnError&&child.exitCode===null&&child.signalCode===null){
   child.kill();await Promise.race([exited,delay(3000,undefined,{ref:false})]);
   if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([exited,delay(3000,undefined,{ref:false})]);}
   if(child.exitCode===null&&child.signalCode===null)fail('LOCAL_PROCESS_SHUTDOWN_FAILED');
  }
  // Remove only this empty mkdtemp directory; never recursively delete state.
  try{await rmdir(directory);}catch{}
 }
 const abort=()=>{void close();};process.once('SIGINT',abort);process.once('SIGTERM',abort);
 const cleanClose=async()=>{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);await close();};
 async function request(method,params=[]){
  if(!alive())fail('LOCAL_PROCESS_STOPPED');
  if(performance.now()>=runDeadline)fail('LOCAL_RUN_DEADLINE');
  const requestId=++id;
  const timeout=Math.max(1,Math.floor(Math.min(15000,runDeadline-performance.now())));
  const response=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)fail('LOCAL_RPC_HTTP');
  const reader=response.body?.getReader();if(!reader)fail('LOCAL_RPC_BODY');let length=0;const bytes=new Uint8Array(8*1024*1024),deadline=Math.min(performance.now()+timeout,runDeadline);
  try{for(;;){const {done,value}=await reader.read();if(performance.now()>deadline)fail('LOCAL_RPC_BODY_DEADLINE');if(done)break;if(length+value.byteLength>bytes.length)fail('LOCAL_RPC_BODY_LIMIT');bytes.set(value,length);length+=value.byteLength;}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  let body;try{body=JSON.parse(Buffer.from(bytes.buffer,0,length).toString('utf8'));}catch{fail('LOCAL_RPC_JSON');}
  if(!alive())fail('LOCAL_PROCESS_STOPPED');
  if(body?.jsonrpc!=='2.0'||body.id!==requestId||!Object.hasOwn(body,'result')||Object.hasOwn(body,'error'))fail(`LOCAL_RPC_ERROR_${method}`);
  return body.result;
 }
 let identity;
 async function assertIdentity(){
  if(!alive())fail('LOCAL_PROCESS_STOPPED');
  const [chainId,clientVersion,metadata,node]=await Promise.all([request('eth_chainId'),request('web3_clientVersion'),request('anvil_metadata'),request('anvil_nodeInfo')]);
  const observed={rpcUrl,chainId,clientVersion,instanceId:metadata.instanceId,expectedInstanceId:identity?.instanceId??metadata.instanceId,processAlive:alive()};
  validateLocalIdentity(observed);
  if(Number(metadata.chainId)!==31337||metadata.clientVersion!==clientVersion||metadata.forkedNetwork!==null||node.environment?.chainId!==31337||node.hardFork?.toLowerCase()!=='cancun'
   ||!node.forkConfig||Object.values(node.forkConfig).some(value=>value!==null)||BigInt(node.environment.gasLimit)!==30000000n)fail('LOCAL_NODE_CONFIGURATION');
  const genesis=await request('eth_getBlockByNumber',['0x0',false]);
  if(BigInt(genesis.baseFeePerGas)!==BigInt(baseFee)||BigInt(genesis.timestamp)!==BigInt(timestamp)||identity&&genesis.hash!==identity.genesisHash)fail('LOCAL_GENESIS_IDENTITY');
  if(!identity)identity={chainId,clientVersion,instanceId:metadata.instanceId,hardfork:node.hardFork,genesisHash:genesis.hash,genesisBaseFee:String(baseFee),genesisTimestamp:timestamp,binarySha256,binaryVersion:version.trim(),ownedPid:child.pid,port};
  return identity;
 }
 try{
  const started=performance.now();let lastError;
  while(performance.now()-started<15000){
   if(!alive())fail('ANVIL_START_FAILED');
   try{await assertIdentity();break;}catch(error){lastError=error;await delay(50);}
  }
  if(!identity)throw lastError??Error('ANVIL_START_TIMEOUT');
  const block=await request('eth_getBlockByNumber',['latest',false]);
  if(block.number!=='0x0')fail('LOCAL_NOT_FRESH');
  const accounts=await request('eth_accounts');if(!Array.isArray(accounts)||accounts.length!==3)fail('LOCAL_ACCOUNTS');
  for(const account of accounts)if(await request('eth_getTransactionCount',[account,'latest'])!=='0x0')fail('LOCAL_NOT_FRESH');
  return {rpcUrl,identity,request,assertIdentity,close:cleanClose,receipt:async hash=>{
   if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('LOCAL_TRANSACTION_HASH');
   const started=performance.now();
   while(performance.now()-started<15000){const receipt=await request('eth_getTransactionReceipt',[hash]);if(receipt)return receipt;await delay(25);}
   fail('LOCAL_RECEIPT_TIMEOUT');
  }};
 }catch(error){await cleanClose();throw error;}
}
