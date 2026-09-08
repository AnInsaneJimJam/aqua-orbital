import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {buildGraph,linkObject,verifyRuntime,ROOTS} from './local-deployment.mjs';
import {startOwnedAnvil} from './local-anvil.mjs';
import {connectPersistentAnvil} from './persistent-anvil.mjs';
const {encodeDeployData,encodeFunctionData,decodeFunctionResult,encodeFunctionResult,getContractAddress,keccak256,hashTypedData,toHex,zeroAddress}=createRequire(new URL('../../packages/sdk/package.json',import.meta.url))('viem');
const root=fileURLToPath(new URL('../../',import.meta.url)),contracts=resolve(root,'packages/contracts');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=x=>JSON.stringify(x,(_key,value)=>typeof value==='bigint'?value.toString():value,2)+'\n';
const eq=(a,b,code)=>{if(typeof a==='string'&&typeof b==='string'&&a.startsWith('0x')&&b.startsWith('0x')?a.toLowerCase()!==b.toLowerCase():json(a)!==json(b))throw Error(code);};
const fail=code=>{throw Error(code);};
const quantity=n=>'0x'+BigInt(n).toString(16);
const sources=['scripts/local-deployment.mjs','scripts/lib/local-deployment.mjs','scripts/lib/local-anvil.mjs','scripts/lib/persistent-anvil.mjs','scripts/lib/local-deployment-runner.mjs','packages/sdk/scripts/artifact-integrity.mjs','packages/contracts/foundry.toml','packages/contracts/remappings.txt','pnpm-lock.yaml'];
async function sourceHashes(){return Object.fromEntries(await Promise.all(sources.map(async p=>[p,sha(await readFile(resolve(root,p)))])));}
async function upstream(graph){
 const bytes=await readFile(resolve(root,'test/evidence/upstream.json')),entry=JSON.parse(bytes).aqua;
 if(entry.url!=='https://github.com/1inch/aqua.git'||entry.revision!=='81c26e4619ce21556ab02b3284ee2685de21fb18')fail('AQUA_PIN_MISMATCH');
 const authenticated={};
 for(const [name,hash]of Object.entries(entry.files)){
  if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('AQUA_PATH_INVALID');
  const path=`vendor/aqua/${name}`,current=sha(await readFile(resolve(contracts,path)));
  if(current!==hash)fail('AQUA_PIN_SOURCE_MISMATCH');authenticated[path]=hash;
 }
 for(const source of Object.keys(graph.sources))if(source.startsWith('vendor/aqua/')&&!Object.hasOwn(authenticated,source))fail('AQUA_SOURCE_UNPINNED');
 return {url:entry.url,revision:entry.revision,acquisitionManifestSha256:sha(bytes),files:authenticated};
}
function serialGraph(graph){return {roots:graph.roots,sources:graph.sources,nodes:graph.nodes.map(n=>({fqn:n.fqn,dependencies:n.dependencies,creationBytes:n.creationBytes,runtimeBytes:n.runtimeBytes,
 abi:n.artifact.abi,creationTemplate:n.artifact.bytecode.object,runtimeTemplate:n.artifact.deployedBytecode.object,immutableReferences:n.artifact.deployedBytecode.immutableReferences??{},integrity:n.integrity}))};}
