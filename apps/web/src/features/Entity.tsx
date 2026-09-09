'use client';
import Link from '../components/AppLink';
import {useResource} from './api';
export default function Entity({id,kind}:{id:string;kind:'strategy'|'invoice'}){
 const valid=/^0x[0-9a-fA-F]{64}$/.test(id);const result=useResource<unknown>(valid?`/${kind==='strategy'?'strategies':'invoices'}/${id}`:'/deployment');
 return <section className="page"><Link className="back-link" href={kind==='strategy'?'/liquidity':'/pay'}><span aria-hidden="true">←</span> {kind==='strategy'?'Liquidity':'Payments'}</Link><div className="page-head"><h1>{kind==='strategy'?'Strategy details':'Invoice'}</h1></div><p className="mono">{id}</p><div className="panel empty"><h2>{!valid?'Invalid identifier':result.isPending?'Checking chain state…':'Details unavailable'}</h2><p>{!valid?'Use the full 32-byte identifier from the correct network.':result.error?.message??'The verified contract and indexed state are required to display this record.'}</p><button className="button secondary" disabled={!valid||result.isFetching} onClick={()=>{void result.refetch();}}>Refresh</button></div></section>;
}
