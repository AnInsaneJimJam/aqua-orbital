import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {decodeEventLog,encodeAbiParameters,encodeEventTopics,type AbiEvent,type Hex} from 'viem';
import * as sdk from '../src/index';

type Fixture={exportName:'lifecycleEventsAbi'|'paymentsEventsAbi';eventName:string;signature:string;args:Record<string,unknown>;topics:Hex[];data:Hex};
const fixture=JSON.parse(readFileSync(new URL('./fixtures/events.json',import.meta.url),'utf8')) as {events:Fixture[]};
function eventAbi(name:Fixture['exportName']):readonly AbiEvent[]{
 const abi=(sdk as Record<string,unknown>)[name];
 assert.ok(Array.isArray(abi),`Missing package export ${name}`);
 return abi as AbiEvent[];
}
function expectedArgs(event:Fixture){
 const args={...event.args};
 for(const name of ['version','amountDueRaw','amountInRaw','receivedRaw','refundRaw'])if(name in args)args[name]=BigInt(args[name] as string);
 return args;
}

test('event exports contain only requested nonanonymous events and preserve function-only ABIs',()=>{
 assert.deepEqual(eventAbi('lifecycleEventsAbi').map(e=>e.name),['StrategyActivated','StrategyRetired']);
 assert.deepEqual(eventAbi('paymentsEventsAbi').map(e=>e.name),['InvoiceCancelled','InvoiceCreated','InvoicePaid']);
 for(const name of ['lifecycleEventsAbi','paymentsEventsAbi'] as const)for(const event of eventAbi(name)){
  assert.equal(event.type,'event');assert.equal(event.anonymous,false);
 }
 for(const [abi,count] of [[sdk.routerAbi,2],[sdk.lifecycleAbi,6],[sdk.aquaAbi,2],[sdk.paymentsAbi,4]] as const){
  assert.equal(abi.length,count);assert.ok(abi.every(entry=>entry.type==='function'));
 }
});

for(const event of fixture.events)test(`${event.eventName} matches independent cast topics, indexed fields and data words`,()=>{
 const abi=eventAbi(event.exportName);
 const decoded=decodeEventLog({abi,topics:event.topics as [Hex,...Hex[]],data:event.data,strict:true});
 assert.equal(decoded.eventName,event.eventName);
 assert.deepEqual(decoded.args,expectedArgs(event));
 const declaration=abi.find(item=>item.name===event.eventName)!;
 const args=expectedArgs(event);
 assert.deepEqual(encodeEventTopics({abi,eventName:event.eventName,args}),event.topics);
 const dataInputs=declaration.inputs.filter(input=>!input.indexed);
 assert.equal(encodeAbiParameters(dataInputs,dataInputs.map(input=>args[input.name!])),event.data);
});

test('strict golden decoding rejects unknown signatures, missing indexed topics and truncated dynamic data',()=>{
 const created=fixture.events.find(e=>e.eventName==='InvoiceCreated')!;
 const abi=eventAbi('paymentsEventsAbi');
 assert.throws(()=>decodeEventLog({abi,topics:[`0x${'00'.repeat(32)}`,...created.topics.slice(1)],data:created.data,strict:true}));
 assert.throws(()=>decodeEventLog({abi,topics:created.topics.slice(0,-1) as [Hex,...Hex[]],data:created.data,strict:true}));
 assert.throws(()=>decodeEventLog({abi,topics:created.topics as [Hex,...Hex[]],data:created.data.slice(0,-64) as Hex,strict:true}));
 const activated=fixture.events.find(e=>e.eventName==='StrategyActivated')!;
 const swapped=decodeEventLog({abi:eventAbi('lifecycleEventsAbi'),topics:[activated.topics[0]!,activated.topics[1]!,activated.topics[3]!,activated.topics[2]!],data:'0x',strict:true});
 assert.notDeepEqual(swapped.args,expectedArgs(activated));
});

test('event provenance pins current sources, compiler and independently encoded topic hashes',()=>{
 const provenance=JSON.parse(readFileSync(new URL('../src/generated/events-provenance.json',import.meta.url),'utf8')) as Array<Record<string,any>>;
 const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
 for(const exportName of ['lifecycleEventsAbi','paymentsEventsAbi'] as const){
  const record=provenance.find(entry=>entry.exportName===exportName);
  assert.ok(record,`Missing provenance for ${exportName}`);
  assert.equal(record.compiler,'0.8.30+commit.73712a01');assert.equal(record.evmVersion,'cancun');
  assert.equal(record.optimizerRuns,700);assert.equal(record.viaIR,true);
  assert.equal(record.sourceSha256,sha(readFileSync(new URL(`../../../${record.source}`,import.meta.url))));
  assert.equal(record.abiSha256,sha(JSON.stringify(eventAbi(exportName))));
  for(const event of fixture.events.filter(e=>e.exportName===exportName))assert.equal(record.eventTopics[event.signature],event.topics[0]);
 }
 const lifecycle=provenance.find(entry=>entry.exportName==='lifecycleEventsAbi')!;
 assert.equal(lifecycle.implementation.source,'packages/contracts/src/OrbitalSwapVMRouter.sol');
 assert.equal(lifecycle.implementation.sourceSha256,sha(readFileSync(new URL(`../../../${lifecycle.implementation.source}`,import.meta.url))));
});
