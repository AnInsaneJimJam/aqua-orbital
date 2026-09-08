/** Local development only. No keys, arbitrary endpoint, fork or remote signing. */
export async function connectPersistentAnvil(){
 const rpcUrl='http://127.0.0.1:8545';let id=0,identity;
 async function request(method,params=[]){
  const requestId=++id,response=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('LOCAL_RPC_HTTP');const body=await response.json();
  if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error||!Object.hasOwn(body,'result'))throw Error(`LOCAL_RPC_ERROR_${method}`);
  return body.result;
 }
 async function assertIdentity(){
  const [chain,meta,node,genesis]=await Promise.all([request('eth_chainId'),request('anvil_metadata'),request('anvil_nodeInfo'),request('eth_getBlockByNumber',['0x0',false])]);
  if(chain!=='0x7a69'||meta.clientVersion!=='anvil/v1.5.1'||meta.chainId!==31337||meta.forkedNetwork!==null||node.hardFork?.toLowerCase()!=='cancun'
   ||node.environment?.chainId!==31337||BigInt(node.environment.gasLimit)!==30000000n||!node.forkConfig||Object.values(node.forkConfig).some(v=>v!==null)
   ||!/^0x[0-9a-f]{64}$/i.test(meta.instanceId??'')||!genesis?.hash)throw Error('LOCAL_NODE_IDENTITY');
  if(identity&&(identity.instanceId!==meta.instanceId||identity.genesisHash!==genesis.hash))throw Error('LOCAL_NODE_RESTARTED');
  identity??={chainId:31337,clientVersion:meta.clientVersion,instanceId:meta.instanceId,genesisHash:genesis.hash,rpcUrl,scope:'persistent-local-development'};
  return identity;
 }
 await assertIdentity();
 return {rpcUrl,identity,request,assertIdentity,close:async()=>{},receipt:async hash=>{
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){await assertIdentity();const receipt=await request('eth_getTransactionReceipt',[hash]);if(receipt)return receipt;await new Promise(r=>setTimeout(r,500));}
  throw Error('LOCAL_RECEIPT_TIMEOUT');
 }};
}
