'use client';
import {useQuery} from '@tanstack/react-query';
import {decodeInvoiceDetail, formatAmount,type InvoiceSnapshot} from '@orbital/sdk';
import type {Address,Hex} from 'viem';
import {hashSchema, manifestSchema, type DeploymentManifest, type InvoiceDetailDTO, type InvoiceReadDTO} from '@orbital/shared';
import {apiBase, request, requestPayload} from './api';

type ReceiptView = {label: string; hash: string; href: string | null};
export type InvoiceViewState = {
  id: string; phase: 'invalid' | 'loading' | 'unavailable' | 'not-found' | 'loaded'; refreshing: boolean; refresh: () => void; payable?:boolean;
  terms?: {amount: string; status: string; merchant: string; deadline: string; network: string; demo: boolean;
    recipients: {address: string; share: string; amount: string}[];
    payment: null | {label: string; payer: string; input: string; refund: string; inputDemo: boolean};
    receipts: ReceiptView[]; memoHash: string; adapter: string};
  observation?: {block: string; hash: string; indexedAt: string; stale: boolean; historical: boolean};
  adminInvoice?:InvoiceSnapshot;
};

function receipt(manifest: DeploymentManifest, source: InvoiceReadDTO['created'], label: string): ReceiptView {
  let href: string | null = null;
  // Anvil has no built-in explorer. Never construct links from invoice payloads.
  if (manifest.chainId !== 31337) {
    const base = new URL(manifest.explorerUrl);
    if (base.protocol === 'https:' && !base.username && !base.password) {
      base.pathname = `${base.pathname.replace(/\/$/, '')}/tx/${source.txHash}`; base.search = ''; base.hash = ''; href = base.href;
    }
  }
  return {label, hash: source.txHash, href};
}
function terms(observation: InvoiceDetailDTO, manifest: DeploymentManifest): NonNullable<InvoiceViewState['terms']> {
  const invoice = observation.data.invoice!;
  const amount = (raw: string, token = invoice.settlementToken) => `${formatAmount(BigInt(raw), token.decimals)} ${token.symbol}`;
  return {
    amount: amount(invoice.amountDueRaw), status: invoice.status === 'unpaid' ? 'Unpaid at indexed block' : invoice.status === 'paid' ? 'Paid at indexed block' : 'Cancelled at indexed block',
    merchant: invoice.merchant, deadline: new Date(Number(invoice.expiresAt) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC'),
    network: observation.chainId === 5042002 ? 'Arc Testnet' : observation.chainId === 31337 ? 'Local Anvil' : `Network ${observation.chainId}`, demo: invoice.settlementToken.mock,
    recipients: invoice.recipients.map(r => ({address: r.address, share: `${r.bps / 100}%`, amount: amount(r.amountRaw)})),
    payment: invoice.payment ? {label: invoice.payment.kind === 'swap' ? 'Paid through an Orbital swap' : 'Paid directly in USDC',
      payer: invoice.payment.payer, input: amount(invoice.payment.inputRaw, invoice.payment.inputToken), refund: amount(invoice.payment.refundRaw), inputDemo: invoice.payment.inputToken.mock} : null,
    receipts: [receipt(manifest, invoice.created, 'Creation receipt'), ...(invoice.status === 'unpaid' ? [] : [receipt(manifest, invoice.updated, invoice.status === 'paid' ? 'Payment receipt' : 'Cancellation receipt')])],
    memoHash: invoice.memoHash, adapter: invoice.adapter,
  };
}

/** Read-only controller: validated observations, exact display amounts, no wallet or calldata. */
export function useInvoice(id: string): InvoiceViewState {
  const valid = hashSchema.safeParse(id).success;
  const query = useQuery({
    queryKey: ['invoice', apiBase, id.toLowerCase()], enabled: valid, retry: false, staleTime: 0, refetchInterval:10000,
    queryFn: async ({signal}) => {
      // Refresh both as one read operation. The decoder rejects a deployment
      // rotation between requests; another explicit refresh can then recover.
      const manifest = manifestSchema.parse(await request<unknown>('/deployment', signal));
      if (!manifest.verified) throw Error('Deployment unavailable');
      const response = await requestPayload(`/invoices/${id.toLowerCase()}`, signal);
      if (response.status !== 200 && response.status !== 404) throw Error('Invoice unavailable');
      return {manifest, observation: decodeInvoiceDetail(response.data, response.status, manifest, id)};
    },
  });
  const refreshing = query.isFetching;
  const state: InvoiceViewState = {id, phase: 'loading', refreshing, refresh: () => {
    if (!valid || refreshing) return;
    void query.refetch();
  }};
  if (!valid) return {...state, phase: 'invalid'};
  // A failed refresh must not leave a previously paid/unpaid record looking current.
  if (query.isError) return {...state, phase: 'unavailable'};
  if (query.isPending || !query.data) return state;
  const {manifest, observation: data} = query.data;
  state.observation = {block: data.asOf.height, hash: data.asOf.hash, indexedAt: data.freshness.indexedAt, stale: data.freshness.stale, historical: data.historical};
  if (!data.data.invoice) return {...state, phase: 'not-found'};
  const invoice=data.data.invoice,available=!refreshing&&!data.freshness.stale&&!data.historical;
  const adminInvoice:InvoiceSnapshot={chainId:manifest.chainId,adapter:manifest.payments as Address,id:id as Hex,merchant:invoice.merchant as Address,status:invoice.status,
    amountDueRaw:BigInt(invoice.amountDueRaw),expiresAt:BigInt(invoice.expiresAt),recipients:invoice.recipients.map(v=>v.address as Address),bps:invoice.recipients.map(v=>v.bps),memoHash:invoice.memoHash as Hex};
  return {...state, phase: 'loaded', terms: terms(data, manifest),payable:invoice.status==='unpaid'&&available,adminInvoice:available?adminInvoice:undefined};
}
