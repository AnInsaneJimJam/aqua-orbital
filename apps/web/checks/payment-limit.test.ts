import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentQuoteLimit} from '../src/features/paymentLimit';
test('automatic quote search uses available tokens without granting an approval',()=>{
 assert.equal(paymentQuoteLimit(998491n),998491n);
 assert.equal(paymentQuoteLimit(998491n,750000n),750000n);
 assert.equal(paymentQuoteLimit(998491n,2000000n),998491n);
 assert.equal(paymentQuoteLimit(1000000000000000001n),1000000000000000001n);
});
test('invalid balances and nonpositive optional limits cannot start a quote',()=>{
 for(const balance of [0n,-1n,1n<<256n])assert.throws(()=>paymentQuoteLimit(balance));
 for(const limit of [0n,-1n,1n<<256n])assert.throws(()=>paymentQuoteLimit(100n,limit));
});
