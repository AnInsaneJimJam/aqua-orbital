// Local-only receipt companion. The target is a new owned Anvil instance;
// unlocked disposable accounts are used without reading or printing keys.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildGraph,linkObject,verifyRuntime} from '../../../scripts/lib/local-deployment.mjs';
import {startOwnedAnvil} from '../../../scripts/lib/local-anvil.mjs';
import {verifyTransaction} from '../../../scripts/lib/local-deployment-runner.mjs';
import {buildOrder,encodeOrder,hashOrder,takerData,type Config} from '../../sdk/src/codec.js';
const {encodeDeployData,encodeFunctionData,decodeFunctionResult,encodeFunctionResult,decodeEventLog,getContractAddress,keccak256,toHex,zeroAddress}=createRequire(new URL('../../sdk/package.json',import.meta.url))('viem');
const root=fileURLToPath(new URL('../../../',import.meta.url)),contracts=resolve(root,'.cache/mixed-invoice/project');
const here=resolve(root,'test/evidence/mixed-invoice');
const sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const json=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const eq=(a:any,b:any)=>assert.deepEqual(typeof a==='string'&&a.startsWith('0x')?a.toLowerCase():a,typeof b==='string'&&b.startsWith('0x')?b.toLowerCase():b);
const quantity=(n:bigint)=>`0x${n.toString(16)}`;
// The JS helper accepts validated string FQNs; its inferred TS default is
// narrower because its ordinary product roots are a literal tuple.
const readGraph=buildGraph as (options:{contracts:string;roots:string[]})=>Promise<{roots:string[];nodes:any[];sources:Record<string,string>}>;
const fqn={aqua:'vendor/aqua/src/Aqua.sol:Aqua',router:'src/OrbitalSwapVMRouter.sol:OrbitalSwapVMRouter',payments:'src/OrbitalPayments.sol:OrbitalPayments',factory:'test/MixedInvoice.t.sol:MixedInvoiceAssets',token:'test/MixedInvoice.t.sol:MixedInvoiceDollar'};
const sources=['packages/contracts/test/mixed-invoice-receipts.mts','packages/contracts/test/MixedInvoice.t.sol','test/evidence/mixed-invoice/source-pins.json','test/evidence/mixed-invoice/run.py','packages/reference/fixtures/reachable-traversal.json','scripts/lib/local-anvil.mjs','scripts/lib/local-deployment.mjs','scripts/lib/local-deployment-runner.mjs','packages/sdk/scripts/artifact-integrity.mjs','packages/sdk/src/codec.ts','packages/sdk/src/generated/abi.ts','packages/shared/src/index.ts','pnpm-lock.yaml'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,sha(await readFile(resolve(root,name)))])));
const serializeGraph=(g:any)=>g.nodes.map((n:any)=>({fqn:n.fqn,dependencies:n.dependencies,runtimeBytes:n.runtimeBytes,integrity:n.integrity}));
const sourceHashes=await hashes();
const graph=await readGraph({contracts,roots:Object.values(fqn)}),nodes=new Map(graph.nodes.map((n:any)=>[n.fqn,n]));
const upstreamBytes=await readFile(resolve(root,'test/evidence/upstream.json')),upstream=JSON.parse(upstreamBytes.toString()).aqua;
assert.equal(upstream.url,'https://github.com/1inch/aqua.git');assert.equal(upstream.revision,'81c26e4619ce21556ab02b3284ee2685de21fb18');
for(const source of Object.keys(graph.sources).filter(source=>source.startsWith('vendor/aqua/'))){
  const name=source.slice('vendor/aqua/'.length);assert.equal(sha(await readFile(resolve(contracts,source))),upstream.files[name]);
}
const pins=JSON.parse(await readFile(resolve(here,'source-pins.json'),'utf8'));
for(const [name,item] of Object.entries(pins) as any){assert.equal(sha(await readFile(resolve(contracts,name))),item.sha256);}
const oracle=JSON.parse(await readFile(resolve(root,'packages/reference/fixtures/reachable-traversal.json'),'utf8'));
assert.deepEqual(oracle.initial.decimals,[6,18,6]);
const GROSS=BigInt(oracle.swaps[0].gross_input_raw),FEE=BigInt(oracle.swaps[0].fee_raw),OUTPUT=BigInt(oracle.swaps[0].witness.output_raw),DUE=150_000_000n,REFUND=OUTPUT-DUE;
assert.equal(GROSS,350_000_000n);assert.equal(FEE,175_000n);assert.equal(OUTPUT,164_721_797n);assert.equal(REFUND,14_721_797n);
const report:any={schemaVersion:1,status:'running',scope:'disposable local mixed invoice; no Arc or Privy claim',startedAt:new Date().toISOString(),sourceHashes,
  upstream:{url:upstream.url,revision:upstream.revision,acquisitionManifestSha256:sha(upstreamBytes)},graph:serializeGraph(graph),deployments:[],transactions:[],cases:[],chainStopped:false};
