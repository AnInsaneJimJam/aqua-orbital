import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexerRpcUrl} from '../src/rpc.js';

test('indexer RPC override is explicit and public HTTPS; default manifest RPC remains unchanged',()=>{
 assert.equal(indexerRpcUrl('http://127.0.0.1:8545'), 'http://127.0.0.1:8545');
 assert.equal(indexerRpcUrl('https://rpc.testnet.arc.io'), 'https://rpc.testnet.arc.io');
 assert.equal(indexerRpcUrl('https://rpc.testnet.arc.io','https://rpc.blockdaemon.testnet.arc.io/'),'https://rpc.blockdaemon.testnet.arc.io');
 for(const value of ['', 'not-a-url', 'http://rpc.blockdaemon.testnet.arc.io', 'https://user:password@rpc.blockdaemon.testnet.arc.io', 'https://rpc.blockdaemon.testnet.arc.io?key=test', 'https://rpc.blockdaemon.testnet.arc.io#fragment']){
  assert.throws(()=>indexerRpcUrl('https://rpc.testnet.arc.io',value),/^Error: INVALID_INDEXER_RPC_URL$/);
 }
});
