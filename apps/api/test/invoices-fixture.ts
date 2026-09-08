import {encodeAbiParameters, encodeEventTopics, getAddress, type AbiEvent, type Hex} from 'viem';
import {invoiceId, paymentsEventsAbi} from '@orbital/sdk';
import type {DeploymentManifest} from '@orbital/shared';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {readInvoices, type InvoiceTopics} from '../../../packages/db/src/invoice-reads.js';
import {deploymentScope, syncDeploymentOnce, type MaterializationRpc} from '../../indexer/src/materializer.js';
import type {InvoiceReadDependencies} from '../src/invoices.js';

export const address = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
export const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
export const merchant = address(20), otherMerchant = address(21), payer = address(22), due = 70_000_000_000_000_001n;
export const manifest: DeploymentManifest = {chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', explorerUrl: 'https://example.invalid', verified: true,
  aqua: address(10), router: address(11), payments: address(12), usdc: address(1), startBlock: '1',
  tokens: [{address: address(1), symbol: 'USDC', decimals: 6, mock: true}, {address: address(2), symbol: 'oUSD18', decimals: 18, mock: true}]};
export const header = (n: number) => ({number: BigInt(n), hash: hash(n), parentHash: hash(n - 1), transactions: [hash(100 + n)]});
export const topics: InvoiceTopics = {created: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoiceCreated'})[0]!,
  paid: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoicePaid'})[0]!, cancelled: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoiceCancelled'})[0]!};
function event(n: number, logIndex: number, name: string, args: Record<string, unknown>) {
  const b = header(n), abi = (paymentsEventsAbi as readonly AbiEvent[]).find(item => item.name === name)!;
  return {blockNumber: b.number, blockHash: b.hash, transactionHash: b.transactions[0]!, transactionIndex: 0, logIndex, address: manifest.payments,
    topics: encodeEventTopics({abi: [abi], eventName: name, args} as never) as Hex[],
    data: encodeAbiParameters(abi.inputs.filter(input => !input.indexed), abi.inputs.filter(input => !input.indexed).map(input => args[input.name!]))};
}
export async function invoiceFixture(count = 4, initialTip = 3) {
  const db = await isolatedDatabase(); let tip = 0;
  const ids = Array.from({length: count}, (_, n) => invoiceId(31337n, getAddress(manifest.payments), n === count - 1 ? otherMerchant : merchant, BigInt(n)));
  const creation = ids.map((id, n) => event(1, n, 'InvoiceCreated', {invoiceId: id, merchant: n === count - 1 ? otherMerchant : merchant,
    amountDueRaw: due, expiresAt: 1800000000, recipients: [merchant, address(23)], bps: [9000, 1000], memoHash: hash(90)}));
  const logs = new Map<bigint, ReturnType<typeof event>[]>([
    [1n, [...creation, event(1, count, 'InvoicePaid', {invoiceId: ids[0], merchant, payer, tokenIn: manifest.usdc, amountInRaw: due, receivedRaw: due, refundRaw: 0n, routeHash: hash(0)})]],
    [2n, [event(2, 0, 'InvoiceCancelled', {invoiceId: ids[1], merchant})]],
    [3n, [event(3, 0, 'InvoicePaid', {invoiceId: ids[2], merchant, payer, tokenIn: address(2), amountInRaw: 9007199254740993n, receivedRaw: due + 7n, refundRaw: 7n, routeHash: hash(88)})]],
  ]);
  const rpc: MaterializationRpc = {async getChainId() { return 31337; }, async getBlockNumber() { return BigInt(tip + 2); },
    async getBlock(n) { return header(Number(n)); }, async getLogs(n) { return logs.get(n) ?? []; }, async call() { throw Error('INVOICE_EVENT_READ_NEEDS_NO_STATE_CALL'); }};
  async function advance(next: number) { const prior = tip; tip = next; for (let n = prior; n < next; n++) await syncDeploymentOnce(db.pool, manifest, rpc); }
  await advance(initialTip);
  const dependencies: InvoiceReadDependencies = {readDatabase: (configured, query) => readInvoices(db.pool, deploymentScope(configured), topics, query),
    async readRpc(_manifest, blocks) { return {chainId: 31337, head: BigInt(tip + 2), blocks: blocks.map(block => ({...block, timestamp: 1700000000n + BigInt(block.height)}))}; }};
  return {db, ids, dependencies, advance, close: () => db.close()};
}
