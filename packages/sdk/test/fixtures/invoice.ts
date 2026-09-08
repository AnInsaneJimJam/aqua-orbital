import {encodeAbiParameters, keccak256, type Address} from 'viem';
import type {DeploymentManifest} from '@orbital/shared';

// HTTP/UI fixtures only: these are not deployed contracts or transaction receipts.
export const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
export const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const;
export const invoiceManifest: DeploymentManifest = {
  chainId: 5042002, rpcUrl: 'https://rpc.testnet.arc.io', explorerUrl: 'https://testnet.arcscan.app', verified: true,
  aqua: address(10), router: address(11), payments: address(12), usdc: address(1), startBlock: '10',
  tokens: [{address: address(1), symbol: 'USDC', decimals: 6, mock: false},
    {address: address(2), symbol: 'oUSD18', decimals: 18, mock: true}],
};
export const fixtureDeploymentId = keccak256(encodeAbiParameters(
  [{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
  [5042002n, address(10), address(11), address(12)],
));
export function invoiceObservation() {
  const created = {blockNumber: '12', blockHash: hash(112), txHash: hash(212), logIndex: 1, event: 'InvoiceCreated' as const};
  return {
    schemaVersion: 1 as const, status: 'available' as const, code: 'INVOICES_AVAILABLE' as const, financialExecutionEnabled: false as const,
    chainId: 5042002, deploymentId: fixtureDeploymentId, asOf: {height: '15', hash: hash(115)}, currentIndexedBlock: {height: '15', hash: hash(115)}, historical: false,
    freshness: {indexedAt: '2026-09-08T06:00:00.000Z', ageMs: 100, head: '17', stale: false},
    coverage: {fromBlock: '10', toBlock: '15', expectedBlocks: '6', canonicalBlocks: '6', coveredBlocks: '6', complete: true as const},
    data: {invoice: {
      invoiceId: hash(1001), merchant: address(20), adapter: address(12), amountDueRaw: '70000000000000001', expiresAt: '1800000000',
      recipients: [{address: address(20), bps: 9000, amountRaw: '63000000000000000'}, {address: address(21), bps: 1000, amountRaw: '7000000000000001'}],
      memoHash: hash(900), status: 'unpaid' as 'unpaid' | 'paid' | 'cancelled', version: '1', created, updated: {...created} as Omit<typeof created, 'event'> & {event: 'InvoiceCreated' | 'InvoicePaid' | 'InvoiceCancelled'},
      settlementToken: {...invoiceManifest.tokens[0]!}, paymentEligibilityVerified: false as const,
      payment: null as null | {payer: Address; tokenIn: Address; inputToken: DeploymentManifest['tokens'][number]; inputRaw: string; receivedRaw: string; refundRaw: string; routeHash: string; kind: 'swap' | 'direct'},
    }},
  };
}
