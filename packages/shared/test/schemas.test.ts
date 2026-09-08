import test from 'node:test';
import assert from 'node:assert/strict';
import {configDTOSchema,manifestSchema,quoteRequestSchema,swapQuoteSchema,uint64Schema,uint40Schema,uintSchema} from '../src/index';
const a=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const h=`0x${'12'.repeat(32)}`;
test('uint schemas reject malformed wire values without throwing during safeParse',()=>{
 for(const schema of [uintSchema,uint64Schema,uint40Schema]){
  for(const value of ['NaN','1e18','0x10','01','-1','1.0','',null,1,1n]){
   assert.doesNotThrow(()=>schema.safeParse(value));assert.equal(schema.safeParse(value).success,false);
  }
 }
 assert.equal(uint64Schema.safeParse((1n<<64n).toString()).success,false);
 assert.equal(uint40Schema.safeParse((1n<<40n).toString()).success,false);
});
test('quote DTOs preserve decimal integers and reject extra transaction fields',()=>{
 const quote={chainId:31337,router:a(10),orderHash:h,configHash:h,caller:a(11),recipient:a(11),tokenIn:a(1),tokenOut:a(2),amountInRaw:'1000000000000000001',amountOutRaw:'999999999999999999',feeRaw:'500000000000001',stateVersion:'1',blockNumber:'2',blockHash:h,expiresAt:'1000',maxCrossings:16};
 assert.deepEqual(swapQuoteSchema.parse(JSON.parse(JSON.stringify(quote))),quote);
 assert.equal(swapQuoteSchema.safeParse({...quote,data:'0xa9059cbb'}).success,false);
 assert.equal(swapQuoteSchema.safeParse({...quote,amountInRaw:1000000000000000001}).success,false);
 assert.equal(swapQuoteSchema.safeParse({...quote,chainId:Number.MAX_SAFE_INTEGER+1}).success,false);
 assert.equal(quoteRequestSchema.safeParse({wallet:a(11),recipient:a(11),tokenIn:a(1),tokenOut:a(1),amountInRaw:'1',slippageBps:10,maxCrossings:16}).success,false);
});
test('wire config and manifest reject malformed nonces and ambiguous deployment roles',()=>{
 const config={schemaVersion:1,chainId:'31337',router:a(10),maker:a(11),makerNonce:'0',tokens:[a(1),a(2)],decimals:[6,18],tickKeys:['18446744073709551615'],radiiInternal:['1000000000000000000000000000000'],feePpm:500,initialAmountsRaw:['1000000','1000000000000000000']};
 assert.equal(configDTOSchema.safeParse(config).success,true);
 assert.doesNotThrow(()=>configDTOSchema.safeParse({...config,makerNonce:'1e18'}));
 assert.equal(configDTOSchema.safeParse({...config,makerNonce:'1e18'}).success,false);
 const manifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://127.0.0.1:8545',verified:false,aqua:a(10),router:a(11),payments:a(12),usdc:a(1),startBlock:'0',tokens:[{address:a(1),decimals:6,symbol:'USDC',mock:true},{address:a(2),decimals:18,symbol:'oUSD18',mock:true}]};
 assert.equal(manifestSchema.safeParse(manifest).success,true);
 for(const delta of [{payments:a(11)},{aqua:a(1)},{router:a(0)},{usdc:a(2)},{startBlock:0}])assert.equal(manifestSchema.safeParse({...manifest,...delta}).success,false);
});
