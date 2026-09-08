import {readFile,writeFile} from 'node:fs/promises';
import {manifestSchema} from '@orbital/shared';
import {decodeStrategyDetail,decodeInvoiceDetail,decodeSwapQuoteObservation} from '../src/index';
const manifest=manifestSchema.parse(JSON.parse(await readFile('deployments/31337/manifest.json','utf8'))),seed=JSON.parse(await readFile('.cache/local-demo/seed.json','utf8'));
if(manifest.chainId!==31337||!manifest.verified||JSON.stringify(seed.manifest)!==JSON.stringify(manifest))throw Error('Prepare the matching persistent local demo first');
const base='http://127.0.0.1:3001',app='http://127.0.0.1:3000';
async function get(path:string){const response=await fetch(base+path,{signal:AbortSignal.timeout(15000)});return {status:response.status,data:await response.json()};}
const deployed=await get('/deployment');if(JSON.stringify(deployed.data)!==JSON.stringify(manifest))throw Error('API uses another deployment');
const strategies=[];
for(const s of seed.strategies){const response=await get(`/strategies/${s.hash}`),v=decodeStrategyDetail(response.data,response.status,manifest,s.hash);if(!v.data.strategy)throw Error('Seed strategy not indexed');strategies.push({hash:s.hash,href:`${app}/liquidity/${s.hash}`,lifecycle:v.data.strategy.lifecycle,version:v.data.strategy.version});}
const i=seed.invoices[0],response=await get(`/invoices/${i.id}`),invoice=decodeInvoiceDetail(response.data,response.status,manifest,i.id).data.invoice;
if(!invoice)throw Error('Seed invoice not indexed');
const result={schemaVersion:1,observedAt:new Date().toISOString(),scope:'persistent-local-integration',app,strategies,invoice:{href:`${app}/pay/${i.id}`,status:invoice.status,amountDueRaw:invoice.amountDueRaw,payment:invoice.payment,receipt:invoice.updated},metrics:await get('/metrics'),
 steps:['Connect the local wallet (funded taker by default).','Swap 1 USDC to oUSD6, reviewing exact approval and swap separately.','Use the wallet control to select the merchant and create a fresh 5 USDC invoice.','Switch to the taker and pay that invoice with oUSD6, reviewing adapter approval and payment separately.','Publish liquidity, reload after shipping, then activate; manage it through retire and dock reviews.'],
 qualifications:{privy:'unverified',arc:'unverified',release:'deferred'},source:'.cache/local-demo/seed.json'};
await writeFile('.cache/local-demo/judge.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'local-data-connected',app,strategies,invoice:result.invoice,guide:'.cache/local-demo/judge.json'},null,2));
