import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const tracked = execFileSync('git', ['ls-files'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
const files = {};
for (const path of [...new Set([...tracked,...untracked])].sort()) {
  if (path.startsWith('test/evidence/builds/')) continue;
  files[path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
await mkdir('test/evidence/builds', {recursive:true});
await writeFile('test/evidence/builds/source.json', JSON.stringify({createdAt:new Date().toISOString(), node:process.version, files, note:'Source hashes only; this manifest does not assert passed tests or verified deployment.'},null,2)+'\n');
console.log('Wrote source evidence manifest.');

async function log(path){try{const data=await readFile(path);return data[0]===255&&data[1]===254?data.subarray(2).toString('utf16le'):data.toString('utf8');}catch{return '';}}
const reference=await log('test/evidence/reference-audit/tests.txt');
const contracts=await log('test/evidence/contracts.txt');
const browser=await log('test/evidence/browser.txt');
const sdk=await log('test/evidence/sdk-green.txt');
const db=await log('test/evidence/database.txt');
const indexer=await log('test/evidence/indexer.txt');
const api=await log('test/evidence/api.txt');
const referenceCount=Number([...reference.matchAll(/Ran (\d+) tests?\b/g)].at(-1)?.[1]??0);
const contractRun=[...contracts.matchAll(/: (\d+) tests passed, (\d+) failed, (\d+) skipped \(/g)].at(-1);
const contractCount=Number(contractRun?.[1]??0);
function tapCount(contents){
 const passed=Number([...contents.matchAll(/(?:#|ℹ) pass (\d+)/g)].at(-1)?.[1]??0);
 const failed=[...contents.matchAll(/(?:#|ℹ) fail (\d+)/g)].at(-1)?.[1];
 const skipped=[...contents.matchAll(/(?:#|ℹ) skipped (\d+)/g)].at(-1)?.[1];
 return passed>0&&failed==='0'&&skipped==='0'?passed:0;
}
const sdkCount=tapCount(sdk),dbCount=tapCount(db),indexerCount=tapCount(indexer),apiCount=tapCount(api);
const browserCount=Number([...browser.matchAll(/\b(\d+) passed\s*\(/g)].at(-1)?.[1]??0);
let privy=false;try{privy=JSON.parse(await readFile('test/evidence/privy-login.json','utf8')).loginVisible===true;}catch{}
const items=[
 {id:'reference',label:'Independent reference fixtures',status:referenceCount>0&&/^OK\s*$/m.test(reference)?'verified':'unavailable',detail:`${referenceCount} recorded bounded numerical regressions; selected 110/160-digit checks. This is not a proof of the production solver.`},
 {id:'contracts',label:'Local contract tests',status:contractCount>0&&contractRun?.[2]==='0'&&contractRun?.[3]==='0'?'verified':'unavailable',detail:`${contractCount} recorded tests, including real six-pair interior Aqua swaps, an initialized mixed outward/reverse sequence, an invoice and local security/cycle checks. Separate receipt probes and frozen campaigns retain their source boundaries. Full release campaigns remain outstanding.`},
 {id:'sdk',label:'SDK transaction plans and recovery',status:sdkCount?'verified':'unavailable',detail:`${sdkCount} recorded fixture tests for local calldata construction, review validation and wallet execution recovery. No live wallet transaction is claimed.`},
 {id:'indexer',label:'Canonical ingestion and projections',status:dbCount&&indexerCount?'verified':'unavailable',detail:`${dbCount+indexerCount} recorded PostgreSQL/worker tests. Bounded replay, lifecycle/invoice and canonical swap-receipt projections with separate backfill coverage are implemented. Full rebuild campaigns and incomplete shipment coverage remain outstanding.`},
 {id:'api',label:'Canonical read API and recovery',status:apiCount?'verified':'unavailable',detail:`${apiCount} recorded local API tests, including receipt metrics, pinned invoice reads, registered strategy financial observations, coverage checks and readiness/recovery. These use database/RPC fixtures and do not establish live Arc activity or financial eligibility.`},
 {id:'engine',label:'Complete engine release acceptance',status:'not-run',detail:'Certified interior and mixed paths execute locally through both custom instructions with one final payout and shared crossing/refinement budgets. Equality/discovery liveness, broad differential/economic campaigns and worst-range transaction gas remain open. A verified application deployment and live Privy/Arc demonstration remain outstanding.'},
 {id:'browser',label:'Development browser workflows',status:browserCount&&!/\d+ failed/.test(browser)?'verified':'failed',detail:`${browserCount} recorded tests: public swap/invoice observations, separate swap/payment approvals and signing, actual swap-event decoding, expiry/account changes, receipt/storage recovery, external-wallet fixtures, navigation and 320px layout. Synthetic HTTP/RPC receipts are not live transactions. Production performance and full accessibility campaigns are outstanding.`},
 {id:'privy-login',label:'Privy sign-in interface',status:privy?'verified':'unavailable',detail:'Public email/external-wallet sign-in UI only. Wallet creation, reconnection and hosted signatures are not verified.'},
 {id:'privy-flow',label:'Privy financial-flow qualification',status:'not-run',detail:'Requires a real embedded-wallet Orbital swap and swap-funded USDC invoice with receipts.'},
 {id:'arc',label:'Arc deployment identity',status:'unavailable',detail:'The recorded Aqua candidate has empty runtime code on Arc Testnet. No verified Orbital deployment or transaction receipts exist.'},
 {id:'release',label:'Release campaigns / independent security audit',status:'not-run',detail:'Full differential, invariant, mutation, gas and release campaigns remain outstanding. No independent security audit is claimed.'}
];
// Refresh the source inventory while retaining the observation timestamp when
// the public proof payload is unchanged.
let previousProof;try{previousProof=JSON.parse(await readFile('test/evidence/builds/proof.json','utf8'));}catch{}
if(JSON.stringify(previousProof?.items)!==JSON.stringify(items)){
 await writeFile('test/evidence/builds/proof.json',JSON.stringify({generatedAt:new Date().toISOString(),items},null,2)+'\n');
}
console.log('Wrote bounded observation summaries for the proof page.');
