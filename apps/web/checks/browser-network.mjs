// Read-only live integration check: no login, wallet provider, signature or send.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const {encodeFunctionData}=require('viem');
const {erc20Abi}=require('viem');
const manifest=JSON.parse(await readFile(new URL('../../../deployments/5042002/manifest.json',import.meta.url),'utf8'));
const directory=new URL('../../../test/evidence/browser-rpc/',import.meta.url);await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{
 for(const origin of ['http://localhost:3002','http://127.0.0.1:3002']){
  const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();page.setDefaultTimeout(45000);
  const errors=[],blocked=[];
  page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text().slice(0,2000));});
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('https://rpc.blockdaemon.testnet.arc.io/**',route=>{blocked.push(route.request().url());return route.abort('blockedbyclient');});
  await context.addInitScript(()=>{
   const inject=()=>{if(!document.body)return false;document.body.setAttribute('cz-shortcut-listen','true');document.body.setAttribute('__processed_browser_test__','true');return true;};
   if(!inject()){const observer=new MutationObserver(()=>{if(inject())observer.disconnect();});observer.observe(document,{childList:true,subtree:true});}
  });
  const response=await page.goto(origin+'/fund');await expect(page.getByRole('button',{name:'Connect wallet',exact:true}).first()).toBeEnabled();
  const account='0x5eBA55e1b43c8714E4432250Dada7A518780C871';
  const tokenCalls=manifest.tokens.filter(t=>t.mock).map(t=>({symbol:t.symbol,address:t.address,data:encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[account]}),approveData:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[manifest.router,0n]})}));
  const rpc=await page.evaluate(async({tokenCalls,account})=>{
   let id=0;async function read(method,params){const response=await fetch('/api/chain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});const result=await response.json();if(!response.ok||result.error)throw Error(JSON.stringify(result));return result.result;}
   let directBlocked=false;try{await fetch('https://rpc.blockdaemon.testnet.arc.io/',{method:'POST',body:'{}'});}catch{directBlocked=true;}
   const chain=await read('eth_chainId',[]),block=await read('eth_getBlockByNumber',['latest',false]);
   const balances=await Promise.all(tokenCalls.map(async t=>({symbol:t.symbol,raw:BigInt(await read('eth_call',[{to:t.address,data:t.data},{blockHash:block.hash,requireCanonical:true}])).toString()})));
   const nativeBalance=BigInt(await read('eth_getBalance',[account,block.number])).toString();
   // Simulate a zero approval without submitting it. The owner may already
   // have claimed the faucet; its 24-hour cooldown is valid changing chain state.
   const tx={from:account,to:tokenCalls[0].address,data:tokenCalls[0].approveData,value:'0x0'};
   const simulation=await read('eth_call',[tx,{blockHash:block.hash,requireCanonical:true}]);
   const gas=BigInt(await read('eth_estimateGas',[tx,block.number])).toString();
   return {directBlocked,chain,block:block.number,balances,nativeBalance,simulation,gas};
  },{tokenCalls,account});
  // Two app clicks in one event turn must open only one SDK modal.
  await page.getByRole('button',{name:'Connect wallet',exact:true}).first().evaluate(button=>{button.click();button.click();});
  await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
  const modalCount=await page.getByPlaceholder('your@email.com').count();
  const unexpected=errors.filter(e=>!e.includes('ERR_BLOCKED_BY_CLIENT'));
  const result={origin,observedAt:new Date().toISOString(),httpStatus:response.status(),rpc,modalCount,blockedRequests:blocked.length,errors:unexpected};results.push(result);
  await writeFile(new URL('observation.json',directory),JSON.stringify({scope:'fresh Chromium with RPC host deliberately blocked and extension body attributes injected; actual read-only Arc RPC, no wallet/auth/signatures',results},null,2)+'\n');
  console.log(JSON.stringify(result));expect(rpc.directBlocked).toBe(true);expect(rpc.chain).toBe('0x4cef52');expect(modalCount).toBe(1);expect(unexpected.filter(e=>/hydration|hydrated|configured chains are not supported|Cannot redefine property/i.test(e))).toEqual([]);
  await context.close();
 }
}finally{await browser.close();}
