import {getShipments} from './shipments.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {readFile} from 'node:fs/promises';
import {manifestSchema,type ProofItem} from '@orbital/shared';
import {checkReadiness,type ReadinessDependencies} from './readiness.js';
import type {NotificationSource} from './events.js';
import {createReadDependencies} from './runtime.js';
import {PostgresNotifications} from './postgres-events.js';
import {registerEventStream} from './event-stream.js';
import {getMetrics,type MetricsDependencies} from './metrics.js';
import {getInvoices,type InvoiceReadDependencies} from './invoices.js';
import {getStrategies,type StrategyReadDependencies} from './strategies.js';
import {registerSwapQuotes,isSwapQuotePath,swapQuoteError,createSwapQuoteLimiter} from './quote-http.js';
import {registerPaymentQuotes,isPaymentQuotePath,paymentQuoteError} from './payment-http.js';

export async function createServer(options:{manifestPath?:string;proofPath?:string;databaseUrl?:string;dependencies?:ReadinessDependencies;metricsDependencies?:MetricsDependencies;invoiceDependencies?:InvoiceReadDependencies;strategyDependencies?:StrategyReadDependencies;notifications?:NotificationSource;now?:()=>number;logger?:boolean}={}) {
 const app=Fastify({logger:options.logger??process.env.NODE_ENV!=='test',bodyLimit:16384});
 const origins=(process.env.PUBLIC_APP_URL??'http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3002').split(',').map(value=>value.trim()).filter(Boolean);
 await app.register(cors,{origin:origins});
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 async function manifest(){
  if(!options.manifestPath)return null;
  try{return manifestSchema.parse(JSON.parse(await readFile(options.manifestPath,'utf8')));}catch{return null;}
 }
 const runtime=options.databaseUrl?createReadDependencies(options.databaseUrl):undefined;
 const dependencies=options.dependencies??runtime?.dependencies;
 const metricsDependencies=options.metricsDependencies??runtime?.metricsDependencies;
 const invoiceDependencies=options.invoiceDependencies??runtime?.invoiceDependencies;
 const strategyDependencies=options.strategyDependencies??runtime?.strategyDependencies;
 const notifications=options.notifications??(options.databaseUrl?new PostgresNotifications(options.databaseUrl):undefined);
 const readiness=async()=>checkReadiness(await manifest(),dependencies,options.now?.()??Date.now());
 if(runtime)app.addHook('onClose',async()=>{await runtime.close();});
 app.get('/ready',async(_,reply)=>{const result=await readiness();return reply.code(result.status==='ready'?200:503).send(result);});
 for(const path of ['/metrics','/api/v1/metrics'])app.get(path,async(_,reply)=>{
  const result=await getMetrics(await manifest(),metricsDependencies,options.now?.()??Date.now());
  return reply.header('cache-control','no-store').code(result.status==='unavailable'?503:200).send(result);
 });
 for(const prefix of ['', '/api/v1']){
  app.get<{Params:{address:string};Querystring:Record<string,unknown>}>(`${prefix}/makers/:address/shipments`,async(req,reply)=>{
   const {httpStatus,...result}=await getShipments(await manifest(),req.params.address,req.query,runtime?.shipmentDependencies);
   return reply.header('cache-control','no-store').code(httpStatus).send(result);
  });
  app.get<{Querystring:Record<string,unknown>}>(`${prefix}/strategies`,async(req,reply)=>{
   const {httpStatus,...result}=await getStrategies(await manifest(),{query:req.query},strategyDependencies,options.now?.()??Date.now());
   return reply.header('cache-control','no-store').code(httpStatus).send({...result,...(httpStatus>=400?{requestId:req.id}:{})});
  });
  app.get<{Params:{address:string};Querystring:Record<string,unknown>}>(`${prefix}/makers/:address/strategies`,async(req,reply)=>{
   const {httpStatus,...result}=await getStrategies(await manifest(),{maker:req.params.address,query:req.query},strategyDependencies,options.now?.()??Date.now());
   return reply.header('cache-control','no-store').code(httpStatus).send({...result,...(httpStatus>=400?{requestId:req.id}:{})});
  });
  app.get<{Params:{hash:string};Querystring:Record<string,unknown>}>(`${prefix}/strategies/:hash`,async(req,reply)=>{
   reply.header('cache-control','no-store');
   if(Object.keys(req.query).length)return reply.code(400).send({code:'INVALID_STRATEGY_QUERY',message:'Strategy detail does not accept query parameters.',retryable:false,field:'query',requestId:req.id});
   const {httpStatus,...result}=await getStrategies(await manifest(),{hash:req.params.hash},strategyDependencies,options.now?.()??Date.now());
   return reply.code(httpStatus).send({...result,...(httpStatus>=400?{requestId:req.id}:{})});
  });
  app.get<{Params:{id:string};Querystring:Record<string,unknown>}>(`${prefix}/invoices/:id`,async(req,reply)=>{
   reply.header('cache-control','no-store');
   if(Object.keys(req.query).length)return reply.code(400).send({code:'INVALID_INVOICE_QUERY',message:'Invoice detail does not accept query parameters.',retryable:false,field:'query',requestId:req.id});
   const {httpStatus,...result}=await getInvoices(await manifest(),{id:req.params.id},invoiceDependencies,options.now?.()??Date.now());
   return reply.code(httpStatus).send({...result,...(httpStatus>=400?{requestId:req.id}:{})});
  });
  app.get<{Params:{address:string};Querystring:Record<string,unknown>}>(`${prefix}/makers/:address/invoices`,async(req,reply)=>{
   const {httpStatus,...result}=await getInvoices(await manifest(),{merchant:req.params.address,query:req.query},invoiceDependencies,options.now?.()??Date.now());
   return reply.header('cache-control','no-store').code(httpStatus).send({...result,...(httpStatus>=400?{requestId:req.id}:{})});
  });
 }
 app.get('/health',async()=>({status:'ok',service:'orbital-api',chainWrites:false,deploymentAvailable:!!(await manifest())?.verified}));
 app.get('/deployment',async(_,reply)=>{
  const data=await manifest();if(!data?.verified)return reply.code(503).send({code:'DEPLOYMENT_UNAVAILABLE',message:'A verified Orbital deployment is not configured.'});return data;
 });
 app.get('/proof',async()=>{
  if(options.proofPath){try{return JSON.parse(await readFile(options.proofPath,'utf8'));}catch{/* Honest unavailable state below. */}}
  return {generatedAt:null,items:[{id:'evidence',label:'Build evidence',status:'unavailable',detail:'No generated evidence manifest is configured.'}] satisfies ProofItem[]};
 });
 const quoteLimit=createSwapQuoteLimiter();
 registerSwapQuotes(app,manifest,runtime?.observeQuote,options.now,quoteLimit);
 registerPaymentQuotes(app,manifest,runtime?.observePaymentQuote,options.now,quoteLimit);
 registerEventStream(app,readiness,notifications);
 app.setErrorHandler((error,request,reply)=>{
  const status=typeof error==='object'&&error!==null&&'statusCode' in error?Number(error.statusCode):500;
  if(isPaymentQuotePath(request.routeOptions.url))return reply.header('cache-control','no-store').code(Number.isInteger(status)&&status>=400&&status<600?status:500).send(paymentQuoteError(status===413?'PAYMENT_BODY_TOO_LARGE':status===429?'PAYMENT_RATE_LIMITED':'PAYMENT_REQUEST_FAILED',request.id,status>=429,status>=400&&status<429?'body':null));
  if(isSwapQuotePath(request.routeOptions.url))return reply.header('cache-control','no-store').code(Number.isInteger(status)&&status>=400&&status<600?status:500).send(swapQuoteError(status===413?'QUOTE_BODY_TOO_LARGE':status===429?'QUOTE_RATE_LIMITED':'QUOTE_REQUEST_FAILED',request.id,status>=429,status>=400&&status<429?'body':null));
  reply.code(Number.isInteger(status)&&status>=400&&status<600?status:500).send({code:'REQUEST_FAILED',message:status===429?'Too many requests. Try again shortly.':'The request could not be completed.'});
 });
 return app;
}
