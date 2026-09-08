import {test,expect,type Page} from '@playwright/test';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,keccak256,erc20Abi,type Address,type Hex} from 'viem';
import {buildOrder,configFromDTO,hashConfig,hashOrder,decodeSwapQuoteObservation,lifecycleAbi,routerAbi,swapEventsAbi} from '@orbital/sdk';
import wire from '../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};
const zero=`0x${'00'.repeat(32)}` as Hex,headers={'access-control-allow-origin':'*','cache-control':'no-store'};
function fixture(){
 const f=structuredClone(wire);f.manifest.chainId=f.observed.chainId=5042002;f.request.recipient=f.observed.request.recipient=f.request.wallet;
 f.observed.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,f.manifest.aqua as Address,f.manifest.router as Address,f.manifest.payments as Address]));
 const ids=new Map<string,string>();for(const r of [f.observed.data.best,...f.observed.data.alternatives]){const old=r.orderHash;r.config.chainId='5042002';r.recipient=f.request.wallet;const c=configFromDTO(r.config);r.configHash=hashConfig(c);r.orderHash=hashOrder(buildOrder(c));ids.set(old,r.orderHash);}
 for(const d of f.observed.data.diagnostics)d.orderHash=ids.get(d.orderHash)!;
 const ranked=[f.observed.data.best,...f.observed.data.alternatives].sort((a,b)=>a.feePpm-b.feePpm||a.orderHash.localeCompare(b.orderHash));f.observed.data.best=ranked[0]!;f.observed.data.alternatives=ranked.slice(1);
 decodeSwapQuoteObservation(f.observed,200,f.manifest,f.request,1700000003200);return f;
}
async function setup(page:Page,options:{approved?:boolean;pending?:boolean;gasPoor?:boolean;rejected?:boolean;docked?:boolean;changed?:boolean;noEvent?:boolean;reverted?:boolean}={}){
 const f=fixture(),r=f.observed.data.best,c=configFromDTO(r.config),amount=BigInt(f.request.amountInRaw),output=BigInt(r.amountOutRaw),fee=BigInt(r.feeRaw);let allowance=options.approved?amount:0n,ready=!options.pending,quotes=0;
 const sent=new Map<string,Record<string,string>>();
 await page.exposeFunction('__recordSwap',(tx:Record<string,string>)=>{const hash=`0x${(800+sent.size).toString(16).padStart(64,'0')}`;sent.set(hash,tx);return hash;});
 await page.addInitScript(({address,rejected})=>{
  let connected=sessionStorage.getItem('swap-fixture-connected')==='yes',current=address,chain='0x4cef52';const listeners=new Map<string,Set<(v:unknown)=>void>>(),calls:unknown[]=[];
  const provider={isMetaMask:true,isConnected:()=>connected,on:(name:string,cb:(v:unknown)=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(cb);return provider;},removeListener:(name:string,cb:(v:unknown)=>void)=>{listeners.get(name)?.delete(cb);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
   if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('swap-fixture-connected','yes');return [current];}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
   if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});calls.push(params[0]);return (window as any).__recordSwap(params[0]);}
   throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  }};
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{swapExecutionWallet:{calls,account:(value:string)=>{current=value;for(const cb of listeners.get('accountsChanged')??[])cb([value]);},chain:(value:string)=>{chain=value;for(const cb of listeners.get('chainChanged')??[])cb(value);}}});
 },{address:f.request.wallet,rejected:!!options.rejected});
 await page.route('**/deployment',route=>route.fulfill({headers,json:f.manifest}));
 await page.route('**/quotes/swap',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  quotes++;expect(route.request().postDataJSON()).toEqual(f.request);return route.fulfill({headers,json:f.observed});
 });
 const hash=(n:string)=>`0x${BigInt(n).toString(16).padStart(64,'0')}` as Hex;
 const block=(number='0x4')=>({number,hash:hash(number),parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:f.manifest.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f103',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
 await page.route('https://rpc.testnet.arc.io/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  const body=route.request().postDataJSON(),respond=(q:{id:number;method:string;params:any[]})=>{
   let result:unknown;const to=(q.params?.[0]?.to as string|undefined)?.toLowerCase();
   if(q.method==='eth_chainId')result='0x4cef52';
   else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
   else if(q.method==='eth_blockNumber')result='0x5';
   else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
   else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':`0x${(amount*10n**12n+10n**20n).toString(16)}`;
   else if(q.method==='eth_estimateGas')result='0x61a8';
   else if(q.method==='eth_call'){
    expect(q.params[1]).toEqual({blockHash:hash('0x4'),requireCanonical:true});
    if(to===f.manifest.router.toLowerCase()){
     const d=decodeFunctionData({abi:[...lifecycleAbi,...routerAbi],data:q.params[0].data});
     if(d.functionName==='swap')result='0x';
     else if(d.functionName==='quote')result=encodeFunctionResult({abi:routerAbi,functionName:'quote',result:[amount,output,r.orderHash as Hex]});
     else if(d.functionName==='getStrategyConfig')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyConfig',result:c});
     else if(d.functionName==='getStrategyState')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyState',result:{maker:c.maker,configHash:r.configHash as Hex,status:1,version:BigInt(r.stateVersion)+(options.changed?1n:0n),X:[1n,1n,1n],principalInternal:[1n,1n,1n],virtualInternal:0n,sumInternal:3n,sumSquaresInternal:{hi:0n,lo:3n},interiorRadius:1n,boundarySumNumerator:0n,boundarySigmaLower:0n,boundarySigmaUpper:0n,interiorTickMask:7,slackBoundInternal:0n,cumulativeFeeRaw:[0n,0n,0n]}});
     else if(d.functionName==='getStrategyAvailability')result=encodeFunctionResult({abi:lifecycleAbi,functionName:'getStrategyAvailability',result:c.tokens.map(token=>({token,aquaAllocationRaw:output,liveTokenCount:options.docked?0:3,walletBalanceRaw:output,aquaAllowanceRaw:output,live:!options.docked,backingValid:true,surplusInternal:{hi:0n,lo:0n},deficitInternal:{hi:0n,lo:0n},fundingCeilingRaw:output}))});
     else throw Error(`Unexpected router call ${d.functionName}`);
    }else {const d=decodeFunctionData({abi:erc20Abi,data:q.params[0].data});result=d.functionName==='approve'?'0x':encodeFunctionResult({abi:erc20Abi,functionName:d.functionName,result:(d.functionName==='balanceOf'?amount:d.functionName==='allowance'?allowance:to===f.request.tokenIn.toLowerCase()?6:18) as never});}
   }else if(q.method==='eth_getTransactionReceipt'){
    const tx=sent.get(q.params[0]);if(!ready||!tx)result=null;else{
     const approval=tx.to!.toLowerCase()===f.request.tokenIn.toLowerCase();if(approval&&!options.reverted)allowance=amount;
     const args={maker:c.maker,orderHash:r.orderHash as Hex,taker:f.request.wallet as Address,recipient:f.request.recipient as Address,tokenInIndex:0,tokenOutIndex:2,grossInputRaw:amount,netInputRaw:amount-fee,feeRaw:fee,amountOutRaw:output+7n,version:BigInt(r.stateVersion)+1n,crossedTickKeys:[c.tickKeys[1]!],crossedInward:[true]};
     const logs=approval||options.noEvent||options.reverted?[]:[{address:f.manifest.router,topics:encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted',args}),data:encodeAbiParameters(swapEventsAbi[0].inputs.filter(v=>!v.indexed),[args.recipient,0,2,amount,amount-fee,fee,output+7n,args.version,args.crossedTickKeys,args.crossedInward]),blockNumber:'0x5',blockHash:hash('0x5'),transactionHash:q.params[0],transactionIndex:'0x0',logIndex:'0x1',removed:false}];
     result={transactionHash:q.params[0],transactionIndex:'0x0',blockHash:hash('0x5'),blockNumber:'0x5',from:f.request.wallet,to:tx.to,cumulativeGasUsed:'0x61a8',gasUsed:'0x61a8',contractAddress:null,logs,logsBloom:`0x${'00'.repeat(256)}`,status:options.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};
    }
   }else if(q.method==='eth_getTransactionByHash'){const tx=sent.get(q.params[0]);result=tx?{...tx,hash:q.params[0],blockHash:hash('0x5'),blockNumber:'0x5',transactionIndex:'0x0',from:f.request.wallet,to:tx.to,input:tx.data,value:'0x0',nonce:'0x0',gas:'0x7530',gasPrice:'0x3b9aca00',type:'0x2',chainId:'0x4cef52',v:'0x0',r:zero,s:zero}:null;}
   else throw Error(`Unexpected RPC ${q.method}`);
   return {jsonrpc:'2.0',id:q.id,result};
  };
  return route.fulfill({headers,json:Array.isArray(body)?body.map(respond):respond(body)});
 });
 await page.goto('/swap');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
 await page.getByLabel('Input token').selectOption('USDC');await page.getByLabel('You receive',{exact:true}).selectOption('oUSD18');await page.getByLabel('You pay',{exact:true}).fill('9007199254.740993');await page.clock.install({time:new Date(1700000003200)});
 return {f,sent,ready:()=>{ready=true;},quotes:()=>quotes};
}
async function review(page:Page){await page.getByRole('button',{name:'Get quote',exact:true}).click();await expect(page.getByLabel('Quoted output',{exact:true})).toHaveText('20 oUSD18');await page.getByRole('button',{name:'Review swap',exact:true}).click();}
test('standalone approval and fresh swap review lead to exact receipt amounts and crossings',async({page})=>{
 const f=await setup(page);await review(page);await expect(page.getByRole('heading',{name:'Review token approval'})).toBeVisible();await page.getByRole('button',{name:'Approve 9007199254.740993 USDC',exact:true}).click();await expect(page.getByRole('heading',{name:'Approval confirmed',exact:true})).toBeVisible();expect(f.sent.size).toBe(1);
 await page.getByRole('button',{name:'Review fresh swap',exact:true}).click();await expect(page.getByRole('heading',{name:'Review swap',exact:true})).toBeVisible();expect(f.quotes()).toBe(3);
 await page.setViewportSize({width:320,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'../../test/evidence/swap-review-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Submit reviewed swap',exact:true}).click();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toBeVisible();await expect(page.getByText('20.000000000000000007 oUSD18',{exact:true})).toBeVisible();await page.getByText('View transaction receipt',{exact:true}).click();await expect(page.getByText(/Inward · tick/)).toBeVisible();expect(f.sent.size).toBe(2);
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'../../test/evidence/swap-receipt-desktop.png',fullPage:true});
});
test('standalone swap rejects insufficient native inventory before requesting any signature',async({page})=>{const f=await setup(page,{approved:true,gasPoor:true});await review(page);await expect(page.getByText(/Insufficient balance for gas/)).toBeVisible();expect(f.sent.size).toBe(0);});
test('docked strategies cannot enter swap review',async({page})=>{const f=await setup(page,{approved:true,docked:true});await review(page);await expect(page.getByText(/strategy is docked/)).toBeVisible();expect(f.sent.size).toBe(0);});
test('changed-version strategies cannot enter swap review',async({page})=>{const f=await setup(page,{approved:true,changed:true});await review(page);await expect(page.getByText('Strategy changed. Refresh the quote.',{exact:true})).toBeVisible();expect(f.sent.size).toBe(0);});
test('standalone signature rejection returns an editable amount without a saved hash',async({page})=>{const f=await setup(page,{approved:true,rejected:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByText(/User rejected/)).toBeVisible();await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('9007199254.740993');expect(f.sent.size).toBe(0);});
test('success without an Orbital settlement event stays unresolved',async({page})=>{const f=await setup(page,{approved:true,noEvent:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByText(/does not establish the reviewed swap settlement/)).toBeVisible();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toHaveCount(0);expect(f.sent.size).toBe(1);});
test('standalone swap resumes a saved receipt after reload without signing again',async({page})=>{
 const f=await setup(page,{approved:true,pending:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toBeVisible();f.ready();await page.getByRole('button',{name:'Resume swap receipt'}).click();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toBeVisible();expect(f.sent.size).toBe(1);
});
test('expired swap review cannot request a signature',async({page})=>{
 const f=await setup(page,{approved:true});await review(page);await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toBeVisible();await page.clock.fastForward(11000);await expect(page.getByText('Swap review expired. Get a fresh quote before signing.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toHaveCount(0);expect(f.sent.size).toBe(0);
});
test('switching accounts away and back permanently invalidates the swap review',async({page})=>{
 const f=await setup(page,{approved:true});await review(page);await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toBeVisible();
 await page.evaluate(()=>(window as any).swapExecutionWallet.account('0x0000000000000000000000000000000000000032'));await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toHaveCount(0);
 await page.evaluate(address=>(window as any).swapExecutionWallet.account(address),f.f.request.wallet);await expect(page.getByRole('button',{name:'Get quote',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toHaveCount(0);expect(f.sent.size).toBe(0);
});
test('reverted swap receipts retain gas evidence without claiming settlement',async({page})=>{
 const f=await setup(page,{approved:true,reverted:true});await review(page);await page.getByRole('button',{name:'Submit reviewed swap'}).click();await expect(page.getByRole('heading',{name:'Transaction reverted',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Swap complete',exact:true})).toHaveCount(0);await expect(page.getByText('Actual output',{exact:true})).toHaveCount(0);expect(f.sent.size).toBe(1);
});
test('corrupted approval recovery blocks a new signature after reload',async({page})=>{
 const f=await setup(page,{pending:true});await review(page);await page.getByRole('button',{name:'Approve 9007199254.740993 USDC',exact:true}).click();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toBeVisible();
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('orbital:swap:1:'))!;const saved=JSON.parse(localStorage.getItem(key)!);saved.plan.to=saved.tokenOut.address;localStorage.setItem(key,JSON.stringify(saved));});await page.reload();await expect(page.getByText('Saved swap recovery could not be read. Check previous wallet activity before retrying.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Resume swap receipt'})).toHaveCount(0);expect(f.sent.size).toBe(1);
});
