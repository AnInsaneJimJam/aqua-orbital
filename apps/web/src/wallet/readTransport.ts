import {http} from 'viem';
import {local} from './config';
// Arc application reads stay on the web origin. Wallet signatures and
// submission still use the selected wallet provider; this endpoint cannot send.
export const readTransport=()=>http(local?undefined:'/api/chain',{timeout:10000,retryCount:0});
