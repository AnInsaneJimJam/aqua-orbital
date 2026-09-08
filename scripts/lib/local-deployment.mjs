import {createRequire} from 'node:module';
import {readVerifiedArtifact} from '../../packages/sdk/scripts/artifact-integrity.mjs';
const {keccak256,toHex}=createRequire(new URL('../../packages/sdk/package.json',import.meta.url))('viem');
const fail=(code,detail='')=>{throw Error(`${code}${detail?`: ${detail}`:''}`);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hex=x=>typeof x==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(x);
const addr=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)&&BigInt(x)!==0n;
export const ROOTS=Object.freeze({
 aqua:'vendor/aqua/src/Aqua.sol:Aqua',router:'src/OrbitalSwapVMRouter.sol:OrbitalSwapVMRouter',
 payments:'src/OrbitalPayments.sol:OrbitalPayments',demo:'src/OrbitalDemoDollar.sol:OrbitalDemoDollar',
 usdc:'test/fixtures/LocalUSDC.sol:LocalUSDC',
});
function identity(fqn){
 if(typeof fqn!=='string'||!/^([A-Za-z0-9_@.$/-]+\.sol):([A-Za-z_$][A-Za-z0-9_$]*)$/.test(fqn))fail('GRAPH_IDENTITY',String(fqn));
 const [source,name]=fqn.split(':');
 if(source.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')))fail('GRAPH_IDENTITY',fqn);
 return {source,name};
}
/** Dependency graph of declared, locally authenticated compiler outputs.
 * readArtifact injection is a pure-test seam; the CLI never accepts a reader. */
export async function buildGraph({contracts,roots=Object.values(ROOTS),readArtifact=readVerifiedArtifact,maxNodes=64}={}){
 if(!Array.isArray(roots)||roots.length<1||roots.length>16||!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>64)fail('GRAPH_LIMIT');
 const states=new Map(),nodes=[],sources=new Map();
 async function visit(fqn){
  if(states.get(fqn)==='visiting')fail('GRAPH_CYCLE',fqn);
  if(states.has(fqn))return;
  if(states.size>=maxNodes)fail('GRAPH_LIMIT');
  const {source,name}=identity(fqn);states.set(fqn,'visiting');
  const data=await readArtifact(contracts,name,source,roots.includes(fqn)?{}:{kind:'library'}),{artifact,integrity}=data;
  if(JSON.stringify(integrity.compilationTarget)!==JSON.stringify({[source]:name}))fail('GRAPH_TARGET_MISMATCH',fqn);
  const creationBytes=(artifact.bytecode.object.length-2)/2,runtimeBytes=(artifact.deployedBytecode.object.length-2)/2;
  if(!Number.isSafeInteger(creationBytes)||creationBytes<1||creationBytes>49152)fail('INITCODE_SIZE',fqn);
  if(!Number.isSafeInteger(runtimeBytes)||runtimeBytes<1||runtimeBytes>24576)fail('RUNTIME_SIZE',fqn);
  for(const item of integrity.sources){
   if(sources.has(item.source)&&sources.get(item.source)!==item.keccak256)fail('SOURCE_CLOSURE_CONFLICT',item.source);
   sources.set(item.source,item.keccak256);
  }
  const dependencies=[...new Set([...integrity.linkReferences.creation,...integrity.linkReferences.runtime].map(ref=>`${ref.source}:${ref.library}`))].sort();
  const placeholderAddresses=new Map(dependencies.map(dep=>[dep,'0x1111111111111111111111111111111111111111']));
  const linkedTemplate=linkObject(artifact.deployedBytecode.object,integrity.linkReferences.runtime,placeholderAddresses);
  verifyRuntime(linkedTemplate,artifact.deployedBytecode.immutableReferences??{},linkedTemplate,linkedTemplate);
  for(const dependency of dependencies)await visit(dependency);
  nodes.push({fqn,...data,dependencies,creationBytes,runtimeBytes});states.set(fqn,'done');
 }
 for(const fqn of [...new Set(roots)].sort())await visit(fqn);
 return {roots:[...new Set(roots)].sort(),nodes,sources:Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b)))};
}
export function linkObject(object,references,addresses){
 if(typeof object!=='string'||!object.startsWith('0x')||(object.length-2)%2||!Array.isArray(references))fail('LINK_OBJECT_INVALID');
 let result=object.slice(2),end=0;
 for(const ref of [...references].sort((a,b)=>a.start-b.start)){
  const fqn=`${ref.source}:${ref.library}`;identity(fqn);
  if(!Number.isSafeInteger(ref.start)||ref.start<end||ref.length!==20||ref.start>result.length/2-20)fail('LINK_SPAN_INVALID');
  const replacement=addresses.get(fqn);if(replacement===undefined)fail('LINK_ADDRESS_MISSING',fqn);if(!addr(replacement))fail('LINK_ADDRESS_INVALID',fqn);
  const placeholder=`__$${keccak256(toHex(fqn)).slice(2,36)}$__`;
  if(result.slice(ref.start*2,(ref.start+20)*2)!==placeholder)fail('LINK_PLACEHOLDER_MISMATCH',fqn);
  result=result.slice(0,ref.start*2)+replacement.slice(2).toLowerCase()+result.slice((ref.start+20)*2);end=ref.start+20;
 }
 if(!hex('0x'+result))fail('LINK_UNRECORDED');return '0x'+result;
}
function immutableSpans(template,references){
 if(!hex(template)||!record(references))fail('IMMUTABLE_REFERENCES_INVALID');
 const spans=[];
 for(const [id,locations]of Object.entries(references)){
  if(!/^(?:[0-9]+|library_deploy_address)$/.test(id)||!Array.isArray(locations)||!locations.length)fail('IMMUTABLE_ID_INVALID');
  for(const ref of locations){
   if(!record(ref)||Object.keys(ref).sort().join(',')!=='length,start'||!Number.isSafeInteger(ref.start)||ref.start<0||ref.length!==32||ref.start>(template.length-2)/2-32)fail('IMMUTABLE_SPAN_INVALID');
   spans.push({id,...ref});
  }
 }
 spans.sort((a,b)=>a.start-b.start);let end=0;
 for(const span of spans){
  if(span.start<end)fail('IMMUTABLE_OVERLAP');end=span.start+32;
  if(template.slice(2+span.start*2,2+end*2)!=='0'.repeat(64))fail('IMMUTABLE_TEMPLATE_NONZERO');
 }
 return spans;
}
/** Exact actual == constructor simulation, plus comparison to the linked
 * compiler runtime outside strictly validated immutable zero spans. */
