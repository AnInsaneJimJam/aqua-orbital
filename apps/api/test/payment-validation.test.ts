import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvoiceRecord} from '@orbital/db';
import {decodeFunctionData} from 'viem';
import {buildPaymentTx,paymentsAbi,type PlanContext} from '@orbital/sdk';
import {decodePaymentContext} from '../src/payment-context.js';
import {validatePaymentFunding,PaymentValidationError} from '../src/payment-validation.js';
import {contextFixture} from './payment-context-fixture.js';
import {address,hash} from './strategies-fixture.js';

function fixture(direct=false){
 const f=contextFixture(direct),context=decodePaymentContext(f.input,f.observations());
 const source={blockNumber:'1',blockHash:hash(1),txHash:hash(101),logIndex:0};
 const record:InvoiceRecord={invoiceId:f.input.request.invoiceId,merchant:context.invoice.merchant,adapter:f.input.manifest.payments,
  amountDueRaw:context.invoice.amountDueRaw.toString(),expiresAt:context.invoice.expiresAt.toString(),recipients:context.invoice.recipients.map((address,i)=>({address,bps:context.invoice.bps[i]!})),memoHash:context.invoice.memoHash,
  status:'unpaid',version:'1',created:{...source},updated:{...source},payment:null};
 const timestamp=1700000003n;
 return {...f,context,record,timestamp,validate(){return validatePaymentFunding(f.input,record,context,timestamp);}};
}
function rejects(f:ReturnType<typeof fixture>,code:string,status=503){assert.throws(()=>f.validate(),error=>{assert.ok(error instanceof PaymentValidationError);assert.equal(error.message,code);assert.equal(error.httpStatus,status);return true;});}

test('canonical unpaid terms retain exact splits, explicit funding and an SDK-compatible invoice snapshot',()=>{
 const f=fixture(true),r=f.validate();assert.equal(r.kind,'direct');assert.equal(r.seedRaw,9007199254740993n);assert.equal(r.boundRaw,100000000000000000000n);
 assert.deepEqual(r.invoice.recipients.map(x=>x.amountRaw),['8106479329266893','900719925474100']);assert.equal(r.invoice.paymentEligibilityVerified,false);
 assert.equal(r.allowanceRaw,0n);assert.equal(r.expiresAt,f.timestamp+20n);
 const ctx:PlanContext={manifest:f.input.manifest,chainId:f.input.manifest.chainId,account:f.input.request.payer as `0x${string}`,now:f.timestamp};
 const plan=buildPaymentTx(ctx,{kind:'direct',invoice:r.snapshot});assert.equal(plan.to.toLowerCase(),f.input.manifest.payments.toLowerCase());
 assert.deepEqual(decodeFunctionData({abi:paymentsAbi,data:plan.data}).args,[f.input.request.invoiceId]);
});

test('swap bound has the exact maximal strict normalized input for every supported decimal precision',()=>{
 for(let decimals=0;decimals<=18;decimals++){
  const f=fixture(),token=f.input.manifest.tokens.find(t=>t.address.toLowerCase()===f.input.request.tokenIn.toLowerCase())!;
  f.input.manifest={...f.input.manifest,tokens:f.input.manifest.tokens.map(t=>t===token?{...t,decimals}:t)};f.context.decimals=decimals;
  f.input.request.maxInputRaw=((1n<<256n)-1n).toString();f.context.balanceRaw=(1n<<256n)-1n;
  const r=f.validate(),q=10n**BigInt(18-decimals)*(1n<<64n),limit=1n<<160n;
  assert.equal(r.kind,'swap');assert.ok(r.boundRaw*q<limit);assert.ok((r.boundRaw+1n)*q>=limit);
  assert.ok(r.seedRaw>=2n&&r.seedRaw<=r.boundRaw);
  const target=f.context.invoice.amountDueRaw*10n**BigInt(decimals);assert.ok(r.seedRaw*1000000n>=target);assert.ok((r.seedRaw-1n)*1000000n<target);
 }
});

test('max input and balance independently cap swap search; allowance never caps it',()=>{
 for(const [max,balance,expected] of [[123n,1000n,123n],[1000n,124n,124n],[2n,2n,2n]] as const){
  const f=fixture();f.input.request.maxInputRaw=max.toString();f.context.balanceRaw=balance;f.context.allowanceRaw=0n;
  assert.equal(f.validate().boundRaw,expected);assert.equal(f.validate().seedRaw,expected);
 }
 for(const balance of [0n,1n]){const f=fixture();f.context.balanceRaw=balance;rejects(f,'PAYMENT_INPUT_TOO_SMALL',422);}
 const f=fixture();f.input.request.maxInputRaw='1';rejects(f,'PAYMENT_INPUT_TOO_SMALL',422);
});

