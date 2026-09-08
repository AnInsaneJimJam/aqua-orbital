import {encodeAbiParameters,encodeFunctionData,isAddress,keccak256,type Address,type Hex} from 'viem';
import {manifestSchema,swapQuoteSchema,type DeploymentManifest,type SwapQuote} from '@orbital/shared';
import {approvalPlan,buildOrder,encodeOrder,feeIn,hashConfig,hashOrder,routerAbi,takerData,validateConfig,type Config,type Order,type TransactionPlan} from './codec';
import {aquaAbi,lifecycleAbi,paymentsAbi,demoTokenAbi} from './generated/abi';
export {aquaAbi,lifecycleAbi,paymentsAbi,demoTokenAbi} from './generated/abi';

const MAX=(1n<<256n)-1n;
const USDC_LIMIT=(1n<<160n)/(10n**12n*(1n<<64n));
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
function address(a:Address){if(!isAddress(a)||BigInt(a)===0n)throw Error('Invalid address');}
function amount(v:bigint,max=MAX,positive=true){if(typeof v!=='bigint'||v<0n||v>max||(positive&&v===0n))throw Error('Invalid amount');return v;}
function hash(value:Hex){if(!/^0x[0-9a-fA-F]{64}$/.test(value))throw Error('Invalid hash');}

/** The manifest must come from verified deployment artifacts, not a quote response.
 * This pure SDK validates consistency; it cannot authenticate RPC/source identity.
 * `now` is the current chain timestamp. Re-read state/requote immediately before review.
 */
export type PlanContext={manifest:DeploymentManifest;chainId:number;account:Address;now:bigint};
function context(ctx:PlanContext):DeploymentManifest {
 const m=manifestSchema.parse(ctx.manifest);
 if(!m.verified)throw Error('Deployment is not verified');
 if(ctx.chainId!==m.chainId||![31337,5042002].includes(ctx.chainId))throw Error('Wrong or unsupported network');
 address(ctx.account);amount(ctx.now,(1n<<40n)-1n,false);
 return m;
}
function plan(ctx:PlanContext,to:Address,data:Hex,label:string):TransactionPlan {
 return {chainId:ctx.chainId,account:ctx.account,to,data,value:0n,label};
}
/** Read nextMintAt(account) from this token at the current confirmed chain block.
 * The deployment verifier must authenticate the demo contract and its immutable
 * metadata. Local/testnet faucet claims are ordinary user-signed transactions;
 * this observation only assists review and the contract enforces the cooldown.
 */
