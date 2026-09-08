import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,erc20Abi,keccak256,toHex,type Address,type Hex} from 'viem';
import {manifestSchema} from '@orbital/shared';
import {prepareStrategyProfile,configToDTO,configFromDTO,orderToDTO,orderFromDTO,hashOrder,buildMakerApprovalTx,buildShipTx,buildActivateTx,buildInvoiceTx,decodeStrategyAdminReceipt,decodeInvoiceAdminReceipt,lifecycleAbi,paymentsReadAbi,demoTokenAbi,aquaAbi,type TransactionPlan,type TransactionReceipt} from '../src/index';
// Fixed local endpoint and unlocked public test accounts; no private-key input.
// @ts-expect-error The local-only node guard is a JavaScript CLI module.
import {connectPersistentAnvil} from '../../../scripts/lib/persistent-anvil.mjs';
const manifest=manifestSchema.parse(JSON.parse(await readFile('deployments/31337/manifest.json','utf8')));
if(!manifest.verified||manifest.chainId!==31337||manifest.rpcUrl!=='http://127.0.0.1:8545')throw Error('Verified local deployment required');
const local=await connectPersistentAnvil(),client=createPublicClient({transport:http(manifest.rpcUrl,{timeout:20000,retryCount:0})});
const verification=JSON.parse(await readFile('deployments/31337/verification.json','utf8'));
for(const contract of verification.contracts){const code=await client.getCode({address:contract.address});if(!code||keccak256(code)!==contract.runtime.runtimeKeccak256)throw Error('Local deployment runtime changed');}
const accounts=await local.request('eth_accounts') as Address[],id=keccak256(toHex(JSON.stringify(manifest))),path='.cache/local-demo/seed.json';
await mkdir('.cache/local-demo',{recursive:true});let record:any;
try{record=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(record&&record.deploymentId!==id)throw Error('Saved demo belongs to another deployment. Preserve it separately before reseeding.');
record??={schemaVersion:1,deploymentId:id,manifest,roles:{maker:accounts[1],secondMaker:accounts[2],taker:accounts[3],merchant:accounts[4],treasury:accounts[5]},strategies:[],invoices:[],transactions:[]};
const save=()=>writeFile(path,JSON.stringify(record,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
async function send(plan:TransactionPlan){
 await local.assertIdentity();const tx={from:plan.account,to:plan.to,data:plan.data,value:'0x0'},gas=BigInt(await local.request('eth_estimateGas',[tx]));
 if(gas*6n/5n>30000000n)throw Error('Local transaction exceeds gas budget');await local.request('eth_call',[tx,'latest']);
 const hash=await local.request('eth_sendTransaction',[{...tx,gas:toHex(gas*6n/5n+10000n)}]) as Hex;
 record.transactions.push({hash,label:plan.label,account:plan.account});await save();
 await local.receipt(hash);const receipt=await client.getTransactionReceipt({hash}),transaction=await client.getTransaction({hash}),block=await client.getBlock({blockNumber:receipt.blockNumber});
 if(receipt.status!=='success'||transaction.input!==plan.data||transaction.value!==0n||transaction.from.toLowerCase()!==plan.account.toLowerCase()||transaction.to?.toLowerCase()!==plan.to.toLowerCase()||block.hash!==receipt.blockHash)throw Error('Demo receipt mismatch');
 record.transactions.at(-1).receipt={blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed};await save();console.log(`${plan.label}: ${hash}`);
 return {...receipt,hash} as TransactionReceipt;
}
for(const account of accounts.slice(1,5))for(const token of manifest.tokens){
 const balance=await client.readContract({address:token.address as Address,abi:erc20Abi,functionName:'balanceOf',args:[account]});
 if(balance>=200n*10n**BigInt(token.decimals))continue;
 const next=await client.readContract({address:token.address as Address,abi:demoTokenAbi,functionName:'nextMintAt',args:[account]});
 if(next>(await client.getBlock()).timestamp)continue;
 await send({chainId:31337,account,to:token.address as Address,value:0n,label:`Fund local fixture ${token.symbol}`,data:encodeFunctionData({abi:demoTokenAbi,functionName:'faucet'})});
}
for(const [i,preset] of ['Balanced','Wide'].entries()){
 const account=accounts[i+1]!,context={manifest,chainId:31337,account,now:(await client.getBlock()).timestamp};
 let entry=record.strategies[i];
 if(!entry){const nonce=await client.readContract({address:manifest.router as Address,abi:lifecycleAbi,functionName:'nextMakerNonce',args:[account]});
  const p=prepareStrategyProfile(manifest,account,nonce,{allocation:'100',preset:preset as 'Balanced'|'Wide',feePpm:500});
  entry={preset,config:configToDTO(p.config),order:orderToDTO(p.order),hash:p.orderHash};record.strategies[i]=entry;await save();}
 const input={config:configFromDTO(entry.config),order:orderFromDTO(entry.order)};
 const nonce=await client.readContract({address:manifest.router as Address,abi:lifecycleAbi,functionName:'nextMakerNonce',args:[account]});
 if(nonce>input.config.makerNonce){const state=await client.readContract({address:manifest.router as Address,abi:lifecycleAbi,functionName:'getStrategyState',args:[hashOrder(input.order)]});if(state.status!==1)throw Error('Seeded strategy is no longer active; preserve demo history.');continue;}
 for(const [j,token] of input.config.tokens.entries()){
  const allowance=await client.readContract({address:token,abi:erc20Abi,functionName:'allowance',args:[account,manifest.aqua as Address]});
  if(allowance>=input.config.initialAmountsRaw[j]!*4n)continue;
  for(const reset of allowance>0n?[true,false]:[false]){const plan=buildMakerApprovalTx(context,{...input,token,reset});decodeStrategyAdminReceipt(await send(plan),{kind:'approval',context,input,token,reset,plan});}
 }
 const raw=await Promise.all(input.config.tokens.map(token=>client.readContract({address:manifest.aqua as Address,abi:aquaAbi,functionName:'rawBalances',args:[account,manifest.router as Address,hashOrder(input.order),token]})));
 if(raw.every(([amount,count])=>amount===0n&&count===0)){const plan=buildShipTx(context,input);decodeStrategyAdminReceipt(await send(plan),{kind:'ship',context,input,plan});}
 else if(!raw.every(([amount,count],j)=>count===input.config.tokens.length&&amount===input.config.initialAmountsRaw[j]))throw Error('Seed allocation changed');
 const plan=buildActivateTx(context,input);decodeStrategyAdminReceipt(await send(plan),{kind:'activate',context,input,plan});entry.activated=true;await save();
}
if(record.invoices.length===0){
 const account=accounts[4]!,now=(await client.getBlock()).timestamp,context={manifest,chainId:31337,account,now};
 const nonce=await client.readContract({address:manifest.payments as Address,abi:paymentsReadAbi,functionName:'nextMerchantNonce',args:[account]});
 const terms={merchantNonce:nonce,amountDueRaw:5_000_000n,expiresAt:now+7n*86400n,recipients:[account,accounts[5]!],bps:[9000,1000],memoHash:keccak256(toHex('Orbital local demo: 5 USDC split invoice'))};
 const {invoiceId}=buildInvoiceTx(context,terms);record.invoices.push({id:invoiceId,terms});await save();
}
for(const entry of record.invoices){
 const invoice=await client.readContract({address:manifest.payments as Address,abi:paymentsReadAbi,functionName:'getInvoice',args:[entry.id]});
 if(invoice.status!==0)continue;
 const account=accounts[4]!,now=(await client.getBlock()).timestamp,terms={...entry.terms,merchantNonce:BigInt(entry.terms.merchantNonce),amountDueRaw:BigInt(entry.terms.amountDueRaw),expiresAt:BigInt(entry.terms.expiresAt)};
 const nonce=await client.readContract({address:manifest.payments as Address,abi:paymentsReadAbi,functionName:'nextMerchantNonce',args:[account]});
 if(nonce!==terms.merchantNonce)throw Error('Unmined seed invoice nonce changed; preserve its recovery record.');
 const {plan,invoiceId}=buildInvoiceTx({manifest,chainId:31337,account,now},terms);
 if(invoiceId!==entry.id)throw Error('Saved seed invoice changed');
 decodeInvoiceAdminReceipt(await send(plan),{kind:'create',plan});
}
await save();console.log(JSON.stringify({status:'seeded-local-only',strategies:record.strategies.map((s:any)=>s.hash),invoice:record.invoices[0].id,app:'http://127.0.0.1:3000',source:path},null,2));
