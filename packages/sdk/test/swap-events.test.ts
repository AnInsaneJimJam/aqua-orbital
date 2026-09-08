import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {decodeEventLog,encodeAbiParameters,encodeEventTopics,type AbiEvent,type Hex} from 'viem';
import * as sdk from '../src/index';

type Fixture={name:string;eventName:string;signature:string;args:Record<string,unknown>;topics:Hex[];data:Hex};
const fixture=JSON.parse(readFileSync(new URL('./fixtures/swap-events.json',import.meta.url),'utf8')) as {events:Fixture[]};
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function abi():readonly AbiEvent[]{
 const value=(sdk as Record<string,unknown>).swapEventsAbi;
 assert.ok(Array.isArray(value),'Missing package export swapEventsAbi');return value as AbiEvent[];
}
function expected(event:Fixture){
 const args={...event.args};
 for(const field of ['grossInputRaw','netInputRaw','feeRaw','amountOutRaw','version'])args[field]=BigInt(args[field] as string);
 args.crossedTickKeys=(args.crossedTickKeys as string[]).map(BigInt);
 return args;
}

test('swap event is an additive export and leaves existing ABI groups unchanged',()=>{
 assert.deepEqual(abi().map(event=>event.name),['OrbitalSwapExecuted']);
 assert.equal(abi()[0]!.anonymous,false);
 assert.deepEqual(abi()[0]!.inputs.filter(input=>input.indexed).map(input=>input.name),['maker','orderHash','taker']);
 assert.deepEqual(sdk.lifecycleEventsAbi.map(event=>event.name),['StrategyActivated','StrategyRetired']);
 assert.equal(sdk.paymentsEventsAbi.length,3);
 assert.deepEqual([sdk.routerAbi.length,sdk.lifecycleAbi.length,sdk.aquaAbi.length,sdk.paymentsAbi.length],[2,6,2,4]);
});

for(const event of fixture.events)test(`swap event ${event.name} matches independent cast bytes and exact typed values`,()=>{
 const declaration=abi()[0]!;
 const decoded=decodeEventLog({abi:abi(),topics:event.topics as [Hex,...Hex[]],data:event.data,strict:true});
 assert.equal(decoded.eventName,'OrbitalSwapExecuted');assert.deepEqual(decoded.args,expected(event));
 const args=expected(event);
 assert.deepEqual(encodeEventTopics({abi:abi(),eventName:'OrbitalSwapExecuted',args}),event.topics);
 const inputs=declaration.inputs.filter(input=>!input.indexed);
 assert.equal(encodeAbiParameters(inputs,inputs.map(input=>args[input.name!])),event.data);
 assert.equal(typeof args.grossInputRaw,'bigint');assert.equal(args.grossInputRaw,(1n<<256n)-1n);
 assert.equal(typeof args.version,'bigint');assert.equal(args.version,(1n<<64n)-1n);
 assert.equal(typeof args.tokenInIndex,'number');
 assert.deepEqual((decoded.args as Record<string,unknown>).crossedInward,event.args.crossedInward);
});

test('swap strict decoding rejects wrong topics and truncated ordered crossing data',()=>{
 const event=fixture.events[1]!;
 assert.throws(()=>decodeEventLog({abi:abi(),topics:[`0x${'00'.repeat(32)}`,...event.topics.slice(1)],data:event.data,strict:true}));
 assert.throws(()=>decodeEventLog({abi:abi(),topics:event.topics.slice(0,-1) as [Hex,...Hex[]],data:event.data,strict:true}));
 assert.throws(()=>decodeEventLog({abi:abi(),topics:event.topics as [Hex,...Hex[]],data:event.data.slice(0,-64) as Hex,strict:true}));
 const changed=decodeEventLog({abi:abi(),topics:[event.topics[0]!,event.topics[3]!,event.topics[2]!,event.topics[1]!],data:event.data,strict:true});
 assert.notDeepEqual(changed.args,expected(event));
 const keys=expected(event).crossedTickKeys as bigint[];
 assert.deepEqual(keys,[(1n<<64n)-1n,1n<<63n,(1n<<64n)-1n]);
 assert.deepEqual(expected(event).crossedInward,[true,false,true]);
});

test('swap provenance pins source, concrete implementation and compiler without changing prior record counts',()=>{
 const originalFunctions=JSON.parse(readFileSync(new URL('../src/generated/provenance.json',import.meta.url),'utf8'));
 const originalEvents=JSON.parse(readFileSync(new URL('../src/generated/events-provenance.json',import.meta.url),'utf8'));
 assert.equal(originalFunctions.length,4);assert.equal(originalEvents.length,2);
 const records=JSON.parse(readFileSync(new URL('../src/generated/swap-events-provenance.json',import.meta.url),'utf8')) as Array<Record<string,any>>;
 assert.equal(records.length,1);const record=records[0]!;
 assert.equal(record.exportName,'swapEventsAbi');
 assert.equal(record.source,'packages/contracts/src/interfaces/IOrbitalLifecycle.sol');
 assert.equal(record.compiler,'0.8.30+commit.73712a01');assert.equal(record.evmVersion,'cancun');
 assert.equal(record.optimizerRuns,700);assert.equal(record.viaIR,true);
 assert.equal(record.sourceSha256,sha(readFileSync(new URL(`../../../${record.source}`,import.meta.url))));
 assert.equal(record.abiSha256,sha(JSON.stringify(abi())));
 assert.equal(record.implementation.source,'packages/contracts/src/OrbitalSwapVMRouter.sol');
 assert.equal(record.implementation.sourceSha256,sha(readFileSync(new URL(`../../../${record.implementation.source}`,import.meta.url))));
 for(const event of fixture.events)assert.equal(record.eventTopics[event.signature],event.topics[0]);
});