export type DemoFaucetInput={token:Address;nextMintAt:bigint};
export function buildDemoFaucetTx(ctx:PlanContext,input:DemoFaucetInput):TransactionPlan {
 const m=context(ctx),token=m.tokens.find(t=>same(t.address,input.token));
 if(!token||same(token.address,m.usdc)||!token.mock||!((token.decimals===6&&token.symbol==='oUSD6')||(token.decimals===18&&token.symbol==='oUSD18')))throw Error('Not an allowed demo token');
 amount(input.nextMintAt,MAX,false);
 if(input.nextMintAt>ctx.now)throw Error('Demo token faucet cooldown has not expired');
 return plan(ctx,token.address as Address,encodeFunctionData({abi:demoTokenAbi,functionName:'faucet'}),`Claim 1,000 ${token.symbol} demo tokens`);
}
function strategy(ctx:PlanContext,c:Config,o:Order,maker=false){
 const m=context(ctx);validateConfig(c);
 if(c.chainId!==BigInt(m.chainId)||!same(c.router,m.router))throw Error('Configuration deployment mismatch');
 if(maker&&!same(c.maker,ctx.account))throw Error('Only the maker can manage this strategy');
 for(let i=0;i<c.tokens.length;i++){
  const token=m.tokens.find(t=>same(t.address,c.tokens[i]!));
  if(!token||token.decimals!==c.decimals[i])throw Error('Configuration token is not in the deployment allowlist');
 }
 if(!same(encodeOrder(o),encodeOrder(buildOrder(c))))throw Error('Noncanonical order or configuration');
 return m;
}
function pair(c:Config,input:Address,output:Address){
 const i=c.tokens.findIndex(t=>same(t,input)),j=c.tokens.findIndex(t=>same(t,output));
 if(i<0||j<0||i===j)throw Error('Invalid token pair');
 return [i,j] as const;
}
function limits(ctx:PlanContext,c:Config,input:number,gross:bigint,minimum:bigint,deadline:bigint,maxCrossings:number){
 amount(gross);amount(minimum);amount(deadline,(1n<<40n)-1n);
 if(deadline<=ctx.now)throw Error('Expired transaction deadline');
 if(gross*10n**BigInt(18-c.decimals[input]!)*(1n<<64n)>=(1n<<160n))throw Error('Normalized input exceeds supported range');
 if(feeIn(gross,c.feePpm)>=gross)throw Error('Input must exceed the rounded fee');
 if(!Number.isInteger(maxCrossings)||maxCrossings<0||maxCrossings>16)throw Error('Invalid crossing bound');
}
function quote(ctx:PlanContext,c:Config,o:Order,q:SwapQuote,caller:Address,recipient:Address,input:Address,output:Address,gross:bigint,minimum:bigint,maxCrossings:number){
 const v=swapQuoteSchema.parse(q);
 if(v.maxCrossings!==maxCrossings)throw Error('Quote crossing bound differs from review');
 if(v.chainId!==ctx.chainId||!same(v.router,c.router)||!same(v.orderHash,hashOrder(o))||!same(v.configHash,hashConfig(c))||!same(v.caller,caller)||!same(v.recipient,recipient)||!same(v.tokenIn,input)||!same(v.tokenOut,output)||BigInt(v.amountInRaw)!==gross||BigInt(v.feeRaw)!==feeIn(gross,c.feePpm))throw Error('Quote does not match the reviewed operation');
 if(BigInt(v.expiresAt)<=ctx.now||BigInt(v.expiresAt)>ctx.now+20n)throw Error('Quote is stale or has an invalid lifetime');
 if(BigInt(v.amountOutRaw)<minimum)throw Error('Quote does not meet the reviewed minimum');
}

export type SwapInput={config:Config;order:Order;tokenIn:Address;tokenOut:Address;recipient:Address;amountInRaw:bigint;minimumOutRaw:bigint;deadline:bigint;maxCrossings:number;quote:SwapQuote};
export function buildSwapTx(ctx:PlanContext,input:SwapInput):TransactionPlan {
 const {config:c,order:o}=input,m=strategy(ctx,c,o),[i,j]=pair(c,input.tokenIn,input.tokenOut);
 address(input.recipient);
 if(same(c.maker,ctx.account)||[c.maker,m.aqua,m.router].some(a=>same(a,input.recipient)))throw Error('Invalid settlement recipient or self trade');
 limits(ctx,c,i,input.amountInRaw,input.minimumOutRaw,input.deadline,input.maxCrossings);
 quote(ctx,c,o,input.quote,ctx.account,input.recipient,input.tokenIn,input.tokenOut,input.amountInRaw,input.minimumOutRaw,input.maxCrossings);
 const data=takerData({taker:ctx.account,recipient:input.recipient,minimum:input.minimumOutRaw,deadline:input.deadline,input:i,output:j,maxCrossings:input.maxCrossings});
 return plan(ctx,m.router as Address,encodeFunctionData({abi:routerAbi,functionName:'swap',args:[o,input.amountInRaw,data]}),'Swap reviewed amount');
}
export function buildSwapApprovalTx(ctx:PlanContext,input:SwapInput):TransactionPlan {
 buildSwapTx(ctx,input);
 return approvalPlan(ctx.manifest,ctx.account,input.tokenIn,ctx.manifest.router as Address,input.amountInRaw);
}

export type StrategyInput={config:Config;order:Order};
/** This constructs a reviewable call, not a claim that the strategy is eligible.
 * Refresh owner/nonce/Aqua/state observations and simulate before requesting a
 * signature. The contract independently certifies initial funding and geometry.
 */
