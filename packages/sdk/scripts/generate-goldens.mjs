import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const target=resolve(dirname(fileURLToPath(import.meta.url)),'../test/fixtures/canonical.json');
const cast=(...args)=>execFileSync('cast',args,{encoding:'utf8'}).trim();
const a=n=>`0x${n.toString(16).padStart(40,'0')}`;
const radius=10n**18n*(1n<<64n),full=(1n<<64n)-1n;
const tuple=`(1,31337,${a(11)},${a(20)},0,[${a(1)},${a(2)}],[6,18],[${full}],[${radius}],500,[1000000,1000000000000000000])`;
const config=cast('abi-encode','f((uint8,uint256,address,address,uint64,address[],uint8[],uint64[],uint192[],uint24,uint256[]))',tuple);
const configHash=cast('keccak',config);
const program=`0x7220${configHash.slice(2)}5220${configHash.slice(2)}`;
// These constants are fixed by MakerTraitsLib.build and its existing Solidity golden.
const traits=(1n<<254n)|(0x0028002800280028n<<160n);
const data=`${a(1)}${a(2).slice(2)}${program.slice(2)}`;
const order=cast('abi-encode','f((address,uint256,bytes))',`(${a(20)},${traits},${data})`);
const invoice=cast('abi-encode','f(uint256,address,address,uint64)','31337',a(12),a(21),'3');
const result={generator:'cast 1.5.1; scripts/generate-goldens.mjs',castVersion:cast('--version'),config,configHash,program,order,orderHash:cast('keccak',order),invoiceEncoding:invoice,invoiceId:cast('keccak',invoice)};
await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(result,null,2)+'\n');
