/** Bounded pure-engine differential observations on an owned disposable chain.
 * No application deployment, persisted financial state, signer input or RPC override. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildGraph,linkObject,verifyRuntime} from '../../../scripts/lib/local-deployment.mjs';
import {startOwnedAnvil} from '../../../scripts/lib/local-anvil.mjs';
import {verifyTransaction} from '../../../scripts/lib/local-deployment-runner.mjs';
import {validateObservation} from './validate.mjs';
const {encodeDeployData,encodeFunctionData,decodeFunctionResult,encodeFunctionResult,getContractAddress}=createRequire(new URL('../../../packages/sdk/package.json',import.meta.url))('viem');
const root=fileURLToPath(new URL('../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url)),contracts=resolve(root,'packages/contracts');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=x=>JSON.stringify(x,(_key,value)=>typeof value==='bigint'?value.toString():value,2)+'\n';
const qty=n=>'0x'+BigInt(n).toString(16);
const target='test/fixtures/MixedPilotHarness.sol:MixedPilotHarness';
const sources=['test/evidence/mixed-pilot/observe.mjs','test/evidence/mixed-pilot/validate.mjs',
 'test/evidence/mixed-pilot/generation.json','packages/reference/fixtures/mixed-pilot.json',
 'scripts/lib/local-anvil.mjs','scripts/lib/local-deployment.mjs','scripts/lib/local-deployment-runner.mjs',
 'packages/sdk/scripts/artifact-integrity.mjs','packages/contracts/foundry.toml','packages/contracts/remappings.txt','pnpm-lock.yaml'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,sha(await readFile(resolve(root,path)))])));
const serialGraph=graph=>({roots:graph.roots,sources:graph.sources,nodes:graph.nodes.map(n=>({fqn:n.fqn,dependencies:n.dependencies,
 creationBytes:n.creationBytes,runtimeBytes:n.runtimeBytes,integrity:n.integrity,abi:n.artifact.abi,
 creationTemplate:n.artifact.bytecode.object,runtimeTemplate:n.artifact.deployedBytecode.object,
 immutableReferences:n.artifact.deployedBytecode.immutableReferences??{}}))});

if(process.argv.length!==2)throw Error('USAGE: node test/evidence/mixed-pilot/observe.mjs');
const initialHashes=await sourceHashes(),generation=JSON.parse(await readFile(resolve(here,'generation.json'),'utf8'));
assert.equal(generation.exit_status,0);assert.deepEqual(generation.changed_inputs,[]);
for(const [path,digest] of Object.entries(generation.inputs))assert.equal(sha(await readFile(resolve(root,path))),digest,`generator input changed: ${path}`);
const fixtureBytes=await readFile(resolve(root,'packages/reference/fixtures/mixed-pilot.json'));
assert.equal(sha(fixtureBytes),generation.output.sha256);
const fixtures=JSON.parse(fixtureBytes);assert.equal(fixtures.configurations.length,32);
assert.equal(generation.output.generated,128,'incomplete oracle corpus cannot establish full pilot coverage');
const graph=await buildGraph({contracts,roots:[target]});
const report={schemaVersion:1,status:'running',scope:'128 pure I-to-C mathematical observations; not Aqua swaps, transactions or release acceptance',
 startedAt:new Date().toISOString(),sourceHashes:initialHashes,graph:serialGraph(graph),deployments:[],observations:[],chainStopped:false};
let local;
try{
 local=await startOwnedAnvil();report.chain=local.identity;
 const [sender]=await local.request('eth_accounts'),addresses=new Map();
 for(const node of graph.nodes){
  assert(!node.dependencies.some(d=>graph.roots.includes(d)));
  await local.assertIdentity();
  const nonce=BigInt(await local.request('eth_getTransactionCount',[sender,'pending']));
  const creation=linkObject(node.artifact.bytecode.object,node.integrity.linkReferences.creation,addresses);
  const template=linkObject(node.artifact.deployedBytecode.object,node.integrity.linkReferences.runtime,addresses);
  const data=encodeDeployData({abi:node.artifact.abi,bytecode:creation,args:[]});assert((data.length-2)/2<=49152);
  const tx={from:sender,data,nonce:qty(nonce),value:'0x0',gas:qty(30_000_000)};
  const simulated=await local.request('eth_call',[tx,'latest']);
  assert.equal(BigInt(await local.request('eth_getTransactionCount',[sender,'pending'])),nonce);
  const hash=await local.request('eth_sendTransaction',[tx]),receipt=await local.receipt(hash);
  const [transaction,block]=await Promise.all([local.request('eth_getTransactionByHash',[hash]),local.request('eth_getBlockByNumber',[receipt.blockNumber,false])]);
  verifyTransaction({transaction,receipt,block,from:sender,to:null,data,nonce,predictedAddress:getContractAddress({from:sender,nonce})});
  const code=await local.request('eth_getCode',[receipt.contractAddress,{blockHash:block.hash,requireCanonical:true}]);
  const runtime=verifyRuntime(template,node.artifact.deployedBytecode.immutableReferences??{},simulated,code);
  if(!graph.roots.includes(node.fqn)&&Object.keys(runtime.immutableValues).length){
   assert.deepEqual(Object.keys(runtime.immutableValues),['library_deploy_address']);
   assert.equal(runtime.immutableValues.library_deploy_address.toLowerCase(),'0x'+receipt.contractAddress.slice(2).toLowerCase().padStart(64,'0'));
  }
  addresses.set(node.fqn,receipt.contractAddress);report.deployments.push({fqn:node.fqn,address:receipt.contractAddress,runtime,code,transaction,receipt,block});
 }
 const node=graph.nodes.find(n=>n.fqn===target),abi=node.artifact.abi,address=addresses.get(target);
 const block=await local.request('eth_getBlockByNumber',['latest',false]),pin={blockHash:block.hash,requireCanonical:true};report.pin={height:block.number,hash:block.hash};
 for(const configuration of fixtures.configurations){
  let contiguous=true;
  for(const action of configuration.actions){
   assert.equal(action.status,'generated');const w=action.witness;
   const input={x:w.start.map(BigInt),keys:configuration.initial.keys.map(BigInt),radii:w.radii.map(BigInt),decimals:w.decimals,
    input:w.input,output:w.output,netInputRaw:BigInt(w.raw_net_input),maxCrossings:16};
   const data=encodeFunctionData({abi,functionName:'observe',args:[input]});
   const bytes=await local.request('eth_call',[{from:sender,to:address,data,value:'0x0',gas:qty(30_000_000)},pin]);
   const result=decodeFunctionResult({abi,functionName:'observe',data:bytes});
   assert.equal(encodeFunctionResult({abi,functionName:'observe',result}).toLowerCase(),bytes.toLowerCase());
   let validation;
   try{validation=validateObservation(w,result);}catch(error){validation={classification:'accepted-result-mismatch',accepted:false,error:error.message};}
   const observation={id:w.id,dimension:w.dimension,ticks:w.keys.length,step:action.step,fromContiguousInitializedHistory:contiguous,
    request:input,result,validation};
   report.observations.push(observation);contiguous&&=validation.accepted;
   console.log(`${w.id}: ${validation.classification}; inner diagnostic gas ${result.innerCallGas}`);
  }
 }
 await local.assertIdentity();
 assert.equal((await local.request('eth_getBlockByNumber',[block.number,false])).hash,block.hash);
 assert.equal(await local.request('eth_blockNumber'),block.number,'observation calls must not mine');
 for(const deployed of report.deployments){
  assert.equal(await local.request('eth_getCode',[deployed.address,pin]),deployed.code);
  assert.equal((await local.request('eth_getBlockByNumber',[deployed.receipt.blockNumber,false])).hash,deployed.receipt.blockHash);
 }
 assert.deepEqual(await sourceHashes(),initialHashes,'runner/oracle changed');
 assert.deepEqual(serialGraph(await buildGraph({contracts,roots:[target]})),report.graph,'source/artifact graph changed');
 const counts={};for(const o of report.observations)counts[o.validation.classification]=(counts[o.validation.classification]??0)+1;
 report.counts=counts;report.observed=report.observations.length;
 report.accepted=report.observations.filter(o=>o.validation.accepted).length;
 report.contiguousAcceptedActions=report.observations.filter(o=>o.validation.accepted&&o.fromContiguousInitializedHistory).length;
 report.completeHistories=report.observations.filter(o=>o.step===3&&o.validation.accepted&&o.fromContiguousInitializedHistory).length;
 report.acceptedTransitions=report.observations.filter(o=>o.validation.accepted&&o.result.mixed).flatMap(o=>o.result.composition.transitions)
  .reduce((c,t)=>{c[t.initialRelease?'initialRelease':t.finalRetention?'finalRetention':t.inward?'frontierInward':'frontierOutward']++;return c;},{initialRelease:0,finalRetention:0,frontierInward:0,frontierOutward:0});
 report.status=counts['accepted-result-mismatch']?'soundness-check-failed':report.accepted===128?'bounded-pilot-passed':'liveness-deferrals-observed';
}catch(error){report.status='runner-failed';report.error=error.message;process.exitCode=1;}
finally{
 if(local){await local.close();report.chainStopped=true;}
 report.completedAt=new Date().toISOString();await writeFile(resolve(here,'observations.json'),json(report));
 console.log(json({status:report.status,observed:report.observed,accepted:report.accepted,counts:report.counts,chainStopped:report.chainStopped,error:report.error}));
 if(report.status==='soundness-check-failed')process.exitCode=1;
}
