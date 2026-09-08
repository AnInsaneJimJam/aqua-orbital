import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,decodeFunctionResult} from 'viem';
import {manifestSchema} from '@orbital/shared';
import {prepareStrategyProfile,configToDTO} from '../src/index';
const manifest=manifestSchema.parse(JSON.parse(await readFile('deployments/31337/manifest.json','utf8')));
const verification=JSON.parse(await readFile('deployments/31337/verification.json','utf8'));
const report=JSON.parse(await readFile(verification.reportPath+'/report.json','utf8'));
const library=report.contracts.find((c:any)=>c.fqn.endsWith(':StrategyInitializer'));
// Solidity library ABI retains the enum name; router ABI declares the same enum uint8.
const abi=JSON.parse(JSON.stringify(report.graph.nodes.find((n:any)=>n.fqn===library.fqn).abi), (key,value)=>key==='type'&&value==='OrbitalStrategyStatus'?'uint8':value);
const client=createPublicClient({transport:http(manifest.rpcUrl)});
const artifact=JSON.parse(await readFile('packages/contracts/out/StrategyInitializer.sol/StrategyInitializer.json','utf8'));
const selector=artifact.methodIdentifiers['initialize(OrbitalConfigV1,bytes32)'];
const results=[];
for(const allocation of ['10','100'])for(const preset of ['Wide','Balanced','Focused'] as const){
 const p=prepareStrategyProfile(manifest,'0x70997970c51812dc3a010c7d01b50e0d17dc79c8',0n,{allocation,preset,feePpm:500});
 const encoded=encodeFunctionData({abi,functionName:'initialize',args:[p.config,p.configHash]});
 const call=await client.call({to:library.address,data:('0x'+selector+encoded.slice(10)) as `0x${string}`});
 const initial=decodeFunctionResult({abi,functionName:'initialize',data:call.data!}) as any;
 if(initial.state.X.some((x:bigint)=>x!==p.coordinateInternal)||initial.state.principalInternal.some((x:bigint)=>x!==p.principalInternal)||initial.state.virtualInternal!==p.virtualInternal)throw Error('Initializer mismatch');
 results.push({allocation,preset,config:configToDTO(p.config),ticks:p.ticks,principalInternal:p.principalInternal,slackBoundInternal:initial.state.slackBoundInternal});
 console.log(`${allocation} ${preset}: initializer accepted, exact X/P/V match`);
}
await writeFile('.cache/profile-smoke.json',JSON.stringify({scope:'Six local initializer comparisons; not independent math or full-range release verification',library:library.address,results},(_,v)=>typeof v==='bigint'?v.toString():v,2));
