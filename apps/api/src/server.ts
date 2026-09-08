import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {readFile} from 'node:fs/promises';
import {manifestSchema,quoteRequestSchema,hashSchema,addressSchema,type ProofItem} from '@orbital/shared';

export async function createServer(options:{manifestPath?:string;proofPath?:string}={}) {
 const app=Fastify({logger:process.env.NODE_ENV!=='test',bodyLimit:16384});
 const origins=(process.env.PUBLIC_APP_URL??'http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3002').split(',').map(value=>value.trim()).filter(Boolean);
 await app.register(cors,{origin:origins});
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 async function manifest(){
  if(!options.manifestPath)return null;
  try{return manifestSchema.parse(JSON.parse(await readFile(options.manifestPath,'utf8')));}catch{return null;}
 }
 app.get('/health',async()=>({status:'ok',service:'orbital-api',chainWrites:false,deploymentAvailable:!!(await manifest())?.verified}));
 app.get('/deployment',async(_,reply)=>{
  const data=await manifest();if(!data?.verified)return reply.code(503).send({code:'DEPLOYMENT_UNAVAILABLE',message:'A verified Orbital deployment is not configured.'});return data;
 });
 app.get('/proof',async()=>{
  if(options.proofPath){try{return JSON.parse(await readFile(options.proofPath,'utf8'));}catch{/* Honest unavailable state below. */}}
  return {generatedAt:null,items:[{id:'evidence',label:'Build evidence',status:'unavailable',detail:'No generated evidence manifest is configured.'}] satisfies ProofItem[]};
 });
 // No database/chain evidence is fabricated when the indexed deployment is absent.
 const unavailable=async(_request:unknown,reply:{code:(code:number)=>{send:(value:unknown)=>unknown}})=>reply.code(503).send({code:'INDEXER_UNAVAILABLE',message:'Verified chain indexing is not available yet.'});
 for(const path of ['/strategies','/metrics','/makers/:address/strategies','/makers/:address/invoices'])app.get(path,unavailable);
 app.get<{Params:{hash:string}}>('/strategies/:hash',async(req,reply)=>{if(!hashSchema.safeParse(req.params.hash).success)return reply.code(400).send({code:'INVALID_HASH',message:'Invalid strategy hash.'});return unavailable(req,reply);});
 app.get<{Params:{id:string}}>('/invoices/:id',async(req,reply)=>{if(!hashSchema.safeParse(req.params.id).success)return reply.code(400).send({code:'INVALID_HASH',message:'Invalid invoice ID.'});return unavailable(req,reply);});
 app.post('/quotes/swap',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(req,reply)=>{
  const parsed=quoteRequestSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({code:'INVALID_QUOTE',message:'Check wallet, pair, amount and quote limits.'});
  return reply.code(503).send({code:'CERTIFIED_QUOTER_UNAVAILABLE',message:'The certified Orbital quote engine has not been enabled.'});
 });
 app.post('/quotes/payment',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},unavailable);
 app.get('/events',unavailable);
 app.setErrorHandler((error,_request,reply)=>{
  const status=typeof error==='object'&&error!==null&&'statusCode' in error?Number(error.statusCode):500;
  reply.code(Number.isInteger(status)&&status>=400&&status<600?status:500).send({code:'REQUEST_FAILED',message:status===429?'Too many requests. Try again shortly.':'The request could not be completed.'});
 });
 return app;
}
