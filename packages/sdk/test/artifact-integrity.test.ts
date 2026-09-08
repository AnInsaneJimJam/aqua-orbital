import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {keccak256, toHex} from 'viem';

const {readVerifiedArtifact} = await import(new URL('../scripts/artifact-integrity.mjs', import.meta.url).href);
const source='src/Widget.sol',dependency='node_modules/core/Leaf.sol',library='Leaf';
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');

// Synthetic compiler-shaped fixture, not a compiled or deployed contract.
// Changing its on-disk dependency must invalidate its recorded source closure.
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'orbital-artifact-integrity-'));
 const sources:Record<string,string>={
  [source]:'pragma solidity 0.8.30; import {Leaf} from "../node_modules/core/Leaf.sol"; contract Widget {}\n',
  [dependency]:'pragma solidity 0.8.30; library Leaf {}\n',
 };
 for(const [path,content] of Object.entries(sources)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content);}
 const metadata:any={compiler:{version:'0.8.30+commit.73712a01'},language:'Solidity',version:1,
  settings:{compilationTarget:{[source]:'Widget'},evmVersion:'cancun',libraries:{},metadata:{bytecodeHash:'ipfs'},optimizer:{enabled:true,runs:700},viaIR:true,
   remappings:[':@1inch/aqua/=vendor/aqua/',':@1inch/solidity-utils/=node_modules/@1inch/solidity-utils/',':@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/',':aqua/=vendor/aqua/src/',':forge-std/=vendor/forge-std/src/',':swap-vm-orbital/=vendor/swap-vm-orbital/src/',':swap-vm/=vendor/swap-vm/src/']},
  sources:Object.fromEntries(Object.entries(sources).map(([path,content])=>[path,{keccak256:keccak256(toHex(content))}]))};
 const placeholder=`__$${keccak256(toHex(`${dependency}:${library}`)).slice(2,36)}$__`;
 const bytecode=()=>({object:`0x60${placeholder}00`,linkReferences:{[dependency]:{[library]:[{start:1,length:20}]}}});
 const abi=[{type:'function',name:'quote',inputs:[{name:'request',type:'tuple[]',components:[{name:'amount',type:'uint256'},{name:'account',type:'address'}]}],outputs:[{name:'result',type:'uint256'}],stateMutability:'view'},
  {type:'event',name:'Observed',inputs:[{name:'amount',type:'uint256',indexed:false}],anonymous:false}];
 metadata.output={abi:structuredClone(abi).reverse()};
 const artifact:any={abi,bytecode:bytecode(),deployedBytecode:bytecode(),methodIdentifiers:{'quote((uint256,address)[])':keccak256(toHex('quote((uint256,address)[])')).slice(2,10)}};
 async function save(){artifact.rawMetadata=JSON.stringify(metadata);await mkdir(join(root,'out/Widget.sol'),{recursive:true});await writeFile(join(root,'out/Widget.sol/Widget.json'),JSON.stringify(artifact));}
 await save();
 return {root,metadata,artifact,sources,save,read:()=>readVerifiedArtifact(root,'Widget',source),close:()=>rm(root,{recursive:true,force:true})};
}
async function makeLibrary(f:Awaited<ReturnType<typeof fixture>>){
 f.sources[source]=f.sources[source]!.replace('contract Widget','library Widget');
 await writeFile(join(f.root,source),f.sources[source]!);f.metadata.sources[source].keccak256=keccak256(toHex(f.sources[source]!));
}

test('artifact integrity retains a deterministic complete source closure for an unlinked build',async()=>{
 const f=await fixture();try{
  const first=await f.read(),second=await f.read();
  assert.deepEqual(first.integrity,second.integrity);
  assert.deepEqual(first.integrity.sources.map((s:any)=>s.source),[dependency,source]);
  for(const item of first.integrity.sources){const bytes=await readFile(join(f.root,item.source));assert.equal(item.keccak256,keccak256(toHex(bytes)));assert.equal(item.sha256,sha(bytes));}
  assert.equal(first.integrity.sourceClosureSha256,sha(JSON.stringify(first.integrity.sources)));
  assert.deepEqual(first.integrity.compilationTarget,{[source]:'Widget'});
  assert.equal(first.integrity.artifactSha256,sha(first.artifactBytes));
  assert.equal('verified' in first.integrity,false);
 }finally{await f.close();}
});

