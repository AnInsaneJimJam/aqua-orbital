import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData, encodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, toFunctionSelector, type Hex} from 'viem';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as sdk from '../src/index';
import {manifestSchema, uintSchema} from '@orbital/shared';

const a=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const blockHash=`0x${'12'.repeat(32)}` as Hex;
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:a(10),router:a(11),payments:a(12),usdc:a(1),startBlock:'0',tokens:[{address:a(1),symbol:'USDC',decimals:6,mock:true},{address:a(2),symbol:'oUSD18',decimals:18,mock:true}]};
const config:sdk.Config={schemaVersion:1,chainId:31337n,router:a(11),maker:a(20),makerNonce:0n,tokens:[a(1),a(2)],decimals:[6,18],tickKeys:[(1n<<64n)-1n],radiiInternal:[10n**18n*(1n<<64n)],feePpm:500,initialAmountsRaw:[1_000_000n,10n**18n]};
const order=sdk.buildOrder(config);
const context={manifest,chainId:31337,account:a(21),now:1_000n};
const quote={chainId:31337,router:a(11),orderHash:sdk.hashOrder(order),configHash:sdk.hashConfig(config),caller:a(21),recipient:a(21),tokenIn:a(2),tokenOut:a(1),amountInRaw:'10000',amountOutRaw:'8000',feeRaw:'5',stateVersion:'1',blockNumber:'100',blockHash,expiresAt:'1020',maxCrossings:16};
const swap={config,order,tokenIn:a(2),tokenOut:a(1),recipient:a(21),amountInRaw:10_000n,minimumOutRaw:7_900n,deadline:1_100n,maxCrossings:16,quote};
const invoice={chainId:31337,adapter:a(12),id:`0x${'34'.repeat(32)}` as Hex,merchant:a(22),amountDueRaw:5_000n,expiresAt:2_000n,recipients:[a(22),a(23)],bps:[9_000,1_000],memoHash:`0x${'00'.repeat(32)}` as Hex,status:'unpaid' as const};

