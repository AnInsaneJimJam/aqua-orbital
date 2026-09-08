import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../src/index.js';
import type {ZodType} from 'zod';

const request={invoiceId:`0x${'12'.repeat(32)}`,payer:`0x${'23'.repeat(20)}`,tokenIn:`0x${'34'.repeat(20)}`,maxInputRaw:'9007199254740993',maxCrossings:16};
const schema=()=> (shared as typeof shared&{paymentQuoteRequestSchema:ZodType}).paymentQuoteRequestSchema;
test('payment request retains exact raw integer input and has only invoice/payer/token/limit fields',()=>{
 const parsed=schema().parse(request);assert.deepEqual(parsed,request);
 assert.doesNotThrow(()=>schema().parse({...request,maxInputRaw:((1n<<256n)-1n).toString(),maxCrossings:0}));
});
test('payment request rejects caller-authored terms, targets, timestamps, signers and malformed limits',()=>{
 for(const change of [{invoiceId:'0x12'},{payer:`0x${'0'.repeat(40)}`},{tokenIn:'USDC'},{maxInputRaw:'0'},{maxInputRaw:'1e18'},{maxInputRaw:(1n<<256n).toString()},{maxInputRaw:1},{maxCrossings:17},{maxCrossings:0.5},
  {minimumOutRaw:'1'},{invoiceExpiresAt:'1700001000'},{router:request.payer},{recipient:request.payer},{rpcUrl:'https://example.invalid'},{slippageBps:50},{caller:request.payer},{blockHash:request.invoiceId}]){
  assert.equal(schema().safeParse({...request,...change}).success,false);
 }
});
