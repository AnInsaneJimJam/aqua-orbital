import test from 'node:test';
import assert from 'node:assert/strict';
import {getAddress,toFunctionSelector,type Hex} from 'viem';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as sdk from '../src/index';
const a=(n:number)=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:true,aqua:a(10),router:a(11),payments:a(12),usdc:a(1),startBlock:'0',tokens:[{address:a(1),symbol:'USDC',decimals:6,mock:true},{address:a(2),symbol:'oUSD6',decimals:6,mock:true},{address:a(3),symbol:'oUSD18',decimals:18,mock:true}]};
const ctx={manifest,chainId:31337,account:a(20),now:1000n};
const input={token:a(2),nextMintAt:0n};
test('demo faucet creates only a fixed self-mint call on each supported network and precision',()=>{
 for(const chainId of [31337,5042002])for(const token of manifest.tokens.slice(1)){
  const context={...ctx,chainId,manifest:{...manifest,chainId}};
  const tx=sdk.buildDemoFaucetTx(context,{token:token.address,nextMintAt:1000n});
  assert.deepEqual(tx,{chainId,account:ctx.account,to:token.address,data:toFunctionSelector('faucet()'),value:0n,label:`Claim 1,000 ${token.symbol} demo tokens`});
  assert.equal(sdk.validateTransactionPlan(tx,context,{kind:'demoFaucet',input:{token:token.address,nextMintAt:1000n}}),tx);
 }
});
test('demo faucet requires a verified deployment, supported chain and connected nonzero account',()=>{
 assert.throws(()=>sdk.buildDemoFaucetTx({...ctx,manifest:{...manifest,verified:false}},input),/verified/);
 assert.throws(()=>sdk.buildDemoFaucetTx({...ctx,chainId:5042002},input),/network/);
 assert.throws(()=>sdk.buildDemoFaucetTx({...ctx,chainId:1,manifest:{...manifest,chainId:1}},input),/network/);
 assert.throws(()=>sdk.buildDemoFaucetTx({...ctx,account:a(0)},input),/address/);
});
test('demo faucet rejects settlement USDC, unknown tokens and mismatched demo metadata',()=>{
 for(const token of [manifest.usdc,a(0),a(99)])assert.throws(()=>sdk.buildDemoFaucetTx(ctx,{...input,token}),/demo token/);
 for(const change of [{mock:false},{decimals:18},{symbol:'USDC'},{symbol:'ousd6'}]){
  const changed={...manifest,tokens:manifest.tokens.map(t=>t.address===input.token?{...t,...change}:t)};
  assert.throws(()=>sdk.buildDemoFaucetTx({...ctx,manifest:changed},input),/demo token/);
 }
});
test('chain-time cooldown observations allow the exact boundary and reject early or malformed claims',()=>{
 assert.equal(sdk.buildDemoFaucetTx({...ctx,now:0n},input).to,input.token);
 assert.equal(sdk.buildDemoFaucetTx(ctx,{...input,nextMintAt:1000n}).to,input.token);
 assert.throws(()=>sdk.buildDemoFaucetTx(ctx,{...input,nextMintAt:1001n}),/cooldown/i);
 for(const nextMintAt of [-1n,1n<<256n,1000 as unknown as bigint])assert.throws(()=>sdk.buildDemoFaucetTx(ctx,{...input,nextMintAt}),/amount/);
});
test('faucet review rejects any token, account, selector, value, chain or calldata alteration',()=>{
 const tx=sdk.buildDemoFaucetTx(ctx,input),intent={kind:'demoFaucet' as const,input};
 for(const change of [{to:a(3)},{account:a(21)},{chainId:5042002},{value:1n},{data:'0xdeadbeef' as Hex},{data:`${tx.data}00`},{label:'Mint USDC'},{spender:manifest.aqua}]){
  assert.throws(()=>sdk.validateTransactionPlan({...tx,...change},ctx,intent),/reviewed plan/);
 }
});
test('demo faucet ABI and reads are generated from the pinned compiler and current contract source',()=>{
 const [record]=JSON.parse(readFileSync(new URL('../src/generated/demo-token-provenance.json',import.meta.url),'utf8'));
 const source=readFileSync(new URL(`../../../${record.source}`,import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),record.sourceSha256);
 assert.equal(record.compiler,'0.8.30+commit.73712a01');assert.equal(record.evmVersion,'cancun');
 assert.equal(record.optimizerRuns,700);assert.equal(record.viaIR,true);
 assert.deepEqual(sdk.demoTokenAbi.map(x=>x.name).sort(),['CHAIN_ID','COOLDOWN','FAUCET_AMOUNT','faucet','nextMintAt']);
 assert.deepEqual(sdk.demoTokenAbi.map(x=>toFunctionSelector(x).slice(2)).sort(),Object.values(record.methodIdentifiers).sort());
});