export function buildActivateTx(ctx:PlanContext,input:StrategyInput):TransactionPlan {
 const m=strategy(ctx,input.config,input.order,true);
 if(input.config.makerNonce===(1n<<64n)-1n)throw Error('Maker nonce is exhausted');
 return plan(ctx,m.router as Address,encodeFunctionData({abi:lifecycleAbi,functionName:'activateStrategy',args:[input.config,input.order]}),'Activate reviewed strategy');
}
export function buildRetireTx(ctx:PlanContext,input:StrategyInput):TransactionPlan {
 const m=strategy(ctx,input.config,input.order,true);
 return plan(ctx,m.router as Address,encodeFunctionData({abi:lifecycleAbi,functionName:'retireStrategy',args:[hashOrder(input.order)]}),'Retire strategy');
}
export function buildShipTx(ctx:PlanContext,input:StrategyInput):TransactionPlan {
 const m=strategy(ctx,input.config,input.order,true);
 return plan(ctx,m.aqua as Address,encodeFunctionData({abi:aquaAbi,functionName:'ship',args:[m.router as Address,encodeOrder(input.order),input.config.tokens,input.config.initialAmountsRaw]}),'Ship strategy to Aqua');
}
export function buildDockTx(ctx:PlanContext,input:StrategyInput):TransactionPlan {
 const m=strategy(ctx,input.config,input.order,true);
 return plan(ctx,m.aqua as Address,encodeFunctionData({abi:aquaAbi,functionName:'dock',args:[m.router as Address,hashOrder(input.order),input.config.tokens]}),'Dock strategy in Aqua');
}
/** Observations must come from one confirmed block on the verified deployment.
 * Persist submitted hashes and re-read after each receipt before choosing the
 * next step. These pure builders never submit or replay transactions themselves.
 */
export type MakerInput=StrategyInput&{allowances:bigint[];resetRequired:boolean[];shipped:boolean;docked:boolean;status:'unknown'|'active'|'retired'};
export type MakerApprovalInput=StrategyInput&{token:Address;reset:boolean};
export function buildMakerApprovalTx(ctx:PlanContext,input:MakerApprovalInput):TransactionPlan {
 const m=strategy(ctx,input.config,input.order,true);
 const index=input.config.tokens.findIndex(t=>same(t,input.token));
 if(index<0||typeof input.reset!=='boolean')throw Error('Invalid maker approval token or reset');
 return approvalPlan(m,ctx.account,input.token,m.aqua as Address,input.reset?0n:amount(input.config.initialAmountsRaw[index]!*4n));
}
export function buildMakerPlan(ctx:PlanContext,input:MakerInput):{steps:TransactionPlan[]} {
 strategy(ctx,input.config,input.order,true);const c=input.config;
 if(input.allowances.length!==c.tokens.length||input.resetRequired.length!==c.tokens.length||typeof input.shipped!=='boolean'||typeof input.docked!=='boolean'||!['unknown','active','retired'].includes(input.status))throw Error('Invalid publication observations');
 input.allowances.forEach(v=>amount(v,MAX,false));
 if(input.resetRequired.some(v=>typeof v!=='boolean'))throw Error('Invalid allowance reset observation');
 if((input.status!=='unknown'||input.docked)&&!input.shipped)throw Error('Inconsistent publication observations');
 if(input.docked||input.status==='retired')throw Error('A docked or retired strategy requires a fresh maker nonce');
 if(input.status==='active')return {steps:[]};
 const steps:TransactionPlan[]=[];
 c.tokens.forEach((token,i)=>{
  const cap=amount(c.initialAmountsRaw[i]!*4n);
  if(input.allowances[i]!>=cap)return;
  if(input.resetRequired[i]&&input.allowances[i]!>0n)steps.push(buildMakerApprovalTx(ctx,{...input,token,reset:true}));
  steps.push(buildMakerApprovalTx(ctx,{...input,token,reset:false}));
 });
 if(!input.shipped)steps.push(buildShipTx(ctx,input));
 steps.push(buildActivateTx(ctx,input));return {steps};
}
export function buildRetireAndDockPlan(ctx:PlanContext,input:StrategyInput&{retired:boolean;docked:boolean}):TransactionPlan[] {
 strategy(ctx,input.config,input.order,true);
 if(typeof input.retired!=='boolean'||typeof input.docked!=='boolean')throw Error('Invalid retirement observations');
 const steps:TransactionPlan[]=[];
 if(!input.retired)steps.push(buildRetireTx(ctx,input));
 if(!input.docked)steps.push(buildDockTx(ctx,input));
 return steps;
}

