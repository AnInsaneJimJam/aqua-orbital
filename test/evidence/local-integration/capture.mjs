// Read-only checkpoint for the retained local browser transaction hashes.
// Run from the repository root while its original Anvil deployment is running.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connectPersistentAnvil} from '../../../scripts/lib/persistent-anvil.mjs';
import {runLocalDeployment} from '../../../scripts/lib/local-deployment-runner.mjs';
const root='test/evidence/local-integration/',json=async path=>JSON.parse(await readFile(path,'utf8'));
const {report:deployment}=await runLocalDeployment({persistent:true});
if(deployment.status!=='existing-local-deployment-verified')throw Error('Expected the retained deployment');
const local=await connectPersistentAnvil();
const inputs=['integrated-browser-transactions.json','integrated-payment-browser-transactions.json','integrated-lifecycle.json','integrated-funding.json','integrated-invoice-admin.json'];
const hashes=new Set(),sourceHashes={};
for(const name of inputs){const bytes=await readFile(root+name),v=JSON.parse(bytes);sourceHashes[name]=createHash('sha256').update(bytes).digest('hex');for(const h of Array.isArray(v)?v:v.transactions)hashes.add(h);}
const transactions=[];
for(const hash of hashes){
 const receipt=await local.request('eth_getTransactionReceipt',[hash]),transaction=await local.request('eth_getTransactionByHash',[hash]);
 if(!receipt||receipt.status!=='0x1'||receipt.transactionHash!==hash||transaction?.hash!==hash||transaction.blockHash!==receipt.blockHash||transaction.blockNumber!==receipt.blockNumber)throw Error('Receipt mismatch');
 const block=await local.request('eth_getBlockByNumber',[receipt.blockNumber,false]);
 if(block?.hash!==receipt.blockHash||!block.transactions.includes(hash))throw Error('Noncanonical receipt');
 transactions.push({transaction,receipt});
}
const requests=['/health','/deployment','/metrics',
 '/invoices/0x9f550baa7ab8af112507bf24f304564795231f6dd7022f07053dbe87b13895c1',
 '/invoices/0x87b7d0b9956e49c34687b97c84617be1f50553949a6ea4cb76e710620b164a72',
 '/strategies/0x9b6b7ef1cb79cd0ea0ee4ff08da4e48ae2e3c5c8f1ca4fa62c368d15b749ebb0'];
const observations=[];
for(const path of requests){const response=await fetch('http://127.0.0.1:3001'+path,{signal:AbortSignal.timeout(15000)}),body=await response.json();if(!response.ok||body.status==='unavailable')throw Error('API observation unavailable: '+path);observations.push({path,httpStatus:response.status,body});}
await local.assertIdentity();
const result={schemaVersion:1,status:'passed',observedAt:new Date().toISOString(),scope:'Persistent local development only; retained receipts verified after graceful atomic-snapshot restart',identity:local.identity,sourceHashes,transactions,observations,nonClaims:['Live Privy wallet execution','Arc deployment','Full mathematical or release acceptance','Broad browser regression campaign']};
await writeFile(root+'receipts-after-restart.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'passed',canonicalReceipts:transactions.length,apiObservations:observations.length,contracts:deployment.contracts.length}));
