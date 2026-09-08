'use client';
import {useQuery} from '@tanstack/react-query';
import {manifestSchema,type DeploymentManifest} from '@orbital/shared';
const base=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
export async function request<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
 const response=await fetch(base+path,{signal,method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw Error(typeof data.message==='string'?data.message:'Data is temporarily unavailable');return data as T;
}
export function useDeployment(){return useQuery({queryKey:['deployment'],queryFn:async({signal})=>manifestSchema.parse(await request<DeploymentManifest>('/deployment',signal)),retry:false,staleTime:30000});}
export function useResource<T>(path:string){return useQuery({queryKey:['resource',path],queryFn:({signal})=>request<T>(path,signal),retry:false});}
