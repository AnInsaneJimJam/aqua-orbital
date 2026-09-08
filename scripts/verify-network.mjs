import {mkdir,writeFile} from 'node:fs/promises';
const rpc = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const aqua = '0x1111113ccf1426a8e30e2bff5e005d929bf6a90a';
const usdc = '0x3600000000000000000000000000000000000000';
const evidence = {checkedAt:new Date().toISOString(),status:'unverified',chainId:5042002,observations:{},missing:['Official chain-specific Aqua deployment/source identity','Custom router deployment and immutable AQUA binding','USDC system identity and EVM compatibility']};
let id=0;
async function request(method,params=[]){
  const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body=await response.json(); if(body.error) throw new Error(`RPC ${body.error.code}: ${body.error.message}`); return body.result;
}
try {
  const chain=await request('eth_chainId');
  if(BigInt(chain)!==5042002n) throw new Error('Wrong chain ID');
  const block=await request('eth_getBlockByNumber',['latest',false]);
  evidence.observations={chainId:chain,blockNumber:block.number,blockHash:block.hash,aquaCode:await request('eth_getCode',[aqua,block.number]),usdcDecimals:await request('eth_call',[{to:usdc,data:'0x313ce567'},block.number])};
}catch(error){ evidence.error=error.message; }
await mkdir('deployments/5042002',{recursive:true});
await writeFile('deployments/5042002/verification.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exitCode=1; // Observations alone never establish deployment identity.