test('unchanged target cannot conceal a changed transitive dependency',async()=>{
 const f=await fixture();try{await writeFile(join(f.root,dependency),f.sources[dependency]+'// changed dependency\n');await assert.rejects(f.read(),/SOURCE_HASH_MISMATCH.*node_modules\/core\/Leaf\.sol/);}finally{await f.close();}
});
test('missing transitive source and missing source hash have explicit integrity errors',async()=>{
 const f=await fixture();try{
  await rm(join(f.root,dependency));await assert.rejects(f.read(),/SOURCE_UNAVAILABLE.*node_modules\/core\/Leaf\.sol/);
  await writeFile(join(f.root,dependency),f.sources[dependency]!);delete f.metadata.sources[dependency].keccak256;await f.save();
  await assert.rejects(f.read(),/SOURCE_METADATA_INVALID.*node_modules\/core\/Leaf\.sol/);
 }finally{await f.close();}
});
test('compilation target binds the requested fully qualified source and contract name',async()=>{
 const f=await fixture();try{f.metadata.settings.compilationTarget={[source]:'DifferentWidget'};await f.save();await assert.rejects(f.read(),/COMPILATION_TARGET_MISMATCH/);}finally{await f.close();}
});
test('compiler settings include optimizer details, remappings and unlinked library configuration',async()=>{
 for(const mutate of [
  (m:any)=>{m.settings.optimizer.details={yul:false};},
  (m:any)=>{m.settings.remappings[0]=':@1inch/aqua/=vendor/different-aqua/';},
  (m:any)=>{m.settings.libraries={[dependency]:{Leaf:`0x${'12'.repeat(20)}`}};},
  (m:any)=>{m.settings.metadata.bytecodeHash='none';},
  (m:any)=>{m.compiler.version='0.8.31+commit.fake';},
 ]){const f=await fixture();try{mutate(f.metadata);await f.save();await assert.rejects(f.read(),/COMPILER_CONFIGURATION_MISMATCH/);}finally{await f.close();}}
});
test('source identities reject parent traversal, absolute paths and path aliases',async()=>{
 for(const path of ['../outside.sol','C:/outside.sol','/outside.sol','src/../outside.sol','src\\Leaf.sol','src//Leaf.sol']){
  const f=await fixture();try{f.metadata.sources[path]={keccak256:keccak256(toHex('not read'))};await f.save();await assert.rejects(f.read(),/SOURCE_IDENTITY_INVALID/);}finally{await f.close();}
 }
});
test('linker references require a source in the authenticated closure',async()=>{
 const f=await fixture();try{f.artifact.bytecode.linkReferences={'src/Unknown.sol':{Leaf:[{start:1,length:20}]}};await f.save();await assert.rejects(f.read(),/LINK_SOURCE_MISSING/);}finally{await f.close();}
});
test('creation and runtime placeholders bind the fully qualified library identity',async()=>{
 for(const part of ['bytecode','deployedBytecode']){const f=await fixture();try{f.artifact[part].linkReferences[dependency]={DifferentLeaf:[{start:1,length:20}]};await f.save();await assert.rejects(f.read(),/LINK_PLACEHOLDER_MISMATCH/);}finally{await f.close();}}
});
test('linker spans reject invalid lengths, offsets, overlaps and unrecorded placeholders',async()=>{
 for(const mutate of [
  (a:any)=>{a.bytecode.linkReferences[dependency].Leaf[0].length=19;},
  (a:any)=>{a.bytecode.linkReferences[dependency].Leaf[0].start=2;},
  (a:any)=>{a.bytecode.linkReferences[dependency].Leaf.push({start:1,length:20});},
  (a:any)=>{a.deployedBytecode.linkReferences={};},
 ]){const f=await fixture();try{mutate(f.artifact);await f.save();await assert.rejects(f.read(),/LINK_(SPAN_INVALID|PLACEHOLDER_MISMATCH|OVERLAP|UNRECORDED)/);}finally{await f.close();}}
});
test('empty interface bytecode and closure ordering are deterministic',async()=>{
 const f=await fixture();try{
  f.artifact.bytecode={object:'0x',linkReferences:{}};f.artifact.deployedBytecode={object:'0x',linkReferences:{}};
  await f.save();const before=await f.read();f.metadata.sources=Object.fromEntries(Object.entries(f.metadata.sources).reverse());await f.save();const after=await f.read();
  assert.deepEqual(before.integrity.sources,after.integrity.sources);assert.equal(before.integrity.sourceClosureSha256,after.integrity.sourceClosureSha256);
 }finally{await f.close();}
});
test('ABI fields agree with compiler metadata despite different top-level ordering',async()=>{
 const f=await fixture();try{
  await f.read();f.artifact.abi[0].inputs[0].components[0].type='uint128';await f.save();await assert.rejects(f.read(),/ABI_METADATA_MISMATCH/);
 }finally{await f.close();}
});
test('method selectors are recomputed from exact tuple signatures',async()=>{
 const f=await fixture();try{
  await f.read();f.artifact.methodIdentifiers['quote((uint256,address)[])']='12345678';await f.save();await assert.rejects(f.read(),/METHOD_IDENTIFIERS_MISMATCH/);
 }finally{await f.close();}
});

