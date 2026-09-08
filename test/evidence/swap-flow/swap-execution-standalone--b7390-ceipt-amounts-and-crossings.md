# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: swap-execution.spec.ts >> standalone approval and fresh swap review lead to exact receipt amounts and crossings
- Location: test\swap-execution.spec.ts:74:1

# Error details

```
TypeError: Cannot read properties of undefined (reading '0')
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Review token approval' })
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Review token approval' }) with timeout 30000ms
  - waiting for getByRole('heading', { name: 'Review token approval' })
  - Test ended.

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
  - text: You pay
  - textbox "You pay":
    - /placeholder: "0.00"
    - text: "9007199254.740993"
  - combobox "Input token":
    - option "USDC" [selected]
    - option "oUSD6"
    - option "oUSD18"
  - button "Reverse pair": ↓
  - text: You receive
  - combobox "You receive":
    - option "oUSD6"
    - option "oUSD18" [selected]
  - status "Quoted output": 20 oUSD18
  - paragraph: oUSD6 and oUSD18 are demo tokens — no redemption value.
  - separator
  - text: Slippage tolerance 0.50% Network fee USDC · estimated at review
  - region "Quote observation":
    - term: You pay
    - definition: 9007199254.740993 USDC
    - term: Minimum received
    - definition: 19.9 oUSD18
    - term: Trading fee · included in input
    - definition: 900719.925475 USDC
    - term: Recipient
    - definition: "0x0000000000000000000000000000000000000016"
    - term: Approval
    - definition: Not requested
    - paragraph: Quote observation. Review checks current funds, strategy availability and transaction simulation before any signature.
    - group: Quote details
  - region "Swap execution":
    - status: Checking the current strategy, funds and simulation…
  - button "Review swap" [disabled]
  - button "Refresh quote" [disabled]
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
  1  | import {test,expect,type Page} from '@playwright/test';
  2  | import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,keccak256,erc20Abi,type Address,type Hex} from 'viem';
  3  | import {buildOrder,configFromDTO,hashConfig,hashOrder,decodeSwapQuoteObservation,lifecycleAbi,routerAbi,swapEventsAbi} from '@orbital/sdk';
  4  | import wire from '../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};
  5  | const zero=`0x${'00'.repeat(32)}` as Hex,headers={'access-control-allow-origin':'*','cache-control':'no-store'};
  6  | function fixture(){
  7  |  const f=structuredClone(wire);f.manifest.chainId=f.observed.chainId=5042002;f.request.recipient=f.observed.request.recipient=f.request.wallet;
  8  |  f.observed.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,f.manifest.aqua as Address,f.manifest.router as Address,f.manifest.payments as Address]));
  9  |  const ids=new Map<string,string>();for(const r of [f.observed.data.best,...f.observed.data.alternatives]){const old=r.orderHash;r.config.chainId='5042002';r.recipient=f.request.wallet;const c=configFromDTO(r.config);r.configHash=hashConfig(c);r.orderHash=hashOrder(buildOrder(c));ids.set(old,r.orderHash);}
  10 |  for(const d of f.observed.data.diagnostics)d.orderHash=ids.get(d.orderHash)!;
  11 |  const ranked=[f.observed.data.best,...f.observed.data.alternatives].sort((a,b)=>a.feePpm-b.feePpm||a.orderHash.localeCompare(b.orderHash));f.observed.data.best=ranked[0]!;f.observed.data.alternatives=ranked.slice(1);
  12 |  decodeSwapQuoteObservation(f.observed,200,f.manifest,f.request,1700000003200);return f;
  13 | }
  14 | async function setup(page:Page,options:{approved?:boolean;pending?:boolean;gasPoor?:boolean;rejected?:boolean;docked?:boolean;changed?:boolean;noEvent?:boolean;reverted?:boolean}={}){
  15 |  const f=fixture(),r=f.observed.data.best,c=configFromDTO(r.config),amount=BigInt(f.request.amountInRaw),output=BigInt(r.amountOutRaw),fee=BigInt(r.feeRaw);let allowance=options.approved?amount:0n,ready=!options.pending,quotes=0;
  16 |  const sent=new Map<string,Record<string,string>>();
  17 |  await page.exposeFunction('__recordSwap',(tx:Record<string,string>)=>{const hash=`0x${(800+sent.size).toString(16).padStart(64,'0')}`;sent.set(hash,tx);return hash;});
  18 |  await page.addInitScript(({address,rejected})=>{
  19 |   let connected=sessionStorage.getItem('swap-fixture-connected')==='yes',current=address,chain='0x4cef52';const listeners=new Map<string,Set<(v:unknown)=>void>>(),calls:unknown[]=[];
  20 |   const provider={isMetaMask:true,isConnected:()=>connected,on:(name:string,cb:(v:unknown)=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(cb);return provider;},removeListener:(name:string,cb:(v:unknown)=>void)=>{listeners.get(name)?.delete(cb);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
  21 |    if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('swap-fixture-connected','yes');return [current];}
  22 |    if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
  23 |    if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});calls.push(params[0]);return (window as any).__recordSwap(params[0]);}
  24 |    throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  25 |   }};
  26 |   Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{swapExecutionWallet:{calls,account:(value:string)=>{current=value;for(const cb of listeners.get('accountsChanged')??[])cb([value]);},chain:(value:string)=>{chain=value;for(const cb of listeners.get('chainChanged')??[])cb(value);}}});
  27 |  },{address:f.request.wallet,rejected:!!options.rejected});
  28 |  await page.route('**/deployment',route=>route.fulfill({headers,json:f.manifest}));
  29 |  await page.route('**/quotes/swap',route=>{
  30 |   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  31 |   quotes++;expect(route.request().postDataJSON()).toEqual(f.request);return route.fulfill({headers,json:f.observed});
  32 |  });
  33 |  const hash=(n:string)=>`0x${BigInt(n).toString(16).padStart(64,'0')}` as Hex;
  34 |  const block=(number='0x4')=>({number,hash:hash(number),parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:f.manifest.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f103',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
  35 |  await page.route('https://rpc.testnet.arc.io/**',async route=>{
  36 |   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  37 |   const body=route.request().postDataJSON(),respond=(q:{id:number;method:string;params:any[]})=>{
  38 |    let result:unknown;const to=(q.params[0]?.to as string|undefined)?.toLowerCase();
  39 |    if(q.method==='eth_chainId')result='0x4cef52';
  40 |    else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
  41 |    else if(q.method==='eth_blockNumber')result='0x5';
  42 |    else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
  43 |    else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':`0x${(amount*10n**12n+10n**20n).toString(16)}`;
  44 |    else if(q.method==='eth_estimateGas')result='0x61a8';
  45 |    else if(q.method==='eth_call'){
  46 |     expect(q.params[1]).toEqual({blockHash:hash('0x4'),requireCanonical:true});
  47 |     if(to===f.manifest.router.toLowerCase()){
  48 |      const d=decodeFunctionData({abi:[...lifecycleAbi,...routerAbi],data:q.params[0].data});
  49 |      if(d.functionName==='swap')result='0x';
  50 |      else if(d.functionName==='quote')result=encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[amount,output,r.orderHash as Hex]});
  51 |      else if(d.functionName==='getStrategyConfig')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:c});
  52 |      else if(d.functionName==='getStrategyState')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyState',result:{maker:c.maker,configHash:r.configHash as Hex,status:1,version:BigInt(r.stateVersion)+(options.changed?1n:0n),X:[1n,1n,1n],principalInternal:[1n,1n,1n],virtualInternal:0n,sumInternal:3n,sumSquaresInternal:{hi:0n,lo:3n},interiorRadius:1n,boundarySumNumerator:0n,boundarySigmaLower:0n,boundarySigmaUpper:0n,interiorTickMask:7,slackBoundInternal:0n,cumulativeFeeRaw:[0n,0n,0n]}});
  53 |      else if(d.functionName==='getStrategyAvailability')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyAvailability',result:c.tokens.map(token=>({token,aquaAllocationRaw:output,liveTokenCount:options.docked?0:3,walletBalanceRaw:output,aquaAllowanceRaw:output,live:!options.docked,backingValid:true,surplusInternal:{hi:0n,lo:0n},deficitInternal:{hi:0n,lo:0n},fundingCeilingRaw:output}))});
  54 |      else throw Error(`Unexpected router call ${d.functionName}`);
  55 |     }else {const d=decodeFunctionData({abi:erc20Abi,data:q.params[0].data});result=d.functionName==='approve'?'0x':encodeFunctionResult({abi:erc20Abi,functionName:d.functionName,result:(d.functionName==='balanceOf'?amount:d.functionName==='allowance'?allowance:to===f.request.tokenIn.toLowerCase()?6:18) as never});}
  56 |    }else if(q.method==='eth_getTransactionReceipt'){
  57 |     const tx=sent.get(q.params[0]);if(!ready||!tx)result=null;else{
  58 |      const approval=tx.to!.toLowerCase()===f.request.tokenIn.toLowerCase();if(approval&&!options.reverted)allowance=amount;
  59 |      const args={maker:c.maker,orderHash:r.orderHash as Hex,taker:f.request.wallet as Address,recipient:f.request.recipient as Address,tokenInIndex:0,tokenOutIndex:2,grossInputRaw:amount,netInputRaw:amount-fee,feeRaw:fee,amountOutRaw:output+7n,version:BigInt(r.stateVersion)+1n,crossedTickKeys:[c.tickKeys[1]!],crossedInward:[true]};
  60 |      const logs=approval||options.noEvent||options.reverted?[]:[{address:f.manifest.router,topics:encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted',args}),data:encodeAbiParameters(swapEventsAbi[0].inputs.filter(v=>!v.indexed),[args.recipient,0,2,amount,amount-fee,fee,output+7n,args.version,args.crossedTickKeys,args.crossedInward]),blockNumber:'0x5',blockHash:hash('0x5'),transactionHash:q.params[0],transactionIndex:'0x0',logIndex:'0x1',removed:false}];
  61 |      result={transactionHash:q.params[0],transactionIndex:'0x0',blockHash:hash('0x5'),blockNumber:'0x5',from:f.request.wallet,to:tx.to,cumulativeGasUsed:'0x61a8',gasUsed:'0x61a8',contractAddress:null,logs,logsBloom:`0x${'00'.repeat(256)}`,status:options.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};
  62 |     }
  63 |    }else if(q.method==='eth_getTransactionByHash'){const tx=sent.get(q.params[0]);result=tx?{...tx,hash:q.params[0],blockHash:hash('0x5'),blockNumber:'0x5',transactionIndex:'0x0',from:f.request.wallet,to:tx.to,input:tx.data,value:'0x0',nonce:'0x0',gas:'0x7530',gasPrice:'0x3b9aca00',type:'0x2',chainId:'0x4cef52',v:'0x0',r:zero,s:zero}:null;}
  64 |    else throw Error(`Unexpected RPC ${q.method}`);
  65 |    return {jsonrpc:'2.0',id:q.id,result};
  66 |   };
  67 |   return route.fulfill({headers,json:Array.isArray(body)?body.map(respond):respond(body)});
  68 |  });
  69 |  await page.goto('/swap');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
  70 |  await page.getByLabel('Input token').selectOption('USDC');await page.getByLabel('You receive',{exact:true}).selectOption('oUSD18');await page.getByLabel('You pay',{exact:true}).fill('9007199254.740993');await page.clock.install({time:new Date(1700000003200)});
  71 |  return {f,sent,ready:()=>{ready=true;},quotes:()=>quotes};
  72 | }
  73 | async function review(page:Page){await page.getByRole('button',{name:'Get quote',exact:true}).click();await expect(page.getByLabel('Quoted output',{exact:true})).toHaveText('20 oUSD18');await page.getByRole('button',{name:'Review swap',exact:true}).click();}
  74 | test('standalone approval and fresh swap review lead to exact receipt amounts and crossings',async({page})=>{
> 75 |  const f=await setup(page);await review(page);await expect(page.getByRole('heading',{name:'Review token approval'})).toBeVisible();await page.getByRole('button',{name:'Approve 9007199254.740993 USDC',exact:true}).click();await expect(page.getByRole('heading',{name:'Approval confirmed',exact:true})).toBeVisible();expect(f.sent.size).toBe(1);
     |                                                                                                                      ^ Error: expect(locator).toBeVisible() failed
  76 |  await page.getByRole('button',{name:'Review fresh swap',exact:true}).click();await expect(page.getByRole('heading',{name:'Review swap',exact:true})).toBeVisible();expect(f.quotes()).toBe(3);
  77 |  await page.setViewportSize({width:320,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'../../test/evidence/swap-review-mobile.png',fullPage:true});
  78 |  await page.getByRole('button',{name:'Submit reviewed swap',exact:true}).click();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toBeVisible();await expect(page.getByText('20.000000000000000007 oUSD18',{exact:true})).toBeVisible();await page.getByText('View transaction receipt',{exact:true}).click();await expect(page.getByText(/Inward · tick/)).toBeVisible();expect(f.sent.size).toBe(2);
  79 |  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'../../test/evidence/swap-receipt-desktop.png',fullPage:true});
  80 | });
  81 | test('standalone swap rejects insufficient native inventory before requesting any signature',async({page})=>{const f=await setup(page,{approved:true,gasPoor:true});await review(page);await expect(page.getByText(/Insufficient balance for gas/)).toBeVisible();expect(f.sent.size).toBe(0);});
  82 | test('docked or changed-version strategies cannot enter swap review',async({page})=>{const f=await setup(page,{approved:true,docked:true});await review(page);await expect(page.getByText(/strategy is docked/)).toBeVisible();expect(f.sent.size).toBe(0);});
  83 | test('standalone signature rejection returns an editable amount without a saved hash',async({page})=>{const f=await setup(page,{approved:true,rejected:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByText(/User rejected/)).toBeVisible();await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('9007199254.740993');expect(f.sent.size).toBe(0);});
  84 | test('success without an Orbital settlement event stays unresolved',async({page})=>{const f=await setup(page,{approved:true,noEvent:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByText(/does not establish the reviewed swap settlement/)).toBeVisible();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toHaveCount(0);expect(f.sent.size).toBe(1);});
  85 | test('standalone swap resumes a saved receipt after reload without signing again',async({page})=>{
  86 |  const f=await setup(page,{approved:true,pending:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toBeVisible();f.ready();await page.getByRole('button',{name:'Resume swap receipt'}).click();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toBeVisible();expect(f.sent.size).toBe(1);
  87 | });
  88 | 
```