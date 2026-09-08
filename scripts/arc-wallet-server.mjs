import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {getArcStatus,recordArcTransaction,activateArcDeployment} from './lib/arc-deployment.mjs';

// This utility receives public transaction hashes only. All signing stays in the
// browser's injected wallet; the backend prepares and verifies unsigned plans.
const {values}=parseArgs({options:{plan:{type:'string'}},allowPositionals:false});
if(!values.plan)throw Error('Usage: node scripts/arc-wallet-server.mjs --plan <prepared-plan.json>');
const planPath=resolve(values.plan);
const origin='http://127.0.0.1:3100';
const csrf=randomBytes(32).toString('base64url');
const scriptNonce=randomBytes(24).toString('base64url');
const maximumBody=2048;
let queue=Promise.resolve();
function serialize(action){const result=queue.then(action);queue=result.catch(()=>{});return result;}
async function status(){
 const value=await getArcStatus(planPath);
 if(value.chainId!==5042002||!/^0x[0-9a-fA-F]{40}$/.test(value.deployer)||typeof value.planId!=='string'||!value.planId.length)throw Error('The prepared plan does not identify a valid Arc Testnet deployment');
 return value;
}
function headers(response,type){
 response.setHeader('Content-Type',type);
 response.setHeader('Cache-Control','no-store');
 response.setHeader('X-Content-Type-Options','nosniff');
 response.setHeader('Referrer-Policy','no-referrer');
 response.setHeader('Cross-Origin-Resource-Policy','same-origin');
 response.setHeader('X-Frame-Options','DENY');
 response.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 response.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'nonce-${scriptNonce}'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
}
function json(response,code,value){headers(response,'application/json; charset=utf-8');response.writeHead(code);response.end(JSON.stringify(value));}
async function body(request){
 if(request.headers['content-type']!=='application/json')throw Object.assign(Error('Send application/json'),{status:415});
 if(Number(request.headers['content-length']??0)>maximumBody)throw Object.assign(Error('Request body is too large'),{status:413});
 let length=0;const chunks=[];
 for await(const chunk of request){length+=chunk.length;if(length>maximumBody)throw Object.assign(Error('Request body is too large'),{status:413});chunks.push(chunk);}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Invalid JSON body'),{status:400});}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('Expected a JSON object'),{status:400});
 return value;
}

