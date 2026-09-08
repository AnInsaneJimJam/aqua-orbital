import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalChain} from '@orbital/db';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type pg from 'pg';
import {encodeAbiParameters, encodeEventTopics, parseAbiItem, type AbiEvent} from 'viem';
import {readReceiptMetrics} from '@orbital/db';
import {deploymentScope} from '../../indexer/src/materializer.js';
import {createServer} from '../src/server.js';
import {getMetrics} from '../src/metrics.js';
import {metricsFixture, manifest, gross, fee, hash, header, swapTopic} from './metrics-fixture.js';

test('metrics require verified deployment and indexed scope; absence never reports zero activity', async () => {
  assert.equal((await getMetrics(null)).code, 'DEPLOYMENT_UNAVAILABLE');
  assert.equal((await getMetrics({...manifest, verified: false})).totals, null);
  assert.equal((await getMetrics(manifest)).code, 'DATABASE_UNAVAILABLE');
  const env = await metricsFixture(); try {
    const result = await getMetrics({...manifest, router: `0x${'77'.repeat(20)}`}, env.dependencies);
    assert.equal(result.status, 'unavailable'); assert.equal(result.totals, null);
  } finally { await env.close(); }
});

test('canonical custom receipts yield exact cumulative amounts beyond uint256, typed units and chain dates', async () => {
  const env = await metricsFixture(); try {
    const result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.status, 'available'); assert.equal(result.financialExecutionEnabled, false);
    assert.equal(result.coverage?.coveredBlocks, '3'); assert.equal(result.coverage?.complete, true);
    assert.equal(result.totals?.swapCount, '2'); assert.equal(result.totals.activeStrategyCount, '1');
    assert.equal(result.totals.activeStrategyCountBasis, 'lifecycle-active'); assert.equal(result.totals.fundabilityVerified, false);
    const pair = result.totals.pairs[0]!;
    assert.equal(pair.grossInputRaw, (2n * gross).toString()); assert.equal(pair.netInputRaw, (2n * (gross - fee)).toString());
    assert.equal(pair.feeRaw, (2n * fee).toString()); assert.equal(pair.amountOutRaw, '18014398509481986');
    assert.equal(pair.inputToken.kind, 'demo-token'); assert.equal(pair.inputToken.decimals, 18);
    assert.equal(pair.outputToken.kind, 'settlement-usdc'); assert.equal(pair.outputToken.nativeUsdc, false);
    assert.equal(result.totals.inputTokens[0]!.feeRaw, pair.feeRaw);
    assert.equal(result.totals.observedDates?.first.timestampSeconds, '1700000002');
    assert.equal(result.totals.observedDates?.last.iso, '2023-11-14T22:13:23.000Z');
    assert.doesNotMatch(JSON.stringify(result), /rpcUrl|explorerUrl|APY|usdValue|priceOracle/);
  } finally { await env.close(); }
});

test('older coverage gaps remain unavailable even with a complete latest block', async () => {
  const env = await metricsFixture(); try {
    await env.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=1');
    let result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.code, 'SWAP_COVERAGE_INCOMPLETE'); assert.equal(result.totals, null);
    assert.equal(result.coverage?.coveredBlocks, '2');
    await env.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=1; DELETE FROM deployment_blocks WHERE height=2');
    result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.code, 'SWAP_COVERAGE_INCOMPLETE'); assert.equal(result.totals, null);
  } finally { await env.close(); }
});

test('only the custom event counts, and missing custom receipt projection invalidates complete totals', async () => {
  const env = await metricsFixture(); try {
    // Signatures match pinned SwapVM.sol:64, IAqua.sol:69 and IERC20.Transfer.
    // They can share a transaction with the custom fill without adding volume.
    const ignored = [
      {abi: parseAbiItem('event Swapped(bytes32 orderHash,address maker,address taker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)'),
        emitter: manifest.router, args: {orderHash: hash(800), maker: manifest.payments, taker: manifest.payments, tokenIn: manifest.tokens[1]!.address, tokenOut: manifest.usdc, amountIn: gross, amountOut: 9n}},
      {abi: parseAbiItem('event Pushed(address maker,address app,bytes32 strategyHash,address token,uint256 amount)'),
        emitter: manifest.aqua, args: {maker: manifest.payments, app: manifest.router, strategyHash: hash(800), token: manifest.usdc, amount: gross}},
      ...[manifest.tokens[1]!.address, manifest.usdc].map(emitter => ({abi: parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)'),
        emitter, args: {from: manifest.payments, to: manifest.router, value: 123n}})),
    ];
    for (let i = 0; i < ignored.length; i++) {
      const item = ignored[i]!, abi = item.abi as AbiEvent, args = item.args as Record<string, unknown>;
      const topics = encodeEventTopics({abi: [abi], eventName: abi.name, args} as never);
      const data = encodeAbiParameters(abi.inputs.filter(input => !input.indexed), abi.inputs.filter(input => !input.indexed).map(input => args[input.name!]));
      await env.db.pool.query(`INSERT INTO chain_events(chain_id,block_hash,tx_hash,log_index,emitter,topic,payload)
        VALUES(31337,$1,$2,$3,$4,$5,$6)`, [hash(2), hash(102), 10 + i, item.emitter.toLowerCase(), topics[0], JSON.stringify({version: 1, topics, data})]);
    }
    assert.equal((await getMetrics(manifest, env.dependencies)).totals?.swapCount, '2');
    await env.db.pool.query('DELETE FROM swap_receipts WHERE block_number=2');
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'SWAP_RECEIPT_COVERAGE_MISMATCH');
  } finally { await env.close(); }
});

