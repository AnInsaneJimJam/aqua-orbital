import {isDeepStrictEqual} from 'node:util';
import {decodeFunctionResult,encodeFunctionData,encodeFunctionResult,type Address,type Hex} from 'viem';
import {manifestSchema,quoteRequestSchema,uintSchema,uint40Schema,hashSchema,type ConfigDTO,type DeploymentManifest,type StrategyReadDTO,type StrategyFinancialDTO} from '@orbital/shared';
import {configFromDTO,buildOrder,feeIn,takerData,lifecycleAbi,routerAbi} from '@orbital/sdk';
import type {StrategyReadSnapshot,StrategyRecord} from '@orbital/db';
import {readinessDeploymentScope} from './deployment-scope.js';
import {strategyRecord,strategyFinancial} from './strategy-validation.js';
export type RoutingIntent={kind:'swap';wallet:string;recipient:string;tokenIn:string;tokenOut:string;amountInRaw:string;slippageBps:number;maxCrossings:number}|{kind:'payment';payer:string;tokenIn:string;amountInRaw:string;minimumOutRaw:string;invoiceExpiresAt:string;maxCrossings:number};
export type RoutingInput={manifest:DeploymentManifest;snapshot:StrategyReadSnapshot;intent:RoutingIntent;blockTimestamp:string};
export type StaticReadCall={id:string;method:'eth_call';params:[{from:string;to:string;data:string;value:'0x0'},{blockHash:string;requireCanonical:true}]};
export type StaticReadResult={request:StaticReadCall;status:'fulfilled';data:string}|{request:StaticReadCall;status:'rejected';reason:'revert'|'transport'|'invalid_response'};
type Diagnostic={orderHash:string;code:string};
type Counts={scanned:number;locallyAccepted:number;inspected:number;eligible:number;quoted:number;failed:number;notInspected:number};
type Candidate={record:StrategyRecord;dto:StrategyReadDTO;inputIndex:number;outputIndex:number;feeRaw:string};
type Eligible=Candidate&{financial:StrategyFinancialDTO};
type Plan={financialExecutionEnabled:false;canonicalVerification:'pending';counts:Counts;coverage:{candidateLimit:200;inspectionLimit:32;scanTruncated:boolean;scope:'bounded_registered_candidates'};diagnostics:Diagnostic[];inspectionCalls:StaticReadCall[];batches:StaticReadCall[][]};
const getters=['getStrategyConfig','getStrategyState','getStrategyAvailability'] as const;
type Getter=typeof getters[number];
const lower=(s:string)=>s.toLowerCase();
const fail=(code:string):never=>{throw Error(code);};
const batches=(calls:StaticReadCall[])=>Array.from({length:Math.ceil(calls.length/8)},(_,i)=>calls.slice(i*8,i*8+8));
export function validateRoutingIntent(manifest:DeploymentManifest,intent:RoutingIntent){
 try{
  manifest=manifestSchema.parse(manifest);if(!manifest.verified)throw Error();
  const keys=intent.kind==='swap'?['kind','wallet','recipient','tokenIn','tokenOut','amountInRaw','slippageBps','maxCrossings']:['kind','payer','tokenIn','amountInRaw','minimumOutRaw','invoiceExpiresAt','maxCrossings'];
  if(!['swap','payment'].includes(intent.kind)||Object.keys(intent).some(k=>!keys.includes(k)))throw Error();
  const raw={wallet:intent.kind==='swap'?intent.wallet:intent.payer,recipient:intent.kind==='swap'?intent.recipient:manifest.payments,tokenIn:intent.tokenIn,tokenOut:intent.kind==='swap'?intent.tokenOut:manifest.usdc,amountInRaw:intent.amountInRaw,slippageBps:intent.kind==='swap'?intent.slippageBps:0,maxCrossings:intent.maxCrossings};
  const parsed=quoteRequestSchema.parse(raw),payer=lower(parsed.wallet),caller=intent.kind==='payment'?lower(manifest.payments):payer,recipient=lower(parsed.recipient);
  if([manifest.router,manifest.aqua,manifest.payments].map(lower).includes(payer)||[manifest.router,manifest.aqua].map(lower).includes(recipient)
   ||[parsed.tokenIn,parsed.tokenOut].some(t=>!manifest.tokens.some(a=>lower(a.address)===lower(t))))throw Error();
  const minimum=intent.kind==='payment'?BigInt(uintSchema.parse(intent.minimumOutRaw)):0n;if(intent.kind==='payment'&&minimum===0n)throw Error();
  const invoiceExpiry=intent.kind==='payment'?BigInt(uint40Schema.parse(intent.invoiceExpiresAt)):null;
  return {...parsed,payer,caller,recipient,tokenIn:lower(parsed.tokenIn),tokenOut:lower(parsed.tokenOut),minimum,invoiceExpiry};
 }catch{return fail('ROUTING_INPUT_INVALID');}
}
function request(input:RoutingInput,manifest:DeploymentManifest){const r=validateRoutingIntent(manifest,input.intent);try{const timestamp=BigInt(uint40Schema.parse(input.blockTimestamp)),limit=timestamp+20n,deadline=r.invoiceExpiry!==null&&r.invoiceExpiry<limit?r.invoiceExpiry:limit;if(deadline<=timestamp||deadline>=(1n<<40n))throw Error();return {...r,deadline};}catch{return fail('ROUTING_INPUT_INVALID');}}
function call(input:RoutingInput,caller:string,id:string,data:Hex):StaticReadCall{return {id,method:'eth_call',params:[{from:caller,to:lower(input.manifest.router),data,value:'0x0'},{blockHash:lower(input.snapshot.asOf!.hash),requireCanonical:true}]};}
function setup(input:RoutingInput){
 const parsed=manifestSchema.safeParse(input.manifest);if(!parsed.success||!parsed.data.verified)return fail('ROUTING_INPUT_INVALID');
 const m=parsed.data,r=request(input,m),s=input.snapshot,scope=readinessDeploymentScope(m);
 if(s.code!=='STRATEGIES_COMPLETE'||s.chainId!==m.chainId||s.deploymentId!==scope.id||!s.asOf||!s.currentCursor||!isDeepStrictEqual(s.asOf,s.currentCursor)
  ||!uintSchema.safeParse(s.asOf.height).success||!hashSchema.safeParse(s.asOf.hash).success||!s.items||s.items.length>200||typeof s.hasMore!=='boolean')return fail('CANDIDATE_SOURCE_INVALID');
 const c=s.coverage,pin=BigInt(s.asOf.height),start=BigInt(m.startBlock);
 if(pin<start||c.fromBlock!==m.startBlock||c.toBlock!==s.asOf.height||c.expectedBlocks!==(pin-start+1n).toString()||c.canonicalBlocks!==c.expectedBlocks||c.coveredBlocks!==c.expectedBlocks)return fail('CANDIDATE_SOURCE_INVALID');
 if(new Set(s.items.map(item=>lower(item.orderHash))).size!==s.items.length)return fail('CANDIDATE_SOURCE_INVALID');
 const diagnostics:Diagnostic[]=[],accepted:Candidate[]=[];
 for(const record of s.items){
  let dto:StrategyReadDTO;try{dto=strategyRecord(record,m,s.asOf);}catch{diagnostics.push({orderHash:record.orderHash,code:'INVALID_CONFIGURATION'});continue;}
  const config=configFromDTO(dto.config),i=config.tokens.findIndex(t=>lower(t)===r.tokenIn),j=config.tokens.findIndex(t=>lower(t)===r.tokenOut);
  let code:string|undefined;
  if(dto.lifecycle!=='active')code='NOT_ACTIVE';
  else if([r.payer,r.caller,r.recipient,lower(m.router),lower(m.aqua)].includes(lower(dto.maker)))code='SETTLEMENT_ROLE_CONFLICT';
  else if(i<0||j<0||i===j)code='PAIR_UNSUPPORTED';
  else if(BigInt(r.amountInRaw)*10n**BigInt(18-config.decimals[i]!)*(1n<<64n)>=(1n<<160n)||feeIn(BigInt(r.amountInRaw),config.feePpm)>=BigInt(r.amountInRaw))code='INPUT_RANGE_UNSUPPORTED';
  if(code){diagnostics.push({orderHash:dto.orderHash,code});continue;}
  accepted.push({record,dto,inputIndex:i,outputIndex:j,feeRaw:feeIn(BigInt(r.amountInRaw),config.feePpm).toString()});
 }
 accepted.sort((a,b)=>{const x=a.dto.updated,y=b.dto.updated;return BigInt(x.blockNumber)!==BigInt(y.blockNumber)?BigInt(x.blockNumber)>BigInt(y.blockNumber)?-1:1:x.logIndex!==y.logIndex?y.logIndex-x.logIndex:a.dto.config.feePpm!==b.dto.config.feePpm?a.dto.config.feePpm-b.dto.config.feePpm:lower(a.dto.orderHash).localeCompare(lower(b.dto.orderHash));});
 const candidates=accepted.slice(0,32);for(const skipped of accepted.slice(32))diagnostics.push({orderHash:skipped.dto.orderHash,code:'NOT_INSPECTED_CAP'});
 const inspectionCalls=candidates.flatMap(c=>getters.map(name=>call(input,r.caller,`${c.dto.orderHash}:${name}`,encodeFunctionData({abi:lifecycleAbi,functionName:name,args:[c.dto.orderHash as Hex]}))));
 const plan:Plan={financialExecutionEnabled:false,canonicalVerification:'pending',counts:{scanned:s.items.length,locallyAccepted:accepted.length,inspected:candidates.length,eligible:0,quoted:0,failed:diagnostics.length-(accepted.length-candidates.length),notInspected:accepted.length-candidates.length},coverage:{candidateLimit:200,inspectionLimit:32,scanTruncated:s.hasMore,scope:'bounded_registered_candidates'},diagnostics,inspectionCalls,batches:batches(inspectionCalls)};
 return {m,r,candidates,plan};
}
function results(expected:StaticReadCall[],observed:StaticReadResult[]){
 if(!Array.isArray(observed)||observed.length>expected.length)return fail('OBSERVATION_SET_INVALID');
 const calls=new Map(expected.map(c=>[c.id,c])),mapped=new Map<string,StaticReadResult>();
 for(const result of observed){const id=result?.request?.id,match=calls.get(id);
  if(!match||mapped.has(id)||!isDeepStrictEqual(match,result.request)||!['fulfilled','rejected'].includes(result.status)
   ||(result.status==='fulfilled'?(Object.keys(result).sort().join()!=='data,request,status'||typeof result.data!=='string'||result.data.length>524290):Object.keys(result).sort().join()!=='reason,request,status'||!['revert','transport','invalid_response'].includes(result.reason)))return fail('OBSERVATION_SET_INVALID');
  mapped.set(id,result);
 }
 return mapped;
}
function decodeGetter(name:Getter,data:string){const value=decodeFunctionResult({abi:lifecycleAbi,functionName:name,data:data as Hex});if(encodeFunctionResult({abi:lifecycleAbi,functionName:name,result:value} as never).toLowerCase()!==lower(data))throw Error();return value;}
function inspected(input:RoutingInput,observations:StaticReadResult[]){
 const prepared=setup(input),{plan,r}=prepared,mapped=results(plan.inspectionCalls,observations),eligible:Eligible[]=[],quoteCalls:StaticReadCall[]=[];
 for(const c of prepared.candidates){let code:string|undefined,financial:StrategyFinancialDTO|undefined;
  const values=getters.map(name=>mapped.get(`${c.dto.orderHash}:${name}`));
  if(values.some(v=>!v))code='INSPECTION_MISSING';else if(values.some(v=>v!.status==='rejected'))code='INSPECTION_FAILED';
  else try{const raw=values.map((v,i)=>decodeGetter(getters[i]!,v!.status==='fulfilled'?v!.data:''));financial=strategyFinancial(c.record,c.dto,{config:raw[0],state:raw[1],availability:raw[2]});
   if(financial.availability.some(a=>!a.live||!a.backingValid)||BigInt(financial.availability[c.outputIndex]!.fundingCeilingRaw)===0n)code='OUTPUT_UNAVAILABLE';
  }catch{code='INSPECTION_DATA_INVALID';}
  if(code){plan.diagnostics.push({orderHash:c.dto.orderHash,code});plan.counts.failed++;continue;}
  eligible.push({...c,financial:financial!});const config=configFromDTO(c.dto.config),data=takerData({taker:r.caller as Address,recipient:r.recipient as Address,minimum:r.minimum,deadline:r.deadline,input:c.inputIndex,output:c.outputIndex,maxCrossings:r.maxCrossings});
  quoteCalls.push(call(input,r.caller,`${c.dto.orderHash}:quote`,encodeFunctionData({abi:routerAbi,functionName:'quote',args:[buildOrder(config),BigInt(r.amountInRaw),data]})));
 }
 plan.counts.eligible=eligible.length;
 return {...prepared,eligible,quoteCalls};
}
/** Pure structural preparation only. A trusted transport must execute these
 * independent reads and verify the canonical database/RPC scope before any API
 * quote can be enabled. A result object is never a trusted witness or reservation. */
