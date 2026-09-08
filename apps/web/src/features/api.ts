'use client';
import {useQuery} from '@tanstack/react-query';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
import {retryableQuoteResponse} from './quoteRefresh';
export const apiBase=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
/** Deadline covers headers and JSON body; route/query cancellation also aborts. */
export async function requestPayload(path:string,signal?:AbortSignal,body?:unknown):Promise<{status:number;data:unknown}>{
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,30000);
 try{
  const response=await fetch(apiBase+path,{signal:controller.signal,cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export async function request<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
 const {status,data}=await requestPayload(path,signal,body);
 if(status<200||status>=300)throw Error(data&&typeof data==='object'&&'message' in data&&typeof data.message==='string'?data.message:'Data is temporarily unavailable');return data as T;
}
export function useDeployment(){return useQuery({queryKey:['deployment'],queryFn:async({signal})=>manifestSchema.parse(await request<DeploymentManifest>('/deployment',signal)),retry:false,staleTime:30000});}
export function useResource<T>(path:string){return useQuery({queryKey:['resource',path],queryFn:({signal})=>request<T>(path,signal),retry:false});}

/** Read-only retries absorb a confirmed-index cursor advancing during a quote.
 * No signing or transaction submission is retried here. Caller owns the deadline. */
export async function requestQuotePayload(path:'/quotes/swap'|'/quotes/payment',signal:AbortSignal,body:unknown){
 for(let attempt=0;;attempt++){
  const response=await requestPayload(path,signal,body),v=response.data as {code?:string;retryable?:boolean};
  if(attempt>=2||!retryableQuoteResponse(response.status,v))return response;
  await new Promise<void>((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(Error('Quote cancelled'));},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},600);
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
 }
}