export function invoiceId(chainId:bigint,adapter:Address,merchant:Address,nonce:bigint):Hex {
 amount(chainId);address(adapter);address(merchant);amount(nonce,(1n<<64n)-1n,false);
 return keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'uint64'}],[chainId,adapter,merchant,nonce]));
}
export type InvoiceCreateInput={amountDueRaw:bigint;expiresAt:bigint;recipients:Address[];bps:number[];memoHash:Hex;merchantNonce:bigint};
function terms(adapter:Address,input:Omit<InvoiceCreateInput,'merchantNonce'>){
 amount(input.amountDueRaw,USDC_LIMIT-1n);amount(input.expiresAt,(1n<<40n)-1n);hash(input.memoHash);
 if(input.recipients.length<1||input.recipients.length>3||input.recipients.length!==input.bps.length)throw Error('Invalid invoice recipients');
 const seen=new Set<string>();
 for(const recipient of input.recipients){address(recipient);if(same(recipient,adapter)||seen.has(recipient.toLowerCase()))throw Error('Invalid or duplicate invoice recipient');seen.add(recipient.toLowerCase());}
 if(input.bps.some(v=>!Number.isInteger(v)||v<=0||v>10000)||input.bps.reduce((a,b)=>a+b,0)!==10000)throw Error('Invoice shares must total 10000');
}
export function buildInvoiceTx(ctx:PlanContext,input:InvoiceCreateInput):{plan:TransactionPlan;invoiceId:Hex} {
 const m=context(ctx);terms(m.payments as Address,input);
 amount(input.merchantNonce,(1n<<64n)-2n,false);
 if(input.expiresAt<ctx.now+300n||input.expiresAt>ctx.now+2_592_000n)throw Error('Invoice expiry must be 5 minutes to 30 days away');
 // This is a prediction; concurrent merchant transactions can advance the nonce.
 // Use InvoiceCreated in the successful receipt as the authoritative ID.
 const id=invoiceId(BigInt(m.chainId),m.payments as Address,ctx.account,input.merchantNonce);
 return {invoiceId:id,plan:plan(ctx,m.payments as Address,encodeFunctionData({abi:paymentsAbi,functionName:'createInvoice',args:[input.amountDueRaw,Number(input.expiresAt),input.recipients,input.bps,input.memoHash]}),'Create reviewed invoice')};
}
/** Terms read from getInvoice on the verified adapter, pinned to one block. */
export type InvoiceSnapshot=Omit<InvoiceCreateInput,'merchantNonce'>&{chainId:number;adapter:Address;id:Hex;merchant:Address;status:'unpaid'|'paid'|'cancelled'|'inProgress'};
function invoice(ctx:PlanContext,input:InvoiceSnapshot,payable=true){
 const m=context(ctx);address(input.merchant);hash(input.id);terms(m.payments as Address,input);
 if(input.chainId!==ctx.chainId||!same(input.adapter,m.payments))throw Error('Invoice deployment mismatch');
 if(input.status!=='unpaid'||(payable&&input.expiresAt<=ctx.now))throw Error('Invoice is not payable');
 return m;
}
export type PaymentInput={kind:'direct';invoice:InvoiceSnapshot}|{kind:'swap';invoice:InvoiceSnapshot;config:Config;order:Order;tokenIn:Address;amountInRaw:bigint;minimumOutRaw:bigint;deadline:bigint;maxCrossings:number;quote:SwapQuote};
export function buildPaymentTx(ctx:PlanContext,input:PaymentInput):TransactionPlan {
 const m=invoice(ctx,input.invoice);
 if(input.kind==='direct')return plan(ctx,m.payments as Address,encodeFunctionData({abi:paymentsAbi,functionName:'payWithUSDC',args:[input.invoice.id]}),'Pay invoice with USDC');
 if(input.kind!=='swap')throw Error('Unknown payment operation');
 const c=input.config,o=input.order;strategy(ctx,c,o);
 const [i]=pair(c,input.tokenIn,m.usdc as Address);
 if(same(c.maker,ctx.account)||same(c.maker,m.payments))throw Error('Invalid payer or strategy maker');
 const minimum=input.minimumOutRaw>input.invoice.amountDueRaw?input.minimumOutRaw:input.invoice.amountDueRaw;
 amount(input.minimumOutRaw,MAX,false);limits(ctx,c,i,input.amountInRaw,minimum,input.deadline,input.maxCrossings);
 quote(ctx,c,o,input.quote,m.payments as Address,m.payments as Address,input.tokenIn,m.usdc as Address,input.amountInRaw,minimum,input.maxCrossings);
 return plan(ctx,m.payments as Address,encodeFunctionData({abi:paymentsAbi,functionName:'payWithSwap',args:[input.invoice.id,o,i,input.amountInRaw,input.minimumOutRaw,Number(input.deadline),input.maxCrossings]}),'Swap and pay reviewed invoice');
}
export function buildPaymentApprovalTx(ctx:PlanContext,input:PaymentInput):TransactionPlan {
 buildPaymentTx(ctx,input);
 return approvalPlan(ctx.manifest,ctx.account,input.kind==='direct'?ctx.manifest.usdc as Address:input.tokenIn,ctx.manifest.payments as Address,input.kind==='direct'?input.invoice.amountDueRaw:input.amountInRaw);
}
export function buildCancelInvoiceTx(ctx:PlanContext,input:InvoiceSnapshot):TransactionPlan {
 const m=invoice(ctx,input,false);
 if(!same(input.merchant,ctx.account))throw Error('Only the merchant can cancel this invoice');
 return plan(ctx,m.payments as Address,encodeFunctionData({abi:paymentsAbi,functionName:'cancelInvoice',args:[input.id]}),'Cancel unpaid invoice');
}
export type PlanIntent={kind:'demoFaucet';input:DemoFaucetInput}|{kind:'swap';input:SwapInput}|{kind:'swapApproval';input:SwapInput}|{kind:'makerApproval';input:MakerApprovalInput}|{kind:'ship'|'dock'|'activate'|'retire';input:StrategyInput}|{kind:'createInvoice';input:InvoiceCreateInput}|{kind:'payment'|'paymentApproval';input:PaymentInput}|{kind:'cancelInvoice';input:InvoiceSnapshot};
/** Reconstruct from the user's retained reviewed intent, never from server calldata.
 * Exact byte equality rejects alternate selectors, extra bytes and noncanonical ABI.
 */