test('complete old receipts are explicitly stale; resync, wrong chain and hash mismatch are unavailable', async () => {
  const env = await metricsFixture(); try {
    await env.db.pool.query("UPDATE indexer_state SET updated_at=now()-interval '11 seconds'");
    let result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.status, 'stale'); assert.equal(result.freshness?.stale, true); assert.equal(result.totals?.swapCount, '2');
    const rpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (...args) => ({...await rpc(...args), head: 9n});
    assert.equal((await getMetrics(manifest, env.dependencies)).status, 'stale');
    env.dependencies.readRpc = async (...args) => ({...await rpc(...args), chainId: 1});
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'RPC_CHAIN_MISMATCH');
    env.dependencies.readRpc = async (...args) => ({...await rpc(...args), blocks: (await rpc(...args)).blocks.map(block => ({...block, hash: hash(999)}))});
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'RPC_BLOCK_MISMATCH');
    await env.db.pool.query("UPDATE indexer_state SET status='resync_required'");
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'RESYNC_REQUIRED');
  } finally { await env.close(); }
});

test('immutable identity and aligned canonical cursors are required', async () => {
  const env = await metricsFixture(); try {
    assert.equal((await getMetrics({...manifest, tokens: manifest.tokens.map(token => ({...token, mock: !token.mock}))}, env.dependencies)).code, 'MATERIALIZATION_DEPLOYMENT_MISMATCH');
    await env.db.pool.query('UPDATE deployment_cursor SET height=2,hash=$1', [hash(2)]);
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'MATERIALIZATION_BEHIND');
    await env.db.pool.query('UPDATE deployment_cursor SET height=3,hash=$1', [hash(3)]);
    await env.db.pool.query('UPDATE deployments SET router=$1', [`0x${'88'.repeat(20)}`]);
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'MATERIALIZATION_DEPLOYMENT_MISMATCH');
  } finally { await env.close(); }
});

test('reorg between metrics snapshot and RPC cannot return mixed totals', async () => {
  const env = await metricsFixture(); try {
    const rpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (...args) => {
      await reconcileCanonicalChain(env.db.pool, manifest.chainId, {height: 3n, hash: hash(3)}, [
        {number: 3n, hash: hash(53), parentHash: hash(2)}, header(2),
      ]);
      return rpc(...args);
    };
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'METRICS_SNAPSHOT_CHANGED');
    env.dependencies.readRpc = async (_manifest, blocks) => ({chainId: 31337, head: 4n, blocks: blocks.map(block => ({...block, timestamp: 1700000000n + BigInt(block.height)}))});
    const replay = await getMetrics(manifest, env.dependencies);
    assert.equal(replay.totals?.swapCount, '1'); assert.equal(replay.coverage?.expectedBlocks, '2');
  } finally { await env.close(); }
});

test('empty covered history has honest zero totals and no invented date; retirement changes lifecycle count', async () => {
  const env = await metricsFixture({swaps: false, retired: true}); try {
    const readRpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (configured, blocks) => { assert.equal(blocks.length, 1); return readRpc(configured, blocks); };
    const result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.totals?.swapCount, '0'); assert.equal(result.totals.activeStrategyCount, '0');
    assert.deepEqual(result.totals.pairs, []); assert.equal(result.totals.observedDates, null);
  } finally { await env.close(); }
});

test('bounded RPC failure returns unavailable with no transport details or fixture fallback', async () => {
  const env = await metricsFixture(); try {
    env.dependencies.readRpc = async () => { throw Error('private rpc credentials should be redacted'); };
    let result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.code, 'RPC_UNAVAILABLE'); assert.equal(result.totals, null);
    assert.equal(result.coverage?.complete, true, 'database coverage is independent of RPC availability');
    assert.doesNotMatch(JSON.stringify(result), /credentials|private rpc/);
    const cached = await env.dependencies.readDatabase(manifest);
    env.dependencies.readDatabase = async () => cached;
    env.dependencies.readRpc = () => new Promise(() => {});
    result = await getMetrics(manifest, env.dependencies, Date.now(), 15);
    assert.equal(result.code, 'RPC_UNAVAILABLE');
  } finally { await env.close(); }
});

