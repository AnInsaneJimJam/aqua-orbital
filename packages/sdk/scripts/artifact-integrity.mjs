import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
import {keccak256,toHex} from 'viem';

const sha=value=>createHash('sha256').update(value).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(_key,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const fail=(code,detail)=>{throw Error(`${code}: ${detail}`);};
const identifier=name=>typeof name==='string'&&/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
// The complete effective remappings include Foundry's three vendor mappings.
// Settings changes require an explicit generator update and fresh artifacts.
const expectedSettings={
 evmVersion:'cancun',libraries:{},metadata:{bytecodeHash:'ipfs'},optimizer:{enabled:true,runs:700},viaIR:true,
 remappings:[':@1inch/aqua/=vendor/aqua/',':@1inch/solidity-utils/=node_modules/@1inch/solidity-utils/',':@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/',':aqua/=vendor/aqua/src/',':forge-std/=vendor/forge-std/src/',':swap-vm-orbital/=vendor/swap-vm-orbital/src/',':swap-vm/=vendor/swap-vm/src/'],
};
function sourceIdentity(source){
 // Metadata uses portable source-unit names, never RPC URLs or OS paths.
 // Keep spelling exact for the compiler's fully qualified linker identity.
 if(typeof source!=='string'||!source.endsWith('.sol')||!/^[A-Za-z0-9_@.$/-]+$/.test(source)
  ||source.split('/').some(part=>!part||part==='.'||part==='..'||part.endsWith('.')))fail('SOURCE_IDENTITY_INVALID',String(source));
}
function links(part,label,sources){
 if(!record(part)||typeof part.object!=='string'||!part.object.startsWith('0x')||!record(part.linkReferences))fail('LINK_BYTECODE_INVALID',label);
 const code=part.object.slice(2),spans=[];
 if(code.length%2)fail('LINK_BYTECODE_INVALID',label);
 for(const source of Object.keys(part.linkReferences).sort()){
  sourceIdentity(source);
  if(!Object.hasOwn(sources,source))fail('LINK_SOURCE_MISSING',`${label} ${source}`);
  const libraries=part.linkReferences[source];
  if(!record(libraries)||Object.keys(libraries).length===0)fail('LINK_IDENTITY_INVALID',`${label} ${source}`);
  for(const library of Object.keys(libraries).sort()){
   const locations=libraries[library],fqn=`${source}:${library}`;
   if(!identifier(library)||!Array.isArray(locations)||locations.length===0)fail('LINK_IDENTITY_INVALID',`${label} ${fqn}`);
   const placeholder=`__$${keccak256(toHex(fqn)).slice(2,36)}$__`;
   for(const location of locations){
    if(!record(location)||Object.keys(location).sort().join(',')!=='length,start'||!Number.isSafeInteger(location.start)||location.start<0
     ||location.length!==20||location.start>code.length/2-20)fail('LINK_SPAN_INVALID',`${label} ${fqn}`);
    spans.push({source,library,start:location.start,length:20,placeholder});
   }
  }
 }
 spans.sort((a,b)=>a.start-b.start);
 let end=0;
 for(const span of spans){
  if(span.start<end)fail('LINK_OVERLAP',label);
  if(!/^[0-9a-fA-F]*$/.test(code.slice(end*2,span.start*2)))fail('LINK_UNRECORDED',label);
  if(code.slice(span.start*2,(span.start+20)*2)!==span.placeholder)fail('LINK_PLACEHOLDER_MISMATCH',`${label} ${span.source}:${span.library}`);
  end=span.start+20;
 }
 if(!/^[0-9a-fA-F]*$/.test(code.slice(end*2)))fail('LINK_UNRECORDED',label);
 return spans.map(({placeholder,...span})=>span);
}
function libraryIdentity(artifact,identity){
 const part=artifact.deployedBytecode,refs=part?.immutableReferences??{};
 if(record(refs)&&Object.keys(refs).length===0)return false;
 if(!record(refs)||Object.keys(refs).join(',')!=='library_deploy_address'||!Array.isArray(refs.library_deploy_address)||refs.library_deploy_address.length!==1)fail('LIBRARY_IDENTITY_INVALID',identity);
 const span=refs.library_deploy_address[0];
 if(!record(span)||Object.keys(span).sort().join(',')!=='length,start'||span.length!==32||!Number.isSafeInteger(span.start)||span.start<0
  ||typeof part.object!=='string'||span.start>(part.object.length-2)/2-32||part.object.slice(2+span.start*2,2+(span.start+32)*2)!=='0'.repeat(64))fail('LIBRARY_IDENTITY_INVALID',identity);
 return true;
}
function libraryDeclaration(bytes,name){
 const source=bytes.toString('utf8');let clean='',state='code';
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(state==='line'){if(c==='\n'||c==='\r'){state='code';clean+=' ';}continue;}
  if(state==='block'){if(c==='*'&&next==='/'){state='code';i++;clean+=' ';}continue;}
  if(state==='"'||state==="'"){if(c==='\\'){i++;continue;}if(c===state){state='code';clean+=' ';}continue;}
  if(c==='/'&&next==='/'){state='line';i++;clean+=' ';continue;}
  if(c==='/'&&next==='*'){state='block';i++;clean+=' ';continue;}
  if(c==='"'||c==="'"){state=c;clean+=' ';continue;}
  clean+=c;
 }
 if(state!=='code'&&state!=='line')fail('LIBRARY_SOURCE_IDENTITY',name);
 const tokens=clean.match(/[A-Za-z_$][A-Za-z0-9_$]*|[{}]/g)??[];let depth=0,matches=0;
 for(let i=0;i<tokens.length;i++){
  if(depth===0&&tokens[i]==='library'&&tokens[i+1]===name&&tokens[i+2]==='{')matches++;
  if(depth===0&&(tokens[i]==='contract'||tokens[i]==='interface')&&tokens[i+1]===name)fail('LIBRARY_SOURCE_IDENTITY',name);
  if(tokens[i]==='{')depth++;if(tokens[i]==='}'&&--depth<0)fail('LIBRARY_SOURCE_IDENTITY',name);
 }
 if(depth!==0||matches!==1)fail('LIBRARY_SOURCE_IDENTITY',name);
}
function libraryType(input,identity){
 if(!record(input)||typeof input.type!=='string'||typeof input.internalType!=='string')fail('LIBRARY_ABI_TYPE_UNSUPPORTED',identity);
 const named=/^(struct|contract) ([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)((?:\[[0-9]*\])*)$/.exec(input.internalType);
 if(named){
  if(named[1]==='struct'&&(input.type!==`tuple${named[3]}`||!Array.isArray(input.components)))fail('LIBRARY_ABI_TYPE_UNSUPPORTED',identity);
  if(named[1]==='contract'&&input.type!==`${named[2]}${named[3]}`)fail('LIBRARY_ABI_TYPE_UNSUPPORTED',identity);
  return `${named[2]}${named[3]}`;
 }
 if(!/^(?:address|bool|string|bytes(?:[1-9]|[12][0-9]|3[0-2])?|u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256))(?:\[[0-9]*\])*$/.test(input.type)
  ||input.internalType!==input.type&&!(input.type==='address'&&input.internalType==='address payable'))fail('LIBRARY_ABI_TYPE_UNSUPPORTED',identity);
 return input.type;
}
function libraryMethods(artifact,abi,identity,hasSelfAddress){
 // Library calls use Solidity's internal type names, not regular tuple ABI
 // selectors. Stateful functions and functions with storage parameters/returns
 // are omitted from output.abi (solc v0.8.30 ABI.cpp lines 46-50).
 // This validates the declared map and representable ABI subset; completeness
 // of ABI-omitted methods remains a compiler-output assumption.
 const declared=artifact.methodIdentifiers;
 if(!record(declared)||Object.keys(declared).length>256)fail('METHOD_IDENTIFIERS_MISMATCH',identity);
 for(const [signature,selector]of Object.entries(declared)){
  if(signature.length>8192||!/^[A-Za-z_$][A-Za-z0-9_$]*\([A-Za-z0-9_$.,()[\] =>]*\)$/.test(signature)||!/^[0-9a-f]{8}$/.test(selector)
   ||keccak256(toHex(signature)).slice(2,10)!==selector)fail('METHOD_IDENTIFIERS_MISMATCH',identity);
  let balance=0;for(const char of signature){if(char==='(')balance++;if(char===')'&&--balance<0)fail('METHOD_IDENTIFIERS_MISMATCH',identity);}
  if(balance!==0)fail('METHOD_IDENTIFIERS_MISMATCH',identity);
 }
 const represented=new Set();
 for(const entry of abi.filter(item=>item.type==='function')){
  if(!identifier(entry.name)||!Array.isArray(entry.inputs)||!['pure','view'].includes(entry.stateMutability))fail('ABI_METADATA_MISMATCH',identity);
  const signature=`${entry.name}(${entry.inputs.map(input=>libraryType(input,identity)).join(',')})`;
  if(represented.has(signature)||declared[signature]!==keccak256(toHex(signature)).slice(2,10))fail('METHOD_IDENTIFIERS_MISMATCH',identity);
  represented.add(signature);
 }
 if(!hasSelfAddress&&Object.keys(declared).some(signature=>!represented.has(signature)))fail('LIBRARY_IDENTITY_INVALID',identity);
 return declared;
}
function abiConsistency(artifact,metadata,identity,kind){
 const abi=artifact.abi,compiled=metadata.output?.abi;
 if(!Array.isArray(abi)||!Array.isArray(compiled)||abi.some(item=>!record(item))||compiled.some(item=>!record(item))
  ||JSON.stringify(abi.map(canonical).sort())!==JSON.stringify(compiled.map(canonical).sort()))fail('ABI_METADATA_MISMATCH',identity);
 // Foundry orders top-level ABI entries differently from solc metadata. Only
 // that ordering and JSON object-key order are irrelevant; tuple/argument
 // order, internal types, mutability and event indexing must agree exactly.
 if(kind==='library')return libraryMethods(artifact,abi,identity,libraryIdentity(artifact,identity));
 const type=input=>{
  if(!record(input)||typeof input.type!=='string')fail('ABI_METADATA_MISMATCH',identity);
  if(!input.type.startsWith('tuple'))return input.type;
  if(!/^tuple(?:\[[0-9]*\])*$/.test(input.type)||!Array.isArray(input.components))fail('ABI_METADATA_MISMATCH',identity);
  return `(${input.components.map(type).join(',')})${input.type.slice(5)}`;
 };
 const methods={};
 for(const item of abi.filter(item=>item.type==='function')){
  if(!identifier(item.name)||!Array.isArray(item.inputs))fail('ABI_METADATA_MISMATCH',identity);
  const signature=`${item.name}(${item.inputs.map(type).join(',')})`;
  if(Object.hasOwn(methods,signature))fail('ABI_METADATA_MISMATCH',identity);
  methods[signature]=keccak256(toHex(signature)).slice(2,10);
 }
 if(!record(artifact.methodIdentifiers)||canonical(methods)!==canonical(artifact.methodIdentifiers))fail('METHOD_IDENTIFIERS_MISMATCH',identity);
 return methods;
}

