import {decodePaymentQuoteObservation,parseAmount} from '@orbital/sdk';
import {manifestSchema,paymentQuoteRequestSchema} from '@orbital/shared';
import type {Session} from '../wallet/WalletProvider';
import {readSwapBalance} from '../wallet/balancePort';
import {selectedChain} from '../wallet/config';
import {request,requestQuotePayload} from './api';
import {paymentQuoteLimit} from './paymentLimit';

/** Invoice terms determine the output. The current token balance bounds the
 * server's finite search; only its validated, reviewed input can be approved. */
export async function fetchPaymentQuote(id:string,symbol:string,maximum:string,wallet:Pick<Session,'address'|'identity'|'send'>,signal:AbortSignal,current:()=>boolean){
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,30000);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const guard=()=>current()&&!controller.signal.aborted;
 try{
  const manifest=manifestSchema.parse(await request('/deployment',controller.signal));
  if(!manifest.verified||manifest.chainId!==selectedChain.id)throw Error('Verified deployment unavailable');
  const assets=manifest.tokens.filter(t=>t.symbol===symbol),asset=assets[0];if(assets.length!==1||!asset)throw Error('Select a supported input token');
  const balance=await readSwapBalance(wallet,manifest,asset,guard);
  if(!guard())throw Error('Payment calculation interrupted');
  const limit=paymentQuoteLimit(balance.amountRaw,maximum.trim()?parseAmount(maximum.trim(),asset.decimals):undefined);
  const requested=paymentQuoteRequestSchema.parse({invoiceId:id,payer:wallet.address,tokenIn:asset.address,maxInputRaw:limit.toString(),maxCrossings:16});
  const response=await requestQuotePayload('/quotes/payment',controller.signal,requested);
  const latest=manifestSchema.parse(await request('/deployment',controller.signal));
  if(JSON.stringify(latest)!==JSON.stringify(manifest))throw Error('Deployment changed. Review again.');
  if(!guard())throw Error('Payment calculation interrupted');
  const observation=decodePaymentQuoteObservation(response.data,response.status,manifest,requested);
  if(observation.status!=='observed')throw Error(observation.code==='PAYMENT_BALANCE_INSUFFICIENT'?'Not enough tokens to pay this invoice.':'A payment quote is unavailable for this token and limit. Retry or select another token.');
  return {manifest,requested,observation};
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