test('coverage and totals share one MVCC snapshot across an intervening writer commit', async () => {
  const env = await metricsFixture(); try {
    let changed = false;
    const reader = {async connect() {
      const client = await env.db.pool.connect(), query = client.query.bind(client);
      const wrapped = Object.create(client) as pg.PoolClient;
      wrapped.release = () => client.release();
      wrapped.query = (async (sql: string, values?: unknown[]) => {
        const result = await query(sql, values);
        if (!changed && sql.includes('AS covered_blocks')) {
          changed = true;
          await env.db.pool.query('BEGIN; DELETE FROM swap_receipts WHERE block_number=2; UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=2; COMMIT');
        }
        return result;
      }) as typeof client.query;
      return wrapped;
    }} as pg.Pool;
    const before = await readReceiptMetrics(reader, deploymentScope(manifest), swapTopic);
    assert.equal(changed, true); assert.equal(before.code, 'METRICS_COMPLETE'); assert.equal(before.totals?.swapCount, '2');
    const after = await env.dependencies.readDatabase(manifest);
    assert.equal(after.code, 'SWAP_COVERAGE_INCOMPLETE'); assert.equal(after.totals, null);
  } finally { await env.close(); }
});

test('single receipt block dates are deduplicated and mismatched historical date hashes are rejected', async () => {
  const env = await metricsFixture(); try {
    await reconcileCanonicalChain(env.db.pool, manifest.chainId, {height: 3n, hash: hash(3)}, [
      {number: 3n, hash: hash(53), parentHash: hash(2)}, header(2),
    ]);
    env.dependencies.readRpc = async (_manifest, blocks) => {
      assert.equal(blocks.length, 1);
      return {chainId: 31337, head: 4n, blocks: blocks.map(block => ({...block, timestamp: 1700000002n}))};
    };
    const result = await getMetrics(manifest, env.dependencies);
    assert.deepEqual(result.totals?.observedDates?.first, result.totals?.observedDates?.last);
    env.dependencies.readRpc = async (_manifest, blocks) => ({chainId: 31337, head: 4n, blocks: blocks.map(block => ({...block, hash: hash(999), timestamp: 1700000002n}))});
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'RPC_BLOCK_MISMATCH');
  } finally { await env.close(); }
});

test('HTTP metrics expose live read projections through documented route without enabling quotes', async () => {
  const env = await metricsFixture(), directory = await mkdtemp(join(tmpdir(), 'orbital-metrics-'));
  const manifestPath = join(directory, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  const app = await createServer({manifestPath, metricsDependencies: env.dependencies, logger: false});
  try {
    for (const route of ['/metrics', '/api/v1/metrics']) {
      const response = await app.inject(route); assert.equal(response.statusCode, 200);
      assert.equal(response.json().totals.swapCount, '2'); assert.equal(response.json().financialExecutionEnabled, false);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.equal((await app.inject('/ready')).statusCode, 503);
    assert.equal((await app.inject({method: 'POST', url: '/quotes/payment', payload: {}})).statusCode, 400);
    await env.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0 WHERE height=1');
    const unavailable = await app.inject('/metrics'); assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.json().totals, null);
  } finally { await app.close(); await env.close(); await rm(directory, {recursive: true, force: true}); }
});

test('a slow database read accepts an indexer timestamp created during the request', async () => {
  const env = await metricsFixture(); try {
    const read = env.dependencies.readDatabase; let first = true;
    env.dependencies.readDatabase = async configured => {
      if (first) {
        first = false;
        await new Promise(resolve => setTimeout(resolve, 1200));
        const observedTime = new Date(); // Keep this regression independent of host/container clock skew.
        await env.db.pool.query('UPDATE indexer_state SET updated_at=$1', [observedTime]);
        await env.db.pool.query('UPDATE deployment_cursor SET updated_at=$1', [observedTime]);
      }
      return read(configured);
    };
    const result = await getMetrics(manifest, env.dependencies);
    assert.equal(result.status, 'available'); assert.equal(result.code, 'METRICS_AVAILABLE');
    assert.ok(result.freshness!.ageMs >= 0 && result.freshness!.ageMs < 10000);
    const snapshot = await read(manifest);
    env.dependencies.readDatabase = async () => ({...snapshot, indexedAt: new Date(Date.now() + 10000).toISOString()});
    assert.equal((await getMetrics(manifest, env.dependencies)).code, 'INDEXER_TIME_INVALID');
  } finally { await env.close(); }
});