/** Checks local artifact/source consistency, not compiler honesty, deployed
 * runtime identity, authorized signers, or a verified network deployment. */
export async function readVerifiedArtifact(contracts,name,source,options={}){
 if(!record(options)||Object.keys(options).some(key=>key!=='kind')||options.kind!==undefined&&options.kind!=='library')fail('ARTIFACT_MODE_INVALID',String(name));
 sourceIdentity(source);if(!identifier(name))fail('ARTIFACT_IDENTITY_INVALID',String(name));
 let artifactBytes,artifact,metadata;
 try{artifactBytes=await readFile(resolve(contracts,`out/${basename(source)}/${name}.json`));}
 catch{fail('ARTIFACT_UNAVAILABLE',`${source}:${name}`);}
 try{artifact=JSON.parse(artifactBytes);if(!record(artifact)||typeof artifact.rawMetadata!=='string')throw Error();metadata=JSON.parse(artifact.rawMetadata);}
 catch{fail('ARTIFACT_METADATA_INVALID',`${source}:${name}`);}
 if(!record(metadata)||!record(metadata.settings)||metadata.language!=='Solidity'||metadata.version!==1)fail('ARTIFACT_METADATA_INVALID',`${source}:${name}`);
 const {compilationTarget,...settings}=metadata.settings;
 if(canonical(compilationTarget)!==canonical({[source]:name}))fail('COMPILATION_TARGET_MISMATCH',`${source}:${name}`);
 if(canonical(metadata.compiler)!==canonical({version:'0.8.30+commit.73712a01'})||canonical(settings)!==canonical(expectedSettings))fail('COMPILER_CONFIGURATION_MISMATCH',`${source}:${name}`);
 const methodIdentifiers=abiConsistency(artifact,metadata,`${source}:${name}`,options.kind);
 if(!record(metadata.sources)||!Object.hasOwn(metadata.sources,source))fail('SOURCE_METADATA_INVALID',source);
 const sourceNames=Object.keys(metadata.sources).sort();
 for(const path of sourceNames){
  sourceIdentity(path);
  if(!record(metadata.sources[path])||!/^0x[0-9a-fA-F]{64}$/.test(metadata.sources[path].keccak256??''))fail('SOURCE_METADATA_INVALID',path);
 }
 let bytes;
 const sources=await Promise.all(sourceNames.map(async path=>{
  let current;
  // Resolve lexically within contracts. Package-manager symlinks remain valid:
  // the bytes reached through their canonical source-unit paths are hashed.
  try{current=await readFile(resolve(contracts,path));}catch{fail('SOURCE_UNAVAILABLE',path);}
  const hash=keccak256(toHex(current));
  if(hash!==metadata.sources[path].keccak256.toLowerCase())fail('SOURCE_HASH_MISMATCH',`${path}; rebuild ${source}:${name}`);
  if(path===source)bytes=current;
  return {source:path,keccak256:hash,sha256:sha(current)};
 }));
 const linkReferences={creation:links(artifact.bytecode,'creation',metadata.sources),runtime:links(artifact.deployedBytecode,'runtime',metadata.sources)};
 if(options.kind==='library')libraryDeclaration(bytes,name);
 const integrity={compilationTarget,artifactSha256:sha(artifactBytes),metadataSha256:sha(artifact.rawMetadata),
  settings:metadata.settings,settingsSha256:sha(canonical(metadata.settings)),sourceClosureSha256:sha(JSON.stringify(sources)),sources,linkReferences,methodIdentifiers,
  ...(options.kind==='library'?{methodIdentifiersScope:'library-declared-map-and-ABI-representable-subset'}:{})};
 return {artifact,metadata,bytes,artifactBytes,integrity};
}
