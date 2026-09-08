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
let privy=false;try{privy=JSON.parse(await readFile('test/evidence/privy-login.json','utf8')).loginVisible===true;}catch{}
const items=[
 {id:'reference',label:'Independent reference fixtures',status:/Ran 15 tests/.test(reference)&&/\bOK\b/.test(reference)?'verified':'unavailable',detail:'15 bounded numerical regressions; selected 110/160-digit checks. This is not a proof of the production solver.'},
 {id:'contracts',label:'Local contract tests',status:/27 tests passed, 0 failed/.test(contracts)?'verified':'unavailable',detail:'27 unit/probe tests, including local primitive fuzz cases. The six-pair Aqua probe and payment router double do not execute the Orbital curve.'},
 {id:'engine',label:'Certified Orbital swap engine',status:'not-run',detail:'Complete integer traversal and rounded-state path proof remain unfinished. Financial execution is unavailable.'},
 {id:'browser',label:'Development browser workflows',status:/4 passed/.test(browser)&&!/\d+ failed/.test(browser)?'verified':'failed',detail:'Isolated external-wallet fixtures, navigation, guarded strategy preview and 320px layout. Production performance and full accessibility campaigns are outstanding.'},
 {id:'privy-login',label:'Privy sign-in interface',status:privy?'verified':'unavailable',detail:'Public email/external-wallet sign-in UI only. Wallet creation, reconnection and hosted signatures are not verified.'},
 {id:'privy-flow',label:'Privy financial-flow qualification',status:'not-run',detail:'Requires a real embedded-wallet Orbital swap and swap-funded USDC invoice with receipts.'},
 {id:'arc',label:'Arc deployment identity',status:'unavailable',detail:'The recorded Aqua candidate has empty runtime code on Arc Testnet. No verified Orbital deployment or transaction receipts exist.'},
 {id:'release',label:'Release campaigns / independent security audit',status:'not-run',detail:'Full differential, invariant, mutation, gas and release campaigns remain outstanding. No independent security audit is claimed.'}
];
await writeFile('test/evidence/builds/proof.json',JSON.stringify({generatedAt:new Date().toISOString(),items},null,2)+'\n');
console.log('Wrote bounded observation summaries for the proof page.');
