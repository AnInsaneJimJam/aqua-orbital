import {request as httpRequest,type ClientRequest} from 'node:http';
/** The production service supplies its own deadline. An early return/rejection
 * must fail the test instead of leaving its expected RPC barrier pending. */
export async function awaitServiceBarrier(barrier:Promise<void>,work:PromiseLike<unknown>):Promise<void>{
 await Promise.race([barrier,Promise.resolve(work).then(value=>{
  const r=value&&typeof value==='object'?value as Record<string,unknown>:{};
  throw Error(`Service returned before RPC barrier: ${String(r.status??r.statusCode)} ${String(r.code??'')} ${typeof r.body==='string'?r.body.slice(0,1024):''}`);
 })]);
}
/** Test-only request: complete only when the intended blocked RPC was reached. */
export async function requestUntilBarrier(url:string,payload:unknown,barrier:Promise<void>):Promise<ClientRequest>{
 let request!:ClientRequest,timer:ReturnType<typeof setTimeout>|undefined,reached=false;
 const failed=new Promise<never>((_,reject)=>{
  request=httpRequest(url,{method:'POST',headers:{'content-type':'application/json'}},response=>{
   let body='';response.setEncoding('utf8');response.on('data',part=>{body+=part;if(body.length>16384){reject(Error('RPC barrier received an oversized response'));request.destroy();}});
   response.on('error',reject);response.once('end',()=>reject(Error(`RPC barrier received HTTP ${response.statusCode}: ${body.slice(0,16384)}`)));
  });
  request.on('error',reject);timer=setTimeout(()=>{reject(Error('RPC barrier was not reached within 25 seconds'));request.destroy();},25000);request.end(JSON.stringify(payload));
 });
 try{await Promise.race([barrier,failed]);reached=true;return request;}
 finally{clearTimeout(timer);if(!reached)request.destroy();}
}
