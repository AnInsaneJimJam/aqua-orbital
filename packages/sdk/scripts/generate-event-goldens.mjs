import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

// Independent cast fixtures: signatures and indexed/data placement below are
// copied from the concrete Solidity declarations, not the generated SDK ABI.
const target=resolve(dirname(fileURLToPath(import.meta.url)),'../test/fixtures/events.json');
const cast=(...args)=>execFileSync('cast',args,{encoding:'utf8'}).trim();
const address=n=>`0x${String(n).repeat(40)}`;
const hash=n=>`0x${n.repeat(32)}`;
const word=(type,value)=>cast('abi-encode',`f(${type})`,String(value));
const maker=address(1),recipient=address(2),payer=address(3),token=address(4);
const order=hash('aa'),config=hash('bb'),invoice=hash('cc'),memo=hash('dd'),route=hash('ef');
const due=(1n<<120n)+123456789n,input=(1n<<200n)+123n,received=due+77n;
const cases=[
 {exportName:'lifecycleEventsAbi',eventName:'StrategyActivated',signature:'StrategyActivated(address,bytes32,bytes32)',
  args:{maker,orderHash:order,configHash:config},topics:[word('address',maker),order,config],data:'0x'},
 {exportName:'lifecycleEventsAbi',eventName:'StrategyRetired',signature:'StrategyRetired(address,bytes32,uint64)',
  args:{maker,orderHash:order,version:((1n<<64n)-1n).toString()},topics:[word('address',maker),order],data:word('uint64',(1n<<64n)-1n)},
 {exportName:'paymentsEventsAbi',eventName:'InvoiceCreated',signature:'InvoiceCreated(bytes32,address,uint256,uint40,address[],uint16[],bytes32)',
  args:{invoiceId:invoice,merchant:maker,amountDueRaw:due.toString(),expiresAt:2**40-1,recipients:[recipient,payer],bps:[4321,5679],memoHash:memo},
  topics:[invoice,word('address',maker)],data:cast('abi-encode','f(uint256,uint40,address[],uint16[],bytes32)',due.toString(),String(2**40-1),`[${recipient},${payer}]`,'[4321,5679]',memo)},
 {exportName:'paymentsEventsAbi',eventName:'InvoicePaid',signature:'InvoicePaid(bytes32,address,address,address,uint256,uint256,uint256,bytes32)',
  args:{invoiceId:invoice,merchant:maker,payer,tokenIn:token,amountInRaw:input.toString(),receivedRaw:received.toString(),refundRaw:'77',routeHash:route},
  topics:[invoice,word('address',maker),word('address',payer)],data:cast('abi-encode','f(address,uint256,uint256,uint256,bytes32)',token,input.toString(),received.toString(),'77',route)},
 {exportName:'paymentsEventsAbi',eventName:'InvoiceCancelled',signature:'InvoiceCancelled(bytes32,address)',
  args:{invoiceId:invoice,merchant:maker},topics:[invoice,word('address',maker)],data:'0x'}
];
for(const event of cases)event.topics.unshift(cast('keccak',event.signature));
const result={generator:'scripts/generate-event-goldens.mjs; independent cast topic/ABI words, no RPC',castVersion:cast('--version'),events:cases};
await mkdir(dirname(target),{recursive:true});
await writeFile(target,JSON.stringify(result,null,2)+'\n');

// The execution event has a separate additive fixture file. These full-width
// values test ABI bytes only; they are not claimed to be executable trades.
const swapSignature='OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])';
const swapDataSignature='f(address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])';
const gross=(1n<<256n)-1n,fee=(1n<<128n)+9n,net=gross-fee,output=(1n<<240n)+123n,version=(1n<<64n)-1n;
const swapCases=[
 {name:'interior empty crossings',keys:[],inward:[]},
 {name:'full-width ordered crossings',keys:[((1n<<64n)-1n).toString(),(1n<<63n).toString(),((1n<<64n)-1n).toString()],inward:[true,false,true]}
].map(({name,keys,inward})=>({
 name,eventName:'OrbitalSwapExecuted',signature:swapSignature,
 args:{maker,orderHash:order,taker:payer,recipient,tokenInIndex:7,tokenOutIndex:0,grossInputRaw:gross.toString(),netInputRaw:net.toString(),feeRaw:fee.toString(),amountOutRaw:output.toString(),version:version.toString(),crossedTickKeys:keys,crossedInward:inward},
 topics:[cast('keccak',swapSignature),word('address',maker),order,word('address',payer)],
 data:cast('abi-encode',swapDataSignature,recipient,'7','0',gross.toString(),net.toString(),fee.toString(),output.toString(),version.toString(),`[${keys.join(',')}]`,`[${inward.join(',')}]`)
}));
await writeFile(resolve(dirname(target),'swap-events.json'),JSON.stringify({generator:'scripts/generate-event-goldens.mjs; independent cast topic/ABI words, no RPC',castVersion:cast('--version'),events:swapCases},null,2)+'\n');
