import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';

// Offline evidence audit only: no RPC, identity service, wallet or signing request.
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(resolve(root,'apps/web/package.json'));
const {decodeEventLog,parseAbiItem,toEventSelector,serializeTransaction,keccak256,recoverTransactionAddress}=require('viem');
const inputs=[];
async function source(path){
 const bytes=await readFile(resolve(root,path));
 inputs.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
 return bytes.toString('utf8');
}
async function json(path){return JSON.parse(await source(path));}
const swap=await json('test/evidence/arc-integration/first-swap.json');
const payment=await json('test/evidence/arc-integration/first-payment.json');
const manifest=await json('deployments/5042002/manifest.json');
const identity=await json('deployments/5042002/verification.json');
const publicLogin=await json('test/evidence/privy-login.json');
const arcLogin=await json('test/evidence/arc-integration/privy-login.json');
const deployedUI=await json('test/evidence/arc-integration/deployed-ui.json');
const smoke=await source('test/evidence/frontend-polish/README.md');
const routerSource=await source('packages/contracts/src/OrbitalSwapVMRouter.sol');
const paymentsSource=await source('packages/contracts/src/OrbitalPayments.sol');
await source(relative(root,fileURLToPath(import.meta.url)).replaceAll('\\','/'));

function norm(value){
 if(typeof value==='bigint')return value.toString();
 if(typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value))return value.toLowerCase();
 if(Array.isArray(value))return value.map(norm);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,norm(v)]));
 return value;
}
const checks=[];
function equal(id,actual,expected){assert.deepEqual(norm(actual),norm(expected),id);checks.push({id,status:'passed'});}
function ok(id,value){assert.ok(value,id);checks.push({id,status:'passed'});}
function eventAbi(text,name){
 const declaration=text.match(new RegExp(`event ${name}\\([\\s\\S]*?\\);`))?.[0];
 assert.ok(declaration,`Missing source event ${name}`);
 return parseAbiItem(declaration.slice(0,-1).replace(/\s+/g,' '));
}
const swapAbi=eventAbi(routerSource,'OrbitalSwapExecuted');
const paymentAbi=eventAbi(paymentsSource,'InvoicePaid');
const transferAbi=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
function events(record,abi,address){return record.receipt.logs.filter(log=>norm(log.address)===norm(address)&&norm(log.topics[0])===norm(toEventSelector(abi))).map(log=>({log,args:decodeEventLog({abi:[abi],topics:log.topics,data:log.data,strict:true}).args}));}
function exactEvent(id,record,abi,address,retained){
 const matches=events(record,abi,address);
 equal(`${id}: one raw event from expected contract`,matches.length,1);
 equal(`${id}: raw decoded arguments match retained event`,matches[0].args,retained.args);
 equal(`${id}: retained event log identity`,[retained.address,retained.transactionHash,retained.blockHash,retained.blockNumber,retained.logIndex],[matches[0].log.address,matches[0].log.transactionHash,matches[0].log.blockHash,matches[0].log.blockNumber,matches[0].log.logIndex]);
 return matches[0].args;
}
function transfer(id,record,token,from,to,value){
 const matches=events(record,transferAbi,token).filter(event=>norm(event.args.from)===norm(from)&&norm(event.args.to)===norm(to)&&event.args.value===value);
 equal(id,matches.length,1);
}
async function receiptIdentity(name,record,target){
 const tx=record.transaction,receipt=record.receipt,block=record.canonicalBlock;
 equal(`${name}: Arc chain identity`,[record.chainId,tx.chainId],[5042002,manifest.chainId]);
 equal(`${name}: successful receipt`,receipt.status,'success');
 equal(`${name}: receipt and transaction identity`,[receipt.transactionHash,receipt.from,receipt.to,receipt.transactionIndex],[tx.hash,tx.from,target,tx.transactionIndex]);
 equal(`${name}: expected transaction target`,tx.to,target);
 equal(`${name}: retained canonical block agreement`,[receipt.blockHash,receipt.blockNumber,tx.blockHash,tx.blockNumber,tx.blockTimestamp],[block.hash,block.number,block.hash,block.number,block.timestamp]);
 ok(`${name}: all receipt logs agree with transaction and retained block`,receipt.logs.every(log=>log.removed===false&&norm(log.transactionHash)===norm(tx.hash)&&norm(log.blockHash)===norm(block.hash)&&BigInt(log.blockNumber)===BigInt(block.number)&&log.transactionIndex===tx.transactionIndex));
 const serialized=serializeTransaction({type:'eip1559',chainId:tx.chainId,nonce:tx.nonce,to:tx.to,data:tx.input,value:BigInt(tx.value),gas:BigInt(tx.gas),maxFeePerGas:BigInt(tx.maxFeePerGas),maxPriorityFeePerGas:BigInt(tx.maxPriorityFeePerGas),accessList:tx.accessList},{r:tx.r,s:tx.s,yParity:tx.yParity});
 equal(`${name}: independently reconstructed signed transaction hash`,keccak256(serialized),tx.hash);
 equal(`${name}: recovered signer matches recorded sender`,await recoverTransactionAddress({serializedTransaction:serialized}),tx.from);
 return {transactionHash:tx.hash,sender:tx.from,target:tx.to,blockNumber:block.number,blockHash:block.hash,recordedAt:record.observedAt,receiptStatus:receipt.status};
}

equal('manifest agrees with retained deployment identity',manifest,identity.manifest);
equal('deployment report is verified on Arc',[manifest.verified,identity.verified,manifest.chainId],[true,true,5042002]);
ok('deployment receipts retain matching successful transaction identities',identity.receipts.length===12&&identity.receipts.every(item=>item.receipt.status==='0x1'&&norm(item.hash)===norm(item.receipt.transactionHash)));
for(const key of ['aqua','router','payments'])ok(`${key}: manifest address appears in deployment receipt`,identity.receipts.some(item=>norm(item.receipt.contractAddress)===norm(manifest[key])));

