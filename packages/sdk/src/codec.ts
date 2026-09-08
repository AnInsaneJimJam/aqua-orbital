import {concatHex,toHex,isAddress,encodeAbiParameters,keccak256,encodeFunctionData,erc20Abi, type Address,type Hex} from 'viem';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import {paymentsAbi} from './generated/abi';
export {routerAbi} from './generated/abi';
const MAX=(1n<<256n)-1n;
function decimals(d:number){if(!Number.isInteger(d)||d<0||d>18)throw Error('Unsupported decimals');}
function uint(v:bigint,max=MAX){if(typeof v!=='bigint'||v<0n||v>max)throw Error('Amount outside supported range');return v;}
export function parseAmount(value:string,d:number):bigint {
 decimals(d);if(value.length>100 || !/^[0-9]+(?:\.[0-9]+)?$/.test(value))throw Error('Enter a decimal amount');
 const [whole,fraction='']=value.split('.');if(fraction.length>d)throw Error(`Use at most ${d} decimal places`);
 return uint(BigInt(whole!)*10n**BigInt(d)+BigInt(fraction.padEnd(d,'0')||'0'));
}
export function formatAmount(value:bigint,d:number):string {
 decimals(d);uint(value);if(!d)return value.toString();
 const s=value.toString().padStart(d+1,'0');const fraction=s.slice(-d).replace(/0+$/,'');
 return s.slice(0,-d)+(fraction?'.'+fraction:'');
}
export function feeIn(gross:bigint,ppm:number):bigint {
 uint(gross);if(![100,500,1000].includes(ppm))throw Error('Unsupported fee');
 return (gross*BigInt(ppm)+999999n)/1000000n;
}
export function program(hash:Hex):Hex {
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Invalid config hash');
 return concatHex(['0x7220',hash,'0x5220',hash]);
}
export function instructionsArgs(input:number,output:number,max=16):Hex {
 if(![input,output,max].every(Number.isInteger)||input<0||input>=8||output<0||output>=8||input===output||max<0||max>16)throw Error('Invalid pair or crossing bound');
 return toHex(new Uint8Array([1,input,output,max]));
}
export function takerData(args:{taker:Address;recipient:Address;minimum:bigint;deadline:bigint;input:number;output:number;maxCrossings?:number}):Hex {
 if(!isAddress(args.taker)||!isAddress(args.recipient)||BigInt(args.recipient)===0n)throw Error('Invalid recipient');
 uint(args.minimum);uint(args.deadline,(1n<<40n)-1n);if(args.deadline===0n)throw Error('Deadline required');
 const recipient=args.recipient.toLowerCase()===args.taker.toLowerCase()?'0x':args.recipient;
 const i0=32,i1=i0+(recipient==='0x'?0:20),i2=i1+5;
 const indices=[i0,i1,i2,i2,i2,i2,i2,i2,i2,i2+4].reverse();
 return concatHex([...indices.map(i=>toHex(i,{size:2})), '0x00e1',toHex(args.minimum,{size:32}),recipient as Hex,toHex(args.deadline,{size:5}),instructionsArgs(args.input,args.output,args.maxCrossings)]);
}
export const configComponents=[{name:'schemaVersion',type:'uint8'},{name:'chainId',type:'uint256'},{name:'router',type:'address'},{name:'maker',type:'address'},{name:'makerNonce',type:'uint64'},{name:'tokens',type:'address[]'},{name:'decimals',type:'uint8[]'},{name:'tickKeys',type:'uint64[]'},{name:'radiiInternal',type:'uint192[]'},{name:'feePpm',type:'uint24'},{name:'initialAmountsRaw',type:'uint256[]'}] as const;
export type Config={schemaVersion:1;chainId:bigint;router:Address;maker:Address;makerNonce:bigint;tokens:Address[];decimals:number[];tickKeys:bigint[];radiiInternal:bigint[];feePpm:number;initialAmountsRaw:bigint[]};
export type Order={maker:Address;traits:bigint;data:Hex};
export const orderComponents=[{name:'maker',type:'address'},{name:'traits',type:'uint256'},{name:'data',type:'bytes'}] as const;
export function validateConfig(c:Config){
 const n=c.tokens.length,t=c.tickKeys.length;
 if(c.schemaVersion!==1||c.chainId<=0n||!isAddress(c.maker)||BigInt(c.maker)===0n||!isAddress(c.router)||BigInt(c.router)===0n||n<2||n>8||t<1||t>8||c.decimals.length!==n||c.initialAmountsRaw.length!==n||c.radiiInternal.length!==t)throw Error('Invalid configuration shape');
 uint(c.chainId);uint(c.makerNonce,(1n<<64n)-1n);feeIn(0n,c.feePpm);
 c.tokens.forEach((a,i)=>{if(!isAddress(a)||BigInt(a)===0n||(i>0&&BigInt(a)<=BigInt(c.tokens[i-1]!)))throw Error('Tokens must be strictly sorted');decimals(c.decimals[i]!);if(uint(c.initialAmountsRaw[i]!)===0n)throw Error('Funding required');});
 if(c.tickKeys[t-1]!==((1n<<64n)-1n))throw Error('Full-range tick required');
 c.tickKeys.forEach((key,i)=>{if(i<t-1){if(i>0&&key<=c.tickKeys[i-1]!)throw Error('Tick ordering');const grid=1n<<32n,d=BigInt(n)*grid-key;if(key<0n||key>=BigInt(n-1)*grid||d*d>=BigInt(n)*grid*grid||(BigInt(n)*grid*grid-d*d)*grid<BigInt(n)*grid*grid)throw Error('Invalid cap');}});
 c.tickKeys.forEach(key=>uint(key,(1n<<64n)-1n));
 if(c.radiiInternal.some(r=>uint(r,(1n<<192n)-1n)<10n**12n*(1n<<64n))||c.radiiInternal.reduce((a,b)=>a+b,0n)>=(1n<<160n))throw Error('Radius range');
 if(c.initialAmountsRaw.some((r,i)=>r*10n**BigInt(18-c.decimals[i]!)*(1n<<64n)>=(1n<<160n)))throw Error('Normalized funding range');
}
export function hashConfig(c:Config):Hex{validateConfig(c);return keccak256(encodeAbiParameters([{type:'tuple',components:configComponents}],[c]));}
export function buildOrder(c:Config):Order {
 const hash=hashConfig(c);const indices=0x0028002800280028n;
 return {maker:c.maker,traits:(1n<<254n)|(indices<<160n),data:concatHex([c.tokens[0]!,c.tokens[1]!,program(hash)])};
}
export function encodeOrder(order:Order):Hex{return encodeAbiParameters([{type:'tuple',components:orderComponents}],[order]);}
export function hashOrder(order:Order):Hex{return keccak256(encodeOrder(order));}
export type TransactionPlan={chainId:number;account:Address;to:Address;data:Hex;value:0n;label:string};
export function approvalPlan(manifest:DeploymentManifest,account:Address,token:Address,spender:Address,amount:bigint):TransactionPlan{
 manifest=manifestSchema.parse(manifest);
 if(!manifest.verified)throw Error('Deployment is not verified');
 if(![31337,5042002].includes(manifest.chainId))throw Error('Unsupported network');
 if(!isAddress(account)||BigInt(account)===0n)throw Error('Invalid account');
 if(!manifest.tokens.some(t=>t.address.toLowerCase()===token.toLowerCase())||![manifest.aqua,manifest.router,manifest.payments].some(a=>a.toLowerCase()===spender.toLowerCase()))throw Error('Unknown token or spender');
 return {chainId:manifest.chainId,account,to:token,value:0n,label:'Approve reviewed amount',data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[spender,uint(amount)]})};
}
/** Compatibility export; sourced from the current OrbitalPayments build. */
export const directPaymentAbi=paymentsAbi;
