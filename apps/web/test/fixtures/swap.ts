import {expect,type Page} from '@playwright/test';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,keccak256,erc20Abi,type Address,type Hex} from 'viem';
import {buildOrder,configFromDTO,hashConfig,hashOrder,decodeSwapQuoteObservation,lifecycleAbi,routerAbi,swapEventsAbi,feeIn} from '@orbital/sdk';
import wire from '../../../../packages/sdk/test/fixtures/swap-quote-observation.json' with {type:'json'};
const zero=`0x${'00'.repeat(32)}` as Hex,headers={'access-control-allow-origin':'*','cache-control':'no-store'};
export function swapFixture(){
 const f=structuredClone(wire);f.request.slippageBps=f.observed.request.slippageBps=10;f.manifest.chainId=f.observed.chainId=5042002;f.request.recipient=f.observed.request.recipient=f.request.wallet;
 f.observed.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,f.manifest.aqua as Address,f.manifest.router as Address,f.manifest.payments as Address]));
 const ids=new Map<string,string>();for(const r of [f.observed.data.best,...f.observed.data.alternatives]){r.minimumOutRaw=(BigInt(r.amountOutRaw)*9990n/10000n).toString();const old=r.orderHash;r.config.chainId='5042002';r.recipient=f.request.wallet;const c=configFromDTO(r.config);r.configHash=hashConfig(c);r.orderHash=hashOrder(buildOrder(c));ids.set(old,r.orderHash);}
 for(const d of f.observed.data.diagnostics)d.orderHash=ids.get(d.orderHash)!;
 const ranked=[f.observed.data.best,...f.observed.data.alternatives].sort((a,b)=>a.feePpm-b.feePpm||a.orderHash.localeCompare(b.orderHash));f.observed.data.best=ranked[0]!;f.observed.data.alternatives=ranked.slice(1);
 decodeSwapQuoteObservation(f.observed,200,f.manifest,f.request,1700000003200);return f;
}
export async function setupSwap(page:Page,options:{approved?:boolean;pending?:boolean;gasPoor?:boolean;rejected?:boolean;docked?:boolean;changed?:boolean;noEvent?:boolean;reverted?:boolean;dynamic?:boolean;blank?:boolean;gasUnits?:bigint;balanceFail?:boolean;wrongDecimals?:boolean;switchRejected?:boolean}={}){
 const f=swapFixture(),r=f.observed.data.best,c=configFromDTO(r.config),balanceAmount=BigInt(f.request.amountInRaw),output=BigInt(r.amountOutRaw);let amount=balanceAmount,fee=BigInt(r.feeRaw),allowance=options.approved?amount:0n,ready=!options.pending,quotes=0;const requests:typeof f.request[]=[];
 const sent=new Map<string,Record<string,string>>();
 await page.exposeFunction('__recordSwap',(tx:Record<string,string>)=>{const hash=`0x${(800+sent.size).toString(16).padStart(64,'0')}`;sent.set(hash,tx);return hash;});
 await page.addInitScript(({address,rejected,switchRejected})=>{
  let connected=sessionStorage.getItem('swap-fixture-connected')==='yes',current=address,chain='0x4cef52';const listeners=new Map<string,Set<(v:unknown)=>void>>(),calls:unknown[]=[],networks:string[]=[];
  const provider={isMetaMask:true,isConnected:()=>connected,on:(name:string,cb:(v:unknown)=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(cb);return provider;},removeListener:(name:string,cb:(v:unknown)=>void)=>{listeners.get(name)?.delete(cb);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
   if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('swap-fixture-connected','yes');return [current];}
   if(method==='wallet_switchEthereumChain'){if(switchRejected)throw Object.assign(Error('User rejected network request'),{code:4001});chain=(params[0] as {chainId:string}).chainId;networks.push(chain);for(const cb of listeners.get('chainChanged')??[])cb(chain);return null;}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
   if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});calls.push(params[0]);return (window as any).__recordSwap(params[0]);}
   throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  }};
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{swapExecutionWallet:{calls,networks,account:(value:string)=>{current=value;for(const cb of listeners.get('accountsChanged')??[])cb([value]);},chain:(value:string)=>{chain=value;for(const cb of listeners.get('chainChanged')??[])cb(value);}}});
 },{address:f.request.wallet,rejected:!!options.rejected,switchRejected:!!options.switchRejected});
 await page.route('**/deployment',route=>route.fulfill({headers,json:f.manifest}));
 await page.route('**/quotes/swap',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  quotes++;const body=route.request().postDataJSON();requests.push(body);
  if(options.dynamic){Object.assign(f.request,body);Object.assign(f.observed.request,body);for(const route of [f.observed.data.best,...f.observed.data.alternatives]){const decimals=f.manifest.tokens.find(t=>t.address.toLowerCase()===body.tokenOut.toLowerCase())!.decimals;route.amountOutRaw=(20n*10n**BigInt(decimals)).toString();route.amountInRaw=body.amountInRaw;route.tokenIn=body.tokenIn;route.tokenOut=body.tokenOut;route.feeRaw=feeIn(BigInt(body.amountInRaw),route.feePpm).toString();route.minimumOutRaw=(BigInt(route.amountOutRaw)*BigInt(10000-body.slippageBps)/10000n).toString();}amount=BigInt(body.amountInRaw);fee=BigInt(r.feeRaw);}else expect(body).toEqual(f.request);
  return route.fulfill({headers,json:f.observed});
 });
 const hash=(n:string)=>`0x${BigInt(n).toString(16).padStart(64,'0')}` as Hex;
 const block=(number='0x4')=>({number,hash:hash(number),parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:f.manifest.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f103',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
 await page.route(url=>url.origin==='https://rpc.testnet.arc.io'||url.pathname==='/api/chain',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  const body=route.request().postDataJSON(),respond=(q:{id:number;method:string;params:any[]})=>{
   let result:unknown;const to=(q.params?.[0]?.to as string|undefined)?.toLowerCase();
   if(q.method==='eth_chainId')result='0x4cef52';
   else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
   else if(q.method==='eth_blockNumber')result='0x5';
   else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
   else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':`0x${(balanceAmount*10n**12n+10n**20n).toString(16)}`;
   else if(q.method==='eth_estimateGas')result=`0x${(options.gasUnits??25000n).toString(16)}`;
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
    }else {const d=decodeFunctionData({abi:erc20Abi,data:q.params[0].data});if(options.balanceFail&&d.functionName==='balanceOf')return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'Balance unavailable'}};result=d.functionName==='approve'?'0x':encodeFunctionResult({abi:erc20Abi,functionName:d.functionName,result:(d.functionName==='balanceOf'?balanceAmount:d.functionName==='allowance'?allowance:options.wrongDecimals?0:c.decimals[c.tokens.findIndex(t=>t.toLowerCase()===to)]) as never});}
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
 await page.clock.install({time:new Date(1700000003200)});if(!options.blank){await page.getByLabel('Input token').selectOption('USDC');await page.getByLabel('You receive',{exact:true}).selectOption('oUSD18');await page.getByLabel('You pay',{exact:true}).fill('9007199254.740993');}
 return {f,sent,requests,ready:()=>{ready=true;},quotes:()=>quotes};
}
