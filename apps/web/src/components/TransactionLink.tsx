import {ArrowUpRight} from 'lucide-react';
import {selectedChain} from '../wallet/config';
/** Explorer origins come only from application chain configuration, never a payload. */
export function TransactionLink({hash,label='View on explorer'}:{hash:string;label?:string}){
 const explorer=selectedChain.blockExplorers?.default.url;
 if(!explorer||!/^0x[0-9a-f]{64}$/i.test(hash))return null;
 return <a className="inline-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={15} aria-hidden="true"/></a>;
}
