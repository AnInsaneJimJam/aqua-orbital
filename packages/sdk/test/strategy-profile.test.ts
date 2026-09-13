import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,type Address} from 'viem';
import type {DeploymentManifest} from '@orbital/shared';
import legacy from '../../../test/evidence/local-integration/profile-initializer.json' with {type:'json'};
import {prepareStrategyProfile,configToDTO,configFromDTO,hashConfig,hashOrder,buildShipTx,buildActivateTx,buildMakerApprovalTx,aquaAbi,lifecycleAbi,strategyPresets} from '../src/index';
const a=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const maker=a(20);
const tokens=[6,6,18,8,12,0,1,18].map((decimals,i)=>({address:a(i+1),symbol:['USDC','oUSD6','oUSD18'][i]??`TEST${i}`,decimals,mock:true}));
const manifest:DeploymentManifest={chainId:31337,rpcUrl:'http://127.0.0.1:8545',explorerUrl:'http://localhost:8545',verified:true,aqua:a(11),router:a(12),payments:a(13),usdc:a(1),startBlock:'1',tokens};

test('selected baskets support every size from two through eight and canonical token ordering',()=>{
 for(let n=2;n<=8;n++)for(const allocation of ['10','100','1000000'])for(const preset of ['Wide','Balanced','Focused'] as const){
  const selected=tokens.slice(0,n).map(t=>t.address).reverse();
  const p=prepareStrategyProfile(manifest,maker,0n,{allocation,preset,feePpm:500,tokens:selected});
  assert.deepEqual(p.config.tokens,tokens.slice(0,n).map(t=>t.address));
  assert.equal(p.config.initialAmountsRaw.length,n);
  assert.ok(p.principalInternal>0n);
  for(let i=0;i<n;i++){
   const scale=10n**BigInt(18-p.config.decimals[i]!)*(1n<<64n);
   assert.equal(p.config.initialAmountsRaw[i],(p.principalInternal+scale-1n)/scale);
   assert.ok(p.config.initialAmountsRaw[i]!<=BigInt(allocation)*10n**BigInt(tokens[i]!.decimals));
  }
  assert.equal(p.ticks.length,3);
  assert.equal(p.ticks.reduce((sum,t)=>sum+t.share,0),100);
 }
});

test('every deployed pair binds only the selected assets into publication and restored drafts',()=>{
 for(const pair of [[tokens[0]!,tokens[1]!],[tokens[0]!,tokens[2]!],[tokens[1]!,tokens[2]!]]){
  const profile={allocation:'10',preset:'Balanced',feePpm:500,tokens:pair.map(t=>t.address)} as const;
  const p=prepareStrategyProfile(manifest,maker,0n,profile),input={config:p.config,order:p.order};
  const context={manifest,chainId:31337,account:maker,now:1n};
  const shipped=decodeFunctionData({abi:aquaAbi,data:buildShipTx(context,input).data});
  assert.equal(shipped.functionName,'ship');
  assert.deepEqual(shipped.args?.[2],p.config.tokens);
  const activated=decodeFunctionData({abi:lifecycleAbi,data:buildActivateTx(context,input).data});
  assert.equal(activated.functionName,'activateStrategy');
  const omitted=tokens.find(t=>!pair.includes(t))!;
  assert.throws(()=>buildMakerApprovalTx(context,{...input,token:omitted.address,reset:false}));
  const saved=JSON.parse(JSON.stringify({profile,config:configToDTO(p.config)}));
  const restored=prepareStrategyProfile(manifest,maker,0n,saved.profile);
  assert.equal(restored.configHash,hashConfig(configFromDTO(saved.config)));
  assert.equal(restored.orderHash,hashOrder(p.order));
 }
});

test('legacy three-token profiles retain their recorded geometry, amounts, and hashes',()=>{
 for(const row of legacy.results){
  const preset=row.preset as keyof typeof strategyPresets;
  const profile={allocation:row.allocation,preset,feePpm:500} as const;
  const old=prepareStrategyProfile(manifest,maker,0n,profile);
  const explicit=prepareStrategyProfile(manifest,maker,0n,{...profile,tokens:tokens.slice(0,3).map(t=>t.address)});
  assert.equal(old.configHash,explicit.configHash);
  assert.equal(old.orderHash,explicit.orderHash);
  assert.deepEqual(old.config.tickKeys.map(String),row.config.tickKeys);
  assert.deepEqual(old.config.radiiInternal.map(String),row.config.radiiInternal);
  assert.equal(old.principalInternal.toString(),row.principalInternal);
  // Recorded fixture uses a different address order; compare by token precision.
  for(let i=0;i<old.config.decimals.length;i++)assert.equal(old.config.initialAmountsRaw[i]!.toString(),row.config.initialAmountsRaw[row.config.decimals.indexOf(old.config.decimals[i]!)]);
 }
});

test('invalid or unsupported selections cannot produce a strategy',()=>{
 const profile={allocation:'10',preset:'Balanced',feePpm:500} as const;
 for(const selected of [[],[a(1)],[a(1),a(1)],[a(1),a(99)],tokens.map(t=>t.address).concat(a(99))])assert.throws(()=>prepareStrategyProfile(manifest,maker,0n,{...profile,tokens:selected}));
 for(const selected of [null,'USDC',[null,a(1)]])assert.throws(()=>prepareStrategyProfile(manifest,maker,0n,{...profile,...JSON.parse(JSON.stringify({tokens:selected}))}));
 assert.throws(()=>prepareStrategyProfile({...manifest,verified:false},maker,0n,{...profile,tokens:[a(1),a(2)]}));
});
