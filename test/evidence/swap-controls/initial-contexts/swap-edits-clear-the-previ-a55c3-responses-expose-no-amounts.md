# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: swap.spec.ts >> edits clear the previous quote and malformed responses expose no amounts
- Location: test\swap.spec.ts:92:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Quoted output', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByLabel('Quoted output', { exact: true }) with timeout 5000ms
  - waiting for getByLabel('Quoted output', { exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "Orbital home":
    - /url: /
    - text: Orbital
  - navigation "Main navigation":
    - link "Swap":
      - /url: /swap
    - link "Liquidity":
      - /url: /liquidity
    - link "Payments":
      - /url: /pay
  - button "Manage connected wallet": 0x0000…0016
- main:
  - heading "Swap" [level=1]
  - text: Arc Testnet
  - paragraph: Trade stablecoin liquidity through Orbital.
  - group: Swap settings
  - text: You pay
  - textbox "You pay":
    - /placeholder: "0.00"
    - text: "1"
  - combobox "Input token":
    - option "USDC" [selected]
    - option "oUSD6"
    - option "oUSD18"
  - paragraph: "Balance: Unavailable"
  - button "Max" [disabled]
  - button "Refresh balance"
  - button "Reverse pair": ↓
  - text: You receive
  - combobox "You receive":
    - option "oUSD6"
    - option "oUSD18" [selected]
  - text: Output appears after a certified onchain quote.
  - paragraph: oUSD6 and oUSD18 are demo tokens — no redemption value.
  - separator
  - text: Slippage tolerance 0.1% Network fee USDC · estimated at review
  - alert: Quote unavailable. The amounts could not be checked. Try again.
  - region "Swap execution"
  - button "Get quote"
  - group: How execution works
- contentinfo:
  - link "Build evidence":
    - /url: /proof
  - link "Read the paper ↗":
    - /url: https://www.paradigm.xyz/writing/orbital
  - text: Arc Testnet
  - paragraph: Testnet application. Demo tokens have no redemption value. Concentrated liquidity can lose value.
  - text: Powered by SwapVM — © Degensoft Ltd 2025
- alert
```

# Test source

```ts
  1   | import {test, expect, type Page} from '@playwright/test';
  2   | import {encodeAbiParameters, keccak256, type Address} from 'viem';
  3   | import {buildOrder, configFromDTO, decodeSwapQuoteObservation, hashConfig, hashOrder} from '@orbital/sdk';
  4   | import wire from '../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};
  5   | 
  6   | const now = 1700000003200, wallet = wire.request.wallet;
  7   | const headers = {'access-control-allow-origin': '*', 'cache-control': 'no-store'};
  8   | function fixture() {
  9   |   const value = structuredClone(wire);value.request.slippageBps=value.observed.request.slippageBps=10;
  10  |   value.manifest.chainId = 5042002;
  11  |   value.observed.chainId = 5042002;
  12  |   value.observed.deploymentId = keccak256(encodeAbiParameters([{type:'uint256'}, {type:'address'}, {type:'address'}, {type:'address'}],
  13  |     [5042002n, value.manifest.aqua as Address, value.manifest.router as Address, value.manifest.payments as Address]));
  14  |   value.request.recipient = wallet; value.observed.request.recipient = wallet;
  15  |   const hashes = new Map<string,string>();
  16  |   for (const r of [value.observed.data.best, ...value.observed.data.alternatives]) {
  17  |     r.minimumOutRaw=(BigInt(r.amountOutRaw)*9990n/10000n).toString();const old = r.orderHash; r.recipient = wallet; r.config.chainId = '5042002';
  18  |     const config = configFromDTO(r.config); r.configHash = hashConfig(config); r.orderHash = hashOrder(buildOrder(config)); hashes.set(old, r.orderHash);
  19  |   }
  20  |   for (const d of value.observed.data.diagnostics) d.orderHash = hashes.get(d.orderHash)!;
  21  |   // Changing the chain changes tied order hashes; preserve the real ranking.
  22  |   const ranked=[value.observed.data.best,...value.observed.data.alternatives].sort((a,b)=>a.feePpm-b.feePpm || a.orderHash.localeCompare(b.orderHash));
  23  |   value.observed.data.best=ranked[0]!;value.observed.data.alternatives=ranked.slice(1);
  24  |   decodeSwapQuoteObservation(value.observed,200,value.manifest,value.request,now);
  25  |   return value;
  26  | }
  27  | async function installWallet(page: Page) {
  28  |   await page.addInitScript(({address}) => {
  29  |     const listeners = new Map<string,Set<(value:unknown)=>void>>(); let connected = false, current = address, chain = '0x4cef52';
  30  |     const calls:string[] = [];
  31  |     const provider = {isMetaMask:true, isConnected:()=>connected,
  32  |       on:(event:string, callback:(value:unknown)=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(callback);return provider;},
  33  |       removeListener:(event:string,callback:(value:unknown)=>void)=>{listeners.get(event)?.delete(callback);return provider;},
  34  |       request:async({method}:{method:string})=>{calls.push(method);
  35  |         if(method==='eth_chainId')return chain;
  36  |         if(method==='eth_accounts')return connected?[current]:[];
  37  |         if(method==='eth_requestAccounts'){connected=true;return [current];}
  38  |         if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
  39  |         if(method==='wallet_getPermissions')return [];
  40  |         if(method==='wallet_revokePermissions'){connected=false;return null;}
  41  |         throw Object.assign(Error(`Read-only fixture rejects ${method}`),{code:4200});
  42  |       }};
  43  |     Object.defineProperty(window,'ethereum',{value:provider,configurable:true});
  44  |     Object.assign(window,{swapWallet:{calls,
  45  |       account:(next:string)=>{current=next;for(const callback of listeners.get('accountsChanged')??[])callback([current]);},
  46  |       chain:(next:string)=>{chain=next;for(const callback of listeners.get('chainChanged')??[])callback(chain);}}});
  47  |   }, {address:wallet});
  48  | }
  49  | async function setup(page:Page, respond:(body:unknown)=>unknown = ()=>fixture().observed, status:()=>number = ()=>200) {
  50  |   await installWallet(page);
  51  |   await page.route('https://rpc.testnet.arc.io/**',route=>route.abort());
  52  |   await page.route('**/deployment', route=>route.fulfill({json:fixture().manifest,headers}));
  53  |   await page.route('**/quotes/swap', async route=>{
  54  |     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  55  |     const body = route.request().postDataJSON(); await route.fulfill({json:respond(body),status:status(),headers});
  56  |   });
  57  |   await page.goto('/swap');
  58  |   await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
  59  |   await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
  60  |   await page.getByLabel('Input token').selectOption('USDC'); await page.getByLabel('You receive').selectOption('oUSD18');
  61  | 
  62  |   // Keep timers running: TanStack schedules notifications through timers too.
  63  |   // Install after hydration so cold development compilation does not age data.
  64  |   await page.clock.install({time:new Date(now)});
  65  |   await page.getByLabel('You pay').fill('9007199254.740993');
  66  | }
  67  | const getQuote=(page:Page)=>page.getByRole('button',{name:/^(Get quote|Refresh quote|Switch to Arc Testnet)$/});
  68  | const refresh=(page:Page)=>page.getByRole('button',{name:'Refresh quote',exact:true});
  69  | const output=(page:Page)=>page.getByLabel('Quoted output',{exact:true});
  70  | 
  71  | test('checked swap observation shows exact amounts, recipient and bounded coverage without requesting signatures',async({page})=>{
  72  |   let body:unknown;await setup(page, request=>{body=request;return fixture().observed;});
  73  |   await page.setViewportSize({width:320,height:760});await getQuote(page).click();
  74  |   await expect(output(page)).toBeVisible({timeout:5000});
  75  |   await expect(output(page)).toHaveText('20 oUSD18');
  76  |   expect(body).toEqual(fixture().request);
  77  |   await expect(page.getByText('19.98 oUSD18',{exact:true})).toBeVisible();
  78  |   await expect(page.getByText('900719.925475 USDC',{exact:true})).toBeVisible();
  79  |   await expect(page.getByText('Quote observation. Review checks current funds, strategy availability and transaction simulation before any signature.',{exact:true})).toBeVisible();
  80  |   await expect(page.getByText(wallet,{exact:true})).toBeVisible();
  81  |   await expect(page.getByRole('button',{name:/approve|confirm swap/i})).toHaveCount(0);
  82  |   await page.getByText('Quote details',{exact:true}).click();
  83  |   await expect(page.getByText('Best among the strategies checked · 4 inspected.',{exact:true})).toBeVisible();
  84  |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  85  |   const calls=await page.evaluate(()=>(window as unknown as {swapWallet:{calls:string[]}}).swapWallet.calls);
  86  |   expect(calls.some(m=>/sendTransaction|sign|estimateGas/i.test(m))).toBeFalsy();
  87  |   await page.screenshot({path:'../../test/evidence/swap-observation-mobile.png',fullPage:true});
  88  |   await page.setViewportSize({width:1280,height:900});
  89  |   await page.screenshot({path:'../../test/evidence/swap-observation-desktop.png',fullPage:true});
  90  | });
  91  | 
  92  | test('edits clear the previous quote and malformed responses expose no amounts',async({page})=>{
  93  |   let malformed=false;await setup(page,()=>{const f=fixture();if(malformed)f.observed.data.best.minimumOutRaw='20000000000000000001';return f.observed;});
  94  |   await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  95  |   await page.getByLabel('You pay').fill('1');await expect(output(page)).toHaveCount(0);
  96  | await expect(output(page)).toHaveCount(0);
  97  |   malformed=true;await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});
> 98  |   await expect(output(page)).toHaveCount(0);malformed=false;await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
      |                                                                                                                     ^ Error: expect(locator).toBeVisible() failed
  99  | });
  100 | 
  101 | test('quote freshness expires on screen and refresh obtains a new checked observation',async({page})=>{
  102 |   let current=now;await setup(page,()=>{const f=fixture(),seconds=Math.floor(current/1000);
  103 |     f.observed.freshness={...f.observed.freshness,indexedAt:new Date(current-100).toISOString(),observedAt:new Date(current).toISOString(),blockTimestamp:String(seconds)};
  104 |     for(const r of [f.observed.data.best,...f.observed.data.alternatives])r.expiresAt=String(seconds+20);return f.observed;
  105 |   });
  106 |   await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  107 |   current+=11000;await page.clock.fastForward(11000);await expect(output(page)).toHaveText('20 oUSD18');
  108 |   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});current+=21000;await page.clock.fastForward(21000);await expect(output(page)).toHaveCount(0);
  109 |   await expect(page.getByText('Quote expired. Refresh to check current amounts.',{exact:true})).toBeVisible();
  110 |   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(output(page)).toBeVisible({timeout:5000});
  111 | });
  112 | 
  113 | test('wallet and chain changes invalidate observations and wrong chain sends no new quote request',async({page})=>{
  114 |   let count=0;await setup(page,()=>{count++;return fixture().observed;});await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  115 |   await page.evaluate(()=>(window as unknown as {swapWallet:{account:(a:string)=>void}}).swapWallet.account('0x0000000000000000000000000000000000000032'));
  116 |   await expect(output(page)).toHaveCount(0);
  117 |   await page.evaluate(({address})=>(window as unknown as {swapWallet:{account:(a:string)=>void;chain:(c:string)=>void}}).swapWallet.account(address),{address:wallet});
  118 |   await expect(output(page)).toHaveCount(0);await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  119 |   await page.evaluate(()=>(window as unknown as {swapWallet:{chain:(c:string)=>void}}).swapWallet.chain('0x1'));
  120 |   await expect(output(page)).toHaveCount(0);await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Switch to Arc Testnet');const stopped=count;await page.clock.runFor(350);expect(count).toBe(stopped);
  121 | });
  122 | 
  123 | test('bounded absence and outage are distinct, and failed refresh removes previously checked amounts',async({page})=>{
  124 |   let mode='success';await setup(page,()=>{
  125 |     const f=fixture();if(mode==='outage')return f.unavailable;
  126 |     if(mode==='empty')return {...f.observed,code:'NO_ROUTE_IN_INSPECTED_SET',data:{...f.observed.data,best:null,alternatives:[],counts:{scanned:0,locallyAccepted:0,inspected:0,eligible:0,quoted:0,failed:0,notInspected:0},diagnostics:[]}};
  127 |     return f.observed;
  128 |   },()=>mode==='outage'?503:200);
  129 |   await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});mode='outage';await refresh(page).click();
  130 |   await expect(output(page)).toHaveCount(0);await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});
  131 |   mode='empty';await getQuote(page).click();await expect(page.getByText('No route was found in the inspected strategies.',{exact:true})).toBeVisible({timeout:5000});
  132 | });
  133 | 
  134 | test('an interrupted quote cannot restore old amounts after input changes',async({page})=>{
  135 |   await setup(page);let started=0,finished=0,release:(()=>void)|undefined;
  136 |   await page.route('**/quotes/swap',async route=>{
  137 |     if(route.request().method()==='OPTIONS')return route.fallback();started++;
  138 |     await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({json:fixture().observed,headers}).catch(()=>{});finished++;
  139 |   });
  140 |   await getQuote(page).click();await expect.poll(()=>started).toBe(1);await page.getByLabel('You pay').fill('');
  141 |   await expect(page.getByRole('button',{name:'Enter an amount',exact:true})).toBeDisabled();release?.();await expect.poll(()=>finished).toBe(1);await expect(output(page)).toHaveCount(0);
  142 | });
  143 | 
  144 | test('a stalled quote times out and permits retry',async({page})=>{
  145 |   await setup(page);let stalled=true,started=0,release:(()=>void)|undefined;
  146 |   await page.route('**/quotes/swap',async route=>{
  147 |     if(route.request().method()==='OPTIONS')return route.fallback();started++;
  148 |     if(stalled)await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({json:fixture().observed,headers}).catch(()=>{});
  149 |   });
  150 |   await getQuote(page).click();await expect.poll(()=>started).toBe(1);await page.clock.fastForward(31000);
  151 |   await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});await expect(getQuote(page)).toBeEnabled();
  152 |   stalled=false;release?.();await page.clock.setFixedTime(now);await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  153 | });
  154 | 
  155 | test('deployment rotation during a quote rejects the observation and a fresh attempt recovers',async({page})=>{
  156 |   await setup(page);let read=0,rotating=true;
  157 |   await page.route('**/deployment',route=>{read++;const f=fixture();if(rotating&&read>=3)f.manifest.payments='0x0000000000000000000000000000000000000063';return route.fulfill({json:f.manifest,headers});});
  158 |   // The page's initial deployment was loaded by setup; first fresh read is 1,
  159 |   // final identity read is 2, so trigger the change at that final read.
  160 |   read=1;await getQuote(page).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Quote unavailable',{timeout:5000});await expect(output(page)).toHaveCount(0);
  161 |   rotating=false;await getQuote(page).click();await expect(output(page)).toBeVisible({timeout:5000});
  162 | });
  163 | 
```