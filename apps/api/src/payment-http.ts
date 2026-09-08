import {isDeepStrictEqual} from 'node:util';
import type {FastifyInstance} from 'fastify';
import {paymentQuoteRequestSchema,paymentQuoteUnavailableSchema,type DeploymentManifest} from '@orbital/shared';
import {decodePaymentQuoteObservation} from '@orbital/sdk';
import type {createReadDependencies} from './runtime.js';
import {createSwapQuoteLimiter} from './quote-http.js';
export const isPaymentQuotePath=(path:string|undefined)=>path==='/quotes/payment'||path==='/api/v1/quotes/payment';
export function paymentQuoteError(code:string,requestId:string,retryable=true,field:'body'|'query'|null=null){return paymentQuoteUnavailableSchema.parse({schemaVersion:1,status:'unavailable',code,
 message:'A complete canonical payment observation is unavailable.',retryable,field,requestId,financialExecutionEnabled:false,paymentEligibilityVerified:false,canonicalVerification:'unavailable',data:null});}
/** Public observations contain unsigned review plans only. All aliases share the
 * supplied IP budget, and one deadline includes discovery and final validation. */
export function registerPaymentQuotes(app:FastifyInstance,loadManifest:()=>Promise<DeploymentManifest|null>,observe:ReturnType<typeof createReadDependencies>['observePaymentQuote']|undefined,wallClock?:()=>number,limit=createSwapQuoteLimiter()){
 for(const url of ['/quotes/payment','/api/v1/quotes/payment'])app.post<{Querystring:Record<string,unknown>}>(url,{config:{rateLimit:false},onRequest:async(req,reply)=>{
  reply.header('cache-control','no-store');const allowed=limit(req.ip);if(!allowed.allowed)return reply.header('retry-after',allowed.retryAfter).code(429).send(paymentQuoteError('PAYMENT_RATE_LIMITED',req.id));
 }},async(req,reply)=>{
  if(Object.keys(req.query).length)return reply.code(400).send(paymentQuoteError('INVALID_PAYMENT_QUERY',req.id,false,'query'));
  const parsed=paymentQuoteRequestSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send(paymentQuoteError('INVALID_PAYMENT_REQUEST',req.id,false,'body'));
  const request={...parsed.data,invoiceId:parsed.data.invoiceId.toLowerCase(),payer:parsed.data.payer.toLowerCase(),tokenIn:parsed.data.tokenIn.toLowerCase()};
  const started=performance.now(),controller=new AbortController(),abort=()=>controller.abort(),closed=()=>{if(!reply.raw.writableEnded)abort();};
  const timer=setTimeout(abort,20000);req.raw.once('aborted',abort);reply.raw.once('close',closed);
  const remaining=()=>Math.floor(20000-(performance.now()-started));
  const checkpoint=()=>{if(controller.signal.aborted||remaining()<=0)throw Error('PAYMENT_HTTP_TIMEOUT');};
  async function bounded<T>(operation:()=>Promise<T>):Promise<T>{
   checkpoint();let stop:(()=>void)|undefined;
   try{const result=await Promise.race([operation(),new Promise<never>((_,reject)=>{stop=()=>reject(Error('PAYMENT_HTTP_TIMEOUT'));controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)stop();})]);checkpoint();return result;}
   finally{if(stop)controller.signal.removeEventListener('abort',stop);}
  }
  try{
   if(req.raw.aborted||reply.raw.destroyed)abort();
   const manifest=structuredClone(await bounded(loadManifest));if(!manifest?.verified)return reply.code(503).send(paymentQuoteError('PAYMENT_DEPLOYMENT_UNAVAILABLE',req.id));
   if(!observe)return reply.code(503).send(paymentQuoteError('PAYMENT_DATABASE_UNAVAILABLE',req.id));
   const result=await bounded(()=>observe(manifest,request,{signal:controller.signal,timeoutMs:remaining(),...(wallClock?{now:wallClock}:{})}));
   if(result.canonicalVerification==='unavailable'){
    const status=result.httpStatus;if(![400,409,422,429,503,504].includes(status))throw Error('PAYMENT_RESPONSE_INVALID');
    return reply.code(status).send(paymentQuoteError(result.code,req.id,status>=429,status===400?'body':null));
   }
   if(!isDeepStrictEqual(manifest,await bounded(loadManifest)))return reply.code(503).send(paymentQuoteError('PAYMENT_DEPLOYMENT_CHANGED',req.id));
   const {httpStatus,...body}=result;
   const wire=decodePaymentQuoteObservation({...body,requestId:req.id,router:manifest.router.toLowerCase(),adapter:manifest.payments.toLowerCase(),deploymentStartBlock:manifest.startBlock,
    ...(result.status==='unavailable'?{request,retryable:false,field:'invoiceId'}:{})},httpStatus,manifest,request,wallClock?.()??Date.now());
   checkpoint();
   // Decoder work and the final manifest read must not age the response out.
   if(wire.canonicalVerification!=='verified_at_pin')throw Error('PAYMENT_RESPONSE_INVALID');
   const now=wallClock?.()??Date.now(),observed=Date.parse(wire.freshness.observedAt),indexed=Date.parse(wire.freshness.indexedAt),timestamp=BigInt(wire.freshness.blockTimestamp);
   const expires=wire.status==='observed'?BigInt(wire.data.expiresAt):timestamp+20n;
   if(!Number.isSafeInteger(now)||now<0||observed>now+1000||indexed>now+1000||Number(timestamp)*1000>now+1000||Number(expires)*1000<=now||now-indexed>10000)throw Error('PAYMENT_RESPONSE_EXPIRED');
   return reply.code(httpStatus).send(wire);
  }catch(error){
   if(controller.signal.aborted&&reply.raw.destroyed)return;
   const timeout=controller.signal.aborted||remaining()<=0||(error instanceof Error&&error.message==='PAYMENT_HTTP_TIMEOUT');
   return reply.code(timeout?504:503).send(paymentQuoteError(timeout?'PAYMENT_HTTP_TIMEOUT':'PAYMENT_RESPONSE_UNAVAILABLE',req.id));
  }finally{clearTimeout(timer);req.raw.removeListener('aborted',abort);reply.raw.removeListener('close',closed);abort();}
 });
}
