import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,formatAmount,feeIn,program,instructionsArgs,takerData} from '../src/index.js';
import type {Address,Hex} from 'viem';
test('decimal parser is exact and rejects coercions',()=>{
 assert.equal(parseAmount('123456789012345678.123456',6),123456789012345678123456n);
 assert.equal(formatAmount(1000000000000000001n,18),'1.000000000000000001');
 for(const input of ['-1','1e6','NaN',' 1','1.0000001','Infinity']) assert.throws(()=>parseAmount(input,6));
 assert.throws(()=>parseAmount((1n<<256n).toString(),0));
});
test('fee is once on gross input and ceiling rounded',()=>{
 assert.equal(feeIn(10001n,500),6n);assert.equal(feeIn(10000n,500),5n);
 assert.throws(()=>feeIn(1n,1));
});
test('canonical program and argument lengths',()=>{
 const hash=('0x'+'11'.repeat(32)) as Hex;
 assert.equal(program(hash),'0x7220'+'11'.repeat(32)+'5220'+'11'.repeat(32));
 assert.equal(instructionsArgs(0,2,16),'0x01000210');
 assert.throws(()=>instructionsArgs(0,0));assert.throws(()=>instructionsArgs(0,8));assert.throws(()=>instructionsArgs(0,1,17));
});
test('upstream taker header is 22 bytes with canonical flags and slices',()=>{
 const user='0x0000000000000000000000000000000000000001' as Address;
 const data=takerData({taker:user,recipient:user,minimum:5n,deadline:1000n,input:0,output:1});
 assert.equal(data.slice(0,46),'0x002900250025002500250025002500250020002000e1');
 assert.equal((data.length-2)/2,22+32+5+4);
 assert.equal(data.slice(-8),'01000110');
});
