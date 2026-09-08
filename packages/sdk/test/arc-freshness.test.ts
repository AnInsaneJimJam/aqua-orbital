import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeAbiParameters,keccak256} from 'viem';
import {isFreshIndexedHead,invoiceDetailSchema} from '@orbital/shared';
import {decodeSwapQuoteObservation} from '../src/quote-read';
import {decodeStrategyDetail} from '../src/strategy-read';
import {strategyObservation,strategyManifest} from './fixtures/strategy';
import {invoiceObservation} from './fixtures/invoice';

test('Arc bounds read lag without changing other networks or accepting unconfirmed cursors',()=>{
 for(const [lag,expected] of [[-1,false],[0,false],[1,false],[2,true],[3,true],[8,true],[9,false],[100,false]] as const){
  assert.equal(isFreshIndexedHead(5042002,100n+BigInt(lag),100n),expected);
  assert.equal(isFreshIndexedHead(31337,100n+BigInt(lag),100n),lag===2);
 }
 assert.equal(isFreshIndexedHead(5042002,2n,-1n),false);
});

test('Arc strategy and invoice wires agree at the lag boundary and still reject false freshness',()=>{
 for(const head of ['17','18','23']){
  const strategy=strategyObservation();strategy.freshness.head=head;
  assert.doesNotThrow(()=>decodeStrategyDetail(strategy,200,strategyManifest,strategy.data.strategy.orderHash));
  const invoice=invoiceObservation();invoice.freshness.head=head;
  assert.equal(invoiceDetailSchema.safeParse(invoice).success,true);
 }
 for(const head of ['16','24']){
  const strategy=strategyObservation();strategy.freshness.head=head;
  assert.throws(()=>decodeStrategyDetail(strategy,200,strategyManifest,strategy.data.strategy.orderHash));
  const invoice=invoiceObservation();invoice.freshness.head=head;
  assert.equal(invoiceDetailSchema.safeParse(invoice).success,false);
 }
 const stale=invoiceObservation();stale.freshness.ageMs=10001;
 assert.equal(invoiceDetailSchema.safeParse(stale).success,false);
});

test('Arc swap decoder accepts bounded lag but retains deployment, time and confirmation checks',()=>{
 // Synthetic empty inspected-set response isolates wire freshness from curve math.
 const f=JSON.parse(readFileSync(new URL('./fixtures/swap-quote-observation.json',import.meta.url),'utf8'));
 f.manifest.chainId=5042002;f.observed.chainId=5042002;
 f.observed.deploymentId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'address'}],
  [5042002n,f.manifest.aqua,f.manifest.router,f.manifest.payments]));
 f.observed.code='NO_ROUTE_IN_INSPECTED_SET';f.observed.data.best=null;f.observed.data.alternatives=[];
 f.observed.data.counts.quoted=0;f.observed.data.counts.failed=4;
 f.observed.data.diagnostics.forEach((d:{code:string})=>{d.code='QUOTE_REVERTED';});
 const decode=()=>decodeSwapQuoteObservation(f.observed,200,f.manifest,f.request,1700000003200);
 for(const lag of [2n,3n,8n]){
  f.observed.freshness.head=(BigInt(f.observed.currentIndexedBlock.height)+lag).toString();assert.equal(decode().status,'observed');
 }
 for(const lag of [1n,9n]){
  f.observed.freshness.head=(BigInt(f.observed.currentIndexedBlock.height)+lag).toString();assert.throws(decode);
 }
 f.observed.freshness.head=(BigInt(f.observed.currentIndexedBlock.height)+3n).toString();
 f.observed.freshness.indexedAt='2020-01-01T00:00:00.000Z';assert.throws(decode);
});
