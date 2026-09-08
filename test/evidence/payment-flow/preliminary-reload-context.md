# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: payment.spec.ts >> saved receipt recovery after reload does not repeat the wallet send
- Location: test\payment.spec.ts:119:1

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

```
Error: page.reload: Test ended.
Call log:
  - waiting for navigation until "load"
    - navigated to "http://127.0.0.1:3100/pay/0x000000000000000000000000000000000000000000000000000000000000005a"

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - link "Skip to content" [ref=f1e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=f1e3]:
    - link "Orbital home" [ref=f1e4] [cursor=pointer]:
      - /url: /
      - text: Orbital
    - navigation "Main navigation" [ref=f1e7]:
      - link "Swap" [ref=f1e8] [cursor=pointer]:
        - /url: /swap
      - link "Liquidity" [ref=f1e9] [cursor=pointer]:
        - /url: /liquidity
      - link "Payments" [ref=f1e10] [cursor=pointer]:
        - /url: /pay
    - button "Connect wallet" [ref=f1e11] [cursor=pointer]
  - main [ref=f1e12]:
    - generic [ref=f1e13]:
      - link "← Payments" [ref=f1e14] [cursor=pointer]:
        - /url: /pay
      - generic [ref=f1e15]:
        - heading "Invoice" [level=1] [ref=f1e16]
        - paragraph [ref=f1e17]: "0x000000000000000000000000000000000000000000000000000000000000005a"
      - generic [ref=f1e18]:
        - status [ref=f1e19]:
          - heading "Checking invoice history…" [level=2] [ref=f1e20]
          - paragraph [ref=f1e21]: Reading the verified deployment and its indexed invoice history.
        - button "Refresh invoice" [disabled] [ref=f1e22]
  - contentinfo [ref=f1e23]:
    - generic [ref=f1e24]:
      - link "Build evidence" [ref=f1e25] [cursor=pointer]:
        - /url: /proof
      - link "Read the paper ↗" [ref=f1e26] [cursor=pointer]:
        - /url: https://www.paradigm.xyz/writing/orbital
      - generic [ref=f1e27]: Arc Testnet
    - paragraph [ref=f1e28]: Testnet application. Demo tokens have no redemption value. Concentrated liquidity can lose value.
    - text: Powered by SwapVM — © Degensoft Ltd 2025
```

# Test source

