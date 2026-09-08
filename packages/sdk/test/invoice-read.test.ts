import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeInvoiceDetail} from '../src/index';
import {invoiceObservation, invoiceManifest as manifest, address, hash} from './fixtures/invoice';

const id = hash(1001);
const decode = (value: unknown, status = 200, deployment = manifest, invoiceId = id) => decodeInvoiceDetail(value, status, deployment, invoiceId);
test('invoice detail preserves exact raw units, floor/remainder recipients and receipt provenance', () => {
  const value = invoiceObservation();
  assert.deepEqual(decode(value), value);
  assert.deepEqual(decode(value, 200, manifest, id.toUpperCase().replace('0X', '0x') as typeof id), value);
});
test('invoice reads retain direct and swap-funded paid receipts without declaring payment eligibility', () => {
  for (const kind of ['direct', 'swap'] as const) {
    const value = invoiceObservation(), invoice = value.data.invoice;
    invoice.status = 'paid'; invoice.version = '2'; invoice.updated = {blockNumber: '14', blockHash: hash(114), txHash: hash(214), logIndex: 4, event: 'InvoicePaid'};
    invoice.payment = {payer: address(30), tokenIn: kind === 'direct' ? manifest.usdc as ReturnType<typeof address> : address(2), inputToken: {...manifest.tokens[kind === 'direct' ? 0 : 1]!},
      inputRaw: kind === 'direct' ? invoice.amountDueRaw : '70000000000000001000000000', receivedRaw: kind === 'direct' ? invoice.amountDueRaw : '70000000000000011',
      refundRaw: kind === 'direct' ? '0' : '10', routeHash: kind === 'direct' ? hash(0) : hash(300), kind};
    assert.deepEqual(decode(value), value);
  }
});
test('invoice detail binds chain, deployment roles, ID, tokens and indexing start to verified configuration', () => {
  assert.deepEqual(decode(invoiceObservation()), invoiceObservation());
  for (const change of [{verified: false}, {chainId: 31337}, {aqua: address(99)}, {router: address(99)}, {payments: address(99)}, {startBlock: '11'},
    {tokens: manifest.tokens.map(t => ({...t, mock: !t.mock}))}]) assert.throws(() => decode(invoiceObservation(), 200, {...manifest, ...change}));
  assert.throws(() => decode(invoiceObservation(), 200, manifest, hash(9999)));
  for (const field of ['invoiceId', 'adapter'] as const) { const value = invoiceObservation(); value.data.invoice[field] = field === 'invoiceId' ? hash(9999) : address(99); assert.throws(() => decode(value)); }
  const value = invoiceObservation(); value.deploymentId = hash(9999); assert.throws(() => decode(value));
});
test('invoice detail rejects malformed money, inconsistent shares and executable payloads', () => {
  assert.deepEqual(decode(invoiceObservation()), invoiceObservation());
  for (const amount of ['1e18', '-1', '01', '1.5', '1'.repeat(79)]) { const value = invoiceObservation(); value.data.invoice.amountDueRaw = amount; assert.throws(() => decode(value)); }
  for (const change of [{amountRaw: '63000000000000001'}, {bps: 9001}, {bps: 1.5}]) { const value = invoiceObservation(); Object.assign(value.data.invoice.recipients[0]!, change); assert.throws(() => decode(value)); }
  assert.throws(() => decode({...invoiceObservation(), financialExecutionEnabled: true}));
  const value = invoiceObservation(); Object.assign(value.data.invoice, {paymentEligibilityVerified: true}); assert.throws(() => decode(value));
  assert.throws(() => decode({...invoiceObservation(), data: {...invoiceObservation().data, calldata: '0x1234'}}));
});
test('historical and stale observations remain explicit and cannot falsify canonical coverage', () => {
  const value = {...invoiceObservation(), status: 'stale', code: 'INVOICES_STALE', historical: true,
    currentIndexedBlock: {height: '16', hash: hash(116)}, freshness: {indexedAt: '2026-09-08T06:00:00.000Z', ageMs: 11000, head: '18', stale: true}};
  assert.deepEqual(decode(value), value);
  for (const change of [{historical: false}, {status: 'available'}, {code: 'INVOICES_AVAILABLE'}, {asOf: {height: '17', hash: hash(117)}},
    {coverage: {...value.coverage, coveredBlocks: '5'}}, {coverage: {...value.coverage, complete: false}},
    {freshness: {...value.freshness, head: '16'}}, {freshness: {...value.freshness, ageMs: -1}},
    {freshness: {...value.freshness, indexedAt: 'tomorrow'}}, {freshness: {...value.freshness, head: '1e18'}}]) assert.throws(() => decode({...value, ...change}));
  const future = invoiceObservation(); future.data.invoice.created.blockNumber = '16'; future.data.invoice.updated.blockNumber = '16'; assert.throws(() => decode(future));
});
test('only a checked canonical 404 can mean invoice not found', () => {
  const absent = {...invoiceObservation(), code: 'INVOICE_NOT_FOUND', data: {invoice: null}, message: 'Invoice not found in the canonical indexed history at the indicated block.', retryable: false, field: 'id', requestId: 'req-1'};
  assert.deepEqual(decode(absent, 404), absent);
  assert.throws(() => decode(absent, 200)); assert.throws(() => decode(invoiceObservation(), 404));
  assert.throws(() => decode({...absent, status: 'unavailable'}, 404));
  assert.throws(() => decode({...absent, coverage: {...absent.coverage, complete: false}}, 404));
  assert.throws(() => decode({...invoiceObservation(), data: {invoice: null}}, 200));
  assert.throws(() => decode({code: 'INVOICE_NOT_FOUND', data: null}, 503));
});
test('terminal invoice events must have a strictly later block-global log position', () => {
  const value = invoiceObservation(), invoice = value.data.invoice;
  invoice.status = 'cancelled'; invoice.version = '2';
  invoice.updated = {...invoice.created, txHash: hash(9000), logIndex: invoice.created.logIndex + 1, event: 'InvoiceCancelled'};
  assert.deepEqual(decode(value), value);
  invoice.updated.logIndex = invoice.created.logIndex;
  assert.throws(() => decode(value), /event order/);
});
