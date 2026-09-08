import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startOwnedAnvil} from '../lib/local-anvil.mjs';
const {getContractAddress}=createRequire(new URL('../../packages/sdk/package.json',import.meta.url))('viem');
test('owned ephemeral Cancun Anvil authenticates instance and creation eth_call preserves exact nonce/self address',async()=>{
 const local=await startOwnedAnvil();
 try{
  assert.notEqual(new URL(local.rpcUrl).port,'8545');
  await local.assertIdentity();
  assert.equal(await local.request('eth_chainId'),'0x7a69');
  assert.match(local.identity.instanceId,/^0x[0-9a-f]{64}$/i);
  const [from]=await local.request('eth_accounts');
  // Constructor returns its own address as the entire runtime. This specifically
  // catches eth_call CREATE choosing a different nonce than eth_sendTransaction.
  const data='0x3060005260206000f3';
  for(let nonce=0n;nonce<2n;nonce++){
   assert.equal(BigInt(await local.request('eth_getTransactionCount',[from,'latest'])),nonce);
   const expected=getContractAddress({from,nonce});
   const tx={from,data,nonce:'0x'+nonce.toString(16),gas:'0x1c9c380'};
   const simulated=await local.request('eth_call',[tx,'latest']);
   assert.equal(simulated.toLowerCase(),'0x'+expected.slice(2).toLowerCase().padStart(64,'0'));
   assert.equal(BigInt(await local.request('eth_getTransactionCount',[from,'latest'])),nonce);
   const hash=await local.request('eth_sendTransaction',[tx]);
   const receipt=await local.receipt(hash);assert.equal(receipt.status,'0x1');
   assert.equal(receipt.contractAddress.toLowerCase(),expected.toLowerCase());
   assert.equal(await local.request('eth_getCode',[expected,receipt.blockNumber]),simulated);
  }
 }finally{await local.close();}
 await assert.rejects(local.assertIdentity(),/LOCAL_PROCESS_STOPPED/);
});
