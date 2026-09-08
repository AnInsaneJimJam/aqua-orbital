import {expect,type Page} from '@playwright/test';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionResult,decodeFunctionData,keccak256,erc20Abi,type Address,type Hex} from 'viem';
import {directPaymentAbi,paymentsReadAbi,paymentsEventsAbi} from '@orbital/sdk';
import wire from '../../../../packages/sdk/test/fixtures/payment-observations.json' with {type:'json'};
const zero=`0x${'00'.repeat(32)}` as Hex,createdId=`0x${'ee'.repeat(32)}` as Hex,txHash=`0x${'ab'.repeat(32)}` as Hex;
const headers={'access-control-allow-origin':'*','cache-control':'no-store'};
/** Synthetic RPC and injected wallet; not Privy or live-chain evidence. */
export async function setupInvoiceAdmin(page:Page,options:{cancel?:boolean;pending?:boolean;rejected?:boolean;gasPoor?:boolean;reverted?:boolean;noEvent?:boolean;wrongTransaction?:boolean}={}){
 const f=structuredClone(wire.find(v=>v.kind==='direct')!),m=f.manifest,invoice=f.payload.data!.invoice,account=invoice.merchant;
 m.chainId=5042002;const deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],[5042002n,m.aqua as Address,m.router as Address,m.payments as Address]));
 let ready=!options.pending,submitted:Record<string,string>|undefined,nonce=3n,invoiceStatus=1;const calls:Record<string,string>[]=[];
 await page.exposeFunction('__recordInvoice',(tx:Record<string,string>)=>{submitted=tx;calls.push(tx);return txHash;});
 await page.addInitScript(({address,rejected})=>{
  let connected=sessionStorage.getItem('invoice-fixture-connected')==='yes',current=address,chain='0x4cef52';const listeners=new Map<string,Set<(v:unknown)=>void>>();
  const provider={isMetaMask:true,isConnected:()=>connected,on:(n:string,cb:(v:unknown)=>void)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n)!.add(cb);return provider;},removeListener:(n:string,cb:(v:unknown)=>void)=>{listeners.get(n)?.delete(cb);return provider;},request:async({method,params}:{method:string;params:unknown[]})=>{
   if(method==='eth_chainId')return chain;if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_requestAccounts'){connected=true;sessionStorage.setItem('invoice-fixture-connected','yes');return [current];}
   if(method==='wallet_switchEthereumChain'){chain=(params[0] as {chainId:string}).chainId;for(const cb of listeners.get('chainChanged')??[])cb(chain);return null;}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];if(method==='wallet_getPermissions')return [];if(method==='wallet_revokePermissions'){connected=false;return null;}
   if(method==='eth_sendTransaction'){if(rejected)throw Object.assign(Error('User rejected request'),{code:4001});return (window as any).__recordInvoice(params[0]);}
   throw Object.assign(Error(`Fixture rejects ${method}`),{code:4200});
  }};
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{invoiceWallet:{account:(v:string)=>{current=v;for(const cb of listeners.get('accountsChanged')??[])cb([v]);},chain:(v:string)=>{chain=v;for(const cb of listeners.get('chainChanged')??[])cb(v);}}});
 },{address:account,rejected:!!options.rejected});
 await page.route('**/deployment',r=>r.fulfill({headers,json:m}));
 await page.route(`**/invoices/${invoice.invoiceId}`,r=>r.fulfill({headers,json:{schemaVersion:1,status:'available',code:'INVOICES_AVAILABLE',financialExecutionEnabled:false,chainId:m.chainId,deploymentId,asOf:f.payload.asOf,currentIndexedBlock:f.payload.currentIndexedBlock,historical:false,
  freshness:{indexedAt:f.payload.freshness!.indexedAt,ageMs:0,head:'5',stale:false},coverage:f.payload.coverage,data:{invoice}}}));
 const block=(number='0x4')=>({number,hash:`0x${BigInt(number).toString(16).padStart(64,'0')}`,parentHash:zero,nonce:'0x0000000000000000',sha3Uncles:zero,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:zero,stateRoot:zero,receiptsRoot:zero,miner:m.aqua,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x6553f104',transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:zero});
 await page.route(url=>url.origin==='https://rpc.testnet.arc.io'||url.pathname==='/api/chain',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'}});
  const respond=(q:{id:number;method:string;params:any[]})=>{
   let result:unknown;
   if(q.method==='eth_chainId')result='0x4cef52';
   else if(q.method==='eth_getBlockByNumber')result=block(q.params[0]==='latest'?'0x4':q.params[0]);
   else if(q.method==='eth_maxPriorityFeePerGas')result='0x3b9aca00';
   else if(q.method==='eth_getBalance')result=options.gasPoor?'0x1':'0xde0b6b3a7640000';
   else if(q.method==='eth_estimateGas')result='0x61a8';
   else if(q.method==='eth_call'){
    const tx=q.params[0];
    if(tx.to.toLowerCase()===m.usdc.toLowerCase())result=encodeFunctionResult({abi:erc20Abi,functionName:'decimals',result:6});
    else{
     const decoded=decodeFunctionData({abi:[...paymentsReadAbi,...directPaymentAbi],data:tx.data}),fn=decoded.functionName;
     if(fn==='createInvoice')result=encodeFunctionResult({abi:directPaymentAbi,functionName:fn,result:createdId});
     else if(fn==='cancelInvoice')result='0x';
     else{
      expect(q.params[1]).toEqual({blockHash:block().hash,requireCanonical:true});
      const value=fn==='USDC'?m.usdc:fn==='ROUTER'?m.router:fn==='nextMerchantNonce'?nonce:{merchant:invoice.merchant,amountDueRaw:BigInt(invoice.amountDueRaw),expiresAt:Number(invoice.expiresAt),recipients:invoice.recipients.map(v=>v.address),bps:invoice.recipients.map(v=>v.bps),memoHash:invoice.memoHash,status:invoiceStatus,payer:`0x${'00'.repeat(20)}`,inputRaw:0n,receivedRaw:0n,refundRaw:0n,routeHash:zero};
      result=encodeFunctionResult({abi:paymentsReadAbi,functionName:fn as never,result:value as never});
     }
    }
   }else if(q.method==='eth_getTransactionReceipt'){
    if(!submitted||!ready)result=null;
    else{
     const decoded=decodeFunctionData({abi:directPaymentAbi,data:submitted.data as Hex}),create=decoded.functionName==='createInvoice';
     const topics=encodeEventTopics({abi:paymentsEventsAbi,eventName:create?'InvoiceCreated':'InvoiceCancelled',args:{invoiceId:create?createdId:invoice.invoiceId as Hex,merchant:account as Address}});
     const data=create?encodeAbiParameters([{type:'uint256'},{type:'uint40'},{type:'address[]'},{type:'uint16[]'},{type:'bytes32'}],decoded.args as never):'0x';
     const logs=options.noEvent||options.reverted?[]:[{address:m.payments,topics,data,blockNumber:'0x5',blockHash:block('0x5').hash,transactionHash:txHash,transactionIndex:'0x0',logIndex:'0x0',removed:false}];
     result={transactionHash:txHash,transactionIndex:'0x0',blockHash:block('0x5').hash,blockNumber:'0x5',from:account,to:submitted.to,cumulativeGasUsed:'0x61a8',gasUsed:'0x61a8',contractAddress:null,logs,logsBloom:`0x${'00'.repeat(256)}`,status:options.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};
    }
   }else if(q.method==='eth_getTransactionByHash')result=submitted?{...submitted,hash:txHash,blockHash:block('0x5').hash,blockNumber:'0x5',transactionIndex:'0x0',from:account,to:submitted.to,input:options.wrongTransaction?'0xdeadbeef':submitted.data,value:'0x0',nonce:'0x0',gas:'0x7530',gasPrice:'0x3b9aca00',type:'0x2',chainId:'0x4cef52',v:'0x0',r:zero,s:zero}:null;
   else if(q.method==='eth_blockNumber')result='0x5';else throw Error(`Unhandled invoice RPC ${q.method}`);
   return {jsonrpc:'2.0',id:q.id,result};
  };
  const body=r.request().postDataJSON();return r.fulfill({headers,json:Array.isArray(body)?body.map(respond):respond(body)});
 });
 await page.clock.install({time:new Date(1700000004000)});
 await page.goto(options.cancel?`/pay/${invoice.invoiceId}`:'/pay');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeVisible();
 return {calls,account,manifest:m,createdId,invoiceId:invoice.invoiceId,ready:()=>{ready=true;},advanceNonce:()=>{nonce++;},paid:()=>{invoiceStatus=3;}};
}
