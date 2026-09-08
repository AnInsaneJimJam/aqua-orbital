import {test,expect,type Page} from '@playwright/test';
import {decodeFunctionData,encodeFunctionResult,encodeAbiParameters,keccak256,erc20Abi,type Address,type Hex} from 'viem';
import {decodePaymentQuoteObservation,paymentsReadAbi,buildOrder,buildPaymentTx,buildPaymentApprovalTx,configFromDTO,hashConfig,hashOrder,type PaymentInput,type PlanContext} from '@orbital/sdk';
import type {PaymentQuoteObservationDTO} from '@orbital/shared';
import wire from '../../../packages/sdk/test/fixtures/payment-observations.json' with {type:'json'};
const now=1700000004000,zero=`0x${'00'.repeat(32)}`,txHash=`0x${'ab'.repeat(32)}`;
const headers={'access-control-allow-origin':'*','cache-control':'no-store'};
function fixture(kind='direct'){
 const f=structuredClone(wire.find(v=>v.kind===kind)!);f.manifest.chainId=f.payload.chainId=f.payload.data!.plan.chainId=f.payload.data!.approval!.chainId=5042002;
 f.payload.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,f.manifest.aqua as Address,f.manifest.router as Address,f.manifest.payments as Address]));
 if(kind==='swap'){
  const d=f.payload.data!,routing=d.routing!,ids=new Map<string,string>();
  for(const r of [routing.best,...routing.alternatives]){const old=r.orderHash;r.config.chainId='5042002';const config=configFromDTO(r.config);r.configHash=hashConfig(config);r.orderHash=hashOrder(buildOrder(config));ids.set(old,r.orderHash);}
  for(const diagnostic of routing.diagnostics)diagnostic.orderHash=ids.get(diagnostic.orderHash)??diagnostic.orderHash;
  for(const outcome of d.search!.outcomes)outcome.orderHash=ids.get(outcome.orderHash)??outcome.orderHash;
  const routes=[routing.best,...routing.alternatives].sort((a,b)=>Number(BigInt(b.amountOutRaw)-BigInt(a.amountOutRaw))||a.feePpm-b.feePpm||a.orderHash.localeCompare(b.orderHash));routing.best=routes[0]!;routing.alternatives=routes.slice(1);
  const inv=d.invoice,r=routing.best,config=configFromDTO(r.config),context:PlanContext={manifest:f.manifest,chainId:5042002,account:f.request.payer as Address,now:1700000004n};
  const input:PaymentInput={kind:'swap',invoice:{chainId:5042002,adapter:f.manifest.payments as Address,id:f.request.invoiceId as Hex,merchant:inv.merchant as Address,status:'unpaid',amountDueRaw:BigInt(inv.amountDueRaw),expiresAt:BigInt(inv.expiresAt),recipients:inv.recipients.map(v=>v.address as Address),bps:inv.recipients.map(v=>v.bps),memoHash:inv.memoHash as Hex},config,order:buildOrder(config),tokenIn:f.request.tokenIn as Address,amountInRaw:BigInt(d.amountInRaw),minimumOutRaw:BigInt(d.minimumOutRaw),deadline:BigInt(d.expiresAt),maxCrossings:f.request.maxCrossings,
   quote:{chainId:5042002,router:f.manifest.router,orderHash:r.orderHash,configHash:r.configHash,caller:r.caller,recipient:r.recipient,tokenIn:r.tokenIn,tokenOut:r.tokenOut,amountInRaw:r.amountInRaw,amountOutRaw:r.amountOutRaw,feeRaw:r.feeRaw,stateVersion:r.stateVersion,blockNumber:f.payload.asOf!.height,blockHash:f.payload.asOf!.hash,expiresAt:r.expiresAt,maxCrossings:r.maxCrossings}};
  d.plan={...buildPaymentTx(context,input),value:'0'};d.approval={...buildPaymentApprovalTx(context,input),value:'0'};
 }
 decodePaymentQuoteObservation(f.payload,200,f.manifest,f.request,now);return f;
}
async function setup(page:Page,options:{kind?:'direct'|'swap';approved?:boolean;gasPoor?:boolean;rejected?:boolean;pending?:boolean;reverted?:boolean;mismatched?:boolean;wrongReceiptTransactionHash?:boolean;signatureWait?:boolean}={}){
 const f=fixture(options.kind),m=f.manifest,invoice=f.payload.data!.invoice;let allowance=options.approved?1000n:0n,requests=0;
 let receiptReady=!options.pending;const calls:string[]=[];let submitted:Record<string,string>|undefined;
 await page.exposeFunction('__recordPayment',(tx:Record<string,string>)=>{submitted=tx;});
 await page.addInitScript(({address,rejected,hash,signatureWait})=>{
  const listeners=new Map<string,Set<(v:unknown)=>void>>();let connected=sessionStorage.getItem('fixture-connected')==='yes',current=address,chain='0x4cef52';const sent:unknown[]=[];
  const provider={isMetaMask:true,isConnected:()=>connected,on:(e:string,fn:(v:unknown)=>void)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e)!.add(fn);return provider;},removeListener:(e:string,fn:(v:unknown)=>void)=>{listeners.get(e)?.delete(fn);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
   if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('fixture-connected','yes');return [current];}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
   if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});sent.push(params[0]);await (window as any).__recordPayment(params[0]);if(signatureWait)await new Promise<void>(resolve=>{(window as any).releaseSignature=resolve;});return hash;}
   throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  }};
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{paymentWallet:{sent,account:(next:string)=>{current=next;for(const cb of listeners.get('accountsChanged')??[])cb([current]);},chain:(next:string)=>{chain=next;for(const cb of listeners.get('chainChanged')??[])cb(chain);}}});
 },{address:f.request.payer,rejected:!!options.rejected,hash:txHash,signatureWait:!!options.signatureWait});
 await page.route('**/deployment',r=>r.fulfill({json:m,headers}));
 await page.route(`**/invoices/${f.request.invoiceId}`,r=>r.fulfill({headers,json:{schemaVersion:1,status:'available',code:'INVOICES_AVAILABLE',financialExecutionEnabled:false,chainId:m.chainId,deploymentId:f.payload.deploymentId,asOf:f.payload.asOf,currentIndexedBlock:f.payload.currentIndexedBlock,historical:false,freshness:{indexedAt:f.payload.freshness!.indexedAt,ageMs:0,head:'5',stale:false},coverage:f.payload.coverage,data:{invoice}}}));
 await page.route('**/quotes/payment',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  requests++;expect(r.request().postDataJSON()).toEqual(f.request);const payload=structuredClone(f.payload) as Extract<PaymentQuoteObservationDTO,{status:'observed'}>;
  payload.data!.funding.allowanceRaw=allowance.toString();payload.data!.funding.approvalRequired=allowance<BigInt(payload.data!.amountInRaw);if(!payload.data!.funding.approvalRequired)payload.data!.approval=null;
  return r.fulfill({headers,json:payload});
 });
 const block=(number='0x4')=>({number,hash:`0x${BigInt(number).toString(16).padStart(64,'0')}`,parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:m.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f104',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
 await page.route(url=>url.origin==='https://rpc.testnet.arc.io'||url.pathname==='/api/chain',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});const body=r.request().postDataJSON();
  const respond=async (q:{id:number;method:string;params:any[]})=>{
   calls.push(q.method);let result:unknown;
   if(q.method==='eth_chainId')result='0x4cef52';
   else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
   else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
   else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':'0xde0b6b3a7640000';
   else if(q.method==='eth_estimateGas')result='0x61a8';
   else if(q.method==='eth_call'){
    const tx=q.params[0],to=tx.to.toLowerCase();
    if(tx.data===f.payload.data!.plan.data||tx.data===f.payload.data!.approval?.data)result='0x';
    else if(to===m.payments.toLowerCase()){
     expect(q.params[1]).toEqual({blockHash:block().hash,requireCanonical:true});
     const decoded=decodeFunctionData({abi:paymentsReadAbi,data:tx.data}),fn=decoded.functionName;
     const value=fn==='USDC'?m.usdc:fn==='ROUTER'?m.router:fn==='allowedToken'?true:{merchant:invoice.merchant,amountDueRaw:BigInt(invoice.amountDueRaw),expiresAt:Number(invoice.expiresAt),recipients:invoice.recipients.map(r=>r.address),bps:invoice.recipients.map(r=>r.bps),memoHash:invoice.memoHash,status:1,payer:`0x${'00'.repeat(20)}`,inputRaw:0n,receivedRaw:0n,refundRaw:0n,routeHash:zero};
     result=encodeFunctionResult({abi:paymentsReadAbi,functionName:fn,result:value as never});
    }else {const decoded=decodeFunctionData({abi:erc20Abi,data:tx.data}),fn=decoded.functionName;result=encodeFunctionResult({abi:erc20Abi,functionName:fn,result:(fn==='balanceOf'?1000n:fn==='allowance'?allowance:6) as never});}
   }else if(q.method==='eth_getTransactionReceipt'){
    if(receiptReady&&submitted){if(submitted.to!.toLowerCase()===f.request.tokenIn.toLowerCase()&&!options.reverted)allowance=1000n;result={transactionHash:txHash,transactionIndex:'0x0',blockHash:block('0x5').hash,blockNumber:'0x5',from:f.request.payer,to:submitted.to,cumulativeGasUsed:'0x61a8',gasUsed:'0x61a8',contractAddress:null,logs:[],logsBloom:`0x${'00'.repeat(256)}`,status:options.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};}else result=null;
   }else if(q.method==='eth_getTransactionByHash')result=submitted?{...submitted,hash:options.wrongReceiptTransactionHash?zero:txHash,blockHash:block('0x5').hash,blockNumber:'0x5',transactionIndex:'0x0',from:f.request.payer,to:submitted.to,input:options.mismatched?'0xdeadbeef':submitted.data,value:'0x0',nonce:'0x0',gas:'0x7530',gasPrice:'0x3b9aca00',type:'0x2',chainId:'0x4cef52',v:'0x0',r:zero,s:zero}:null;
   else if(q.method==='eth_blockNumber')result='0x5';
   else throw Error(`Unhandled RPC ${q.method}`);
   return {jsonrpc:'2.0',id:q.id,result};
  };
  return r.fulfill({headers,json:Array.isArray(body)?await Promise.all(body.map(respond)):await respond(body)});
 });
 await page.goto(`/pay/${f.request.invoiceId}`);await expect(page.getByRole('heading',{name:'0.0001 USDC',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
 await page.clock.install({time:new Date(now)});if(options.kind==='swap')await page.getByLabel('Payment token').selectOption('oUSD6');await page.getByLabel('Maximum input').fill('0.001');
 return {calls,requests:()=>requests,ready:()=>{receiptReady=true;},f};
}
test('exact approval is a separate signature and a fresh payment quote follows its receipt',async({page})=>{
 const f=await setup(page);await page.getByRole('button',{name:'Get payment quote'}).click();
 await expect(page.getByRole('heading',{name:'Review token approval'})).toBeVisible();
 await page.setViewportSize({width:320,height:680});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'../../test/evidence/payment-approval-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Approve 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Approval confirmed/)).toBeVisible();
 expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(1);expect(f.requests()).toBe(1);
 await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
 expect(f.requests()).toBe(2);await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'../../test/evidence/payment-review-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();
 const sent=await page.evaluate(()=>(window as any).paymentWallet.sent);expect(sent).toHaveLength(2);expect(sent[0].gas).toBe('0x7530');expect(sent[0].maxFeePerGas).toBeTruthy();expect(sent[1].to.toLowerCase()).toBe(f.f.manifest.payments.toLowerCase());
 // Synthetic receipt confirmation is not permission to invent a paid invoice.
 await expect(page.getByText('Unpaid at indexed block',{exact:true})).toBeVisible();
});
test('insufficient native funds never request a signature',async({page})=>{
 await setup(page,{gasPoor:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByText(/Insufficient balance for gas/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
});
test('swap-funded invoice reviews the exact selected input and sends the reconstructed adapter plan',async({page})=>{
 const f=await setup(page,{kind:'swap',approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Pay 0.000134 oUSD6',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pay 0.000134 oUSD6',exact:true}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();
 const sent=await page.evaluate(()=>(window as any).paymentWallet.sent);expect(sent).toHaveLength(1);expect(sent[0].data).toBe(f.f.payload.data!.plan.data);
});
test('wallet and chain changes discard the payment review before signing',async({page})=>{
 const f=await setup(page,{approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).paymentWallet.account('0x000000000000000000000000000000000000002a'));await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toHaveCount(0);
 await page.evaluate(address=>(window as any).paymentWallet.account(address),f.f.request.payer);await expect(page.getByRole('button',{name:'Manage connected wallet'})).toContainText('0016');await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toHaveCount(0,{timeout:1000});
 await page.evaluate(()=>(window as any).paymentWallet.chain('0x1'));await expect(page.getByText(/Switch your wallet to the invoice network/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
});
test('receipt identity must match the queried hash as well as the reviewed calldata',async({page})=>{
 await setup(page,{approved:true,wrongReceiptTransactionHash:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Receipt transaction does not match/)).toBeVisible({timeout:5000});await expect(page.getByText(/Payment transaction confirmed/)).toHaveCount(0);
});
test('expired review cannot request a signature',async({page})=>{
 await setup(page,{approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();await page.clock.fastForward(20000);
 await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);
});
test('reverted payment preserves its receipt and displays no paid status',async({page})=>{
 await setup(page,{approved:true,reverted:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Transaction reverted. Refresh/)).toBeVisible();await page.getByText('Reverted transaction',{exact:true}).click();await expect(page.getByText(txHash,{exact:true})).toBeVisible();await expect(page.getByText('Gas paid: 0.000025 USDC',{exact:true})).toBeVisible();await expect(page.getByText('Unpaid at indexed block',{exact:true})).toBeVisible();
});
test('a receipt for different transaction bytes remains unresolved',async({page})=>{
 await setup(page,{approved:true,mismatched:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Receipt transaction does not match/)).toBeVisible();await expect(page.getByRole('button',{name:'Resume receipt tracking'})).toBeVisible();await expect(page.getByText(/Payment transaction confirmed/)).toHaveCount(0);
});
test('rejected signatures require a fresh quote without storing a transaction',async({page})=>{
 await setup(page,{approved:true,rejected:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/User rejected/)).toBeVisible();expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('orbital:payment:')))).toEqual([]);
});
test('saved receipt recovery after reload does not repeat the wallet send',async({page})=>{
 const fixture=await setup(page,{approved:true,pending:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(txHash,{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();await expect(page.getByRole('button',{name:'Resume receipt tracking'})).toBeVisible();fixture.ready();
 await page.getByRole('button',{name:'Resume receipt tracking'}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(0);expect(fixture.requests()).toBe(1);
});
test('storage failure after submission keeps the hash visible for read-only recovery',async({page})=>{
 await setup(page,{approved:true});await page.getByRole('button',{name:'Get payment quote'}).click();await expect(page.getByRole('heading',{name:'Review payment',exact:true})).toBeVisible();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('orbital:payment:'))throw Error('Fixture quota');return original.call(this,key,value);};});
 await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();await expect(page.getByText(/Transaction submitted; recovery storage is unavailable/)).toBeVisible();await expect(page.getByText(txHash,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Resume receipt tracking'}).click();await expect(page.getByText(/Payment transaction confirmed/)).toBeVisible();expect(await page.evaluate(()=>(window as any).paymentWallet.sent.length)).toBe(1);
});
test('account change while a signature is outstanding preserves the original payer hash',async({page})=>{
 const f=await setup(page,{approved:true,signatureWait:true,pending:true});await page.getByRole('button',{name:'Get payment quote'}).click();await page.getByRole('button',{name:'Pay 0.0001 USDC',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseSignature)).toBe('function');
 await page.evaluate(()=>{(window as any).paymentWallet.account('0x000000000000000000000000000000000000002a');(window as any).releaseSignature();});
 await expect(page.getByText(txHash,{exact:true})).toBeVisible();const records=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('orbital:payment:')));expect(records).toEqual([`orbital:payment:1:5042002:${f.f.request.payer.toLowerCase()}:${f.f.request.invoiceId}`]);
});
