import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeFunctionResult,encodeAbiParameters,encodeFunctionData,toFunctionSelector,type Abi,type Hex} from 'viem';
import * as sdk from '../src/index.js';

const reads=()=> (sdk as typeof sdk&{paymentsReadAbi:Abi}).paymentsReadAbi;
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as const;
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}` as Hex;
test('payment context and invoice administration share five compiled read getters without altering transaction groups',()=>{
 const abi=reads();assert.ok(Array.isArray(abi),'missing compiled payment read ABI');
 assert.deepEqual(abi.map(entry=>entry.type==='function'?entry.name:null).sort(),['ROUTER','USDC','allowedToken','getInvoice','nextMerchantNonce'].sort());
 assert.ok(abi.every(entry=>entry.type==='function'&&entry.stateMutability==='view'));
 assert.deepEqual([sdk.routerAbi.length,sdk.lifecycleAbi.length,sdk.aquaAbi.length,sdk.paymentsAbi.length],[2,6,2,4]);
});

test('compiled invoice result matches an independently stated Solidity tuple layout',()=>{
 const components=[{name:'merchant',type:'address'},{name:'amountDueRaw',type:'uint256'},{name:'expiresAt',type:'uint40'},
  {name:'recipients',type:'address[]'},{name:'bps',type:'uint16[]'},{name:'memoHash',type:'bytes32'},
  {name:'status',type:'uint8'},{name:'payer',type:'address'},{name:'inputRaw',type:'uint256'},
  {name:'receivedRaw',type:'uint256'},{name:'refundRaw',type:'uint256'},{name:'routeHash',type:'bytes32'}] as const;
 const invoice={merchant:address(20),amountDueRaw:9007199254740993n,expiresAt:1700001000,recipients:[address(20),address(23)],bps:[9000,1000],memoHash:hash(99),status:1,payer:address(0),inputRaw:0n,receivedRaw:0n,refundRaw:0n,routeHash:hash(0)};
 const bytes=encodeAbiParameters([{type:'tuple',components}],[invoice]);
 const decoded=decodeFunctionResult({abi:reads(),functionName:'getInvoice',data:bytes});assert.deepEqual(decoded,invoice);
});

test('read selectors and arguments agree with independent cast signatures and compiler provenance',()=>{
 const abi=reads(),selectors=Object.fromEntries(abi.filter(e=>e.type==='function').map(e=>[e.name,toFunctionSelector(e)]));
 // Independent `cast sig` observations for these five literal signatures.
 assert.deepEqual(selectors,{getInvoice:'0xcb802c8b',ROUTER:'0x32fe7b26',USDC:'0x89a30271',allowedToken:'0x756742f8',nextMerchantNonce:'0xaa225a8c'});
 const provenance=JSON.parse(readFileSync(new URL('../src/generated/provenance.json',import.meta.url),'utf8')).find((p:{exportName:string})=>p.exportName==='paymentsReadAbi');
 assert.ok(provenance);assert.equal(provenance.source,'packages/contracts/src/OrbitalPayments.sol');
 for(const [signature,selector] of Object.entries(provenance.methodIdentifiers))assert.equal(selectors[signature.split('(')[0]!],`0x${selector}`);
 assert.equal(encodeFunctionData({abi,functionName:'getInvoice',args:[hash(7)]}),`${selectors.getInvoice}${hash(7).slice(2)}`);
 assert.equal(encodeFunctionData({abi,functionName:'allowedToken',args:[address(3)]}),`${selectors.allowedToken}${address(3).slice(2).padStart(64,'0')}`);
 assert.equal(encodeFunctionData({abi,functionName:'nextMerchantNonce',args:[address(3)]}),`${selectors.nextMerchantNonce}${address(3).slice(2).padStart(64,'0')}`);
 assert.equal(decodeFunctionResult({abi,functionName:'nextMerchantNonce',data:encodeAbiParameters([{type:'uint64'}],[(1n<<64n)-1n])}),(1n<<64n)-1n);
});
