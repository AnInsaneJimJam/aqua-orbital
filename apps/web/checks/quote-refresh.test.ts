import test from 'node:test';
import assert from 'node:assert/strict';
import {nextQuoteRefreshAt,retryableQuoteResponse} from '../src/features/quoteRefresh';

test('quote refresh starts early, backs off on failures, and never loops immediately',()=>{
 assert.equal(nextQuoteRefreshAt(10000,23000,false),15000);
 assert.equal(nextQuoteRefreshAt(10000,17000,false),12000);
 assert.equal(nextQuoteRefreshAt(10000,9000,false),12000);
 assert.equal(nextQuoteRefreshAt(10000,null,true),25000);
});
test('temporary quote expiry/index races are retried; invalid requests and rate limits are not',()=>{
 for(const code of ['QUOTE_EXPIRED','PAYMENT_QUOTE_EXPIRED','QUOTE_INDEXER_STALE','QUOTE_SOURCE_CHANGED','QUOTE_TIMEOUT'])assert.equal(retryableQuoteResponse(503,{code,retryable:true}),true);
 for(const code of ['INVALID_QUOTE_REQUEST','QUOTE_DEPLOYMENT_CHANGED'])assert.equal(retryableQuoteResponse(503,{code,retryable:true}),false);
 assert.equal(retryableQuoteResponse(429,{code:'QUOTE_TIMEOUT',retryable:true}),false);
 assert.equal(retryableQuoteResponse(503,{code:'QUOTE_EXPIRED',retryable:false}),false);
});