export function validateTransactionPlan(candidate:unknown,ctx:PlanContext,intent:PlanIntent):TransactionPlan {
 let expected:TransactionPlan;
 switch(intent.kind){
  case 'demoFaucet':expected=buildDemoFaucetTx(ctx,intent.input);break;
  case 'swap':expected=buildSwapTx(ctx,intent.input);break;
  case 'swapApproval':expected=buildSwapApprovalTx(ctx,intent.input);break;
  case 'makerApproval':expected=buildMakerApprovalTx(ctx,intent.input);break;
  case 'ship':expected=buildShipTx(ctx,intent.input);break;
  case 'dock':expected=buildDockTx(ctx,intent.input);break;
  case 'activate':expected=buildActivateTx(ctx,intent.input);break;
  case 'retire':expected=buildRetireTx(ctx,intent.input);break;
  case 'createInvoice':expected=buildInvoiceTx(ctx,intent.input).plan;break;
  case 'payment':expected=buildPaymentTx(ctx,intent.input);break;
  case 'paymentApproval':expected=buildPaymentApprovalTx(ctx,intent.input);break;
  case 'cancelInvoice':expected=buildCancelInvoiceTx(ctx,intent.input);break;
  default:throw Error('Unknown transaction intent');
 }
 if(!candidate||typeof candidate!=='object')throw Error('Invalid transaction plan');
 const p=candidate as TransactionPlan;
 if(p.chainId!==expected.chainId||p.value!==0n||typeof p.account!=='string'||!same(p.account,expected.account)||typeof p.to!=='string'||!same(p.to,expected.to)||typeof p.data!=='string'||!same(p.data,expected.data)||p.label!==expected.label||Object.keys(p).some(k=>!['chainId','account','to','data','value','label'].includes(k)))throw Error('Transaction differs from the locally reviewed plan');
 return p;
}
