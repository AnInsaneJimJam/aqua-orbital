// One shared policy keeps server classification and client decoding consistent.
// Ages, canonical hashes, coverage and quote expiry remain separate checks.
export {isFreshIndexedHead} from '@orbital/shared';

type Cursor={height:string;hash:string};
/** A later observation may advance, but cannot rewind or replace the same tip. */
export function cursorFollows(previous:Cursor,current:Cursor):boolean{
 if(!/^(0|[1-9][0-9]*)$/.test(previous.height)||!/^(0|[1-9][0-9]*)$/.test(current.height)
  ||!/^0x[0-9a-fA-F]{64}$/.test(previous.hash)||!/^0x[0-9a-fA-F]{64}$/.test(current.hash))return false;
 const before=BigInt(previous.height),after=BigInt(current.height);
 return after>before||after===before&&previous.hash.toLowerCase()===current.hash.toLowerCase();
}