export function verifyRuntime(template,references,simulated,actual){
 const spans=immutableSpans(template,references);
 if(!hex(simulated)||!hex(actual)||actual.toLowerCase()!==simulated.toLowerCase())fail('RUNTIME_SIMULATION_MISMATCH');
 if(actual.length!==template.length||actual==='0x'||(actual.length-2)/2>24576)fail('RUNTIME_TEMPLATE_MISMATCH');
 let masked=actual.slice(2).toLowerCase();const immutableValues={};
 for(const span of spans){
  const value='0x'+masked.slice(span.start*2,(span.start+32)*2);
  if(immutableValues[span.id]!==undefined&&immutableValues[span.id]!==value)fail('IMMUTABLE_VALUE_MISMATCH');
  immutableValues[span.id]=value;masked=masked.slice(0,span.start*2)+'0'.repeat(64)+masked.slice((span.start+32)*2);
 }
 if('0x'+masked!==template.toLowerCase())fail('RUNTIME_TEMPLATE_MISMATCH');
 return {runtimeBytes:(actual.length-2)/2,runtimeKeccak256:keccak256(actual),immutableValues};
}
export function validateLocalIdentity({rpcUrl,chainId,clientVersion,instanceId,expectedInstanceId,processAlive}){
 let url;try{url=new URL(rpcUrl);}catch{fail('LOCAL_IDENTITY');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||Number(url.port)<1||url.port==='8545'||url.username||url.password||url.pathname!=='/'||url.search||url.hash
  ||chainId!=='0x7a69'||!/^anvil\//i.test(clientVersion??'')||!/^0x[0-9a-f]{64}$/i.test(instanceId??'')||instanceId!==expectedInstanceId||processAlive!==true)fail('LOCAL_IDENTITY');
}
export function parseAction(args){if(!Array.isArray(args)||args.length!==1||!['plan','test-run','persistent'].includes(args[0]))fail('USAGE','node scripts/local-deployment.mjs plan|test-run|persistent');return args[0];}
