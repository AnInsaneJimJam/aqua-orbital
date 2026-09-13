// Read-only comparisons against the deployed initializer. Extra assets below
// are synthetic inputs to a pure library call, not deployable Arc strategies.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,decodeFunctionResult,type Address,type Hex} from 'viem';
import {manifestSchema} from '@orbital/shared';
import {prepareStrategyProfile,configToDTO} from '../src/index';
const manifest=manifestSchema.parse(JSON.parse(await readFile('deployments/5042002/manifest.json','utf8')));
const plan=JSON.parse(await readFile('deployments/5042002/plans/self-deployment.json','utf8'));
const library=plan.steps.find((s:{label:string})=>s.label==='StrategyInitializer');
const artifact=JSON.parse(await readFile('packages/contracts/out/StrategyInitializer.sol/StrategyInitializer.json','utf8'));
const abi=JSON.parse(JSON.stringify(artifact.abi),(key,value)=>key==='type'&&value==='OrbitalStrategyStatus'?'uint8':value);
const selector=artifact.methodIdentifiers['initialize(OrbitalConfigV1,bytes32)'];
const rpc=process.env.ORBITAL_PROFILE_RPC??'https://rpc.blockdaemon.testnet.arc.io';
const client=createPublicClient({transport:http(rpc,{timeout:20000,retryCount:1})});
assert.equal(await client.getChainId(),manifest.chainId);
const block=await client.getBlock();
assert.ok((await client.getCode({address:library.address,blockNumber:block.number}))?.length!>2);
const assets=[...manifest.tokens];
for(let i=assets.length;i<8;i++)assets.push({address:`0x${(100+i).toString(16).padStart(40,'0')}`,symbol:`FIXTURE${i}`,decimals:[8,12,0,1,18][i-3]!,mock:true});
const expanded=manifestSchema.parse({...manifest,tokens:assets});
const baskets=[...manifest.tokens.flatMap((a,i)=>manifest.tokens.slice(i+1).map(b=>[a.address,b.address])),...Array.from({length:6},(_,i)=>assets.slice(0,i+3).map(t=>t.address))];
const cases=baskets.flatMap(tokens=>['10','100','1000000'].flatMap(allocation=>(['Wide','Balanced','Focused'] as const).map(preset=>({tokens,allocation,preset}))));
const results=[];
for(let offset=0;offset<cases.length;offset+=4){
 const batch=await Promise.all(cases.slice(offset,offset+4).map(async ({tokens,allocation,preset})=>{
  const p=prepareStrategyProfile(expanded,plan.deployer,0n,{allocation,preset,feePpm:500,tokens:tokens as Address[]});
  const encoded=encodeFunctionData({abi,functionName:'initialize',args:[p.config,p.configHash]});
  const call=await client.call({to:library.address,data:('0x'+selector+encoded.slice(10)) as Hex,blockNumber:block.number});
  const initial=decodeFunctionResult({abi,functionName:'initialize',data:call.data!}) as {state:{X:bigint[];principalInternal:bigint[];virtualInternal:bigint;slackBoundInternal:bigint}};
  assert.equal(initial.state.X.length,tokens.length);
  assert.ok(initial.state.X.every(x=>x===p.coordinateInternal));
  assert.ok(initial.state.principalInternal.every(x=>x===p.principalInternal));
  assert.equal(initial.state.virtualInternal,p.virtualInternal);
  return {allocation,preset,config:configToDTO(p.config),ticks:p.ticks,principalInternal:p.principalInternal,slackBoundInternal:initial.state.slackBoundInternal};
 }));
 results.push(...batch);
}
const output='test/evidence/selected-token-profiles';await mkdir(output,{recursive:true});
await writeFile(`${output}/initializer.json`,JSON.stringify({scope:'81 pure initializer comparisons: all three current pairs, basket sizes 3–8, three presets, allocations 10/100/1000000. Synthetic extra tokens test arithmetic only; no transactions or additional Arc assets.',library:library.address,chainId:manifest.chainId,blockNumber:block.number,blockHash:block.hash,results},(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(`${results.length} profiles accepted by the existing initializer; exact SDK/contract X, principal, and virtual reserves match.`);