test('explicit library mode authenticates named structs and compiler-declared storage-only selectors',async()=>{
 const f=await fixture();try{
  await makeLibrary(f);
  const abi=[{type:'function',name:'run',inputs:[{name:'ticks',type:'tuple[]',internalType:'struct Math.Tick[]',components:[{name:'r',type:'uint256',internalType:'uint256'}]},{name:'aqua',type:'IAqua',internalType:'contract IAqua'}],outputs:[],stateMutability:'pure'}];
  f.artifact.abi=abi;f.metadata.output.abi=structuredClone(abi);
  f.artifact.deployedBytecode={object:'0x'+'00'.repeat(32)+'6000',linkReferences:{},immutableReferences:{library_deploy_address:[{start:0,length:32}]}};
  const signatures=['run(Math.Tick[],IAqua)','begin(Store.State storage,mapping(address => bool) storage)'];
  f.artifact.methodIdentifiers=Object.fromEntries(signatures.map(s=>[s,keccak256(toHex(s)).slice(2,10)]));await f.save();
  await assert.rejects(f.read(),/METHOD_IDENTIFIERS_MISMATCH/); // No ordinary-contract fallback.
  const read=()=>readVerifiedArtifact(f.root,'Widget',source,{kind:'library'});
  const result=await read();assert.equal(result.integrity.methodIdentifiersScope,'library-declared-map-and-ABI-representable-subset');
  assert.deepEqual(result.integrity.methodIdentifiers,f.artifact.methodIdentifiers);
  f.artifact.methodIdentifiers[signatures[1]!]='00000000';await f.save();await assert.rejects(read(),/METHOD_IDENTIFIERS_MISMATCH/);
 }finally{await f.close();}
});
test('library mode needs self-address compiler identity and exact selectors for retained and ABI-omitted stateful methods',async()=>{
 const f=await fixture();try{
  await makeLibrary(f);
  const read=()=>readVerifiedArtifact(f.root,'Widget',source,{kind:'library'});
  f.artifact.deployedBytecode.immutableReferences={library_deploy_address:[]};await f.save();
  await assert.rejects(read(),/LIBRARY_IDENTITY_INVALID/);
  const abi=[{type:'function',name:'amount',inputs:[{name:'n',type:'uint256',internalType:'uint256'}],outputs:[],stateMutability:'pure'}];
  f.artifact.abi=abi;f.metadata.output.abi=structuredClone(abi);
  f.artifact.deployedBytecode={object:'0x'+'00'.repeat(32)+'6000',linkReferences:{},immutableReferences:{library_deploy_address:[{start:0,length:32}]}};
  f.artifact.methodIdentifiers={};await f.save();await assert.rejects(read(),/METHOD_IDENTIFIERS_MISMATCH/);
  f.artifact.methodIdentifiers={'amount(uint256)':keccak256(toHex('amount(uint256)')).slice(2,10),'other(uint256)':keccak256(toHex('other(uint256)')).slice(2,10)};
  await f.save();await read(); // A stateful other(uint256) is legitimately absent from library ABI.
  f.artifact.methodIdentifiers['other(uint256)']='00000000';await f.save();await assert.rejects(read(),/METHOD_IDENTIFIERS_MISMATCH/);
  delete f.artifact.methodIdentifiers['other(uint256)'];f.artifact.deployedBytecode.immutableReferences.library_deploy_address[0].length=20;
  await f.save();await assert.rejects(read(),/LIBRARY_IDENTITY_INVALID/);
 }finally{await f.close();}
});

test('pure-only library needs exact represented selector map when optimized self-address guard is absent',async()=>{
 const f=await fixture();try{
  await makeLibrary(f);
  const abi=[{type:'function',name:'amount',inputs:[{name:'n',type:'uint256',internalType:'uint256'}],outputs:[],stateMutability:'pure'}];
  f.artifact.abi=abi;f.metadata.output.abi=structuredClone(abi);f.artifact.deployedBytecode={object:'0x6000',linkReferences:{}};
  f.artifact.methodIdentifiers={'amount(uint256)':keccak256(toHex('amount(uint256)')).slice(2,10)};await f.save();
  const read=()=>readVerifiedArtifact(f.root,'Widget',source,{kind:'library'});await read();
  f.artifact.methodIdentifiers['stateful(uint256)']=keccak256(toHex('stateful(uint256)')).slice(2,10);await f.save();await assert.rejects(read(),/LIBRARY_IDENTITY_INVALID/);
 }finally{await f.close();}
});
test('ordinary contract cannot choose library mode using comments, strings, spoofed names or nested declarations',async()=>{
 for(const suffix of ['// library Widget {}\n','/* library Widget {} */\n','contract Decoy { string constant x="library Widget {}"; }\n','contract Container { library Widget {} }\n','library WidgetSpoof {}\n']){
  const f=await fixture();try{
   f.sources[source]=f.sources[source]!.replace('contract Widget','contract Actual')+suffix;
   await writeFile(join(f.root,source),f.sources[source]!);f.metadata.sources[source].keccak256=keccak256(toHex(f.sources[source]!));
   const abi=[{type:'function',name:'amount',inputs:[{name:'n',type:'uint256',internalType:'uint256'}],outputs:[],stateMutability:'pure'}];
   f.artifact.abi=abi;f.metadata.output.abi=structuredClone(abi);f.artifact.deployedBytecode={object:'0x'+'00'.repeat(32),linkReferences:{},immutableReferences:{library_deploy_address:[{start:0,length:32}]}};
   f.artifact.methodIdentifiers={'amount(uint256)':keccak256(toHex('amount(uint256)')).slice(2,10)};await f.save();
   await assert.rejects(readVerifiedArtifact(f.root,'Widget',source,{kind:'library'}),/LIBRARY_SOURCE_IDENTITY/);
  }finally{await f.close();}
 }
});
