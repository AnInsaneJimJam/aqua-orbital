import {prepareRouting,prepareWholeSizeQuotes,selectWholeSizeQuotes} from '../src/route-selection.js';
import {routingFixture} from './route-selection-fixture.js';
/** Explicit non-live wire fixture. No deployed or RPC authenticity is claimed. */
export function swapQuoteWireFixture(){
 const f=routingFixture(4),plan=prepareRouting(f.input),reads=f.inspections(plan.inspectionCalls),quotes=prepareWholeSizeQuotes(f.input,reads),selected=selectWholeSizeQuotes(f.input,reads,f.quotes(quotes.quoteCalls));
 const {kind,...request}=f.input.intent;
 const route=(r:NonNullable<typeof selected.best>)=>({...r,config:f.records.find(c=>c.orderHash===r.orderHash)!.config});
 return {manifest:f.input.manifest,request,observed:{schemaVersion:1,status:'observed',code:'QUOTE_OBSERVED',financialExecutionEnabled:false,canonicalVerification:'verified_at_pin',requestId:'req-fixture',request,router:f.input.manifest.router.toLowerCase(),deploymentStartBlock:f.input.manifest.startBlock,
  chainId:f.input.manifest.chainId,deploymentId:f.input.snapshot.deploymentId,asOf:f.input.snapshot.asOf,currentIndexedBlock:f.input.snapshot.currentCursor,historical:false,
  freshness:{indexedAt:new Date(1700000003100).toISOString(),observedAt:new Date(1700000003200).toISOString(),ageMs:100,head:'5',blockTimestamp:f.input.blockTimestamp},
  data:{best:route(selected.best!),alternatives:selected.alternatives.map(route),counts:selected.counts,coverage:selected.coverage,diagnostics:selected.diagnostics}},
  unavailable:{schemaVersion:1,status:'unavailable',code:'QUOTE_DEPLOYMENT_UNAVAILABLE',message:'A complete canonical quote observation is unavailable.',retryable:true,field:null,requestId:'req-fixture',financialExecutionEnabled:false,canonicalVerification:'unavailable',data:null}};
}