export function prepareRouting(input:RoutingInput):Plan{return setup(input).plan;}
export function prepareWholeSizeQuotes(input:RoutingInput,observations:StaticReadResult[]){const p=inspected(input,observations);return {...p.plan,quoteCalls:p.quoteCalls,quoteBatches:batches(p.quoteCalls)};}
export function selectWholeSizeQuotes(input:RoutingInput,observations:StaticReadResult[],quotes:StaticReadResult[]){
 const p=inspected(input,observations),mapped=results(p.quoteCalls,quotes),routes:{kind:'swap'|'payment';payer:string;orderHash:string;configHash:string;config:ConfigDTO;stateVersion:string;caller:string;recipient:string;tokenIn:string;tokenOut:string;amountInRaw:string;amountOutRaw:string;feeRaw:string;feePpm:number;minimumOutRaw:string;expiresAt:string;maxCrossings:number}[]=[];
 for(const c of p.eligible){const value=mapped.get(`${c.dto.orderHash}:quote`);let code:string|undefined,out=0n;
  if(!value)code='QUOTE_MISSING';else if(value.status==='rejected')code=value.reason==='revert'?'QUOTE_REVERTED':'QUOTE_FAILED';
  else try{const decoded=decodeFunctionResult({abi:routerAbi,functionName:'quote',data:value.data as Hex});
   if(encodeFunctionResult({abi:routerAbi,functionName:'quote',result:decoded}).toLowerCase()!==lower(value.data)||lower(decoded[2])!==lower(c.dto.orderHash))throw Error();
   if(decoded[0]!==BigInt(p.r.amountInRaw))code='PARTIAL_FILL';else if(decoded[1]===0n||decoded[1]<p.r.minimum)code='MINIMUM_NOT_MET';else if(decoded[1]>BigInt(c.financial.availability[c.outputIndex]!.fundingCeilingRaw))code='OUTPUT_UNAVAILABLE';else out=decoded[1];
  }catch{code='QUOTE_DATA_INVALID';}
  if(code){p.plan.counts.failed++;p.plan.diagnostics.push({orderHash:c.dto.orderHash,code});continue;}
  let minimum=input.intent.kind==='payment'?p.r.minimum:out*BigInt(10000-p.r.slippageBps)/10000n;if(minimum===0n)minimum=1n;
  routes.push({kind:input.intent.kind,payer:p.r.payer,orderHash:c.dto.orderHash,configHash:c.dto.configHash,config:c.dto.config,stateVersion:c.dto.version,caller:p.r.caller,recipient:p.r.recipient,tokenIn:p.r.tokenIn,tokenOut:p.r.tokenOut,amountInRaw:p.r.amountInRaw,amountOutRaw:out.toString(),feeRaw:c.feeRaw,feePpm:c.dto.config.feePpm,minimumOutRaw:minimum.toString(),expiresAt:p.r.deadline.toString(),maxCrossings:p.r.maxCrossings});p.plan.diagnostics.push({orderHash:c.dto.orderHash,code:'QUOTED'});
 }
 routes.sort((a,b)=>BigInt(a.amountOutRaw)!==BigInt(b.amountOutRaw)?BigInt(a.amountOutRaw)>BigInt(b.amountOutRaw)?-1:1:a.feePpm!==b.feePpm?a.feePpm-b.feePpm:lower(a.orderHash).localeCompare(lower(b.orderHash)));
 p.plan.counts.quoted=routes.length;
 return {financialExecutionEnabled:false as const,canonicalVerification:'pending' as const,counts:p.plan.counts,coverage:p.plan.coverage,diagnostics:p.plan.diagnostics,asOf:input.snapshot.asOf,best:routes[0]??null,alternatives:routes.slice(1,4)};
}