export async function buildLocalPlan(){
 const graph=await buildGraph({contracts});
 for(const node of graph.nodes){
  if(node.dependencies.some(dep=>graph.roots.includes(dep)))fail('ROOT_LINKED_AS_LIBRARY');
  if(!graph.roots.includes(node.fqn)){
   const keys=Object.keys(node.artifact.deployedBytecode.immutableReferences??{});
   if(keys.length)eq(keys,['library_deploy_address'],'LIBRARY_IMMUTABLES');
   if(node.artifact.abi.some(entry=>entry.type==='constructor'))fail('LIBRARY_CONSTRUCTOR');
  }
 }
 return {graph,upstream:await upstream(graph),sourceHashes:await sourceHashes()};
}
async function samePlan(plan){
 const next=await buildLocalPlan();
 eq(serialGraph(next.graph),serialGraph(plan.graph),'BUILD_CHANGED_DURING_RUN');eq(next.upstream,plan.upstream,'UPSTREAM_CHANGED_DURING_RUN');eq(next.sourceHashes,plan.sourceHashes,'RUNNER_CHANGED_DURING_RUN');
}
/** Verifies receipt and transaction identity against the requested local write. */
export function verifyTransaction({transaction,receipt,block,from,to,data,nonce,predictedAddress}){
 if(receipt.status!=='0x1'||BigInt(receipt.gasUsed??0)<=0n||BigInt(receipt.gasUsed)>30000000n)fail('RECEIPT_STATUS');
 eq(transaction.hash,receipt.transactionHash,'TRANSACTION_HASH');eq(receipt.blockHash,block.hash,'RECEIPT_BLOCK');eq(receipt.blockNumber,block.number,'RECEIPT_BLOCK');
 eq(transaction.blockHash,block.hash,'TRANSACTION_BLOCK');eq(transaction.blockNumber,block.number,'TRANSACTION_BLOCK');
 eq(transaction.from,from,'TRANSACTION_FROM');eq(receipt.from,from,'RECEIPT_FROM');
 if(BigInt(transaction.chainId)!==31337n||BigInt(transaction.nonce)!==nonce)fail('TRANSACTION_CHAIN_NONCE');
 if(BigInt(transaction.value)!==0n)fail('TRANSACTION_VALUE');
 if(BigInt(transaction.gas)>30000000n||BigInt(transaction.gas)<BigInt(receipt.gasUsed))fail('TRANSACTION_GAS');
 eq(transaction.input,data,'TRANSACTION_INPUT');eq(transaction.to,to,'TRANSACTION_TO');eq(receipt.to,to,'RECEIPT_TO');
 eq(receipt.contractAddress,predictedAddress??null,'CREATION_ADDRESS');
 if(!block.transactions.includes(transaction.hash))fail('TRANSACTION_BLOCK_MEMBERSHIP');
}
export async function runLocalDeployment({persistent=false}={}){
 // Authentication completes before starting a node or creating a deployment.
 const plan=await buildLocalPlan();
 if(persistent){
  let existing;try{existing=JSON.parse(await readFile(resolve(root,'deployments/31337/manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){
   if(existing.verified!==true||existing.chainId!==31337||existing.rpcUrl!=='http://127.0.0.1:8545')fail('EXISTING_LOCAL_MANIFEST_INVALID');
   const verification=JSON.parse(await readFile(resolve(root,'deployments/31337/verification.json'),'utf8'));
   const directory=resolve(root,verification.reportPath),report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
   eq(existing,report.manifest,'EXISTING_MANIFEST_CHANGED');eq(serialGraph(plan.graph),report.graph,'DEPLOYED_BUILD_DIFFERS_RETAIN_EXISTING_STATE');
   const local=await connectPersistentAnvil();eq(local.identity.genesisHash,report.chain.genesisHash,'LOCAL_GENESIS_CHANGED');
   const block=await local.request('eth_getBlockByNumber',[quantity(report.asOf.number),false]);eq(block?.hash,report.asOf.hash,'LOCAL_DEPLOYMENT_HISTORY_MISSING');
   for(const contract of report.contracts)eq(await local.request('eth_getCode',[contract.address,'latest']),contract.deployedRuntime,'LOCAL_DEPLOYMENT_CODE_CHANGED');
   await local.assertIdentity();return {directory,report:{...report,status:'existing-local-deployment-verified'}};
  }
 }
 const graph=plan.graph,byFqn=new Map(graph.nodes.map(n=>[n.fqn,n]));
 const directory=resolve(root,'test/evidence/local-deployment',`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`);
 await mkdir(resolve(root,'test/evidence/local-deployment'),{recursive:true});await mkdir(directory);
 const report={schemaVersion:1,status:'running',startedAt:new Date().toISOString(),scope:persistent?'persistent-local-development':'disposable-local-deployment',financialExecutionEnabled:false,
  upstream:plan.upstream,sourceHashes:plan.sourceHashes,graph:serialGraph(graph),contracts:[],receipts:[],assets:[],faucets:[],bindings:{},manifest:{verified:false,chainId:31337},chainStopped:false};
 let local;
 try{
  local=persistent?await connectPersistentAnvil():await startOwnedAnvil();report.chain=local.identity;
  const accounts=await local.request('eth_accounts'),from=accounts[0],faucetCaller=accounts[1];report.deployer=from;report.faucetCaller=faucetCaller;
  const addresses=new Map();
  async function transact(data,to=null){
   await local.assertIdentity();
   const nonce=BigInt(await local.request('eth_getTransactionCount',[from,'pending']));
   const tx={from,data,nonce:quantity(nonce),value:'0x0',gas:'0x1c9c380',...(to?{to}:{})};
   const estimated=BigInt(await local.request('eth_estimateGas',[tx]));
   const gas=estimated+estimated/5n+10000n;if(gas>30000000n)fail('TRANSACTION_GAS_BUDGET');tx.gas=quantity(gas);
   const simulated=await local.request('eth_call',[tx,'latest']);
   if(BigInt(await local.request('eth_getTransactionCount',[from,'pending']))!==nonce)fail('SIMULATION_CHANGED_NONCE');
   const hash=await local.request('eth_sendTransaction',[tx]),receipt=await local.receipt(hash);
   const [transaction,block]=await Promise.all([local.request('eth_getTransactionByHash',[hash]),local.request('eth_getBlockByNumber',[receipt.blockNumber,false])]);
   const predictedAddress=to?null:getContractAddress({from,nonce});
   verifyTransaction({transaction,receipt,block,from,to,data,nonce,predictedAddress});
   report.receipts.push(receipt);return {transaction,receipt,block,simulated,estimatedGas:estimated.toString(),predictedAddress};
  }
  async function deploy(fqn,args=[],label=fqn){
   const node=byFqn.get(fqn);if(!node)fail('DEPLOYMENT_NODE_MISSING');
   const creation=linkObject(node.artifact.bytecode.object,node.integrity.linkReferences.creation,addresses);
   const template=linkObject(node.artifact.deployedBytecode.object,node.integrity.linkReferences.runtime,addresses);
   const data=encodeDeployData({abi:node.artifact.abi,bytecode:creation,args});if((data.length-2)/2>49152)fail('INITCODE_ARGUMENT_SIZE');
   const result=await transact(data),address=result.receipt.contractAddress;
   const actual=await local.request('eth_getCode',[address,{blockHash:result.block.hash,requireCanonical:true}]);
   const runtime=verifyRuntime(template,node.artifact.deployedBytecode.immutableReferences??{},result.simulated,actual);
   if(!graph.roots.includes(fqn)){
    if(Object.keys(runtime.immutableValues).length){
     eq(Object.keys(runtime.immutableValues),['library_deploy_address'],'LIBRARY_IMMUTABLES');
     eq(runtime.immutableValues.library_deploy_address,'0x'+address.slice(2).padStart(64,'0'),'LIBRARY_SELF_ADDRESS');
    }
   }
   const record={label,fqn,address,args,links:Object.fromEntries(node.dependencies.map(dep=>[dep,addresses.get(dep)])),artifactSha256:node.integrity.artifactSha256,
    transaction:result.transaction,receipt:result.receipt,estimatedGas:result.estimatedGas,initcodeKeccak256:keccak256(data),
    simulatedRuntimeKeccak256:keccak256(result.simulated),deployedRuntime:actual,runtime};
   report.contracts.push(record);addresses.set(fqn,address);return record;
  }
  // Dependencies have a deterministic topological order independent of a
  // hard-coded list; future Storage -> Composition -> Endpoint links are read.
  for(const node of graph.nodes)if(!graph.roots.includes(node.fqn))await deploy(node.fqn);
  const aqua=await deploy(ROOTS.aqua),demo6=await deploy(ROOTS.demo,[6],'Orbital demo dollar6'),demo18=await deploy(ROOTS.demo,[18],'Orbital demo dollar18'),usdc=await deploy(ROOTS.usdc,[],'Local USDC fixture');
  report.assets=[{label:demo6.label,address:demo6.address,decimals:6,role:'demo'},{label:demo18.label,address:demo18.address,decimals:18,role:'demo'},{label:usdc.label,address:usdc.address,decimals:6,role:'local-usdc-fixture'}];
  const sorted=[...report.assets].sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
  const router=await deploy(ROOTS.router,[aqua.address,from,sorted.map(t=>t.address),sorted.map(t=>t.decimals)]);
  const payments=await deploy(ROOTS.payments,[usdc.address,router.address,sorted.map(t=>t.address)]);
  const routerAbi=byFqn.get(ROOTS.router).artifact.abi;
  const renunciation=await transact(encodeFunctionData({abi:routerAbi,functionName:'renounceOwnership'}),router.address);report.renunciation=renunciation.receipt;
  // Fund only the public local caller, through each token's fixed faucet.
  for(const asset of report.assets){
   await local.assertIdentity();const node=byFqn.get(asset.role==='demo'?ROOTS.demo:ROOTS.usdc);
   const nonce=BigInt(await local.request('eth_getTransactionCount',[faucetCaller,'pending']));
   const data=encodeFunctionData({abi:node.artifact.abi,functionName:'faucet'}),tx={from:faucetCaller,to:asset.address,data,nonce:quantity(nonce),gas:'0x30d40',value:'0x0'};
   const estimatedGas=await local.request('eth_estimateGas',[tx]);
   const hash=await local.request('eth_sendTransaction',[tx]),receipt=await local.receipt(hash);
   const [transaction,block]=await Promise.all([local.request('eth_getTransactionByHash',[hash]),local.request('eth_getBlockByNumber',[receipt.blockNumber,false])]);
   verifyTransaction({transaction,receipt,block,from:faucetCaller,to:asset.address,data,nonce});report.receipts.push(receipt);
   report.faucets.push({token:asset.address,caller:faucetCaller,receipt,transaction,estimatedGas,amount:(1000n*10n**BigInt(asset.decimals)).toString(),blockTimestamp:BigInt(block.timestamp).toString()});
  }
  const finalBlock=await local.request('eth_getBlockByNumber',['latest',false]);report.asOf={number:BigInt(finalBlock.number).toString(),hash:finalBlock.hash,timestamp:BigInt(finalBlock.timestamp).toString()};
  const pin={blockHash:finalBlock.hash,requireCanonical:true};
  async function read(record,functionName,args=[]){
   const abi=byFqn.get(record.fqn).artifact.abi,data=encodeFunctionData({abi,functionName,args});
   const encoded=await local.request('eth_call',[{from,to:record.address,data},pin]);
   const result=decodeFunctionResult({abi,functionName,data:encoded});
   eq(encodeFunctionResult({abi,functionName,result}),encoded,'GETTER_NONCANONICAL_ENCODING');return result;
  }
  const bindings={aqua:await read(router,'AQUA'),weth:await read(router,'WETH'),chainId:await read(router,'CHAIN_ID'),owner:await read(router,'owner'),domain:await read(router,'eip712Domain')};
  report.bindings.router=bindings;
  eq(bindings.aqua,aqua.address,'ROUTER_AQUA');eq(bindings.weth,zeroAddress,'ROUTER_WETH');eq(bindings.chainId,31337n,'ROUTER_CHAIN');eq(bindings.owner,zeroAddress,'ROUTER_OWNER');
  const expectedDomain=['0x0f','Orbital','1',31337n,router.address,'0x'+'00'.repeat(32),[]];
  if(bindings.domain.length!==expectedDomain.length)fail('ROUTER_DOMAIN');
  for(let i=0;i<expectedDomain.length;i++)eq(bindings.domain[i],expectedDomain[i],'ROUTER_DOMAIN');
  const orderTypes={Order:[{name:'maker',type:'address'},{name:'traits',type:'uint256'},{name:'data',type:'bytes'}]},probe={maker:from,traits:0n,data:'0x0102'};
  bindings.orderTypeHash=await read(router,'ORDER_TYPEHASH');eq(bindings.orderTypeHash,keccak256(toHex('Order(address maker,uint256 traits,bytes data)')),'ORDER_TYPEHASH');
  bindings.domainProbe={order:probe,digest:await read(router,'hash',[probe])};
  eq(bindings.domainProbe.digest,hashTypedData({domain:{name:'Orbital',version:'1',chainId:31337,verifyingContract:router.address},types:orderTypes,primaryType:'Order',message:probe}),'ROUTER_CACHED_DOMAIN');
  const p={usdc:await read(payments,'USDC'),router:await read(payments,'ROUTER')};eq(p.usdc,usdc.address,'PAYMENTS_USDC');eq(p.router,router.address,'PAYMENTS_ROUTER');report.bindings.payments=p;
  for(const asset of report.assets){
   const record=report.contracts.find(c=>c.address===asset.address),faucet=report.faucets.find(f=>f.token===asset.address);
   const observed={decimals:await read(record,'decimals'),chainId:await read(record,'CHAIN_ID'),name:await read(record,'name'),symbol:await read(record,'symbol'),
    amount:await read(record,'FAUCET_AMOUNT'),cooldown:await read(record,'COOLDOWN'),balance:await read(record,'balanceOf',[faucetCaller]),totalSupply:await read(record,'totalSupply'),nextMintAt:await read(record,'nextMintAt',[faucetCaller])};
   eq(observed.decimals,asset.decimals,'TOKEN_DECIMALS');eq(observed.chainId,31337n,'TOKEN_CHAIN');eq(observed.amount,1000n*10n**BigInt(asset.decimals),'TOKEN_FAUCET');eq(observed.cooldown,86400n,'TOKEN_COOLDOWN');
   eq(observed.balance,observed.amount,'TOKEN_BALANCE');eq(observed.totalSupply,observed.amount,'TOKEN_SUPPLY');eq(observed.nextMintAt,BigInt(faucet.blockTimestamp)+86400n,'TOKEN_NEXT_FAUCET');
   eq(observed.name,asset.role==='demo'?`Orbital Demo Dollar ${asset.decimals}`:'Local USDC Fixture','TOKEN_NAME');eq(observed.symbol,asset.role==='demo'?`oUSD${asset.decimals}`:'USDC.fixture','TOKEN_SYMBOL');
   eq(await read(router,'allowedToken',[asset.address]),true,'ROUTER_ALLOWLIST');eq(await read(router,'tokenDecimals',[asset.address]),asset.decimals,'ROUTER_DECIMALS');eq(await read(payments,'allowedToken',[asset.address]),true,'PAYMENTS_ALLOWLIST');
   faucet.balance=observed.balance.toString();asset.observation=observed;
  }
  eq(await read(router,'allowedToken',[zeroAddress]),false,'ROUTER_ZERO_TOKEN');eq(await read(payments,'allowedToken',[zeroAddress]),false,'PAYMENTS_ZERO_TOKEN');
  for(const record of report.contracts){
   const code=await local.request('eth_getCode',[record.address,pin]);eq(code,record.deployedRuntime,'FINAL_RUNTIME_CHANGED');
  }
  for(const receipt of report.receipts){const canonical=await local.request('eth_getBlockByNumber',[receipt.blockNumber,false]);eq(canonical.hash,receipt.blockHash,'RECEIPT_ORPHANED');}
  await local.assertIdentity();eq((await local.request('eth_getBlockByNumber',[finalBlock.number,false])).hash,finalBlock.hash,'FINAL_PIN_CHANGED');
  await samePlan(plan);
  report.manifest={verified:false,chainId:31337,scope:'disposable-local-only',aqua:aqua.address,router:router.address,payments:payments.address,usdc:usdc.address,
   tokens:sorted,asOf:report.asOf,reason:'Evidence candidate; no persistent runtime identity, G1 release, Arc identity or live Privy qualification is established.'};
  report.status='local-verification-passed';
  if(persistent){
   // Runtime verification enables this local development profile only. It does
   // not certify mathematical release acceptance or sponsor qualification.
   report.manifest={verified:true,chainId:31337,rpcUrl:local.rpcUrl,explorerUrl:'http://127.0.0.1:8545',
    aqua:aqua.address,router:router.address,payments:payments.address,usdc:usdc.address,startBlock:BigInt(aqua.receipt.blockNumber).toString(),
    tokens:sorted.map(t=>({address:t.address,decimals:t.decimals,symbol:t.role==='local-usdc-fixture'?'USDC':`oUSD${t.decimals}`,mock:true}))};
   await mkdir(resolve(root,'deployments/31337'),{recursive:true});
   await writeFile(resolve(root,'deployments/31337/manifest.json'),json(report.manifest));
   await writeFile(resolve(root,'deployments/31337/verification.json'),json({verified:true,scope:report.scope,releaseAccepted:false,privyVerified:false,arcVerified:false,
    chain:report.chain,asOf:report.asOf,upstream:report.upstream,reportPath:directory.replace(root,'').replaceAll('\\','/'),contracts:report.contracts.map(c=>({fqn:c.fqn,address:c.address,runtime:c.runtime,transactionHash:c.receipt.transactionHash})),
    limitations:['Local demo assets only','Numerical/release obligations remain open','No Arc or hosted-wallet receipt claim']}));
  }
 }catch(error){report.status='local-verification-failed';report.error=error instanceof Error?error.message:'LOCAL_RUN_FAILED';throw error;}
 finally{
  if(local)await local.close();report.chainStopped=!persistent;report.finishedAt=new Date().toISOString();
  await writeFile(resolve(directory,'report.json'),json(report),{flag:'wx'});
  await writeFile(resolve(directory,'manifest.candidate.json'),json(report.manifest),{flag:'wx'});
 }
 return {report:JSON.parse(json(report)),directory};
}