const page=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Orbital · Arc deployment utility</title>
<style nonce="${scriptNonce}">
:root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#0b1430;color:#eef2ff}*{box-sizing:border-box}body{margin:0;padding:32px 20px}main{max-width:920px;margin:auto}header{margin:0 0 24px}h1{font-size:clamp(26px,5vw,40px);line-height:1.1;margin:8px 0 16px}h2{font-size:20px;margin:0 0 14px}p{margin:12px 0}a{color:#c5f36b}.eyebrow{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#c5f36b}.muted{color:#bcc5da;font-size:14px}.card{background:#131f3b;border:1px solid #3d4b67;border-radius:16px;padding:24px;margin:16px 0}dl{display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px;margin:0}dt{color:#bcc5da}dd{margin:0;overflow-wrap:anywhere}code,pre{font:13px/1.5 ui-monospace,monospace}pre{overflow:auto;max-height:320px;white-space:pre-wrap;overflow-wrap:anywhere;background:#080f22;padding:16px;border-radius:8px}button,input{font:inherit}button{min-height:44px;border-radius:8px;border:1px solid #c5f36b;background:#c5f36b;color:#17202b;padding:10px 18px;cursor:pointer;font-weight:650}button.secondary{background:transparent;color:#eef2ff;border-color:#677896}button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid white;outline-offset:4px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0 0}.warning{border-left:3px solid #f3c56b;padding-left:14px;color:#f8daa4}.error{color:#ffc9c9}summary{cursor:pointer;padding:14px 0}input{width:100%;margin:8px 0 12px;background:#080f22;color:#fff;border:1px solid #677896;border-radius:8px;padding:12px}label{display:block}ul{padding-left:22px}li{margin:8px 0;overflow-wrap:anywhere}[hidden]{display:none!important}@media(max-width:560px){body{padding:20px 12px}.card{padding:18px}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}}
</style></head><body><main>
<header><div class="eyebrow">Orbital / operator utility</div><h1>Deploy to Arc Testnet</h1><p>This local utility prepares deployment transactions for your browser wallet. Review each action and approve it in the wallet yourself.</p><p class="muted">Separate from the Orbital application. This server does not hold a key or sign or broadcast transactions.</p></header>
<section class="card" aria-labelledby="status-heading"><h2 id="status-heading">Deployment status</h2><dl><dt>Network</dt><dd>Arc Testnet · 5042002</dd><dt>Authorized wallet</dt><dd><code id="deployer">Loading…</code></dd><dt>Plan</dt><dd id="plan">—</dd><dt>Progress</dt><dd id="progress">—</dd><dt>Connected wallet</dt><dd id="wallet">Not connected</dd></dl><ul class="warning" id="blockers" hidden></ul><div class="actions"><button id="connect" type="button">Connect browser wallet</button><button class="secondary" id="refresh" type="button">Refresh status</button></div></section>
<p id="message" role="status" aria-live="polite"></p>
<section class="card" id="pending" hidden><h2>Transaction in progress</h2><p id="pending-description"></p><p><a id="pending-link" target="_blank" rel="noreferrer" hidden>View on ArcScan ↗</a></p><p class="muted">Reloading resumes this transaction. A new signing request stays disabled until its outcome is reconciled.</p></section>
<section class="card" id="recovery" hidden><h2>Recover a wallet request</h2><p>The browser saved an unfinished request. If the wallet submitted it, paste its public transaction hash from wallet activity. Do not send the same transaction again.</p><form id="recover-form"><label for="recover-hash">Transaction hash</label><input id="recover-hash" type="text" autocomplete="off" spellcheck="false" pattern="0x[0-9a-fA-F]{64}" placeholder="0x…" required><button id="recover" type="submit">Track this transaction</button></form></section>
<section class="card" id="review" hidden><h2 id="next-label">Next transaction</h2><dl><dt>Action</dt><dd id="action">—</dd><dt>Recipient</dt><dd id="recipient">—</dd><dt>USDC sent</dt><dd>0 · deployment gas is charged separately</dd><dt>Maximum gas budget</dt><dd id="gas">—</dd><dt>Nonce</dt><dd id="nonce">—</dd></dl><details><summary>Exact unsigned transaction</summary><pre id="transaction"></pre></details><p class="warning">Confirm the authorized wallet, network, action and gas budget before opening your wallet.</p><button id="send" type="button" disabled>Review and sign in wallet</button></section>
<section class="card" id="complete" hidden><h2>Deployment transactions confirmed</h2><p>Finish to verify and activate the resulting deployment artifacts for the Arc application.</p><button id="activate" type="button">Verify and activate deployment</button></section>
<section class="card"><h2>Planned contract addresses</h2><p class="muted">These addresses come from the prepared plan. Confirmed receipts and final activation verify the actual deployments.</p><pre id="addresses">No prepared addresses available.</pre></section>
<p class="muted">Only public addresses, unsigned transactions and transaction hashes are used here. Keep wallet recovery material inside your wallet.</p>
</main><script nonce="${scriptNonce}">
'use strict';
const csrf=${JSON.stringify(csrf)};
const CHAIN=5042002,CHAIN_HEX='0x4cef52';
const $=id=>document.getElementById(id);
let deployment,provider,account,chain,working=false,refreshing=false,attempt,storageAvailable=true,activated=false;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const isHash=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value);
function message(value,error=false){$('message').textContent=value;$('message').className=error?'error':'';}
function storageKey(){return 'orbital:arc-deployment:'+deployment.planId+':'+deployment.deployer.toLowerCase()+':'+CHAIN;}
function loadAttempt(){
 try{const raw=localStorage.getItem(storageKey());attempt=raw?JSON.parse(raw):undefined;if(attempt&&(attempt.planId!==deployment.planId||!same(attempt.from,deployment.deployer)||attempt.chainId!==CHAIN||!Number.isSafeInteger(attempt.confirmed)||attempt.confirmed<0))throw Error('Stored request does not match this deployment');}
 catch{storageAvailable=false;message('Deployment recovery storage is unavailable or invalid. Enable browser storage before signing; use the saved transaction hash to recover an existing request.',true);}
}
function saveAttempt(value){localStorage.setItem(storageKey(),JSON.stringify(value));attempt=value;}
function clearAttempt(){localStorage.removeItem(storageKey());attempt=undefined;}
async function api(path,value){
 const response=await fetch(path,{method:value===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:value===undefined?{}:{'Content-Type':'application/json','X-Orbital-CSRF':csrf},...(value===undefined?{}:{body:JSON.stringify(value)})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Deployment utility request failed');return result;
}
function validTransaction(){
 const tx=deployment?.next?.transaction;
 if(!tx||!same(tx.from,deployment.deployer))return false;
 const fields=new Set(['from','to','data','nonce','value','chainId','gas','maxFeePerGas','maxPriorityFeePerGas']);
 if(Object.keys(tx).some(key=>!fields.has(key))||!/^0x(?:[0-9a-fA-F]{2})+$/.test(tx.data)||tx.to!==undefined&&!/^0x[0-9a-fA-F]{40}$/.test(tx.to))return false;
 if(['nonce','value','chainId','gas','maxFeePerGas','maxPriorityFeePerGas'].some(key=>typeof tx[key]!=='string'||!/^0x[0-9a-fA-F]+$/.test(tx[key])))return false;
 return BigInt(tx.chainId)===BigInt(CHAIN)&&BigInt(tx.value)===0n&&BigInt(tx.gas)>0n&&BigInt(tx.maxFeePerGas)>=BigInt(tx.maxPriorityFeePerGas);
}
function render(){
 if(!deployment)return;
 $('deployer').textContent=deployment.deployer;$('plan').textContent=deployment.planId;$('progress').textContent=deployment.confirmed+' / '+deployment.total+' confirmed · '+deployment.phase;
 $('wallet').textContent=account?(account+' · '+(chain===CHAIN?'Arc Testnet':'wrong network')):'Not connected';
 $('blockers').replaceChildren(...deployment.blockers.map(value=>{const item=document.createElement('li');item.textContent=value;return item;}));$('blockers').hidden=!deployment.blockers.length;
 $('addresses').textContent=Object.keys(deployment.addresses||{}).length?JSON.stringify(deployment.addresses,null,2):'No prepared addresses available.';
 const hash=deployment.pendingHash||attempt?.hash;
 $('pending').hidden=!hash&&deployment.phase!=='pending';$('pending-description').textContent=hash?'Tracking '+hash:'Waiting for confirmation from Arc.';
 $('pending-link').hidden=!isHash(hash);if(isHash(hash))$('pending-link').href='https://testnet.arcscan.app/tx/'+hash;
 $('recovery').hidden=!attempt||Boolean(deployment.pendingHash);
 if(attempt?.hash&&document.activeElement!==$('recover-hash'))$('recover-hash').value=attempt.hash;
 $('review').hidden=!deployment.next||deployment.phase!=='ready';
 if(deployment.next){const tx=deployment.next.transaction;$('next-label').textContent=deployment.next.label;$('action').textContent=tx.to?'Contract call':'Create contract';$('recipient').textContent=tx.to||'Contract creation';$('gas').textContent=String(deployment.next.gasBudgetUsdc)+' USDC';$('nonce').textContent=/^0x[0-9a-fA-F]+$/.test(tx.nonce)?BigInt(tx.nonce).toString():'Invalid';$('transaction').textContent=JSON.stringify(tx,null,2);}
 $('send').disabled=working||!storageAvailable||Boolean(attempt)||Boolean(deployment.pendingHash)||deployment.phase!=='ready'||!same(account,deployment.deployer)||chain!==CHAIN||!validTransaction();
 $('connect').disabled=working;$('recover').disabled=working;$('activate').disabled=working||Boolean(attempt)||activated;
 $('complete').hidden=deployment.phase!=='complete';$('activate').textContent=activated?'Deployment activated':'Verify and activate deployment';
}
async function refresh(){
 if(refreshing)return;refreshing=true;
 try{
  const next=await api('/api/status');const first=!deployment;deployment=next;if(first)loadAttempt();
  if(attempt&&deployment.confirmed>attempt.confirmed)clearAttempt();
  // A saved hash is submitted for tracking again after a reload or interrupted
  // POST. The backend validates and deduplicates it against the prepared plan.
  if(attempt?.hash&&!deployment.pendingHash&&deployment.phase!=='complete'){
   await api('/api/transaction',{hash:attempt.hash});deployment=await api('/api/status');
   if(deployment.confirmed>attempt.confirmed)clearAttempt();
  }
  render();
 }catch(error){message(error.message,true);render();}finally{refreshing=false;}
}
async function walletIdentity(){
 const [accounts,chainId]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
 account=Array.isArray(accounts)?accounts[0]:undefined;chain=Number(chainId);render();
 if(!same(account,deployment.deployer))throw Error('Select the authorized deployment account in your wallet.');
 if(chain!==CHAIN)throw Error('Switch your wallet to Arc Testnet before signing.');
}
async function connect(){
 if(working)return;working=true;render();
 try{
  if(!deployment)throw Error('Wait for the prepared deployment plan to load.');
  if(!window.ethereum?.request)throw Error('Open this page in a browser with an injected EVM wallet, such as MetaMask or Rabby.');
  if(provider!==window.ethereum){provider=window.ethereum;provider.on?.('accountsChanged',()=>{account=undefined;chain=undefined;render();message('Wallet account changed. Connect again before signing.');});provider.on?.('chainChanged',()=>{chain=undefined;render();message('Wallet network changed. Connect again before signing.');});provider.on?.('disconnect',()=>{account=undefined;chain=undefined;render();});}
  const accounts=await provider.request({method:'eth_requestAccounts'});account=accounts[0];
  if(!same(account,deployment.deployer))throw Error('Select '+deployment.deployer+' in your wallet. This plan cannot use another account.');
  const current=await provider.request({method:'eth_chainId'});
  if(Number(current)!==CHAIN){
   try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]});}
   catch(error){if(error.code!==4902&&error.data?.originalError?.code!==4902)throw error;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:['https://rpc.testnet.arc.io'],blockExplorerUrls:['https://testnet.arcscan.app']}]});await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]});}
  }
  await walletIdentity();message('Authorized wallet connected. Review the next transaction.');
 }catch(error){message(error.message||'Wallet connection did not complete.',true);}finally{working=false;render();}
}
async function send(){
 if(working||!deployment)return;
 if(!navigator.locks?.request){message('This browser cannot safely coordinate deployment requests across tabs. Use a current Chrome, Edge or Firefox browser.',true);return;}
 await navigator.locks.request(storageKey(),{ifAvailable:true},async lock=>{if(!lock){message('Another deployment tab has a wallet request open. Finish or recover that request first.',true);return;}await sendLocked();});
}
async function sendLocked(){
 if(working||!deployment||attempt||deployment.pendingHash)return;
 working=true;render();let sent=false;
 try{
  // Refresh immediately before opening the wallet so a stale browser tab cannot
  // issue a transaction already advanced by the backend or another tab.
  const reviewed=JSON.stringify(deployment.next);
  deployment=await api('/api/status');loadAttempt();
  if(attempt||deployment.pendingHash||deployment.phase!=='ready'||!storageAvailable||!validTransaction())throw Error('This transaction is no longer ready. Refresh and review its current status.');
  if(JSON.stringify(deployment.next)!==reviewed)throw Error('The transaction or gas budget changed. Review the updated details before signing.');
  await walletIdentity();
  saveAttempt({planId:deployment.planId,from:deployment.deployer,chainId:CHAIN,confirmed:deployment.confirmed,label:deployment.next.label,nonce:deployment.next.transaction.nonce,createdAt:new Date().toISOString()});
  message('Confirm the reviewed transaction in your wallet.');
  let hash;
  try{hash=await provider.request({method:'eth_sendTransaction',params:[deployment.next.transaction]});}
  catch(error){if(error.code===4001||error.data?.originalError?.code===4001)clearAttempt();throw error;}
  if(!isHash(hash))throw Error('The wallet did not return a valid transaction hash. Check wallet activity and recover the request below.');
  // Store before any HTTP request: if the utility or network goes away, reload
  // resumes tracking instead of opening a duplicate wallet request.
  attempt={...attempt,hash};sent=true;
  try{saveAttempt(attempt);}catch{storageAvailable=false;message('Transaction submitted: '+hash+'. Browser recovery storage failed; keep this public hash.',true);}
  render();
  await api('/api/transaction',{hash});message('Transaction submitted. Waiting for Arc confirmation.');
 }catch(error){message(error.message||(sent?'The transaction was submitted; its saved hash will resume tracking.':'The wallet request did not complete.'),true);}
 finally{working=false;render();await refresh();}
}
async function recover(event){
 event.preventDefault();if(working||!deployment)return;
 const hash=$('recover-hash').value.trim();if(!isHash(hash)){message('Enter a complete public transaction hash.',true);return;}
 working=true;render();
 try{saveAttempt({...attempt,planId:deployment.planId,from:deployment.deployer,chainId:CHAIN,confirmed:attempt?.confirmed??deployment.confirmed,hash});await api('/api/transaction',{hash});message('Saved transaction hash accepted for tracking.');}
 catch(error){message(error.message,true);}finally{working=false;render();await refresh();}
}
async function activate(){
 if(working||attempt||deployment?.phase!=='complete')return;working=true;render();
 try{await api('/api/activate',{});activated=true;message('Deployment artifacts verified and activated. The Arc application can use this deployment.');}
 catch(error){message(error.message,true);}finally{working=false;render();await refresh();}
}
$('connect').addEventListener('click',connect);$('send').addEventListener('click',send);$('refresh').addEventListener('click',refresh);$('recover-form').addEventListener('submit',recover);$('activate').addEventListener('click',activate);
window.addEventListener('storage',event=>{if(deployment&&event.key===storageKey()){loadAttempt();render();}});
void refresh();setInterval(()=>{if(!working)void refresh();},4000);
</script></body></html>`;

const server=createServer(async(request,response)=>{
 try{
  if(request.socket.remoteAddress!=='127.0.0.1'||request.headers.host!=='127.0.0.1:3100'||request.headers.origin&&request.headers.origin!==origin||request.headers['sec-fetch-site']==='cross-site'){json(response,403,{error:'Use the local deployment utility at '+origin});return;}
  if(request.method==='GET'&&request.url==='/'){headers(response,'text/html; charset=utf-8');response.writeHead(200);response.end(page);return;}
  if(request.method==='GET'&&request.url==='/api/status'){json(response,200,await serialize(status));return;}
  if(request.method!=='POST'||!['/api/transaction','/api/activate'].includes(request.url)){json(response,404,{error:'Not found'});return;}
  if(request.headers.origin!==origin||request.headers['x-orbital-csrf']!==csrf){json(response,403,{error:'Reload the local deployment page before continuing'});return;}
  const input=await body(request);
  if(request.url==='/api/transaction'){
   if(Object.keys(input).length!==1||typeof input.hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(input.hash)){json(response,400,{error:'A single public transaction hash is required'});return;}
   await serialize(()=>recordArcTransaction(planPath,input.hash));json(response,200,{recorded:true});return;
  }
  if(Object.keys(input).length){json(response,400,{error:'Activation does not accept parameters'});return;}
  await serialize(async()=>{const current=await status();if(current.phase!=='complete')throw Error('Confirm every planned transaction before activation');await activateArcDeployment(planPath);});
  json(response,200,{activated:true});
 }catch(error){if(!response.headersSent)json(response,error.status??400,{error:typeof error.message==='string'?error.message.slice(0,800):'Deployment utility request failed'});else response.end();}
});
server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
server.on('error',error=>{console.error('Arc deployment utility could not start: '+error.message);process.exitCode=1;});
await serialize(status);
server.listen(3100,'127.0.0.1',()=>console.log('Arc deployment utility: '+origin+'\nAll signing requires the authorized browser wallet.'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeIdleConnections();});
