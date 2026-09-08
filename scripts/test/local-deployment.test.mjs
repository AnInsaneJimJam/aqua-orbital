import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildGraph,linkObject,verifyRuntime,validateLocalIdentity,parseAction} from '../lib/local-deployment.mjs';
import {verifyTransaction} from '../lib/local-deployment-runner.mjs';
const {keccak256,toHex}=createRequire(new URL('../../packages/sdk/package.json',import.meta.url))('viem');
const fqn=name=>`src/${name}.sol:${name}`;
const address='0x1234567890123456789012345678901234567890';
function artifact(name,dependencies=[],runtimeDependencies=dependencies,immutable={}){
 const refs=names=>names.map((library,i)=>({source:`src/${library}.sol`,library,start:i*20,length:20}));
 const object=names=>'0x'+names.map(n=>`__$${keccak256(toHex(fqn(n))).slice(2,36)}$__`).join('')+'00'.repeat(64);
 return {artifact:{abi:[],bytecode:{object:object(dependencies)},deployedBytecode:{object:object(runtimeDependencies),immutableReferences:immutable}},
  integrity:{compilationTarget:{[`src/${name}.sol`]:name},artifactSha256:name,sourceClosureSha256:name,
   sources:[{source:`src/${name}.sol`,keccak256:name}],linkReferences:{creation:refs(dependencies),runtime:refs(runtimeDependencies)}}};
}
const reader=records=>async(_contracts,name,source)=>{assert.equal(source,`src/${name}.sol`);if(!records[name])throw Error('ARTIFACT_UNAVAILABLE');return records[name];};
test('graph resolves creation AND runtime dependencies once in deterministic dependency order',async()=>{
 const records={Router:artifact('Router',['Store'],['RuntimeOnly']),Store:artifact('Store',['Math']),RuntimeOnly:artifact('RuntimeOnly',['Math']),Math:artifact('Math')};
 const graph=await buildGraph({contracts:'unused',roots:[fqn('Router')],readArtifact:reader(records)});
 assert.deepEqual(graph.nodes.map(n=>n.fqn),[fqn('Math'),fqn('RuntimeOnly'),fqn('Store'),fqn('Router')]);
 assert.equal(graph.nodes.length,4);assert(graph.nodes.findIndex(n=>n.fqn===fqn('Math'))<graph.nodes.findIndex(n=>n.fqn===fqn('Store')));
 assert.deepEqual(graph.nodes.at(-1).dependencies,[fqn('RuntimeOnly'),fqn('Store')]);
});
test('cycles, missing nodes, changed source closure, oversized init/runtime and graph cap fail closed',async()=>{
 await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:artifact('A',['B']),B:artifact('B',['A'])})}),/GRAPH_CYCLE/);
 await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:artifact('A',['B'])})}),/ARTIFACT_UNAVAILABLE/);
 const a=artifact('A',['B']),b=artifact('B');a.integrity.sources.push({source:'src/B.sol',keccak256:'different'});
 await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:a,B:b})}),/SOURCE_CLOSURE_CONFLICT/);
 for(const [part,bytes,error] of [['bytecode',49153,'INITCODE_SIZE'],['deployedBytecode',24577,'RUNTIME_SIZE']]){
  const bad=artifact('A');bad.artifact[part].object='0x'+'00'.repeat(bytes);
  await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:bad})}),new RegExp(error));
 }
 await assert.rejects(buildGraph({roots:[fqn('A')],maxNodes:1,readArtifact:reader({A:artifact('A',['B']),B:artifact('B')})}),/GRAPH_LIMIT/);
});
test('canonical link replacement needs exact derived FQN address and preserves all other bytes',()=>{
 const a=artifact('A',['B']);
 assert.equal(linkObject(a.artifact.bytecode.object,a.integrity.linkReferences.creation,new Map([[fqn('B'),address]])),'0x'+address.slice(2)+'00'.repeat(64));
 assert.throws(()=>linkObject(a.artifact.bytecode.object,a.integrity.linkReferences.creation,new Map()),/LINK_ADDRESS_MISSING/);
 assert.throws(()=>linkObject(a.artifact.bytecode.object,a.integrity.linkReferences.creation,new Map([[fqn('B'),'0x00']])) ,/LINK_ADDRESS_INVALID/);
 assert.throws(()=>linkObject(a.artifact.bytecode.object.replace('__$','000'),a.integrity.linkReferences.creation,new Map([[fqn('B'),address]])),/LINK_PLACEHOLDER_MISMATCH/);
});
test('runtime comparison binds constructor-simulated immutables and every non-immutable byte',()=>{
 const base='0x6000'+'00'.repeat(32)+'6001',runtime='0x6000'+address.slice(2).padStart(64,'0')+'6001';
 const spans={'123':[{start:2,length:32}]};
 assert.deepEqual(verifyRuntime(base,spans,runtime,runtime),{runtimeBytes:36,runtimeKeccak256:keccak256(runtime),immutableValues:{'123':'0x'+address.slice(2).padStart(64,'0')}});
 assert.throws(()=>verifyRuntime(base,spans,runtime,base),/RUNTIME_SIMULATION_MISMATCH/);
 assert.throws(()=>verifyRuntime(base,spans,runtime.replace('6001','6002'),runtime.replace('6001','6002')),/RUNTIME_TEMPLATE_MISMATCH/);
 assert.throws(()=>verifyRuntime(base,{'1':[{start:2,length:32}],'2':[{start:3,length:32}]},runtime,runtime),/IMMUTABLE_OVERLAP/);
 assert.throws(()=>verifyRuntime(base,{'1':[{start:2,length:31}]},runtime,runtime),/IMMUTABLE_SPAN_INVALID/);
 assert.throws(()=>verifyRuntime(base,{'1':[{start:6,length:32}]},runtime,runtime),/IMMUTABLE_SPAN_INVALID/);
 assert.throws(()=>verifyRuntime(runtime,spans,runtime,runtime),/IMMUTABLE_TEMPLATE_NONZERO/);
 const twice='0x'+'00'.repeat(64),different='0x'+'01'.repeat(32)+'02'.repeat(32);
 assert.throws(()=>verifyRuntime(twice,{'1':[{start:0,length:32},{start:32,length:32}]},different,different),/IMMUTABLE_VALUE_MISMATCH/);
});
test('local identity rejects non-owned, default-port, non-loopback, wrong chain/client and changed instance',()=>{
 const good={rpcUrl:'http://127.0.0.1:19457',chainId:'0x7a69',clientVersion:'anvil/v1.5.1',instanceId:'0x'+'11'.repeat(32),expectedInstanceId:'0x'+'11'.repeat(32),processAlive:true};
 assert.doesNotThrow(()=>validateLocalIdentity(good));
 for(const change of [{rpcUrl:'http://127.0.0.1:8545'},{rpcUrl:'http://127.0.0.1:0'},{rpcUrl:'https://example.com:19457'},{chainId:'0x1'},{clientVersion:'Geth/v1'},{processAlive:false},{expectedInstanceId:'0x'+'22'.repeat(32)},{rpcUrl:'http://user:pass@127.0.0.1:19457'}])assert.throws(()=>validateLocalIdentity({...good,...change}),/LOCAL_IDENTITY/);
});
test('CLI accepts no remote endpoints, keys, addresses or arbitrary output paths',()=>{
 assert.equal(parseAction(['plan']),'plan');assert.equal(parseAction(['test-run']),'test-run');
 for(const args of [[],['deploy'],['test-run','--rpc-url','http://localhost:8545'],['plan','C:/other'],['test-run','--private-key','redacted']])assert.throws(()=>parseAction(args),/USAGE/);
});
test('receipt verification binds input, sender, nonce, chain, creation address and canonical inclusion',()=>{
 const hash='0x'+'aa'.repeat(32),blockHash='0x'+'bb'.repeat(32),created='0x'+'22'.repeat(20);
 const transaction={hash,blockHash,blockNumber:'0x7',from:address,to:null,chainId:'0x7a69',nonce:'0x6',input:'0x6000',value:'0x0',gas:'0x20000'};
 const receipt={status:'0x1',gasUsed:'0xffff',transactionHash:hash,blockHash,blockNumber:'0x7',from:address,to:null,contractAddress:created};
 const block={hash:blockHash,number:'0x7',transactions:[hash]};
 const good={transaction,receipt,block,from:address,to:null,data:'0x6000',nonce:6n,predictedAddress:created};
 assert.doesNotThrow(()=>verifyTransaction(good));
 for(const [part,key,value,error]of [
  ['receipt','status','0x0','RECEIPT_STATUS'],['receipt','gasUsed','0x1c9c381','RECEIPT_STATUS'],
  ['receipt','contractAddress',address,'CREATION_ADDRESS'],['receipt','blockHash',hash,'RECEIPT_BLOCK'],
  ['transaction','input','0x6001','TRANSACTION_INPUT'],['transaction','from',created,'TRANSACTION_FROM'],
  ['transaction','chainId','0x1','TRANSACTION_CHAIN_NONCE'],['transaction','nonce','0x5','TRANSACTION_CHAIN_NONCE'],
  ['transaction','value','0x1','TRANSACTION_VALUE'],['transaction','gas','0x1c9c381','TRANSACTION_GAS'],['transaction','gas','0x1','TRANSACTION_GAS'],
  ['transaction','to',created,'TRANSACTION_TO'],['transaction','hash',blockHash,'TRANSACTION_HASH'],
  ['block','transactions',[],'TRANSACTION_BLOCK_MEMBERSHIP'],
 ])assert.throws(()=>verifyTransaction({...good,[part]:{...good[part],[key]:value}}),new RegExp(error));
});
test('invalid immutable metadata is rejected during planning, before any deployment exists',async()=>{
 const broken=artifact('A',[],[],{'1':[{start:40,length:32}]});
 await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:broken})}),/IMMUTABLE_SPAN_INVALID/);
 const overlap=artifact('A',['B'],['B'],{'1':[{start:0,length:32}]});
 await assert.rejects(buildGraph({roots:[fqn('A')],readArtifact:reader({A:overlap,B:artifact('B')})}),/IMMUTABLE_TEMPLATE_NONZERO/);
});
