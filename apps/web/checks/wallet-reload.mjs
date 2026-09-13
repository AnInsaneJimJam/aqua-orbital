// Real Privy profile, simulated authorized wallet; no login, signatures or sends.
// PLAYWRIGHT_CHANNEL=chrome node apps/web/checks/wallet-reload.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const origin=process.env.PLAYWRIGHT_BASE_URL??'http://localhost:3002';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
try{
 const page=await browser.newPage();
 let privyLoaded=false;
 page.on('response',response=>{const url=new URL(response.url());if(url.hostname==='auth.privy.io'&&/^\/api\/v1\/apps\/[^/]+$/.test(url.pathname)&&response.status()===200)privyLoaded=true;});
 await page.addInitScript(()=>{
  const address='0x0000000000000000000000000000000000000001',listeners=new Map();
  window.__walletRequests=[];
  const permissions=[{parentCapability:'eth_accounts',caveats:[{type:'restrictReturnedAccounts',value:[address]}]}];
  const provider={isMetaMask:true,isConnected:()=>true,_metamask:{isUnlocked:async()=>true},
   on(event,listener){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(listener);return provider;},
   removeListener(event,listener){listeners.get(event)?.delete(listener);return provider;},
   async request({method}){
    window.__walletRequests.push(method);
    if(method==='eth_accounts')return [address];
    if(method==='eth_chainId')return '0x4cef52';
    if(method==='wallet_getPermissions')return permissions;
    if(method==='wallet_getCapabilities')return {};
    if(method==='net_version')return '5042002';
    if(method==='wallet_requestPermissions'||method==='eth_requestAccounts')throw Object.assign(Error('Declined redundant wallet permission request'),{code:4001});
    throw Object.assign(Error(`Unsupported fixture method: ${method}`),{code:4200});
   },
  };
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});
  const info={uuid:'221fe501-51d1-4e68-80b4-fc5199606f12',name:'MetaMask',rdns:'io.metamask',icon:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="orange"/></svg>')};
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info,provider}}));
  window.addEventListener('eip6963:requestProvider',announce);announce();
 });
 for(let load=0;load<3;load++){
  if(load===0)await page.goto(origin);else await page.reload();
  await page.waitForFunction(()=>window.__walletRequests.some(method=>method==='wallet_requestPermissions'||method==='eth_requestAccounts')||[...document.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Manage connected wallet'&&button.getClientRects().length>0),null,{timeout:25000});
  // Allow queued SDK effects to reveal a late permission request after connection.
  await page.waitForTimeout(250);
  const methods=await page.evaluate(()=>window.__walletRequests);
  const counts={};for(const method of methods)counts[method]=(counts[method]??0)+1;
  console.log(JSON.stringify({load:load===0?'initial':`reload ${load}`,methods:counts}));
  assert.equal(counts.wallet_requestPermissions??0,0,'Restoring an authorized wallet requested permissions');
  assert.equal(counts.eth_requestAccounts??0,0,'Restoring an authorized wallet requested accounts');
  await expect(page.getByRole('button',{name:'Manage connected wallet',exact:true})).toHaveText('0x0000…0001');
  assert.ok(privyLoaded,'Run this check against a Privy-enabled app');
 }
}finally{await browser.close();}
