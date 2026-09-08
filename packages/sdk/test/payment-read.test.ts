import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePaymentQuoteObservation} from '../src/index.js';
const fixture=(kind='swap')=>JSON.parse(readFileSync(new URL('./fixtures/payment-observations.json',import.meta.url),'utf8')).find((f:any)=>f.kind===kind);
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
const decode=(f=fixture())=>decodePaymentQuoteObservation(f.payload,f.httpStatus,f.manifest,f.request,f.nowMs);

test('SDK accepts bounded direct/swap observations and canonical absence without returning execution authority',()=>{
 for(const kind of ['direct','swap','absent']){const f=fixture(kind),before=JSON.stringify(f);assert.deepEqual(decode(f),f.payload);assert.equal(JSON.stringify(f),before);assert.equal(decode(f).financialExecutionEnabled,false);}
});
test('payment echoes bind payer, invoice, input token, amount cap and crossing limit to the local request',()=>{
 assert.equal(decode().status,'observed');
 for(const change of [{payer:address(99)},{invoiceId:hash(99)},{tokenIn:address(3)},{maxInputRaw:'999'},{maxCrossings:15}]){const f=fixture();Object.assign(f.request,change);assert.throws(()=>decode(f));}
 for(const kind of ['direct','absent']){const f=fixture(kind);f.request.invoiceId=hash(99);assert.throws(()=>decode(f));}
});
test('deployment identity, scope, canonical coverage and token metadata are independently checked',()=>{
 assert.equal(decode().status,'observed');
 for(const mutate of [(f:any)=>{f.manifest.verified=false;},(f:any)=>{f.manifest.router=address(99);},(f:any)=>{f.payload.adapter=address(99);},(f:any)=>{f.payload.deploymentStartBlock='2';},(f:any)=>{f.payload.deploymentId=hash(99);},(f:any)=>{f.payload.coverage.coveredBlocks='2';},(f:any)=>{f.payload.data.tokenIn.decimals=18;},(f:any)=>{f.payload.data.invoice.settlementToken.symbol='FAKE';},(f:any)=>{f.payload.historical=true;},(f:any)=>{f.payload.currentIndexedBlock.hash=hash(99);}]){const f=fixture();mutate(f);assert.throws(()=>decode(f));}
});
test('invoice terms, minimum, expiry, split remainder and funding inequalities cannot be rewritten',()=>{
 assert.equal(decode().status,'observed');
 for(const mutate of [(d:any)=>{d.invoice.status='paid';},(d:any)=>{d.invoice.invoiceId=hash(99);},(d:any)=>{d.invoice.recipients[1].amountRaw='11';},(d:any)=>{d.minimumOutRaw='99';},(d:any)=>{d.refundRaw='1';},(d:any)=>{d.funding.boundRaw='999';},(d:any)=>{d.funding.balanceRaw='133';},(d:any)=>{d.funding.spender=address(99);},(d:any)=>{d.expiresAt=String(BigInt(d.expiresAt)+1n);},(d:any)=>{d.funding.approvalRequired=false;}]){const f=fixture();mutate(f.payload.data);assert.throws(()=>decode(f));}
});
test('every retained route binds its configuration, adapter traits, fees and ranking',()=>{
 assert.equal(decode().status,'observed');
 for(const field of ['payer','caller','recipient','tokenIn','tokenOut']){const f=fixture();f.payload.data.routing.alternatives[0][field]=address(99);assert.throws(()=>decode(f));}
 for(const mutate of [(r:any)=>{r.configHash=hash(99);},(r:any)=>{r.orderHash=hash(99);},(r:any)=>{r.feeRaw='2';},(r:any)=>{r.feePpm=1000;},(r:any)=>{r.minimumOutRaw='101';},(r:any)=>{r.amountInRaw='135';},(r:any)=>{r.expiresAt=String(BigInt(r.expiresAt)-1n);}]){const f=fixture();mutate(f.payload.data.routing.best);assert.throws(()=>decode(f));}
 const reversed=fixture(),data=reversed.payload.data.routing;[data.best,data.alternatives[0]]=[data.alternatives[0],data.best];assert.throws(()=>decode(reversed));
});
test('service search summaries and actual logical work must satisfy the complete bounded stage arithmetic',()=>{
 assert.equal(decode().status,'observed');
 for(const mutate of [(d:any)=>{d.search.quoteCallsUsed++;},(d:any)=>{d.search.quoteBatchesUsed++;},(d:any)=>{d.search.stagesUsed--;},(d:any)=>{d.search.outcomes[0].unavailable++;},(d:any)=>{d.search.outcomes[0].orderHash=hash(99);},(d:any)=>{d.routing.counts.scanned++;},(d:any)=>{d.routing.diagnostics[0].code='QUOTE_MISSING';},(d:any)=>{d.work.logicalMembers++;},(d:any)=>{d.work.nativeBatches++;},(d:any)=>{d.work.contextMembers=14;}]){const f=fixture();mutate(f.payload.data);assert.throws(()=>decode(f));}
});