let local:any;
try{
  local=await startOwnedAnvil();report.chain=local.identity;const [merchant,maker,payer]=await local.request('eth_accounts');
  const first='0x000000000000000000000000000000000000cafe',second='0x0000000000000000000000000000000000000fee';
  const addresses=new Map<string,string>();report.actors={merchant,maker,payer,first,second};
  async function transact(from:string,to:string|null,data:string,status='0x1'){
    await local.assertIdentity();const nonce=BigInt(await local.request('eth_getTransactionCount',[from,'pending']));
    const tx:any={from,...(to?{to}:{}),data,nonce:quantity(nonce),value:'0x0',gas:'0x1c9c380'};
    let simulated:string|undefined;
    if(status==='0x1'){
      const estimated=BigInt(await local.request('eth_estimateGas',[tx]));const gas=estimated+estimated/5n+10000n;assert.ok(gas<=30_000_000n);tx.gas=quantity(gas);
      simulated=await local.request('eth_call',[tx,'latest']);
    }
    assert.equal(BigInt(await local.request('eth_getTransactionCount',[from,'pending'])),nonce);
    const hash=await local.request('eth_sendTransaction',[tx]),receipt=await local.receipt(hash);
    const [transaction,block]=await Promise.all([local.request('eth_getTransactionByHash',[hash]),local.request('eth_getBlockByNumber',[receipt.blockNumber,false])]);
    assert.equal(receipt.status,status);
    if(status==='0x1')verifyTransaction({transaction,receipt,block,from,to,data,nonce,predictedAddress:to?null:getContractAddress({from,nonce})});
    else{
      // Preserve real status=0. Identity checks mirror the success verifier,
      // without rewriting a failed receipt into a synthetic successful one.
      eq(transaction.hash,hash);eq(receipt.transactionHash,hash);eq(transaction.from,from);eq(receipt.from,from);eq(transaction.to,to);eq(receipt.to,to);
      eq(transaction.input,data);assert.equal(BigInt(transaction.nonce),nonce);assert.equal(BigInt(transaction.chainId),31337n);assert.equal(BigInt(transaction.value),0n);
      eq(transaction.blockHash,block.hash);eq(receipt.blockHash,block.hash);eq(transaction.blockNumber,block.number);eq(receipt.blockNumber,block.number);assert.ok(block.transactions.includes(hash));
      assert.equal(receipt.contractAddress,null);assert.ok(BigInt(receipt.gasUsed)>0n&&BigInt(receipt.gasUsed)<BigInt(transaction.gas)&&BigInt(transaction.gas)<=30_000_000n);assert.deepEqual(receipt.logs,[]);
    }
    const result={transaction,receipt,block};report.transactions.push(result);return {...result,simulated};
  }
  async function deploy(name:string,args:any[]=[]){
    const node:any=nodes.get(name);const creation=linkObject(node.artifact.bytecode.object,node.integrity.linkReferences.creation,addresses);
    const template=linkObject(node.artifact.deployedBytecode.object,node.integrity.linkReferences.runtime,addresses);
    const data=encodeDeployData({abi:node.artifact.abi,bytecode:creation,args});assert.ok((data.length-2)/2<=49152);
    const result=await transact(merchant,null,data),address=result.receipt.contractAddress;
    const code=await local.request('eth_getCode',[address,{blockHash:result.block.hash,requireCanonical:true}]);
    const runtime=verifyRuntime(template,node.artifact.deployedBytecode.immutableReferences??{},result.simulated,code);
    if(!graph.roots.includes(name)&&Object.keys(runtime.immutableValues).length){assert.deepEqual(Object.keys(runtime.immutableValues),['library_deploy_address']);eq(runtime.immutableValues.library_deploy_address,'0x'+address.slice(2).padStart(64,'0'));}
    addresses.set(name,address);report.deployments.push({fqn:name,address,args,receipt:result.receipt,runtime,code});return address;
  }
  for(const node of graph.nodes){assert.ok(!node.dependencies.some((d:string)=>graph.roots.includes(d)));if(!graph.roots.includes(node.fqn))await deploy(node.fqn);}
  const aqua=await deploy(fqn.aqua),factory=await deploy(fqn.factory);
  const abi=(name:string)=>(nodes.get(name) as any).artifact.abi;
  async function call(target:string,name:string,fn:string,args:any[]=[],from=payer,pin:any='latest'){
    const data=await local.request('eth_call',[{from,to:target,data:encodeFunctionData({abi:abi(name),functionName:fn,args})},pin]);
    const result=decodeFunctionResult({abi:abi(name),functionName:fn,data});eq(encodeFunctionResult({abi:abi(name),functionName:fn,result}),data);return result;
  }
  async function send(target:string,name:string,fn:string,args:any[]=[],from=merchant){return transact(from,target,encodeFunctionData({abi:abi(name),functionName:fn,args}));}
  const tokens=[];
  for(let i=0;i<3;i++)tokens.push(await call(factory,fqn.factory,'assets',[BigInt(i)]));
  assert.ok(BigInt(tokens[0])<BigInt(tokens[1])&&BigInt(tokens[1])<BigInt(tokens[2]));
  for(let i=0;i<3;i++){
    assert.equal(await call(tokens[i],fqn.token,'decimals'),[6,18,6][i]);
    const node:any=nodes.get(fqn.token),args=[[6,18,6][i]],data=encodeDeployData({abi:node.artifact.abi,bytecode:node.artifact.bytecode.object,args});
    const simulated=await local.request('eth_call',[{from:merchant,data,nonce:await local.request('eth_getTransactionCount',[merchant,'pending']),gas:'0x1c9c380'},'latest']);
    const code=await local.request('eth_getCode',[tokens[i],'latest']);
    report.deployments.push({fqn:fqn.token,address:tokens[i],createdByFactory:factory,args,runtime:verifyRuntime(node.artifact.deployedBytecode.object,node.artifact.deployedBytecode.immutableReferences??{},simulated,code),code});
  }
  const router=await deploy(fqn.router,[aqua,merchant,tokens,[6,18,6]]),payments=await deploy(fqn.payments,[tokens[2],router,tokens]);
  await send(router,fqn.router,'renounceOwnership');eq(await call(router,fqn.router,'owner'),zeroAddress);eq(await call(router,fqn.router,'AQUA'),aqua);assert.equal(await call(router,fqn.router,'CHAIN_ID'),31337n);
  for(let i=0;i<3;i++){
    const fund=10000n*10n**BigInt([6,18,6][i]!);for(const who of [maker,payer])await send(tokens[i],fqn.token,'mint',[who,fund]);
    await send(tokens[i],fqn.token,'approve',[aqua,(1n<<256n)-1n],maker);
  }
  const config:Config={schemaVersion:1,chainId:31337n,router,maker,makerNonce:0n,tokens,decimals:[6,18,6],tickKeys:oracle.initial.keys.map(BigInt),radiiInternal:oracle.initial.radii.map(BigInt),feePpm:500,initialAmountsRaw:oracle.initial.raw.map(BigInt)};
  const order=buildOrder(config),orderHash=hashOrder(order);report.strategy={config,order,orderHash};
  await send(aqua,fqn.aqua,'ship',[router,encodeOrder(order),tokens,config.initialAmountsRaw],maker);
  await send(router,fqn.router,'activateStrategy',[config,order],maker);
  const initial=await call(router,fqn.router,'getStrategyState',[orderHash]);assert.equal(initial.version,1n);assert.deepEqual(initial.X,Array(3).fill(BigInt(oracle.initial.coordinate)));
  const deadline=async()=>BigInt((await local.request('eth_getBlockByNumber',['latest',false])).timestamp)+60n;
  const created=await send(payments,fqn.payments,'createInvoice',[DUE,Number(await deadline())+3540,[first,second],[9000,1000],'0x'+'00'.repeat(32)]);
  const creation=created.receipt.logs.map((log:any)=>{try{return decodeEventLog({abi:abi(fqn.payments),topics:log.topics,data:log.data,strict:true});}catch{return null;}}).filter((e:any)=>e?.eventName==='InvoiceCreated');
  assert.equal(creation.length,1);const invoice=creation[0].args.invoiceId;report.invoiceId=invoice;
  await send(tokens[0],fqn.token,'mint',[payments,99n]);await send(tokens[2],fqn.token,'mint',[payments,77n]);await send(tokens[0],fqn.token,'approve',[payments,GROSS],payer);
  async function snapshot(){
    const block=await local.request('eth_getBlockByNumber',['latest',false]),pin={blockHash:block.hash,requireCanonical:true};
    const state:any={router:await call(router,fqn.router,'getStrategyState',[orderHash],payer,pin),availability:await call(router,fqn.router,'getStrategyAvailability',[orderHash],payer,pin),nonce:await call(router,fqn.router,'nextMakerNonce',[maker],payer,pin),invoice:await call(payments,fqn.payments,'getInvoice',[invoice],payer,pin),merchantNonce:await call(payments,fqn.payments,'nextMerchantNonce',[merchant],payer,pin),assets:[]};
    for(const token of tokens){
      const row:any={allocation:await call(aqua,fqn.aqua,'rawBalances',[maker,router,orderHash,token],payer,pin),supply:await call(token,fqn.token,'totalSupply',[],payer,pin),balances:[],allowances:[]};
      for(const actor of [maker,payer,merchant,first,second,payments,router,aqua])row.balances.push(await call(token,fqn.token,'balanceOf',[actor],payer,pin));
      for(const [owner,spender] of [[maker,aqua],[payer,payments],[payments,router],[router,aqua]])row.allowances.push(await call(token,fqn.token,'allowance',[owner,spender],payer,pin));
      state.assets.push(row);
    }
    return {block:{number:block.number,hash:block.hash},state,digest:sha(json(state))};
  }
  const quote=await call(router,fqn.router,'quote',[order,GROSS,takerData({taker:payments,recipient:payments,input:0,output:2,minimum:DUE,maxCrossings:1,deadline:await deadline()})],payments);assert.equal(quote[1],OUTPUT);eq(quote[2],orderHash);
  await send(tokens[2],fqn.token,'setRejectedRecipient',[second]);const before=await snapshot();
  const payData=encodeFunctionData({abi:abi(fqn.payments),functionName:'payWithSwap',args:[invoice,order,0,GROSS,DUE,Number(await deadline()),1]});
  const failure=await transact(payer,payments,payData,'0x0'),afterFailure=await snapshot();assert.equal(afterFailure.digest,before.digest);
  const trace=await local.request('debug_traceTransaction',[failure.receipt.transactionHash,{tracer:'callTracer'}]);
  eq(trace.output,keccak256(toHex('RecipientRejected()')).slice(0,10));
  const frames:any[]=[];const walk=(frame:any)=>{frames.push(frame);for(const child of frame.calls??[])walk(child);};walk(trace);
  const rejected=frames.find(frame=>frame.to?.toLowerCase()===tokens[2].toLowerCase()&&frame.input?.toLowerCase()===encodeFunctionData({abi:abi(fqn.token),functionName:'transfer',args:[second,15_000_000n]}).toLowerCase()&&frame.error);
  assert.ok(rejected);
  const swapSelector=keccak256(toHex('swap((address,uint256,bytes),uint256,bytes)')).slice(0,10);
  const completedSwap=frames.filter(frame=>frame.to?.toLowerCase()===router.toLowerCase()&&frame.input?.startsWith(swapSelector)&&!frame.error&&frame.type==='CALL');
  assert.equal(completedSwap.length,1);const completed=decodeFunctionResult({abi:abi(fqn.router),functionName:'swap',data:completedSwap[0].output});assert.equal(completed[0],GROSS);assert.equal(completed[1],OUTPUT);eq(completed[2],orderHash);
  const firstSplit=frames.find(frame=>frame.to?.toLowerCase()===tokens[2].toLowerCase()&&frame.input?.toLowerCase()===encodeFunctionData({abi:abi(fqn.token),functionName:'transfer',args:[first,135_000_000n]}).toLowerCase()&&!frame.error);
  assert.ok(firstSplit);assert.equal(decodeFunctionResult({abi:abi(fqn.token),functionName:'transfer',data:firstSplit.output}),true);
  report.cases.push({name:'second recipient after mixed curve',before,after:afterFailure,receipt:failure.receipt,rejectionTrace:trace});
  await send(tokens[2],fqn.token,'setRejectedRecipient',[zeroAddress]);const recovered=await transact(payer,payments,payData),after=await snapshot();
  const state=after.state;assert.equal(state.router.version,2n);assert.equal(state.router.interiorTickMask,6);assert.equal(state.router.interiorRadius,600n*10n**18n*(1n<<64n));
  const scales=[10n**12n*(1n<<64n),1n<<64n,10n**12n*(1n<<64n)],x=BigInt(oracle.initial.coordinate);
  assert.deepEqual(state.router.X,[x+(GROSS-FEE)*scales[0]!,x,x-OUTPUT*scales[2]!]);assert.deepEqual(state.router.cumulativeFeeRaw,[FEE,0n,0n]);
  for(let i=0;i<3;i++){
    const fund=10000n*10n**BigInt([6,18,6][i]!),donation=i===0?99n:i===2?77n:0n,row=state.assets[i];
    assert.deepEqual(row.balances,[fund+(i===0?GROSS:0n)-(i===2?OUTPUT:0n),fund-(i===0?GROSS:0n)+(i===2?REFUND:0n),0n,i===2?135_000_000n:0n,i===2?15_000_000n:0n,donation,0n,0n]);
    assert.deepEqual(row.allowances,[(1n<<256n)-1n,0n,0n,0n]);assert.equal(row.supply,2n*fund+donation);
    assert.deepEqual(row.allocation,[config.initialAmountsRaw[i]!+(i===0?GROSS:0n)-(i===2?OUTPUT:0n),3]);assert.equal(state.availability[i].backingValid,true);
  }
  assert.equal(state.invoice.status,3);eq(state.invoice.merchant,merchant);eq(state.invoice.payer,payer);assert.equal(state.invoice.inputRaw,GROSS);assert.equal(state.invoice.receivedRaw,OUTPUT);assert.equal(state.invoice.refundRaw,REFUND);eq(state.invoice.routeHash,orderHash);assert.equal(state.nonce,1n);assert.equal(state.merchantNonce,1n);
  const events=recovered.receipt.logs.map((log:any)=>{try{return {address:log.address,index:log.logIndex,...decodeEventLog({abi:log.address.toLowerCase()===router.toLowerCase()?abi(fqn.router):abi(fqn.payments),topics:log.topics,data:log.data,strict:true})};}catch{return null;}});
  const swaps=events.filter((e:any)=>e?.eventName==='OrbitalSwapExecuted'&&e.address.toLowerCase()===router.toLowerCase()),paid=events.filter((e:any)=>e?.eventName==='InvoicePaid'&&e.address.toLowerCase()===payments.toLowerCase());
  assert.equal(swaps.length,1);assert.equal(paid.length,1);const s=swaps[0].args,p=paid[0].args;
  eq(s.maker,maker);eq(s.orderHash,orderHash);eq(s.taker,payments);eq(s.recipient,payments);assert.equal(s.tokenInIndex,0);assert.equal(s.tokenOutIndex,2);assert.equal(s.grossInputRaw,GROSS);assert.equal(s.netInputRaw,GROSS-FEE);assert.equal(s.feeRaw,FEE);assert.equal(s.amountOutRaw,OUTPUT);assert.equal(s.version,2n);
  assert.deepEqual(s.crossedTickKeys,[3n*(1n<<32n)/2n]);assert.deepEqual(s.crossedInward,[false]);eq(p.payer,payer);eq(p.invoiceId,invoice);assert.equal(p.receivedRaw,OUTPUT);assert.equal(p.refundRaw,REFUND);assert.ok(BigInt(swaps[0].index)<BigInt(paid[0].index));
  report.recovery={receipt:recovered.receipt,after,swap:swaps[0],invoice:paid[0]};
  eq(await hashes(),sourceHashes);eq(serializeGraph(await readGraph({contracts,roots:Object.values(fqn)})),serializeGraph(graph));await local.assertIdentity();
  report.status='passed';report.completedAt=new Date().toISOString();console.log('Mixed invoice: mined failed receipt status=0/logs=[]; exact second-recipient trace; full rollback and successful outward-swap recovery.');
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);throw error;}
finally{if(local){await local.close();report.chainStopped=true;}await writeFile(resolve(here,'receipts.json'),json(report));}
