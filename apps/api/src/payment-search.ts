export const PAYMENT_SEARCH_LIMITS = Object.freeze({maxExpansions:8,maxRefinements:8,maxStages:16,maxQuoteCalls:128,batchSize:8,maxEligible:32} as const);
export type PaymentSearchStage<T> = {outcomes:readonly {orderHash:string;status:'quoted'|'unavailable'}[];value:T|null};
export type PaymentSearchOptions = {seed:bigint;bound:bigint;eligibleOrderHashes:readonly string[];checkpoint:()=>void;shouldRefine?:()=>boolean};
export type PaymentSearchResult<T> = {
 selected:{input:bigint;value:T}|null;selection:'sufficient_observed_input'|null;minimumInputCertified:false;
 limits:typeof PAYMENT_SEARCH_LIMITS;stagesUsed:number;expansionStages:number;refinementStages:number;quoteCallsUsed:number;quoteBatchesUsed:number;
 outcomes:{orderHash:string;quoted:number;unavailable:number}[];
 stopReason:'no_eligible_strategies'|'search_exhausted'|'adjacent_cursor'|'refinement_limit'|'aggregate_limit'|'refinement_skipped';
};
/** Retain only inert, bounded quote data. structuredClone alone would retain
 * SharedArrayBuffer backing memory and therefore would not isolate a witness. */
function copyRetained<T>(value:T):T{
 const ancestors=new Set<object>();let nodes=0,textUnits=0;
 const invalid=():never=>{throw Error('PAYMENT_VALUE_INVALID');};
 function copy(v:unknown,depth:number):unknown{
  if(++nodes>8192||depth>24)return invalid();
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){textUnits+=v.length;if(textUnits>1048576)return invalid();return v;}
  if(typeof v==='number'){if(!Number.isSafeInteger(v))return invalid();return v;}
  if(typeof v==='bigint'){if(v<=-(1n<<256n)||v>=(1n<<256n))return invalid();return v;}
  if(typeof v!=='object'||ancestors.has(v))return invalid();
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)return invalid();
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string')||keys.length>(array?513:512))return invalid();
  if(array&&(v.length>512||keys.length!==v.length+1))return invalid();
  ancestors.add(v);
  const result=array?[]:Object.create(prototype);
  for(const key of keys as string[]){
   if(array&&key==='length')continue;
   textUnits+=key.length;if(textUnits>1048576)return invalid();
   if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=v.length))return invalid();
   const descriptor=descriptors[key]!;
   if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)return invalid();
   Object.defineProperty(result,key,{value:copy(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
  }
  ancestors.delete(v);return result;
 }
 return copy(value,0) as T;
}
/** Search over a partial certified oracle. The caller owns canonical context,
 * quote validation and the shared abort/deadline; checkpoint must enforce it.
 * Failed stages never prove an infeasible lower bound. A retained stage is
 * copied and can be returned only after the caller's final checkpoint. */
export async function searchPaymentInput<T>(options:PaymentSearchOptions,probe:(amount:bigint)=>Promise<PaymentSearchStage<T>>):Promise<PaymentSearchResult<T>>{
 const {seed,bound,checkpoint,shouldRefine}=options,limits=PAYMENT_SEARCH_LIMITS;
 if(typeof seed!=='bigint'||seed<1n||typeof bound!=='bigint'||bound<2n||bound>=(1n<<256n)
  ||typeof checkpoint!=='function'||(shouldRefine!==undefined&&typeof shouldRefine!=='function')
  ||!Array.isArray(options.eligibleOrderHashes)||options.eligibleOrderHashes.length>limits.maxEligible
  ||options.eligibleOrderHashes.some(id=>typeof id!=='string'||!/^0x[0-9a-f]{64}$/.test(id))
  ||new Set(options.eligibleOrderHashes).size!==options.eligibleOrderHashes.length)throw Error('PAYMENT_SEARCH_INVALID');
 const orders=[...options.eligibleOrderHashes],count=orders.length;
 const result:PaymentSearchResult<T>={selected:null,selection:null,minimumInputCertified:false,limits,stagesUsed:0,expansionStages:0,refinementStages:0,quoteCallsUsed:0,quoteBatchesUsed:0,
  outcomes:orders.map(orderHash=>({orderHash,quoted:0,unavailable:0})),stopReason:'no_eligible_strategies'};
 checkpoint();
 if(count===0)return result;
 const stageCap=Math.min(limits.maxStages,Math.floor(limits.maxQuoteCalls/count)),expansionCap=Math.min(limits.maxExpansions,stageCap);
 const expected=new Map(orders.map((id,index)=>[id,index]));
 async function stage(amount:bigint,kind:'expansion'|'refinement'){
  checkpoint();
  if(amount<2n||amount>bound||result.stagesUsed>=stageCap)throw Error('PAYMENT_SEARCH_BUDGET');
  result.stagesUsed++;result.quoteCallsUsed+=count;result.quoteBatchesUsed+=Math.ceil(count/limits.batchSize);
  if(kind==='expansion')result.expansionStages++;else result.refinementStages++;
  const response=await probe(amount);checkpoint();
  if(!response||typeof response!=='object'||Object.keys(response).sort().join()!=='outcomes,value'
   ||!Array.isArray(response.outcomes)||response.outcomes.length!==count||response.value===undefined)throw Error('PAYMENT_STAGE_INVALID');
  const seen=new Set<string>();let quoted=0;
  for(const outcome of response.outcomes){
   if(!outcome||typeof outcome!=='object'||Object.keys(outcome).sort().join()!=='orderHash,status'
    ||!expected.has(outcome.orderHash)||seen.has(outcome.orderHash)||!['quoted','unavailable'].includes(outcome.status))throw Error('PAYMENT_STAGE_INVALID');
   seen.add(outcome.orderHash);if(outcome.status==='quoted')quoted++;
   const aggregate=result.outcomes[expected.get(outcome.orderHash)!]!;
   if(outcome.status==='quoted')aggregate.quoted++;else aggregate.unavailable++;
  }
  if((quoted>0)!==(response.value!==null))throw Error('PAYMENT_STAGE_INVALID');
  if(response.value!==null){result.selected={input:amount,value:copyRetained(response.value)};result.selection='sufficient_observed_input';}
  checkpoint();return quoted>0;
 }
 let cursor=1n,amount=seed<2n?2n:seed>bound?bound:seed;
 for(let step=0;step<expansionCap;step++){
  if(step===expansionCap-1)amount=bound;
  if(await stage(amount,'expansion'))break;
  cursor=amount;if(amount===bound)break;
  amount=amount>bound/2n?bound:amount*2n;
 }
 if(!result.selected){checkpoint();result.stopReason='search_exhausted';return result;}
 for(;;){
  checkpoint();
  const high=result.selected.input;
  if(high-cursor<=1n){result.stopReason='adjacent_cursor';break;}
  if(result.stagesUsed>=stageCap){result.stopReason='aggregate_limit';break;}
  if(result.refinementStages>=limits.maxRefinements){result.stopReason='refinement_limit';break;}
  if(shouldRefine&&!shouldRefine()){result.stopReason='refinement_skipped';break;}
  const midpoint=(cursor+high)/2n;
  if(!await stage(midpoint,'refinement'))cursor=midpoint;
 }
 checkpoint();return result;
}
