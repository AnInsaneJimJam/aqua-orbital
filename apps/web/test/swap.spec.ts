import {test, expect, type Page} from '@playwright/test';
import {encodeAbiParameters, keccak256, type Address} from 'viem';
import {buildOrder, configFromDTO, decodeSwapQuoteObservation, hashConfig, hashOrder} from '@orbital/sdk';
import wire from '../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};

const now = 1700000003200, wallet = wire.request.wallet;
const headers = {'access-control-allow-origin': '*', 'cache-control': 'no-store'};
function fixture() {
  const value = structuredClone(wire);value.request.slippageBps=value.observed.request.slippageBps=10;
  value.manifest.chainId = 5042002;
  value.observed.chainId = 5042002;
  value.observed.deploymentId = keccak256(encodeAbiParameters([{type:'uint256'}, {type:'address'}, {type:'address'}, {type:'address'}],
    [5042002n, value.manifest.aqua as Address, value.manifest.router as Address, value.manifest.payments as Address]));
  value.request.recipient = wallet; value.observed.request.recipient = wallet;
  const hashes = new Map<string,string>();
  for (const r of [value.observed.data.best, ...value.observed.data.alternatives]) {
    r.minimumOutRaw=(BigInt(r.amountOutRaw)*9990n/10000n).toString();const old = r.orderHash; r.recipient = wallet; r.config.chainId = '5042002';
    const config = configFromDTO(r.config); r.configHash = hashConfig(config); r.orderHash = hashOrder(buildOrder(config)); hashes.set(old, r.orderHash);
  }
  for (const d of value.observed.data.diagnostics) d.orderHash = hashes.get(d.orderHash)!;
  // Changing the chain changes tied order hashes; preserve the real ranking.
  const ranked=[value.observed.data.best,...value.observed.data.alternatives].sort((a,b)=>a.feePpm-b.feePpm || a.orderHash.localeCompare(b.orderHash));
  value.observed.data.best=ranked[0]!;value.observed.data.alternatives=ranked.slice(1);
  decodeSwapQuoteObservation(value.observed,200,value.manifest,value.request,now);
  return value;
}
async function installWallet(page: Page) {
  await page.addInitScript(({address}) => {
    const listeners = new Map<string,Set<(value:unknown)=>void>>(); let connected = false, current = address, chain = '0x4cef52';
    const calls:string[] = [];
    const provider = {isMetaMask:true, isConnected:()=>connected,
      on:(event:string, callback:(value:unknown)=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(callback);return provider;},
      removeListener:(event:string,callback:(value:unknown)=>void)=>{listeners.get(event)?.delete(callback);return provider;},
      request:async({method}:{method:string})=>{calls.push(method);
        if(method==='eth_chainId')return chain;
        if(method==='eth_accounts')return connected?[current]:[];
        if(method==='eth_requestAccounts'){connected=true;return [current];}
        if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
        if(method==='wallet_getPermissions')return [];
        if(method==='wallet_revokePermissions'){connected=false;return null;}
        throw Object.assign(Error(`Read-only fixture rejects ${method}`),{code:4200});
      }};
    Object.defineProperty(window,'ethereum',{value:provider,configurable:true});
    Object.assign(window,{swapWallet:{calls,
      account:(next:string)=>{current=next;for(const callback of listeners.get('accountsChanged')??[])callback([current]);},
      chain:(next:string)=>{chain=next;for(const callback of listeners.get('chainChanged')??[])callback(chain);}}});
  }, {address:wallet});
}
async function setup(page:Page, respond:(body:unknown)=>unknown = ()=>fixture().observed, status:()=>number = ()=>200) {
  await installWallet(page);
  await page.route('https://rpc.testnet.arc.io/**',route=>route.abort());
  await page.route('**/deployment', route=>route.fulfill({json:fixture().manifest,headers}));
  await page.route('**/quotes/swap', async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
    const body = route.request().postDataJSON(); await route.fulfill({json:respond(body),status:status(),headers});
  });
  await page.goto('/swap');
  await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
  await page.getByLabel('Input token').selectOption('USDC'); await page.getByLabel('You receive').selectOption('oUSD18');

  // Keep timers running: TanStack schedules notifications through timers too.
  // Install after hydration so cold development compilation does not age data.
  await page.clock.install({time:new Date(now)});
  await page.getByLabel('You pay').fill('9007199254.740993');
}
const getQuote=(page:Page)=>page.getByRole('button',{name:/^(Get quote|Refresh quote|Switch to Arc Testnet)$/});
const refresh=(page:Page)=>page.getByRole('button',{name:'Refresh quote',exact:true});
const output=(page:Page)=>page.getByLabel('Quoted output',{exact:true});

