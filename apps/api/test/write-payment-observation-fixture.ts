import {writeFile} from 'node:fs/promises';
import {observePaymentQuote} from '../src/payment-service.js';
import {paymentServiceFixture} from './payment-service-fixture.js';
// Captured synthetic wire candidates for the independently validating SDK.
// Dates retain the actual service's monotonic observation offset, not live RPC.
const result=[];
for(const kind of ['direct','swap','absent'] as const){
 const f=paymentServiceFixture(kind==='direct');if(kind==='absent')f.invoices.items=[];
 const observation=await observePaymentQuote(f.input.manifest,f.input.request,f.deps,{now:()=>f.now});
 if(kind==='absent'?observation.httpStatus!==404:observation.status!=='observed')throw Error('FIXTURE_NOT_OBSERVED');
 const {httpStatus,...body}=observation;
 const payload={...body,requestId:'payment-fixture',router:f.input.manifest.router.toLowerCase(),adapter:f.input.manifest.payments.toLowerCase(),deploymentStartBlock:f.input.manifest.startBlock,
  ...(kind==='absent'?{request:f.input.request,retryable:false,field:'invoiceId'}:{})};
 result.push({kind,manifest:f.input.manifest,request:f.input.request,nowMs:f.now+1000,httpStatus,payload});
}
await writeFile(new URL('../../../packages/sdk/test/fixtures/payment-observations.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Wrote three synthetic payment wire observations.');
