'use client';
import {useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {createSwapDraft, prepareSwapReview, estimateMaximumSwap, maximumSwapInput, decodeSwapQuoteObservation, formatAmount, parseAmount} from '@orbital/sdk';
import {manifestSchema, quoteRequestSchema} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {selectedChain} from '../wallet/config';
import {apiBase, useDeployment, request, requestQuotePayload} from './api';
import {copy} from '../content';
import {useSwapExecution} from './useSwapExecution';
import {useSwapSettings} from './useSwapSettings';
import {useSwapBalance} from './useSwapBalance';
import {usePageActive} from './usePageActive';
import {createSwapPort} from '../wallet/swapPort';

type QuoteView = {
  input: string; output: string; minimum: string; fee: string; recipient: string;
  block: string; historical: boolean; inspected: number; truncated: boolean;
  orderHash: string; maker:string; ticks:number; alternatives: {orderHash: string; output: string}[];
};

/** Validated public observations; wallet review is delegated to its controller. */
export function useSwap() {
  const wallet = useWallet(), deployment = useDeployment(), settings=useSwapSettings(), active=usePageActive();
  const [input, setInputValue] = useState('USDC'), [output, setOutputValue] = useState('oUSD6');
  const [amount, setAmountValue] = useState(''),[networkBusy,setNetworkBusy]=useState(false);
  const context = JSON.stringify([wallet.ready, wallet.connected, wallet.address?.toLowerCase(), wallet.chainId, wallet.kind, input, output, amount, deployment.data,settings.bps,settings.seconds,settings.ready]);
  const [intent, setIntent] = useState<{context: string; id: number} | null>(null);
  const balance=useSwapBalance(deployment.data,input,active),live=useRef(context);live.current=context;
  const [maxBusy,setMaxBusy]=useState(false),[maxMessage,setMaxMessage]=useState(''),maxAbort=useRef<AbortController|null>(null);
  useEffect(()=>{setMaxMessage('');return()=>{maxAbort.current?.abort();maxAbort.current=null;};},[context]);
  const [validation, setValidation] = useState<{context: string; message: string} | null>(null);
  const current = intent?.context === context;
  // Render/key guards invalidate immediately; this also prevents returning to
  // a prior account/pair from reviving its old command without a new click.
  useEffect(() => { setIntent(old => old?.context === context ? old : null); }, [context]);
  const fetchQuote = async (signal:AbortSignal, overrideAmount=amount) => {
      const controller = new AbortController(), abort = () => controller.abort();
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once:true});
      // One wall-clock allowance includes both identity reads and response body.
      const timeout = setTimeout(abort, 30000);
      try {
        const manifest = manifestSchema.parse(await request<unknown>('/deployment', controller.signal));
        if (!manifest.verified || manifest.chainId !== selectedChain.id || wallet.chainId !== manifest.chainId) throw Error('Deployment unavailable');
        const inputs = manifest.tokens.filter(t => t.symbol === input), outputs = manifest.tokens.filter(t => t.symbol === output);
        if (inputs.length !== 1 || outputs.length !== 1) throw Error('Asset metadata unavailable');
        const tokenIn = inputs[0]!, tokenOut = outputs[0]!;
        const requested = quoteRequestSchema.parse({wallet: wallet.address, recipient: wallet.address, tokenIn: tokenIn.address, tokenOut: tokenOut.address,
          amountInRaw: parseAmount(overrideAmount, tokenIn.decimals).toString(), slippageBps: settings.value?.slippageBps, maxCrossings: 16});
        const response = await requestQuotePayload('/quotes/swap', controller.signal, requested);
        const finalManifest = manifestSchema.parse(await request<unknown>('/deployment', controller.signal));
        if (JSON.stringify(finalManifest) !== JSON.stringify(manifest)) throw Error('Deployment changed during quote');
        if (controller.signal.aborted) throw Error('Quote cancelled');
        const observation = decodeSwapQuoteObservation(response.data, response.status, manifest, requested);
        return {manifest, requested, observation, tokenIn, tokenOut};
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  };
  let amountValid=false;try{const token=deployment.data?.tokens.find(t=>t.symbol===input);amountValid=!!token&&input!==output&&parseAmount(amount,token.decimals)>0n;}catch{}
  const enabled=wallet.ready&&wallet.connected&&wallet.chainId===selectedChain.id&&deployment.data?.verified===true&&deployment.data.chainId===selectedChain.id&&settings.ready&&!!settings.value;
  const query = useQuery({
    queryKey: ['swap-observation', apiBase, context, intent?.id], enabled: current&&enabled,
    retry: false, retryOnMount: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn:({signal})=>fetchQuote(signal),
  });
  const execution=useSwapExecution(context,enabled&&amountValid,settings.value?.deadlineSeconds??180,fetchQuote);
  const paused=maxBusy||execution.busy||!!execution.review||!!execution.pending||!!execution.confirmed;
  useEffect(()=>{if(!enabled||!amountValid||!active||paused||current)return;const timer=setTimeout(()=>setIntent(old=>({context,id:(old?.id??0)+1})),300);return()=>clearTimeout(timer);},[context,enabled,amountValid,active,paused,current]);
  useEffect(()=>{if(!current||!active||paused||query.isFetching||query.isError||!query.data)return;const timer=setTimeout(()=>{void query.refetch();},Math.max(0,query.dataUpdatedAt+10000-Date.now()));return()=>clearTimeout(timer);},[current,active,paused,query.isFetching,query.isError,query.dataUpdatedAt,query.data,query.refetch]);
  const data = current && !query.isError ? query.data : undefined;
  const observation = data?.observation.status === 'observed' ? data.observation : undefined;
  const freshUntil = observation ? (Number(observation.freshness.blockTimestamp)+20)*1000 : 0;
  const [expiredData, setExpiredData] = useState<unknown>(null);
  useEffect(() => {
    if (!data || !freshUntil) return;
    const check = () => { if (Date.now() >= freshUntil) setExpiredData(data); };
    const timeout = setTimeout(check, Math.max(0, freshUntil-Date.now()));
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(timeout); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [data, freshUntil]);
  const expired = !!observation && (data === expiredData || Date.now() >= freshUntil);
  const pending = current && query.isFetching;
  let quoteView: QuoteView | undefined;
  if (data && observation?.data.best && !expired) {
    const best = observation.data.best;
    const inAmount = (raw: string) => `${formatAmount(BigInt(raw), data.tokenIn.decimals)} ${data.tokenIn.symbol}`;
    const outAmount = (raw: string) => `${formatAmount(BigInt(raw), data.tokenOut.decimals)} ${data.tokenOut.symbol}`;
    quoteView = {input: inAmount(best.amountInRaw), output: outAmount(best.amountOutRaw), minimum: outAmount(best.minimumOutRaw), fee: inAmount(best.feeRaw),
      recipient: best.recipient, block: observation.asOf.height, historical: observation.historical, inspected: observation.data.counts.inspected,
      truncated: observation.data.coverage.scanTruncated, orderHash: best.orderHash, maker:best.config.maker,ticks:best.config.tickKeys.length,
      alternatives: observation.data.alternatives.map(r => ({orderHash:r.orderHash, output:outAmount(r.amountOutRaw)}))};
  }
  const error = validation?.context === context ? validation.message
    : current && (query.isError || data?.observation.status === 'unavailable') ? copy.swap.unavailable : '';
  async function quote() {
    if (pending || !wallet.ready || paused || networkBusy) return;
    setValidation(null);
    if (!wallet.connected || !wallet.address) { wallet.connect(); return; }
    if (wallet.chainId !== selectedChain.id) {setNetworkBusy(true);try{if(!wallet.switchNetwork)throw Error('Network switching is unavailable');await wallet.switchNetwork();}catch(e){setValidation({context,message:`Switch to ${selectedChain.name} in your wallet. ${e instanceof Error?e.message:'Request rejected'}`});}finally{setNetworkBusy(false);}return;}
    if (!deployment.data) return;
    if(!settings.value){setValidation({context,message:'Choose valid slippage and deadline settings'});return;}
    const token = deployment.data.tokens.find(t => t.symbol === input);
    try {
      if (!token || input === output) throw Error('Select two different assets');
      if (parseAmount(amount, token.decimals) === 0n) throw Error('Enter an amount greater than zero');
    } catch (e) { setValidation({context, message:e instanceof Error ? e.message : 'Enter a valid amount'}); return; }
    setIntent(old => ({context, id:(old?.id ?? 0)+1}));
  }
  function clear() { setIntent(null); setValidation(null); }
  const sharesGas=selectedChain.id===5042002&&balance.data?.token.address.toLowerCase()===deployment.data?.usdc.toLowerCase();
  const fallback=sharesGas&&balance.data?maximumSwapInput(balance.data.amountRaw,true,[0n]):null;
  async function max(){
    if(maxAbort.current||maxBusy||paused||!enabled||!balance.data)return;
    const controller=new AbortController();maxAbort.current=controller;setMaxBusy(true);setMaxMessage('');
    const current=()=>!controller.signal.aborted&&live.current===context,timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const fresh=await balance.refresh();if(!current()||fresh.isError||!fresh.data||Date.now()>=fresh.data.expiresAtMs)throw Error('Refresh the balance before using Max');
      const b=fresh.data;let maximum=b.amountRaw;
      if(sharesGas)maximum=await estimateMaximumSwap(b.amountRaw,async candidate=>{
        const bundle=await fetchQuote(controller.signal,formatAmount(candidate,b.token.decimals));if(!current())throw Error('Max interrupted');
        const draft=createSwapDraft(bundle.observation,200,bundle.manifest,bundle.requested,{deadlineSeconds:settings.value!.deadlineSeconds});
        const verify=async()=>{const m=manifestSchema.parse(await request('/deployment',controller.signal));if(JSON.stringify(m)!==JSON.stringify(bundle.manifest))throw Error('Deployment changed');};
        const review=await prepareSwapReview(draft,createSwapPort(wallet,current,verify));
        return {stage:review.stage,gasCostNative:review.estimate.gas*review.estimate.maxFeePerGas};
      });
      if(!current())throw Error('Max interrupted');clear();setAmountValue(formatAmount(maximum,b.token.decimals));
    }catch(error){if(live.current===context&&maxAbort.current===controller)setMaxMessage(controller.signal.aborted?'Max timed out. Refresh the balance and try again.':error instanceof Error?error.message:'Max unavailable');}
    finally{clearTimeout(timeout);if(maxAbort.current===controller)maxAbort.current=null;setMaxBusy(false);}
  }
  return {input, output, amount, error, pending, quoteView, expired, execution, settings, balance, maxBusy, maxMessage, max:()=>{void max();},
    maxDisabled:!enabled||paused||!balance.data,conservativeAmount:fallback&&fallback>0n&&balance.data?`${formatAmount(fallback,balance.data.token.decimals)} ${input}`:undefined,
    useConservative:()=>{if(fallback&&balance.data&&!paused){clear();setAmountValue(formatAmount(fallback,balance.data.token.decimals));}},
    empty: !!observation && !observation.data.best && !expired,
    symbols: [...new Set(deployment.data?.tokens.map(t => t.symbol) ?? ['USDC','oUSD6','oUSD18'])],
    network:selectedChain.name, gasAsset:selectedChain.nativeCurrency.symbol,
    setInput:(value:string) => {clear(); if(value===output)setOutputValue(input);setInputValue(value);},
    setOutput:(value:string) => {clear();setOutputValue(value);}, setAmount:(value:string) => {clear();setAmountValue(value);},
    reverse:() => {clear();setInputValue(output);setOutputValue(input);}, quote,
    deploymentPending:deployment.isPending, deploymentError:deployment.error?.message,
    disabled:!wallet.ready || pending || networkBusy || (!deployment.data && wallet.connected) || (wallet.connected&&wallet.chainId===selectedChain.id&&(!amountValid||!settings.value)),
    actionLabel:!wallet.ready ? 'Loading wallet…' : networkBusy?'Confirm network in wallet':pending ? 'Checking quote…' : !wallet.connected ? 'Connect wallet' : wallet.chainId!==selectedChain.id?`Switch to ${selectedChain.name}`: !deployment.data ? 'Quotes unavailable'
      : !amountValid?'Enter an amount':!settings.value?'Check settings':observation ? 'Refresh quote' : 'Get quote'};
}
export type SwapViewState = ReturnType<typeof useSwap>;