test('checked swap observation shows exact amounts, recipient and bounded coverage without requesting signatures',async({page})=>{
  let body:unknown;await setup(page, request=>{body=request;return fixture().observed;});
  await page.setViewportSize({width:320,height:760});await getQuote(page).click();
  await expect(output(page)).toBeVisible({timeout:5000});
  await expect(output(page)).toHaveText('20 oUSD18');
  expect(body).toEqual(fixture().request);
  await expect(page.getByText('19.98 oUSD18',{exact:true})).toBeVisible();
  await expect(page.getByText('900719.925475 USDC',{exact:true})).toBeVisible();
  await expect(page.getByText('Quote observation. Review checks current funds, strategy availability and transaction simulation before any signature.',{exact:true})).toBeVisible();
  await expect(page.getByText(wallet,{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/approve|confirm swap/i})).toHaveCount(0);
  await page.getByText('Quote details',{exact:true}).click();
  await expect(page.getByText('Best among the strategies checked · 4 inspected.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const calls=await page.evaluate(()=>(window as unknown as {swapWallet:{calls:string[]}}).swapWallet.calls);
  expect(calls.some(m=>/sendTransaction|sign|estimateGas/i.test(m))).toBeFalsy();
  await page.screenshot({path:'../../test/evidence/swap-observation-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'../../test/evidence/swap-observation-desktop.png',fullPage:true});
});

test('edits clear the previous quote and malformed responses expose no amounts',async({page})=>{
  let malformed=false;await setup(page,()=>{const f=fixture();if(malformed)f.observed.data.best.minimumOutRaw='20000000000000000001';return f.observed;});
  await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  await page.getByLabel('You pay').fill('1');await expect(output(page)).toHaveCount(0);
  await page.getByLabel('You pay').fill('9007199254.740993');await expect(output(page)).toHaveCount(0);
  malformed=true;await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});
  await expect(output(page)).toHaveCount(0);malformed=false;await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
});

test('quote freshness expires on screen and refresh obtains a new checked observation',async({page})=>{
  let current=now;await setup(page,()=>{const f=fixture(),seconds=Math.floor(current/1000);
    f.observed.freshness={...f.observed.freshness,indexedAt:new Date(current-100).toISOString(),observedAt:new Date(current).toISOString(),blockTimestamp:String(seconds)};
    for(const r of [f.observed.data.best,...f.observed.data.alternatives]){r.expiresAt=String(seconds+20);if(current>now){r.amountOutRaw='21000000000000000000';r.minimumOutRaw=(BigInt(r.amountOutRaw)*9990n/10000n).toString();}}return f.observed;
  });
  await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  current+=11000;await page.clock.fastForward(11000);await expect(output(page)).toHaveText('21 oUSD18');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});current+=21000;await page.clock.fastForward(21000);await expect(output(page)).toHaveCount(0);
  await expect(page.getByText('Quote expired. Refresh to check current amounts.',{exact:true})).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(output(page)).toBeVisible({timeout:5000});
});

test('wallet and chain changes invalidate observations and wrong chain sends no new quote request',async({page})=>{
  let count=0;await setup(page,()=>{count++;return fixture().observed;});await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  await page.evaluate(()=>(window as unknown as {swapWallet:{account:(a:string)=>void}}).swapWallet.account('0x0000000000000000000000000000000000000032'));
  await expect(output(page)).toHaveCount(0);
  await page.evaluate(({address})=>(window as unknown as {swapWallet:{account:(a:string)=>void;chain:(c:string)=>void}}).swapWallet.account(address),{address:wallet});
  await expect(output(page)).toHaveCount(0);await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  await page.evaluate(()=>(window as unknown as {swapWallet:{chain:(c:string)=>void}}).swapWallet.chain('0x1'));
  await expect(output(page)).toHaveCount(0);await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Switch to Arc Testnet');const stopped=count;await page.clock.runFor(350);expect(count).toBe(stopped);
});

test('bounded absence and outage are distinct, and failed refresh removes previously checked amounts',async({page})=>{
  let mode='success';await setup(page,()=>{
    const f=fixture();if(mode==='outage')return f.unavailable;
    if(mode==='empty')return {...f.observed,code:'NO_ROUTE_IN_INSPECTED_SET',data:{...f.observed.data,best:null,alternatives:[],counts:{scanned:0,locallyAccepted:0,inspected:0,eligible:0,quoted:0,failed:0,notInspected:0},diagnostics:[]}};
    return f.observed;
  },()=>mode==='outage'?503:200);
  await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});mode='outage';await refresh(page).click();
  await expect(output(page)).toHaveCount(0);await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});
  mode='empty';await getQuote(page).click();await expect(page.getByText('No route was found in the inspected strategies.',{exact:true})).toBeVisible({timeout:5000});
});

test('an interrupted quote cannot restore old amounts after input changes',async({page})=>{
  await setup(page);let started=0,finished=0,release:(()=>void)|undefined;
  await page.route('**/quotes/swap',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();started++;
    await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({json:fixture().observed,headers}).catch(()=>{});finished++;
  });
  await getQuote(page).click();await expect.poll(()=>started).toBe(1);await page.getByLabel('You pay').fill('');
  await expect(page.getByRole('button',{name:'Enter an amount',exact:true})).toBeDisabled();release?.();await expect.poll(()=>finished).toBe(1);await expect(output(page)).toHaveCount(0);
});

test('a stalled quote times out and permits retry',async({page})=>{
  await setup(page);let stalled=true,started=0,release:(()=>void)|undefined;
  await page.route('**/quotes/swap',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();started++;
    if(stalled)await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({json:fixture().observed,headers}).catch(()=>{});
  });
  await getQuote(page).click();await expect.poll(()=>started).toBe(1);await page.clock.fastForward(31000);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});await expect(getQuote(page)).toBeEnabled();
  stalled=false;release?.();await page.clock.setFixedTime(now);await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
});

test('deployment rotation during a quote rejects the observation and a fresh attempt recovers',async({page})=>{
  await setup(page);let read=0,rotating=true;
  await page.route('**/deployment',route=>{read++;const f=fixture();if(rotating&&read>=3)f.manifest.payments='0x0000000000000000000000000000000000000063';return route.fulfill({json:f.manifest,headers});});
  // The page's initial deployment was loaded by setup; first fresh read is 1,
  // final identity read is 2, so trigger the change at that final read.
  read=1;await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});await expect(output(page)).toHaveCount(0);
  rotating=false;await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
});
