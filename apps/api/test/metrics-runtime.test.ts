import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createReadDependencies} from '../src/runtime.js';
import {getMetrics} from '../src/metrics.js';
import {metricsFixture, manifest, hash} from './metrics-fixture.js';

type Request = {jsonrpc: '2.0'; id: number; method: string; params: unknown[]};
async function rpcServer(before: (request: Request) => Promise<void> = async () => {}) {
  const calls: Request[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Request; calls.push(body);
    await before(body);
    const height = body.method === 'eth_getBlockByNumber' ? BigInt(String(body.params[0])) : 0n;
    const result = body.method === 'eth_chainId' ? '0x7a69' : body.method === 'eth_blockNumber' ? '0x5' : {
      number: `0x${height.toString(16)}`, hash: hash(Number(height)), parentHash: hash(Number(height - 1n)),
      timestamp: `0x${(1700000000n + height).toString(16)}`, transactions: [], uncles: [],
      gasLimit: '0x100000', gasUsed: '0x0', size: '0x100', difficulty: '0x0', totalDifficulty: '0x0',
    };
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, result}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {calls, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); })};
}

test('production read dependencies bind real PostgreSQL metrics to bounded HTTP chain/header reads', async () => {
  const env = await metricsFixture(), rpc = await rpcServer(), runtime = createReadDependencies(env.db.pool.options.connectionString!);
  try {
    const result = await getMetrics({...manifest, rpcUrl: rpc.url}, runtime.metricsDependencies);
    assert.equal(result.status, 'available'); assert.equal(result.totals?.swapCount, '2');
    assert.equal(result.totals.observedDates?.first.timestampSeconds, '1700000002');
    assert.deepEqual(rpc.calls.map(call => call.method).sort(), ['eth_blockNumber', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByNumber']);
    assert.deepEqual(rpc.calls.filter(call => call.method === 'eth_getBlockByNumber').map(call => call.params[0]).sort(), ['0x2', '0x3']);
    assert.ok(rpc.calls.every(call => !/send|sign/i.test(call.method)));
  } finally { await runtime.close(); await rpc.close(); await env.close(); }
});

test('metrics and readiness share an eight-request RPC capacity bound and release it after completion', async () => {
  let release!: () => void, arrived!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const allArrived = new Promise<void>(resolve => { arrived = resolve; });
  let pending = 0, peak = 0;
  const rpc = await rpcServer(async () => { pending++; peak = Math.max(peak, pending); if (pending === 8) arrived(); await barrier; pending--; });
  const runtime = createReadDependencies(process.env.TEST_DATABASE_URL!);
  const configured = {...manifest, rpcUrl: rpc.url};
  const cursor = {height: 3n, hash: hash(3), status: 'indexing' as const, updatedAt: new Date(), canonical: true, materialization: null};
  let closed = false;
  try {
    const metrics = runtime.metricsDependencies.readRpc(configured, [1, 2, 3].map(n => ({height: String(n), hash: hash(n)})));
    const ready = runtime.dependencies.readRpc(configured, cursor);
    await assert.rejects(() => runtime.dependencies.readRpc(configured, cursor), /RPC_CAPACITY/);
    const timer = setTimeout(arrived, 5000);
    await allArrived; clearTimeout(timer); assert.equal(peak, 8);
    release(); const [observed, readiness] = await Promise.all([metrics, ready]);
    assert.equal(observed.blocks.length, 3); assert.equal(readiness.chainId, 31337);
    assert.equal((await runtime.metricsDependencies.readRpc(configured, [{height: '3', hash: hash(3)}])).blocks.length, 1);
    await runtime.close(); closed = true;
    await assert.rejects(() => runtime.metricsDependencies.readRpc(configured, [{height: '3', hash: hash(3)}]), /RPC_CAPACITY/);
  } finally { release(); if (!closed) await runtime.close(); await rpc.close(); }
});