```ts
  21  |  }
  22  |  decodePaymentQuoteObservation(f.payload,200,f.manifest,f.request,now);return f;
  23  | }
  24  | async function setup(page:Page,options:{kind?:'direct'|'swap';approved?:boolean;gasPoor?:boolean;rejected?:boolean;pending?:boolean;reverted?:boolean;mismatched?:boolean}={}){
  25  |  const f=fixture(options.kind),m=f.manifest,invoice=f.payload.data!.invoice;let allowance=options.approved?1000n:0n,requests=0;
  26  |  let receiptReady=!options.pending;const calls:string[]=[];let submitted:Record<string,string>|undefined;
  27  |  await page.addInitScript(({address,rejected,hash})=>{
  28  |   const listeners=new Map<string,Set<(v:unknown)=>void>>();let connected=sessionStorage.getItem('fixture-connected')==='yes',current=address,chain='0x4cef52';const sent:unknown[]=[];
  29  |   const provider={isMetaMask:true,isConnected:()=>connected,on:(e:string,fn:(v:unknown)=>void)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e)!.add(fn);return provider;},removeListener:(e:string,fn:(v:unknown)=>void)=>{listeners.get(e)?.delete(fn);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
  30  |    if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('fixture-connected','yes');return [current];}
  31  |    if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
  32  |    if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});sent.push(params[0]);sessionStorage.setItem('fixture-submitted',JSON.stringify(params[0]));return hash;}
  33  |    throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  34  |   }};
  35  |   Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{paymentWallet:{sent,account:(next:string)=>{current=next;for(const cb of listeners.get('accountsChanged')??[])cb([current]);},chain:(next:string)=>{chain=next;for(const cb of listeners.get('chainChanged')??[])cb(chain);}}});
  36  |  },{address:f.request.payer,rejected:!!options.rejected,hash:txHash});
  37  |  await page.route('**/deployment',r=>r.fulfill({json:m,headers}));
  38  |  await page.route(`**/invoices/${f.request.invoiceId}`,r=>r.fulfill({headers,json:{schemaVersion:1,status:'available',code:'INVOICES_AVAILABLE',financialExecutionEnabled:false,chainId:m.chainId,deploymentId:f.payload.deploymentId,asOf:f.payload.asOf,currentIndexedBlock:f.payload.currentIndexedBlock,historical:false,freshness:{indexedAt:f.payload.freshness!.indexedAt,ageMs:0,head:'5',stale:false},coverage:f.payload.coverage,data:{invoice}}}));
  39  |  await page.route('**/quotes/payment',async r=>{
  40  |   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  41  |   requests++;expect(r.request().postDataJSON()).toEqual(f.request);const payload=structuredClone(f.payload) as Extract<PaymentQuoteObservationDTO,{status:'observed'}>;
  42  |   payload.data!.funding.allowanceRaw=allowance.toString();payload.data!.funding.approvalRequired=allowance<BigInt(payload.data!.amountInRaw);if(!payload.data!.funding.approvalRequired)payload.data!.approval=null;
  43  |   return r.fulfill({headers,json:payload});
  44  |  });
  45  |  const block=(number='0x4')=>({number,hash:`0x${BigInt(number).toString(16).padStart(64,'0')}`,parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:m.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f104',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
  46  |  await page.route('https://rpc.testnet.arc.io/**',async r=>{
  47  |   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});const body=r.request().postDataJSON();
  48  |   const respond=async (q:{id:number;method:string;params:any[]})=>{
  49  |    calls.push(q.method);let result:unknown;
  50  |    if(q.method==='eth_chainId')result='0x4cef52';
  51  |    else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
  52  |    else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
  53  |    else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':'0xde0b6b3a7640000';
  54  |    else if(q.method==='eth_estimateGas')result='0x61a8';
  55  |    else if(q.method==='eth_call'){
  56  |     const tx=q.params[0],to=tx.to.toLowerCase();
  57  |     if(tx.data===f.payload.data!.plan.data||tx.data===f.payload.data!.approval?.data)result='0x';
  58  |     else if(to===m.payments.toLowerCase()){
  59  |      expect(q.params[1]).toEqual({blockHash:block().hash,requireCanonical:true});
  60  |      const decoded=decodeFunctionData({abi:paymentsReadAbi,data:tx.data}),fn=decoded.functionName;
  61  |      const value=fn==='USDC'?m.usdc:fn==='ROUTER'?m.router:fn==='allowedToken'?true:{merchant:invoice.merchant,amountDueRaw:BigInt(invoice.amountDueRaw),expiresAt:Number(invoice.expiresAt),recipients:invoice.recipients.map(r=>r.address),bps:invoice.recipients.map(r=>r.bps),memoHash:invoice.memoHash,status:1,payer:`0x${'00'.repeat(20)}`,inputRaw:0n,receivedRaw:0n,refundRaw:0n,routeHash:zero};
  62  |      result=encodeFunctionResult({abi:paymentsReadAbi,functionName:fn,result:value as never});
  63  |     }else {const decoded=decodeFunctionData({abi:erc20Abi,data:tx.data}),fn=decoded.functionName;result=encodeFunctionResult({abi:erc20Abi,functionName:fn,result:(fn==='balanceOf'?1000n:fn==='allowance'?allowance:6) as never});}
  64  |    }else if(q.method==='eth_getTransactionReceipt'){
  65  |     submitted=JSON.parse(await page.evaluate(()=>sessionStorage.getItem('fixture-submitted'))??'null')??undefined;
  66  |     if(receiptReady&&submitted){if(submitted.to!.toLowerCase()===f.request.tokenIn.toLowerCase()&&!options.reverted)allowance=1000n;result={transactionHash:txHash,transactionIndex:'0x0',blockHash:block('0x5').hash,blockNumber:'0x5',from:f.request.payer,to:submitted.to,cumulativeGasUsed:'0x61a8',gasUsed:'0x61a8',contractAddress:null,logs:[],logsBloom:`0x${'00'.repeat(256)}`,status:options.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};}else result=null;
  67  |    }else if(q.method==='eth_getTransactionByHash')result=submitted?{...submitted,hash:txHash,blockHash:block('0x5').hash,blockNumber:'0x5',transactionIndex:'0x0',from:f.request.payer,to:submitted.to,input:options.mismatched?'0xdeadbeef':submitted.data,value:'0x0',nonce:'0x0',gas:'0x7530',gasPrice:'0x3b9aca00',type:'0x2',chainId:'0x4cef52',v:'0x0',r:zero,s:zero}:null;
  68  |    else if(q.method==='eth_blockNumber')result='0x5';
  69  |    else throw Error(`Unhandled RPC ${q.method}`);
  70  |    return {jsonrpc:'2.0',id:q.id,result};
  71  |   };
  72  |   return r.fulfill({headers,json:Array.isArray(body)?await Promise.all(body.map(respond)):await respond(body)});
  73  |  });
  74  |  await page.goto(`/pay/${f.request.invoiceId}`);await expect(page.getByRole('heading',{name:'0.0001 USDC',exact:true})).toBeVisible();
  75  |  await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
  76  |  await page.clock.install({time:new Date(now)});if(options.kind==='swap')await page.getByLabel('Payment token').selectOption('oUSD6');await page.getByLabel('Maximum input').fill('0.001');
  77  |  return {calls,requests:()=>requests,ready:()=>{receiptReady=true;},f};
  78  | }
  79  | test('exact approval is a separate signature and a fresh payment quote follows its receipt',async({page})=>{
  80  |  const f=await setup(page);await page.getByRole('button',{name:'Get payment quote'}).click();
  81  |  await expect(page.getByRole('heading',{name:'Review token approval'})).toBeVisible();
  82  |  await page.setViewportSize({width:320,height:680});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  83  |  await page.screenshot({path:'../../test/evidence/payment-approval-mobile.png',fullPage:true});
  84  |  await page.getByRole('button',{name:'Approve 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Approval confirmed/)).toBeVisible();
  85  |  expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(1);expect(f.requests()).toBe(1);
  86  |  await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
  87  |  expect(f.requests()).toBe(2);await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'../../test/evidence/payment-review-desktop.png',fullPage:true});
  88  |  await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();
  89  |  const sent=await page.evaluate(()=>(window as any).paymentWallet.sent);expect(sent).toHaveLength(2);expect(sent[0].gas).toBe('0x7530');expect(sent[0].maxFeePerGas).toBeTruthy();expect(sent[1].to.toLowerCase()).toBe(f.f.manifest.payments.toLowerCase());
  90  |  // Synthetic receipt confirmation is not permission to invent a paid invoice.
  91  |  await expect(page.getByText('Unpaid at indexed block',{exact:true})).toBeVisible();
  92  | });
  93  | test('insufficient native funds never request a signature',async({page})=>{
  94  |  await setup(page,{gasPoor:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByText(/Insufficient balance for gas/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
  95  | });
  96  | test('swap-funded invoice reviews the exact selected input and sends the reconstructed adapter plan',async({page})=>{
  97  |  const f=await setup(page,{kind:'swap',approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
  98  |  await expect(page.getByRole('button',{name:'Pay 0.000134 oUSD6',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pay 0.000134 oUSD6',exact:true}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();
  99  |  const sent=await page.evaluate(()=>(window as any).paymentWallet.sent);expect(sent).toHaveLength(1);expect(sent[0].data).toBe(f.f.payload.data!.plan.data);
  100 | });
  101 | test('wallet and chain changes discard the payment review before signing',async({page})=>{
  102 |  await setup(page,{approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
  103 |  await page.evaluate(()=>(window as any).paymentWallet.account('0x000000000000000000000000000000000000002a'));await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toHaveCount(0);
  104 |  await page.evaluate(()=>(window as any).paymentWallet.chain('0x1'));await expect(page.getByText(/Switch your wallet to the invoice network/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
  105 | });
  106 | test('expired review cannot request a signature',async({page})=>{
  107 |  await setup(page,{approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();await page.clock.fastForward(20000);
  108 |  await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
  109 | });
  110 | test('reverted payment preserves its receipt and displays no paid status',async({page})=>{
  111 |  await setup(page,{approved:true,reverted:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Transaction reverted. Refresh/)).toBeVisible();await page.getByText('Reverted transaction',{exact:true}).click();await expect(page.getByText(txHash,{exact:true})).toBeVisible();await expect(page.getByText('Gas paid: 0.000025 USDC',{exact:true})).toBeVisible();await expect(page.getByText('Unpaid at indexed block',{exact:true})).toBeVisible();
  112 | });
  113 | test('a receipt for different transaction bytes remains unresolved',async({page})=>{
  114 |  await setup(page,{approved:true,mismatched:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Receipt transaction does not match/)).toBeVisible();await expect(page.getByRole('button',{name:'Resume receipt tracking'})).toBeVisible();await expect(page.getByText(/Payment transaction confirmed/)).toHaveCount(0);
  115 | });
  116 | test('rejected signatures require a fresh quote without storing a transaction',async({page})=>{
  117 |  await setup(page,{approved:true,rejected:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/User rejected/)).toBeVisible();expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('orbital:payment:')))).toEqual([]);
  118 | });
  119 | test('saved receipt recovery after reload does not repeat the wallet send',async({page})=>{
  120 |  const fixture=await setup(page,{approved:true,pending:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(txHash,{exact:true})).toBeVisible();
> 121 |  await page.reload();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();await expect(page.getByRole('button',{name:'Resume receipt tracking'})).toBeVisible();fixture.ready();
      |             ^ Error: page.reload: Test ended.
  122 |  await page.getByRole('button',{name:'Resume receipt tracking'}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);expect(fixture.requests()).toBe(1);
  123 | });
  124 | 
```