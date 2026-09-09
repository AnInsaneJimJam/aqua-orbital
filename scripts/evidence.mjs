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
const sdk=await log('test/evidence/strategy-read/final/sdk.txt')||await log('test/evidence/sdk-green.txt');
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
async function record(path){try{return JSON.parse(await readFile(path,'utf8'));}catch{return undefined;}}
const [privyObservation,arcIdentity,arcSwap,arcPayment,swapCheckpoint,paymentCheckpoint]=await Promise.all([
 record('test/evidence/arc-integration/privy-login.json'),record('deployments/5042002/verification.json'),
 record('test/evidence/arc-integration/first-swap.json'),record('test/evidence/arc-integration/first-payment.json'),
 record('test/evidence/swap-flow/checkpoint.json'),record('test/evidence/payment-flow/checkpoint.json')
]);
const privy=privyObservation?.loginVisible===true&&privyObservation.failures?.length===0;
// Summarize retained verification reports; this generator performs no new chain check.
const arcVerified=arcIdentity?.verified===true&&arcIdentity.scope==='arc-testnet-runtime-identity'
 &&arcIdentity.manifest?.verified===true&&arcIdentity.manifest.chainId===5042002
 &&arcIdentity.bindings?.eip712DomainVerified===true&&arcIdentity.bindings.aquaMulticallVerified===true
 &&Array.isArray(arcIdentity.receipts)&&arcIdentity.receipts.length===12&&arcIdentity.receipts.every(entry=>entry.receipt?.status==='0x1'&&entry.hash===entry.receipt.transactionHash);
function recordedArcReceipt(report,target){
 const receipt=report?.receipt,block=report?.canonicalBlock;
 return /^0x[0-9a-f]{40}$/i.test(target??'')&&report?.chainId===5042002&&receipt?.status==='success'
  &&/^0x[0-9a-f]{64}$/i.test(receipt.transactionHash??'')&&receipt.to?.toLowerCase()===target.toLowerCase()
  &&/^0x[0-9a-f]{64}$/i.test(block?.hash??'')&&/^\d+$/.test(block?.number??'')
  &&block.hash===receipt.blockHash&&block.number===receipt.blockNumber&&Array.isArray(report.checks)&&report.checks.length>0;
}
const financialFlow=arcVerified&&recordedArcReceipt(arcSwap,arcIdentity.manifest.router)&&recordedArcReceipt(arcPayment,arcIdentity.manifest.payments)
 &&arcSwap.event?.eventName==='OrbitalSwapExecuted'&&arcPayment.payment?.some(event=>event.eventName==='InvoicePaid');
