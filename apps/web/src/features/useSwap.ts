'use client';
import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decodeSwapQuoteObservation, formatAmount, parseAmount} from '@orbital/sdk';
import {manifestSchema, quoteRequestSchema} from '@orbital/shared';
import {useWallet} from '../wallet/WalletProvider';
import {selectedChain} from '../wallet/config';
import {apiBase, useDeployment, request, requestPayload} from './api';
import {copy} from '../content';
import {useSwapExecution} from './useSwapExecution';

type QuoteView = {
  input: string; output: string; minimum: string; fee: string; recipient: string;
  block: string; historical: boolean; inspected: number; truncated: boolean;
  orderHash: string; alternatives: {orderHash: string; output: string}[];
};

/** Validated public observations; wallet review is delegated to its controller. */
export function useSwap() {
  const wallet = useWallet(), deployment = useDeployment();
  const [input, setInputValue] = useState('oUSD18'), [output, setOutputValue] = useState('USDC');
  const [amount, setAmountValue] = useState('');
  const context = JSON.stringify([wallet.ready, wallet.connected, wallet.address?.toLowerCase(), wallet.chainId, wallet.kind, input, output, amount, deployment.data]);
  const [intent, setIntent] = useState<{context: string; id: number} | null>(null);
  const [validation, setValidation] = useState<{context: string; message: string} | null>(null);
  const current = intent?.context === context;
  // Render/key guards invalidate immediately; this also prevents returning to
  // a prior account/pair from reviving its old command without a new click.
  useEffect(() => { setIntent(old => old?.context === context ? old : null); }, [context]);
  const fetchQuote = async (signal:AbortSignal) => {
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
          amountInRaw: parseAmount(amount, tokenIn.decimals).toString(), slippageBps: 50, maxCrossings: 16});
        const response = await requestPayload('/quotes/swap', controller.signal, requested);
        const finalManifest = manifestSchema.parse(await request<unknown>('/deployment', controller.signal));
        if (JSON.stringify(finalManifest) !== JSON.stringify(manifest)) throw Error('Deployment changed during quote');
        if (controller.signal.aborted) throw Error('Quote cancelled');
        const observation = decodeSwapQuoteObservation(response.data, response.status, manifest, requested);
        return {manifest, requested, observation, tokenIn, tokenOut};
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  };
  const query = useQuery({
    queryKey: ['swap-observation', apiBase, context, intent?.id], enabled: current,
    retry: false, retryOnMount: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn:({signal})=>fetchQuote(signal),
  });
  const execution=useSwapExecution(JSON.stringify([context,intent?.id]),wallet.ready&&wallet.connected&&wallet.chainId===selectedChain.id&&deployment.data?.verified===true,180,fetchQuote);
  const data = current && !query.isFetching && !query.isError ? query.data : undefined;
  const observation = data?.observation.status === 'observed' ? data.observation : undefined;
  const freshUntil = observation ? Math.min(Date.parse(observation.freshness.indexedAt)+10000, (Number(observation.freshness.blockTimestamp)+20)*1000) : 0;
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
      truncated: observation.data.coverage.scanTruncated, orderHash: best.orderHash,
      alternatives: observation.data.alternatives.map(r => ({orderHash:r.orderHash, output:outAmount(r.amountOutRaw)}))};
  }
  const error = validation?.context === context ? validation.message
    : current && (query.isError || data?.observation.status === 'unavailable') ? copy.swap.unavailable : '';
  function quote() {
    if (pending || !wallet.ready) return;
    setValidation(null);
    if (!wallet.connected || !wallet.address) { wallet.connect(); return; }
    if (wallet.chainId !== selectedChain.id) { setValidation({context, message:`Switch to ${selectedChain.name}`}); return; }
    if (!deployment.data) return;
    const token = deployment.data.tokens.find(t => t.symbol === input);
    try {
      if (!token || input === output) throw Error('Select two different assets');
      if (parseAmount(amount, token.decimals) === 0n) throw Error('Enter an amount greater than zero');
    } catch (e) { setValidation({context, message:e instanceof Error ? e.message : 'Enter a valid amount'}); return; }
    setIntent(old => ({context, id:(old?.id ?? 0)+1}));
  }
  function clear() { setIntent(null); setValidation(null); }
  return {input, output, amount, error, pending, quoteView, expired, execution,
    empty: !!observation && !observation.data.best && !expired,
    symbols: [...new Set(deployment.data?.tokens.map(t => t.symbol) ?? ['USDC','oUSD6','oUSD18'])],
    network:selectedChain.name, gasAsset:selectedChain.nativeCurrency.symbol,
    setInput:(value:string) => {clear(); if(value===output)setOutputValue(input);setInputValue(value);},
    setOutput:(value:string) => {clear();setOutputValue(value);}, setAmount:(value:string) => {clear();setAmountValue(value);},
    reverse:() => {clear();setInputValue(output);setOutputValue(input);}, quote,
    deploymentPending:deployment.isPending, deploymentError:deployment.error?.message,
    disabled:!wallet.ready || pending || (!deployment.data && wallet.connected),
    actionLabel:!wallet.ready ? 'Loading wallet…' : pending ? 'Checking quote…' : !wallet.connected ? 'Connect wallet' : !deployment.data ? 'Quotes unavailable'
      : observation ? 'Refresh quote' : 'Get quote'};
}
export type SwapViewState = ReturnType<typeof useSwap>;
