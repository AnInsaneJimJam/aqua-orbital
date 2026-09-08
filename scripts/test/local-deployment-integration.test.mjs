import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runLocalDeployment} from '../lib/local-deployment-runner.mjs';
test('actual pinned official Aqua source, dynamic libraries, local assets, router and payments deploy and verify only on owned disposable chain',async()=>{
 const {report,directory}=await runLocalDeployment();
 assert.equal(report.status,'local-verification-passed');assert.equal(report.manifest.verified,false);
 assert.equal(report.manifest.chainId,31337);assert.equal(report.financialExecutionEnabled,false);
 assert.equal(report.chain.hardfork,'Cancun');assert.notEqual(report.chain.port,8545);
 assert.equal(report.contracts.length,report.graph.nodes.length+1); // Demo artifact deployed twice.
 for(const item of report.contracts){
  assert.equal(item.receipt.status,'0x1');assert.equal(item.runtime.runtimeKeccak256,item.simulatedRuntimeKeccak256);
  assert(item.runtime.runtimeBytes>0&&item.runtime.runtimeBytes<=24576);
  assert.match(item.initcodeKeccak256,/^0x[0-9a-f]{64}$/);assert.equal(item.receipt.contractAddress,item.address);
 }
 assert.equal(report.bindings.router.owner,'0x0000000000000000000000000000000000000000');
 assert.equal(report.bindings.router.domain[1],'Orbital');assert.equal(report.bindings.router.domain[2],'1');
 assert.equal(report.bindings.router.domain[3],'31337');
 assert.match(report.bindings.router.domainProbe.digest,/^0x[0-9a-f]{64}$/);
 assert.deepEqual(report.assets.map(a=>a.label).sort(),['Local USDC fixture','Orbital demo dollar18','Orbital demo dollar6']);
 assert.equal(report.faucets.length,3);assert(report.faucets.every(f=>f.amount===f.balance&&f.receipt.status==='0x1'));
 assert.equal(report.receipts.length,report.contracts.length+4); // Renunciation and caller faucets.
 assert.equal(report.chainStopped,true);
 assert.deepEqual(JSON.parse(await readFile(`${directory}/report.json`,'utf8')),report);
 assert.doesNotMatch(JSON.stringify(report),/private.?key|mnemonic/i);
});
