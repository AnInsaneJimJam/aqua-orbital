import {isDeepStrictEqual} from 'node:util';
import type {FastifyInstance} from 'fastify';
import {quoteRequestSchema,swapQuoteObservedSchema,swapQuoteUnavailableSchema,type DeploymentManifest} from '@orbital/shared';
import type {createReadDependencies} from './runtime.js';

/** One limiter shared by both aliases. Never evict a live IP budget to admit a
 * new IP. At most capacity entries and thirty timestamps per entry are held. */
export function createSwapQuoteLimiter(clock:()=>number=()=>performance.now(),capacity=5000){
 if(!Number.isInteger(capacity)||capacity<1||capacity>5000)throw Error('Invalid quote capacity');
 const states=new Map<string,{at:number;credit:number;times:number[]}>();let previous=0;
 return (ip:string)=>{
  const observed=clock();if(!Number.isFinite(observed)||observed<0)return {allowed:false,retryAfter:60};
  const now=Math.max(previous,observed);previous=now;
  for(const [key,state] of states){if(now-state.at<60000)break;states.delete(key);}
  let state=states.get(ip);if(!state){if(states.size>=capacity)return {allowed:false,retryAfter:60};state={at:now,credit:10000,times:[]};}
  state.credit=Math.min(10000,state.credit+now-state.at);state.at=now;state.times=state.times.filter(t=>now-t<60000);
  states.delete(ip);states.set(ip,state);
  if(state.times.length>=30||state.credit<2000)return {allowed:false,retryAfter:Math.max(1,Math.ceil(Math.max(state.times.length>=30?60000-(now-state.times[0]!):0,2000-state.credit)/1000))};
  state.credit-=2000;state.times.push(now);return {allowed:true,retryAfter:0};
 };
}
export const isSwapQuotePath=(path:string|undefined)=>path==='/quotes/swap'||path==='/api/v1/quotes/swap';
export function swapQuoteError(code:string,requestId:string,retryable=true,field:'body'|'query'|null=null){return swapQuoteUnavailableSchema.parse({schemaVersion:1,status:'unavailable',code,
 message:'A complete canonical quote observation is unavailable.',retryable,field,requestId,financialExecutionEnabled:false,canonicalVerification:'unavailable',data:null});}
export function registerSwapQuotes(app:FastifyInstance,loadManifest:()=>Promise<DeploymentManifest|null>,observe:ReturnType<typeof createReadDependencies>['observeQuote']|undefined,wallClock?:()=>number){
 const limit=createSwapQuoteLimiter();
 for(const url of ['/quotes/swap','/api/v1/quotes/swap'])app.post<{Querystring:Record<string,unknown>}>(url,{config:{rateLimit:false},onRequest:async(req,reply)=>{
  reply.header('cache-control','no-store');const allowed=limit(req.ip);if(!allowed.allowed)return reply.header('retry-after',allowed.retryAfter).code(429).send(swapQuoteError('QUOTE_RATE_LIMITED',req.id));
 }},async(req,reply)=>{
  if(Object.keys(req.query).length)return reply.code(400).send(swapQuoteError('INVALID_QUOTE_QUERY',req.id,false,'query'));
  const parsed=quoteRequestSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send(swapQuoteError('INVALID_QUOTE_REQUEST',req.id,false,'body'));
  const request={...parsed.data,wallet:parsed.data.wallet.toLowerCase(),recipient:parsed.data.recipient.toLowerCase(),tokenIn:parsed.data.tokenIn.toLowerCase(),tokenOut:parsed.data.tokenOut.toLowerCase()};
  const controller=new AbortController(),abort=()=>controller.abort(),closed=()=>{if(!reply.raw.writableEnded)abort();};
  req.raw.once('aborted',abort);reply.raw.once('close',closed);
  try{
   if(req.raw.aborted||reply.raw.destroyed)abort();
   const manifest=await loadManifest();if(!manifest?.verified)return reply.code(503).send(swapQuoteError('QUOTE_DEPLOYMENT_UNAVAILABLE',req.id));
   if(!observe)return reply.code(503).send(swapQuoteError('QUOTE_DATABASE_UNAVAILABLE',req.id));
   const result=await observe(manifest,{kind:'swap',...request},{signal:controller.signal,...(wallClock?{now:wallClock}:{})});
   if(controller.signal.aborted&&reply.raw.destroyed)return;
   if(result.status==='unavailable'){
    const status=result.code==='INVALID_QUOTE_REQUEST'?400:result.code==='QUOTE_CAPACITY'?429:result.code==='QUOTE_TIMEOUT'?504:503;
    return reply.code(status).send(swapQuoteError(result.code,req.id,status!==400,status===400?'body':null));
   }
   if(!isDeepStrictEqual(manifest,await loadManifest()))return reply.code(503).send(swapQuoteError('QUOTE_DEPLOYMENT_CHANGED',req.id));
   if(controller.signal.aborted&&reply.raw.destroyed)return;
   const wire=swapQuoteObservedSchema.safeParse({...result,requestId:req.id,request,router:manifest.router.toLowerCase(),deploymentStartBlock:manifest.startBlock});
   if(!wire.success)return reply.code(503).send(swapQuoteError('QUOTE_RESPONSE_INVALID',req.id));
   // The final file read is outside the service timer. Recheck wall freshness
   // immediately before sending, without rewriting the original observedAt.
   const now=wallClock?.()??Date.now(),timestamp=BigInt(wire.data.freshness.blockTimestamp),indexed=Date.parse(wire.data.freshness.indexedAt);
   if(!Number.isSafeInteger(now)||now<0||Date.parse(wire.data.freshness.observedAt)>now+1000||indexed>now+1000||Number(timestamp)*1000>now+1000)return reply.code(503).send(swapQuoteError('QUOTE_BLOCK_TIME_INVALID',req.id));
   if(Number(timestamp+20n)*1000<=now)return reply.code(503).send(swapQuoteError('QUOTE_EXPIRED',req.id));
   if(now-indexed>10000)return reply.code(503).send(swapQuoteError('QUOTE_INDEXER_STALE',req.id));
   return reply.code(200).send(wire.data);
  }catch{return reply.code(503).send(swapQuoteError('QUOTE_RESPONSE_UNAVAILABLE',req.id));}
  finally{req.raw.removeListener('aborted',abort);reply.raw.removeListener('close',closed);abort();}
 });
}