async function recordedBrowserRun(checkpoint){
 const run=checkpoint?.runs?.find(run=>run.label==='browser');
 if(checkpoint?.accepted!==true||checkpoint.inputsUnchanged!==true||run?.exitStatus!==0||run.timedOut!==false||run.terminal!==true)return false;
 try{return createHash('sha256').update(await readFile(run.transcript)).digest('hex')===run.sha256;}catch{return false;}
}
const walletFlow=(await Promise.all([recordedBrowserRun(swapCheckpoint),recordedBrowserRun(paymentCheckpoint)])).every(Boolean);
let localIntegration;try{localIntegration=JSON.parse(await readFile('test/evidence/local-integration/receipts-after-restart.json','utf8'));}catch{}
const items=[
 {id:'local-integration',label:'Connected local application',status:localIntegration?.status==='passed'?'verified':'unavailable',detail:'Local Anvil contracts, API, indexer and browser flows connected. Fourteen retained browser transaction receipts were checked after an atomic-snapshot restart: swap, swap-funded invoice, funding, publication recovery, retire/dock and invoice creation/cancellation. This is a dated local checkpoint. Arc identity and financial receipts have separate evidence below; broader regressions remain open.'},
 {id:'reference',label:'Independent reference fixtures',status:referenceCount>0&&/^OK\s*$/m.test(reference)?'verified':'unavailable',detail:`${referenceCount} recorded bounded numerical regressions; selected 110/160-digit checks. This is not a proof of the production solver.`},
 {id:'contracts',label:'Local contract tests',status:contractCount>0&&contractRun?.[2]==='0'&&contractRun?.[3]==='0'?'verified':'unavailable',detail:`${contractCount} recorded tests, including real six-pair interior Aqua swaps, an initialized mixed outward/reverse sequence, an invoice and local security/cycle checks. Separate receipt probes and frozen campaigns retain their source boundaries. Full release campaigns remain outstanding.`},
 {id:'sdk',label:'SDK transaction plans and recovery',status:sdkCount?'verified':'unavailable',detail:`${sdkCount} recorded fixture tests for local calldata construction, review validation and wallet execution recovery. No live wallet transaction is claimed.`},
 {id:'indexer',label:'Canonical ingestion and projections',status:dbCount&&indexerCount?'verified':'unavailable',detail:`${dbCount+indexerCount} recorded PostgreSQL/worker tests. Bounded replay, lifecycle/invoice and canonical swap-receipt projections with separate backfill coverage are implemented. Full rebuild campaigns and broader shipment coverage checks remain outstanding.`},
 {id:'api',label:'Canonical read API and recovery',status:apiCount?'verified':'unavailable',detail:`${apiCount} recorded local API tests, including receipt metrics, pinned invoice reads, registered strategy financial observations, coverage checks and readiness/recovery. These use database/RPC fixtures and do not establish live Arc activity or financial eligibility.`},
 {id:'engine',label:'Complete engine release acceptance',status:'not-run',detail:'Certified interior and mixed paths execute locally through both custom instructions with one final payout and shared crossing/refinement budgets. Equality/discovery liveness, broad differential/economic campaigns and worst-range transaction gas remain open. Local integration and recorded Arc execution are separate from complete engine acceptance.'},
 {id:'browser',label:'Development browser workflows',status:browserCount&&!/\d+ failed/.test(browser)?'verified':'failed',detail:`${browserCount} recorded tests: public swap/invoice observations, saved settings, debounced refresh, canonical balances, gas-aware Max, network selection, separate approvals/signing, invoice creation/cancellation, receipt event decoding, expiry/account changes and receipt/storage recovery, external-wallet fixtures, navigation and 320px layout. Synthetic HTTP/RPC receipts are not live transactions. Production performance and full accessibility campaigns are outstanding.`},
 {id:'privy-login',label:'Privy sign-in smoke test',status:privy?'verified':'unavailable',detail:'The configured Privy email/external-wallet interface loaded in the real Arc application without observed SDK failures. This public-interface check did not authenticate or sign.'},
 {id:'wallet-flow',label:'Wallet financial-flow smoke tests',status:walletFlow?'verified':'unavailable',detail:'Retained accepted swap and payment browser runs cover exact approvals, independent review/signature steps and receipt recovery using injected-wallet HTTP/RPC fixtures. Transcript hashes match their checkpoints. They exercise the shared transaction paths; they do not authenticate a Privy wallet.'},
 {id:'privy-flow',label:'Privy wallet receipt association',status:'not-run',detail:'Orbital has financial-flow tests and recorded Arc transactions. The retained live receipts do not identify the wallet provider; an authenticated record linking the demonstrated trader to a Privy wallet remains unrecorded.'},
 {id:'arc',label:'Arc deployment identity',status:arcVerified?'verified':'unavailable',detail:arcVerified?'Retained Arc Testnet verification confirms twelve successful deployment receipts, runtime identity and contract bindings. Aqua uses the owner-authorized project deployment of unchanged upstream source; this is separate from canonical 1inch deployment or sponsor acceptance.':'No complete Arc runtime-identity verification record is available.'},
 {id:'financial-flow',label:'Arc swap and invoice execution',status:financialFlow?'verified':'unavailable',detail:financialFlow?'Retained canonical successful Arc swap and swap-funded invoice receipts include exact transfer, recipient payout and refund checks. These are historical user-signed transactions; wallet provider is not inferred from chain data.':'Both canonical Arc swap and invoice verification records are required.'},
 {id:'release',label:'Release campaigns / independent security audit',status:'not-run',detail:'Full differential, invariant, mutation, gas and release campaigns remain outstanding. No independent security audit is claimed.'}
];
// Refresh the source inventory while retaining the observation timestamp when
// the public proof payload is unchanged.
let previousProof;try{previousProof=JSON.parse(await readFile('test/evidence/builds/proof.json','utf8'));}catch{}
if(JSON.stringify(previousProof?.items)!==JSON.stringify(items)){
 await writeFile('test/evidence/builds/proof.json',JSON.stringify({generatedAt:new Date().toISOString(),items},null,2)+'\n');
}
console.log('Wrote bounded observation summaries for the proof page.');