const swapIdentity=await receiptIdentity('swap',swap,manifest.router);
const paymentIdentity=await receiptIdentity('payment',payment,manifest.payments);
const swapEvent=exactEvent('standalone swap',swap,swapAbi,manifest.router,swap.event);
equal('payment retains exactly one invoice and one swap event',[payment.payment.length,payment.swap.length],[1,1]);
const paid=exactEvent('invoice payment',payment,paymentAbi,manifest.payments,payment.payment[0]);
const paymentSwap=exactEvent('invoice curve execution',payment,swapAbi,manifest.router,payment.swap[0]);
const trader=swap.transaction.from,maker=swapEvent.maker,usdc=manifest.usdc,demo=manifest.tokens.find(token=>token.symbol==='oUSD6').address;
equal('same signed wallet traded and paid',[swapEvent.taker,swapEvent.recipient,payment.transaction.from,paid.payer],[trader,trader,trader,trader]);
equal('merchant and shared strategy agree',[paid.merchant,paymentSwap.maker,paid.routeHash,paymentSwap.orderHash],[maker,maker,swapEvent.orderHash,swapEvent.orderHash]);
ok('trader differs from liquidity maker',norm(trader)!==norm(maker));
equal('invoice adapter is curve taker and recipient',[paymentSwap.taker,paymentSwap.recipient],[manifest.payments,manifest.payments]);
equal('standalone swap amounts and fee',[swapEvent.grossInputRaw,swapEvent.netInputRaw,swapEvent.feeRaw,swapEvent.amountOutRaw],['1000000','999500','500','998491']);
equal('invoice input output refund linkage',[paid.tokenIn,paid.amountInRaw,paid.receivedRaw,paid.refundRaw,paymentSwap.grossInputRaw,paymentSwap.amountOutRaw],[demo,'500000','500507','507','500000','500507']);
equal('payment invoice identifier matches first calldata argument',`0x${payment.transaction.input.slice(10,74)}`,paid.invoiceId);
transfer('swap: USDC signer to router',swap,usdc,trader,manifest.router,1000000n);
transfer('swap: USDC router to maker',swap,usdc,manifest.router,maker,1000000n);
transfer('swap: oUSD6 maker to signer',swap,demo,maker,trader,998491n);
transfer('payment: oUSD6 signer to adapter',payment,demo,trader,manifest.payments,500000n);
transfer('payment: oUSD6 adapter to router',payment,demo,manifest.payments,manifest.router,500000n);
transfer('payment: oUSD6 router to maker',payment,demo,manifest.router,maker,500000n);
transfer('payment: USDC maker to adapter',payment,usdc,maker,manifest.payments,500507n);
transfer('payment: exact USDC merchant settlement',payment,usdc,manifest.payments,maker,500000n);
transfer('payment: USDC excess refunded to signer',payment,usdc,manifest.payments,trader,507n);

equal('public Privy login UI was observed',[publicLogin.loginVisible,arcLogin.loginVisible],[true,true]);
ok('login record explicitly excludes authentication and wallet creation',/No email entry, authentication, wallet creation/.test(arcLogin.scope));
ok('deployed UI record explicitly unauthenticated',/unauthenticated Chromium context/.test(deployedUI.scope));
equal('deployment report does not claim Privy association',identity.privyVerified,false);
ok('payment record explicitly leaves wallet kind unverified',payment.walletKind.startsWith('unverified:'));
const result={
 schemaVersion:1,checkedAt:new Date().toISOString(),scope:'Offline consistency and signed-transaction audit of retained public evidence; no new network or wallet observation',
 retainedReceiptMatching:{status:'passed',checkCount:checks.length,trader,payer:paid.payer,maker,invoiceId:paid.invoiceId,strategyHash:swapEvent.orderHash,swap:swapIdentity,payment:paymentIdentity},
 privyWalletAssociation:{status:'unverified',authenticatedProviderEvidenceAvailable:false,walletCreationVerified:false,reconnectionVerified:false,publicLoginUIObserved:true,publicAppId:publicLogin.appId,reason:'Retained records show the login modal without authentication and identify no selected Privy embedded wallet. Transaction signatures prove the sending address, not which wallet software controlled it.'},
 existingApplicationSmoke:{record:'test/evidence/frontend-polish/README.md',nineSelectedChecksRecordedPassing:/all nine selected checks have passed/.test(smoke),scope:'Previously recorded synthetic HTTP/RPC and injected external-wallet fixtures; no live Privy provider evidence',cases:['apps/web/test/wallet.spec.ts','apps/web/test/payment.spec.ts','apps/web/test/swap-execution.spec.ts']},
 limitations:['Canonical block hashes are compared with the retained RPC observations only; this run did not recheck the live chain or independently reconstruct block/receipt trie inclusion proofs.','Runtime code and immutable bindings were not re-read; deployment address checks use the retained verified identity report.','The input scope is exactly the hashed files listed below. Absence of authenticated evidence in these files does not prove the user used an external wallet.','No identity token, email, private key or signing session was requested or inspected. No synthetic receipt is relabeled as live.'],
 inputs,checks,
};
const destination=resolve(root,'test/evidence/privy-association-basic');
await mkdir(destination,{recursive:true});
await writeFile(resolve(destination,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({retainedReceiptMatching:result.retainedReceiptMatching.status,checks:checks.length,privyWalletAssociation:result.privyWalletAssociation.status,result:'test/evidence/privy-association-basic/result.json'}));
