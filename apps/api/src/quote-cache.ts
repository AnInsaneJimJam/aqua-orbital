export type QuoteCacheStamp=Readonly<{at:number;generation:number}>;
export type QuoteCacheOptions={clock?:()=>number;maxEntries?:number;maxBytes?:number;ttlMs?:number};
/** Runtime-owned complete quote batches only. Fixed entry and payload ceilings
 * bound retention; no in-flight sharing and no extension on a hit/completion.
 * Payload bytes count UTF-16 keys/results, separately from bounded Map metadata. */
export function createQuoteCache(options:QuoteCacheOptions={}){
 const clock=options.clock??(()=>performance.now()),ttl=options.ttlMs??5000,maxEntries=options.maxEntries??256,maxBytes=options.maxBytes??1048576;
 for(const [value,limit] of [[ttl,5000],[maxEntries,256],[maxBytes,1048576]] as const)if(!Number.isInteger(value)||value<1||value>limit)throw Error('Invalid quote cache configuration');
 const entries=new Map<string,{at:number;values:string[];bytes:number}>(),issued=new WeakSet<QuoteCacheStamp>();let generation=0,previous=0,payloadBytes=0;
 function clear(){entries.clear();payloadBytes=0;generation++;}
 function remove(key:string){const e=entries.get(key);if(e){payloadBytes-=e.bytes;entries.delete(key);}}
 function time():number|null{
  const now=clock();if(!Number.isFinite(now)||now<0||now<previous){clear();previous=Number.isFinite(now)&&now>=0?now:0;return null;}previous=now;
  for(const [key,e] of entries)if(now-e.at>=ttl)remove(key);return now;
 }
 const validKey=(key:string)=>/^[0-9a-f]{64}$/.test(key);
 return {
  begin():QuoteCacheStamp|null{const at=time();if(at===null)return null;const stamp=Object.freeze({at,generation});issued.add(stamp);return stamp;},
  get(key:string):string[]|null{if(time()===null||!validKey(key))return null;return entries.get(key)?.values.slice()??null;},
  put(key:string,stamp:QuoteCacheStamp|null,values:readonly string[]):void{
   const now=time();if(!stamp||!issued.has(stamp))return;issued.delete(stamp);
   if(now===null||stamp.generation!==generation||now<stamp.at||now-stamp.at>=ttl||!validKey(key)||entries.has(key)
    ||!Array.isArray(values)||values.length<1||values.length>8||values.some(v=>typeof v!=='string'||!/^0x[0-9a-f]{192}$/.test(v)))return;
   const bytes=2*(key.length+values.reduce((sum,v)=>sum+v.length,0));if(bytes>maxBytes)return;
   while(entries.size>=maxEntries||payloadBytes+bytes>maxBytes)remove(entries.keys().next().value!);
   entries.set(key,{at:stamp.at,values:values.slice(),bytes});payloadBytes+=bytes;
  },
  clear,
  stats(){time();return {entries:entries.size,payloadBytes};},
 };
}
export type QuoteCache=ReturnType<typeof createQuoteCache>;