test('an eligible quote can exceed live output funding while another retained route remains sufficient',()=>{
 const f=fixture(),routing=f.payload.data.routing,other=routing.alternatives[0].orderHash;
 routing.alternatives=[];routing.counts.quoted=1;routing.counts.failed++;
 routing.diagnostics.find((d:any)=>d.orderHash===other).code='OUTPUT_UNAVAILABLE';
 assert.equal(decode(f).status,'observed');
});
test('unsigned payment and approval bytes are reconstructed instead of trusted as server-authored transactions',()=>{
 assert.equal(decode().status,'observed');
 for(const kind of ['direct','swap'])for(const plan of ['plan','approval'])for(const mutate of [(p:any)=>{p.to=address(99);},(p:any)=>{p.account=address(99);},(p:any)=>{p.chainId=5042002;},(p:any)=>{p.data+='00';},(p:any)=>{p.data=p.data.slice(0,-2)+'ff';},(p:any)=>{p.label='Sign to continue';}]){const f=fixture(kind);mutate(f.payload.data[plan]);assert.throws(()=>decode(f));}
 const absent=fixture();absent.payload.data.approval=null;assert.throws(()=>decode(absent));
});
test('direct USDC cannot include an AMM route, quote fee, refund, wrong due or contradictory approval',()=>{
 assert.equal(decode(fixture('direct')).status,'observed');
 for(const mutate of [(d:any)=>{d.feeRaw='1';},(d:any)=>{d.refundRaw='1';},(d:any)=>{d.amountInRaw='101';},(d:any)=>{d.kind='swap';},(d:any)=>{d.work.quoteMembers=1;},(d:any)=>{d.funding.allowanceRaw='100';}]){const f=fixture('direct');mutate(f.payload.data);assert.throws(()=>decode(f));}
});
test('freshness, invoice deadline and transport status are checked at the current client clock',()=>{
 assert.equal(decode().status,'observed');
 for(const kind of ['direct','swap','absent'])for(const mutate of [(f:any)=>{f.nowMs+=20000;},(f:any)=>{f.nowMs=NaN;},(f:any)=>{f.payload.freshness.ageMs+=2;},(f:any)=>{f.payload.freshness.indexedAt=new Date(f.nowMs+2000).toISOString();},(f:any)=>{f.httpStatus=500;}]){const f=fixture(kind);mutate(f);assert.throws(()=>decode(f));}
 const generic={schemaVersion:1,status:'unavailable',code:'PAYMENT_SEARCH_EXHAUSTED',message:'Observation unavailable.',retryable:true,field:null,requestId:'fixture',financialExecutionEnabled:false,paymentEligibilityVerified:false,canonicalVerification:'unavailable',data:null};
 const f=fixture();assert.deepEqual(decodePaymentQuoteObservation(generic,503,f.manifest,f.request,f.nowMs),generic);assert.throws(()=>decodePaymentQuoteObservation(generic,200,f.manifest,f.request,f.nowMs));assert.throws(()=>decodePaymentQuoteObservation(generic,404,f.manifest,f.request,f.nowMs));
});
