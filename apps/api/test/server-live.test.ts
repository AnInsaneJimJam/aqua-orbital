import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.js';
import type {Invalidation, NotificationSource} from '../src/events.js';
import type {ReadinessDependencies} from '../src/readiness.js';

const hash = `0x${'ab'.repeat(32)}`, address = `0x${'11'.repeat(20)}`;
const manifest = {chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', explorerUrl: 'https://example.invalid', verified: true, aqua: `0x${'33'.repeat(20)}`, router: `0x${'44'.repeat(20)}`, payments: `0x${'55'.repeat(20)}`, usdc: address, startBlock: '1', tokens: [{address, symbol: 'USDC', decimals: 6, mock: true}, {address: `0x${'22'.repeat(20)}`, symbol: 'oUSD18', decimals: 18, mock: true}]};
class Source implements NotificationSource {
  subscribers = new Set<{event: (event: Invalidation) => void; lost: () => void}>();
  async subscribe(event: (event: Invalidation) => void, lost: () => void) { const entry = {event, lost}; this.subscribers.add(entry); return () => { this.subscribers.delete(entry); }; }
  emit(event: Invalidation) { for (const entry of this.subscribers) entry.event(event); }
  async close() { for (const entry of [...this.subscribers]) entry.lost(); this.subscribers.clear(); }
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'orbital-api-test-'));
  const manifestPath = join(directory, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  const source = new Source();
  const materialization = () => ({deploymentId: `0x${'12'.repeat(32)}`, identityMatches: true,
    cursor: {height: 10n, hash, updatedAt: new Date(), canonical: true, projectionVersion: 1}});
  const dependencies: ReadinessDependencies = {
    async readDatabase() { return {height: 10n, hash, status: 'indexing', updatedAt: new Date(), canonical: true, materialization: materialization()}; },
    async readRpc() { return {chainId: 31337, head: 12n, indexedBlockHash: hash}; },
  };
  const app = await createServer({manifestPath, dependencies, notifications: source, logger: false});
  const url = await app.listen({host: '127.0.0.1', port: 0});
  return {app, url, source, dependencies, async close() { await app.close(); await rm(directory, {recursive: true}); }};
}
async function read(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('SSE_TIMEOUT')), 1500); })]);
    return new TextDecoder().decode(value.value);
  } finally { if (timer) clearTimeout(timer); }
}

test('readiness route exposes dependency freshness without enabling financial routes', async () => {
  const server = await setup();
  try {
    const ready = await server.app.inject('/ready'); assert.equal(ready.statusCode, 200); assert.equal(ready.json().financialExecutionEnabled, false);
    assert.equal((await server.app.inject('/metrics')).statusCode, 503);
    const quote = await server.app.inject({method: 'POST', url: '/quotes/swap', payload: {wallet: `0x${'66'.repeat(20)}`, recipient: `0x${'66'.repeat(20)}`, tokenIn: address, tokenOut: `0x${'22'.repeat(20)}`, amountInRaw: '1000000', slippageBps: 10, maxCrossings: 16}});
    assert.equal(quote.statusCode, 503); assert.equal(quote.json().code, 'QUOTE_DATABASE_UNAVAILABLE');
    assert.equal(quote.json().data, null); assert.equal(quote.json().financialExecutionEnabled, false); assert.ok(quote.json().requestId);
    server.dependencies.readDatabase = async () => ({height: 10n, hash, status: 'resync_required', updatedAt: new Date(), canonical: true, materialization: null});
    const blocked = await server.app.inject('/ready'); assert.equal(blocked.statusCode, 503); assert.equal(blocked.json().code, 'INDEXER_RESYNC_REQUIRED');
    assert.equal((await server.app.inject('/events')).statusCode, 503);
  } finally { await server.close(); }
});

test('readiness and SSE reject a fresh raw cursor without deployment materialization', async () => {
  const server = await setup();
  try {
    server.dependencies.readDatabase = async () => ({height: 10n, hash, status: 'indexing', updatedAt: new Date(), canonical: true, materialization: null});
    const ready = await server.app.inject('/ready');
    assert.equal(ready.statusCode, 503);
    assert.deepEqual(ready.json(), {status: 'unavailable', code: 'MATERIALIZATION_NOT_STARTED', financialExecutionEnabled: false});
    assert.equal((await server.app.inject('/events')).statusCode, 503);
    assert.equal(server.source.subscribers.size, 0);
    assert.equal((await server.app.inject('/metrics')).statusCode, 503);
  } finally { await server.close(); }
});

test('SSE emits committed chain invalidations, filters other chains, and cleans up on disconnect', async () => {
  const server = await setup(); const abort = new AbortController();
  try {
    const response = await fetch(`${server.url}/events`, {signal: abort.signal, headers: {origin: 'http://127.0.0.1:3002'}});
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3002');
    const reader = response.body!.getReader(); const initial = await read(reader);
    assert.match(initial, /"type":"refresh"/); assert.match(initial, /"block":"10"/);
    server.source.emit({type: 'block', chainId: 1, block: '11', hash});
    server.source.emit({type: 'reorg', chainId: 31337, block: '9', hash});
    const update = await read(reader); assert.match(update, /"type":"reorg"/); assert.doesNotMatch(update, /"chainId":1[,}]/); assert.doesNotMatch(update, /entityId/);
    abort.abort();
    for (let i = 0; server.source.subscribers.size && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(server.source.subscribers.size, 0);
  } finally { abort.abort(); await server.close(); }
});

test('server shutdown closes active SSE streams and notification subscriptions', async () => {
  const server = await setup(); const abort = new AbortController();
  try {
    const response = await fetch(`${server.url}/events`, {signal: abort.signal});
    assert.equal(response.status, 200);
    const reader = response.body!.getReader(); await read(reader);
    await Promise.race([server.app.close(), new Promise<never>((_, reject) => setTimeout(() => reject(Error('SERVER_CLOSE_TIMEOUT')), 1500))]);
    assert.equal(server.source.subscribers.size, 0);
  } finally { abort.abort(); await server.close(); }
});

test('a backpressured SSE consumer is disconnected without accumulating an application queue', async () => {
  const server = await setup(); const abort = new AbortController();
  try {
    const response = await fetch(`${server.url}/events`, {signal: abort.signal});
    assert.equal(response.status, 200); await read(response.body!.getReader());
    for (let i = 0; server.source.subscribers.size && i < 10_000; i++) {
      server.source.emit({type: 'block', chainId: 31337, block: String(i + 11), hash});
    }
    assert.equal(server.source.subscribers.size, 0);
  } finally { abort.abort(); await server.close(); }
});
