/** Background observations are refreshed before expiry; wallet reviews are
 * deliberately paused and retain their immutable financial terms. */
export function nextQuoteRefreshAt(updatedAt:number,expiresAt:number|null,failed:boolean){
 if(failed)return updatedAt+15000;
 return Math.max(updatedAt+2000,Math.min(updatedAt+5000,expiresAt===null?Infinity:expiresAt-5000));
}
export function retryableQuoteResponse(status:number,value:{code?:string;retryable?:boolean}){
 return [503,504].includes(status)&&value.retryable===true&&!!value.code
  &&/(INDEXER_STALE|SOURCE_CHANGED|SOURCE_UNAVAILABLE|RESPONSE_UNAVAILABLE|QUOTE_EXPIRED|QUOTE_TIMEOUT)$/.test(value.code);
}
