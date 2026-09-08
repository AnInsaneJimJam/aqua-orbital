import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeSwapQuoteObservation} from '../src/index';

// A retained, explicitly synthetic wire fixture; no API/RPC calls in SDK tests.
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/swap-quote-observation.json', import.meta.url), 'utf8'));
const at = 1700000003200;
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
function decode(value = fixture().observed, status = 200, manifest = fixture().manifest, request = fixture().request, now = at) {
  return decodeSwapQuoteObservation(value, status, manifest, request, now);
}

test('quote observations retain exact large units, configuration and ranked alternatives without authorizing execution', () => {
  const f = fixture(), before = JSON.stringify(f);
  assert.deepEqual(decode(f.observed), f.observed);
  assert.equal(f.observed.data.best.amountInRaw, '9007199254740993');
  assert.equal(f.observed.data.alternatives.length, 3);
  assert.equal(decode(f.observed).financialExecutionEnabled, false);
  assert.equal(JSON.stringify(f), before);
});

test('the echoed request and every retained route bind the wallet, recipient, pair, raw amount and limits', () => {
  assert.equal(decode().status, 'observed');
  for (const change of [{wallet: addr(90)}, {recipient: addr(90)}, {tokenIn: addr(2)}, {amountInRaw: '9007199254740994'}, {slippageBps: 49}, {maxCrossings: 15}]) {
    assert.throws(() => decode(fixture().observed, 200, fixture().manifest, {...fixture().request, ...change}));
  }
  for (const field of ['payer', 'caller', 'recipient', 'tokenIn', 'tokenOut']) {
    const f = fixture(); f.observed.data.alternatives[1][field] = addr(90); assert.throws(() => decode(f.observed));
  }
});

test('deployment roles, allowlisted token decimals and indexing start are independently bound', () => {
  assert.equal(decode().status, 'observed');
  for (const change of [{verified: false}, {chainId: 5042002}, {aqua: addr(90)}, {router: addr(90)}, {payments: addr(90)}, {startBlock: '2'}]) {
    assert.throws(() => decode(fixture().observed, 200, {...fixture().manifest, ...change}));
  }
  const f = fixture(); f.manifest.tokens[2].decimals = 8; assert.throws(() => decode(f.observed, 200, f.manifest));
  for (const field of ['router', 'deploymentStartBlock', 'deploymentId']) {
    const g = fixture(); g.observed[field] = field === 'router' ? addr(90) : field === 'deploymentId' ? `0x${'a'.repeat(64)}` : '2'; assert.throws(() => decode(g.observed));
  }
});

test('config/order hashes, positive version and fee/minimum arithmetic are recomputed for every route', () => {
  assert.equal(decode().status, 'observed');
  const changes = [
    (r: any) => { r.config.makerNonce = '22'; },
    (r: any) => { r.configHash = `0x${'a'.repeat(64)}`; },
    (r: any) => { r.orderHash = `0x${'b'.repeat(64)}`; },
    (r: any) => { r.feeRaw = (BigInt(r.feeRaw)+1n).toString(); },
    (r: any) => { r.feePpm = r.feePpm === 500 ? 1000 : 500; },
    (r: any) => { r.minimumOutRaw = (BigInt(r.minimumOutRaw)+1n).toString(); },
    (r: any) => { r.stateVersion = '0'; },
    (r: any) => { r.maxCrossings = 0; },
    (r: any) => { r.amountInRaw = (BigInt(r.amountInRaw)+1n).toString(); },
    (r: any) => { r.expiresAt = (BigInt(r.expiresAt)+1n).toString(); },
  ];
  for (const mutate of changes) { const f = fixture(); mutate(f.observed.data.alternatives[2]); assert.throws(() => decode(f.observed)); }
});

test('canonical pins, head confirmations, historical flags and timestamp age must agree', () => {
  assert.equal(decode().status, 'observed');
  for (const change of [
    {historical: true}, {asOf: {height: '0', hash: fixture().observed.asOf.hash}},
    {currentIndexedBlock: {height: '3', hash: `0x${'c'.repeat(64)}`}},
  ]) assert.throws(() => decode({...fixture().observed, ...change}));
  for (const change of [{head: '4'}, {head: '6'}, {ageMs: 0}, {blockTimestamp: '1700000010'}, {observedAt: new Date(at+2000).toISOString()}, {indexedAt: new Date(at+2000).toISOString()}]) {
    const f = fixture(); Object.assign(f.observed.freshness, change); assert.throws(() => decode(f.observed));
  }
  assert.throws(() => decode(fixture().observed, 200, fixture().manifest, fixture().request, at+10001));
  assert.throws(() => decode(fixture().observed, 200, fixture().manifest, fixture().request, 1700000023000));
  assert.throws(() => decode(fixture().observed, 200, fixture().manifest, fixture().request, NaN));
});

test('retained routes are distinct, deterministically ranked and backed by successful diagnostics', () => {
  assert.equal(decode().status, 'observed');
  const duplicate = fixture(); duplicate.observed.data.alternatives[0] = duplicate.observed.data.best; assert.throws(() => decode(duplicate.observed));
  const order = fixture(); [order.observed.data.best, order.observed.data.alternatives[2]] = [order.observed.data.alternatives[2], order.observed.data.best]; assert.throws(() => decode(order.observed));
  const diagnostics = fixture(); diagnostics.observed.data.diagnostics[0].orderHash = `0x${'c'.repeat(64)}`; assert.throws(() => decode(diagnostics.observed));
  const counts = fixture(); counts.observed.data.counts.quoted--; assert.throws(() => decode(counts.observed));
});

test('an empty inspected result and a consistent older pin remain observations with explicit limits', () => {
  const f = fixture(); f.observed.code = 'NO_ROUTE_IN_INSPECTED_SET'; f.observed.data.best = null; f.observed.data.alternatives = [];
  f.observed.data.counts.quoted = 0; f.observed.data.counts.failed = 4; f.observed.data.diagnostics.forEach((r: any) => { r.code = 'QUOTE_REVERTED'; });
  assert.deepEqual(decode(f.observed), f.observed);
  const g = fixture(); g.observed.historical = true; g.observed.currentIndexedBlock = {height: '4', hash: `0x${'d'.repeat(64)}`}; g.observed.freshness.head = '6';
  assert.deepEqual(decode(g.observed), g.observed);
});

test('unavailable HTTP envelopes cannot carry partial routes or become a successful observation', () => {
  const f = fixture(); assert.deepEqual(decode(f.unavailable, 503), f.unavailable);
  assert.throws(() => decode(f.unavailable, 200)); assert.throws(() => decode(f.observed, 503));
  assert.throws(() => decode({...f.unavailable, data: f.observed.data}, 503));
  assert.throws(() => decode({...f.observed, financialExecutionEnabled: true}));
  assert.throws(() => decode({...f.observed, transaction: {to: addr(99), data: '0x'}}));
});

test('malformed or lossy monetary values and arbitrary route payloads are rejected', () => {
  assert.equal(decode().status, 'observed');
  for (const value of ['01', '1e18', '-1', '0', '1'.repeat(79), 9007199254740993]) {
    const f = fixture(); f.observed.data.best.amountOutRaw = value; assert.throws(() => decode(f.observed));
  }
  const f = fixture(); f.observed.data.best.calldata = '0x1234'; assert.throws(() => decode(f.observed));
});