test('swap plan rebuilds canonical amount, flags, pair, recipient and order locally',()=>{
 const tx=sdk.buildSwapTx(context,swap);
 assert.equal(tx.to,manifest.router); assert.equal(tx.account,context.account); assert.equal(tx.value,0n);
 const decoded=decodeFunctionData({abi:sdk.routerAbi,data:tx.data});
 assert.equal(decoded.functionName,'swap'); assert.equal(decoded.args[1],10_000n);
 assert.deepEqual(decoded.args[0],order);
 assert.equal(decoded.args[2],sdk.takerData({taker:a(21),recipient:a(21),minimum:7900n,deadline:1100n,input:1,output:0}));
 assert.equal(sdk.validateTransactionPlan(tx,context,{kind:'swap',input:swap}),tx);
});
test('unknown network, unverified deployment, altered config/order and quote contexts fail closed',()=>{
 const build=(ctx=context,input=swap)=>sdk.buildSwapTx(ctx,input);
 assert.throws(()=>build({...context,chainId:1}));
 assert.throws(()=>build({...context,manifest:{...manifest,verified:false}}));
 for(const field of ['caller','recipient','router','tokenIn','tokenOut'] as const) assert.throws(()=>build(context,{...swap,quote:{...quote,[field]:a(99)}}));
 for(const change of [{amountInRaw:'9999'},{feeRaw:'4'},{expiresAt:'1000'},{orderHash:blockHash},{configHash:blockHash},{chainId:1},{maxCrossings:0}]) assert.throws(()=>build(context,{...swap,quote:{...quote,...change}}));
 assert.throws(()=>build({...context,chainId:1,manifest:{...manifest,chainId:1}},{...swap,config:{...config,chainId:1n}}));
 assert.throws(()=>build(context,{...swap,config:{...config,decimals:[18,18]}}));
 assert.throws(()=>build(context,{...swap,order:{...order,data:`${order.data}00`}}));
 assert.throws(()=>build(context,{...swap,minimumOutRaw:8001n}));
 assert.throws(()=>build(context,{...swap,deadline:1000n}));
});
test('review validation rejects backend target, selector, recipient, amount, value and account changes',()=>{
 const expected=sdk.buildSwapTx(context,swap);
 for(const delta of [{to:a(99)},{chainId:1},{account:a(99)},{value:1n},{data:`0xdeadbeef${expected.data.slice(10)}`},{data:`${expected.data}00`}]) assert.throws(()=>sdk.validateTransactionPlan({...expected,...delta},context,{kind:'swap',input:swap}));
 const redirected={...swap,recipient:a(24),quote:{...quote,recipient:a(24)}};
 assert.throws(()=>sdk.validateTransactionPlan(sdk.buildSwapTx(context,redirected),context,{kind:'swap',input:swap}));
 for(const recipient of [a(0),config.maker,manifest.aqua,manifest.router]) assert.throws(()=>sdk.buildSwapTx(context,{...swap,recipient,quote:{...quote,recipient}}));
 assert.throws(()=>sdk.buildSwapTx({...context,account:config.maker},{...swap,quote:{...quote,caller:config.maker}}));
});
test('maker plan is maker-owned, bounded, reset-aware and includes canonical activation',()=>{
 const ctx={...context,account:config.maker};
 const observations={allowances:[1n,4n*10n**18n],resetRequired:[true,false],shipped:false,docked:false,status:'unknown' as const};
 const result=sdk.buildMakerPlan(ctx,{config,order,...observations});
 assert.equal(result.steps.length,4);
 assert.deepEqual(result.steps.slice(0,2).map(tx=>decodeFunctionData({abi:erc20Abi,data:tx.data}).args),[[manifest.aqua,0n],[manifest.aqua,4_000_000n]]);
 const shipped=decodeFunctionData({abi:sdk.aquaAbi,data:result.steps[2]!.data});
 assert.equal(shipped.functionName,'ship'); assert.deepEqual(shipped.args,[manifest.router,sdk.encodeOrder(order),config.tokens,config.initialAmountsRaw]);
 const activation=decodeFunctionData({abi:sdk.lifecycleAbi,data:result.steps[3]!.data});
 assert.equal(activation.functionName,'activateStrategy');assert.deepEqual(activation.args,[config,order]);
 assert.equal(result.steps[3]!.to,manifest.router);assert.equal(result.steps[3]!.account,config.maker);
 assert.throws(()=>sdk.buildMakerPlan(context,{config,order,...observations}));
 const dock=sdk.buildDockTx(ctx,{config,order});
 assert.deepEqual(decodeFunctionData({abi:sdk.aquaAbi,data:dock.data}).args,[manifest.router,sdk.hashOrder(order),config.tokens]);
 const approvalIntent={kind:'makerApproval' as const,input:{config,order,token:config.tokens[0]!,reset:false}};
 assert.equal(sdk.validateTransactionPlan(result.steps[1],ctx,approvalIntent).data,result.steps[1]!.data);
 const wrongSpender=sdk.approvalPlan(manifest,config.maker,config.tokens[0]!,manifest.router,4_000_000n);
 assert.throws(()=>sdk.validateTransactionPlan(wrongSpender,ctx,approvalIntent));
});
test('publication resumption never repeats ship or activation and repairs revoked approvals',()=>{
 const ctx={...context,account:config.maker};
 const input={config,order,allowances:[4_000_000n,4n*10n**18n],resetRequired:[false,false],shipped:true,docked:false,status:'unknown' as const};
 const resume=sdk.buildMakerPlan(ctx,input);
 assert.equal(resume.steps.length,1);assert.equal(decodeFunctionData({abi:sdk.lifecycleAbi,data:resume.steps[0]!.data}).functionName,'activateStrategy');
 const revoked=sdk.buildMakerPlan(ctx,{...input,allowances:[0n,0n]});
 assert.equal(revoked.steps.length,3);
 assert.equal(decodeFunctionData({abi:erc20Abi,data:revoked.steps[0]!.data}).functionName,'approve');
 assert.equal(decodeFunctionData({abi:erc20Abi,data:revoked.steps[1]!.data}).functionName,'approve');
 assert.equal(decodeFunctionData({abi:sdk.lifecycleAbi,data:revoked.steps[2]!.data}).functionName,'activateStrategy');
 assert.equal(sdk.buildMakerPlan(ctx,{...input,status:'active',allowances:[0n,0n]}).steps.length,0);
 for(const delta of [{status:'retired' as const},{docked:true},{status:'active' as const,shipped:false}])assert.throws(()=>sdk.buildMakerPlan(ctx,{...input,...delta}));
});
test('retire and dock encode separately and resume either independently completed action',()=>{
 const ctx={...context,account:config.maker};const input={config,order,retired:false,docked:false};
 const plans=sdk.buildRetireAndDockPlan(ctx,input);assert.equal(plans.length,2);
 const retired=decodeFunctionData({abi:sdk.lifecycleAbi,data:plans[0]!.data});assert.equal(retired.functionName,'retireStrategy');assert.deepEqual(retired.args,[sdk.hashOrder(order)]);
 assert.equal(plans[0]!.to,manifest.router);assert.equal(plans[1]!.to,manifest.aqua);
 assert.equal(sdk.buildRetireAndDockPlan(ctx,{...input,retired:true})[0]!.data,plans[1]!.data);
 assert.equal(sdk.buildRetireAndDockPlan(ctx,{...input,docked:true})[0]!.data,plans[0]!.data);
 assert.equal(sdk.buildRetireAndDockPlan(ctx,{...input,docked:true,retired:true}).length,0);
 assert.throws(()=>sdk.buildRetireAndDockPlan(context,input));
 assert.throws(()=>sdk.buildRetireAndDockPlan(ctx,{...input,docked:undefined as unknown as boolean}));
});
test('lifecycle review binds deployment, maker, configuration and exact calldata',()=>{
 const ctx={...context,account:config.maker};const input={config,order};
 for(const kind of ['activate','retire'] as const){
  const build=kind==='activate'?sdk.buildActivateTx:sdk.buildRetireTx;
  const tx=build(ctx,input);assert.equal(sdk.validateTransactionPlan(tx,ctx,{kind,input}),tx);
  for(const delta of [{to:manifest.aqua},{account:a(99)},{value:1n},{data:`${tx.data}00`}])assert.throws(()=>sdk.validateTransactionPlan({...tx,...delta},ctx,{kind,input}));
  assert.throws(()=>build(context,input));
  assert.throws(()=>build({...ctx,manifest:{...manifest,verified:false}},input));
  assert.throws(()=>build(ctx,{config,order:{...order,data:`${order.data}00`}}));
 }
 const exhausted={...config,makerNonce:(1n<<64n)-1n};
 assert.throws(()=>sdk.buildActivateTx(ctx,{config:exhausted,order:sdk.buildOrder(exhausted)}),/nonce/i);
});
test('invoice creation binds exact terms and ID, rejects duplicate, zero and adapter recipients',()=>{
 const input={amountDueRaw:5_000n,expiresAt:1_300n,recipients:[a(22),a(23)],bps:[9000,1000],memoHash:invoice.memoHash,merchantNonce:3n};
 const built=sdk.buildInvoiceTx(context,input);
 assert.deepEqual(decodeFunctionData({abi:sdk.paymentsAbi,data:built.plan.data}).args,[5000n,1300,input.recipients,input.bps,input.memoHash]);
 assert.equal(built.invoiceId,sdk.invoiceId(31337n,a(12),a(21),3n));
 for(const recipients of [[a(22),a(22)],[a(0),a(23)],[a(12),a(23)]]) assert.throws(()=>sdk.buildInvoiceTx(context,{...input,recipients}));
 for(const change of [{expiresAt:1299n},{expiresAt:1_000n+2_592_001n},{amountDueRaw:0n},{bps:[9999,2]},{merchantNonce:(1n<<64n)-1n},{merchantNonce:1n<<64n}]) assert.throws(()=>sdk.buildInvoiceTx(context,{...input,...change}));
});
test('direct and swap invoice plans preserve contract context, exact approvals and reviewed recipient terms',()=>{
 const direct=sdk.buildPaymentTx(context,{kind:'direct',invoice});
 assert.equal(direct.to,manifest.payments);
 assert.deepEqual(decodeFunctionData({abi:sdk.paymentsAbi,data:direct.data}).args,[invoice.id]);
 const quoteForAdapter={...quote,caller:a(12),recipient:a(12)};
 const input={kind:'swap' as const,invoice,config,order,tokenIn:a(2),amountInRaw:10_000n,minimumOutRaw:7_900n,deadline:1_100n,maxCrossings:16,quote:quoteForAdapter};
 const payment=sdk.buildPaymentTx(context,input);
 assert.deepEqual(decodeFunctionData({abi:sdk.paymentsAbi,data:payment.data}).args,[invoice.id,order,1,10_000n,7_900n,1_100,16]);
 const approval=sdk.buildPaymentApprovalTx(context,input);
 assert.deepEqual(decodeFunctionData({abi:erc20Abi,data:approval.data}).args,[manifest.payments,10_000n]);
 assert.throws(()=>sdk.buildPaymentTx(context,{...input,quote}));
 assert.throws(()=>sdk.buildPaymentTx(context,{...input,tokenIn:manifest.usdc}));
 for(const delta of [{status:'paid' as const},{expiresAt:1000n},{adapter:a(99)},{chainId:1}]) assert.throws(()=>sdk.buildPaymentTx(context,{kind:'direct',invoice:{...invoice,...delta}}));
 assert.throws(()=>sdk.buildCancelInvoiceTx(context,invoice));
 assert.equal(sdk.buildCancelInvoiceTx({...context,account:invoice.merchant},invoice).to,manifest.payments);
});
test('money/config/order/quote DTOs round trip without Number and reject coercion',()=>{
 const dto=sdk.configToDTO(config);
 assert.deepEqual(sdk.configFromDTO(JSON.parse(JSON.stringify(dto))),config);
 assert.deepEqual(sdk.orderFromDTO(JSON.parse(JSON.stringify(sdk.orderToDTO(order)))),order);
 assert.throws(()=>sdk.configFromDTO({...dto,initialAmountsRaw:[1_000_000,10**18]}));
 assert.throws(()=>sdk.configFromDTO({...dto,makerNonce:'01'}));
 for(const value of ['1e18','-1','01','1.1',(1n<<256n).toString(),1]) assert.equal(uintSchema.safeParse(value).success,false);
 assert.equal(uintSchema.parse(((1n<<256n)-1n).toString()),((1n<<256n)-1n).toString());
 assert.equal(manifestSchema.safeParse({...manifest,tokens:[manifest.tokens[0],manifest.tokens[0]]}).success,false);
 assert.equal(manifestSchema.safeParse({...manifest,usdc:a(99)}).success,false);
});
test('approval plan checks account and spender before encoding',()=>{
 assert.throws(()=>sdk.approvalPlan(manifest,a(0),a(1),manifest.router,1n));
 assert.throws(()=>sdk.approvalPlan(manifest,a(21),a(1),a(99),1n));
 assert.throws(()=>sdk.approvalPlan(manifest,a(21),a(99),manifest.router,1n));
 const expected=sdk.approvalPlan(manifest,a(21),a(1),manifest.router,1n);
 assert.equal(expected.data,encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[manifest.router,1n]}));
});
test('config/order/program/invoice bytes match independently generated cast goldens',()=>{
 const golden=JSON.parse(readFileSync(new URL('./fixtures/canonical.json',import.meta.url),'utf8'));
 assert.equal(encodeAbiParameters([{type:'tuple',components:sdk.configComponents}],[config]),golden.config);
 assert.equal(sdk.hashConfig(config),golden.configHash);
 assert.equal(sdk.program(sdk.hashConfig(config)),golden.program);
 assert.equal(sdk.encodeOrder(order),golden.order);
 assert.equal(sdk.hashOrder(order),golden.orderHash);
 assert.equal(sdk.invoiceId(31337n,a(12),a(21),3n),golden.invoiceId);
 assert.notEqual(sdk.hashConfig({...config,makerNonce:1n}),golden.configHash);
 assert.notEqual(sdk.invoiceId(31337n,a(12),a(21),4n),golden.invoiceId);
});
test('generated actions match pinned source hashes and compiler selectors',()=>{
 const provenance=JSON.parse(readFileSync(new URL('../src/generated/provenance.json',import.meta.url),'utf8'));
 const abis={routerAbi:sdk.routerAbi,lifecycleAbi:sdk.lifecycleAbi,aquaAbi:sdk.aquaAbi,paymentsAbi:sdk.paymentsAbi};
 for(const item of provenance){
  const bytes=readFileSync(new URL(`../../../${item.source}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sourceSha256,'Rebuild and regenerate an ABI after source changes');
  const abi=abis[item.exportName as keyof typeof abis];
  assert.deepEqual(abi.map(entry=>toFunctionSelector(entry).slice(2)).sort(),Object.values(item.methodIdentifiers).sort());
 }
});