test('direct payment checks exact raw due against independent user and balance limits without AMM fee assumptions',()=>{
 const f=fixture(true),due=f.context.invoice.amountDueRaw;
 f.input.request.maxInputRaw=(due-1n).toString();rejects(f,'PAYMENT_MAX_INPUT_INSUFFICIENT',422);
 f.input.request.maxInputRaw=due.toString();f.context.balanceRaw=due-1n;rejects(f,'PAYMENT_BALANCE_INSUFFICIENT',422);
 f.context.balanceRaw=due;assert.equal(f.validate().seedRaw,due);
 f.context.invoice.amountDueRaw=1n;f.record.amountDueRaw='1';f.context.balanceRaw=1n;f.input.request.maxInputRaw='1';assert.equal(f.validate().seedRaw,1n);
});

test('invoice terms and every unpaid payment field must match the indexed source before funding is considered',()=>{
 for(const field of ['merchant','amountDueRaw','expiresAt','memoHash','recipients','bps','payer','inputRaw','receivedRaw','refundRaw','routeHash','status'] as const){
  const f=fixture();
  if(field==='merchant'||field==='payer')f.context.invoice[field]=address(99);
  else if(field==='memoHash'||field==='routeHash')f.context.invoice[field]=hash(100);
  else if(field==='recipients')f.context.invoice.recipients=[...f.context.invoice.recipients].reverse();
  else if(field==='bps')f.context.invoice.bps=[9999,1];else if(field==='status')f.context.invoice.status=2;else f.context.invoice[field]+=1n;
  f.context.balanceRaw=0n;rejects(f,'PAYMENT_INVOICE_MISMATCH');
 }
});

test('paid and cancelled conflicts require matching indexed and onchain terminal observations',()=>{
 for(const status of ['paid','cancelled'] as const){
  const f=fixture();f.record.status=status;f.record.version='2';f.record.updated={blockNumber:'2',blockHash:hash(2),txHash:hash(102),logIndex:0};f.context.invoice.status=status==='paid'?3:4;
  if(status==='paid'){
   f.record.payment={payer:address(22),tokenIn:f.input.manifest.usdc,inputRaw:f.record.amountDueRaw,receivedRaw:f.record.amountDueRaw,refundRaw:'0',routeHash:hash(0)};
   Object.assign(f.context.invoice,{payer:address(22),inputRaw:BigInt(f.record.amountDueRaw),receivedRaw:BigInt(f.record.amountDueRaw)});
  }
  rejects(f,status==='paid'?'INVOICE_PAID':'INVOICE_CANCELLED',409);
  f.context.invoice.status=1;rejects(f,'PAYMENT_INVOICE_MISMATCH');
 }
});

test('expiry is the smaller invoice/20-second deadline, including invoices near expiry that cannot be newly created',()=>{
 const f=fixture();f.record.expiresAt=(f.timestamp+1n).toString();f.context.invoice.expiresAt=f.timestamp+1n;
 assert.equal(f.validate().expiresAt,f.timestamp+1n);
 f.record.expiresAt=f.timestamp.toString();f.context.invoice.expiresAt=f.timestamp;rejects(f,'INVOICE_EXPIRED',409);
 for(const now of [-1n,1n<<40n,1700000003 as never])assert.throws(()=>validatePaymentFunding(f.input,f.record,f.context,now),/PAYMENT_DATA_INVALID/);
});

test('invalid adapter, ID, receipt provenance and contract-inadmissible terms never authorize a payment observation',()=>{
 for(const mode of ['adapter','id','version','future','old','hash','recipient','zeroExpiry','maxDue'] as const){
  const f=fixture();if(mode==='adapter')f.record.adapter=address(99);if(mode==='id')f.record.invoiceId=hash(99);if(mode==='version')f.record.version='2';
  if(mode==='future'){f.record.created.blockNumber='4';f.record.updated.blockNumber='4';}if(mode==='old'){f.record.created.blockNumber='0';f.record.updated.blockNumber='0';}
  if(mode==='hash'){f.record.created.blockNumber='3';f.record.updated.blockNumber='3';}
  if(mode==='recipient'){f.record.recipients[0]!.address=f.input.manifest.payments;f.context.invoice.recipients[0]=f.input.manifest.payments;}
  if(mode==='zeroExpiry'){f.record.expiresAt='0';f.context.invoice.expiresAt=0n;}
  if(mode==='maxDue'){const due=(1n<<160n)/(10n**12n*(1n<<64n));f.record.amountDueRaw=due.toString();f.context.invoice.amountDueRaw=due;}
  rejects(f,'PAYMENT_DATA_INVALID');
 }
});

test('invalid funding scalar types, token metadata and adapter immutables fail before the numeric search bound',()=>{
 for(const [field,value] of [['balanceRaw',-1n],['balanceRaw',1n<<256n],['allowanceRaw',1n<<256n],['balanceRaw',123],['decimals',6],['usdcDecimals',18],['allowedToken',false],['router',address(99)],['usdc',address(99)]] as const){
  const f=fixture();Object.assign(f.context,{[field]:value});rejects(f,'PAYMENT_DATA_INVALID');
 }
});
