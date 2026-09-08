import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkReadiness, type ReadinessDependencies, type IndexedState} from '../src/readiness.js';
import type {DeploymentManifest} from '@orbital/shared';

export const hash = `0x${'ab'.repeat(32)}`;
const address = `0x${'11'.repeat(20)}`;
export const manifest: DeploymentManifest = {
  chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', explorerUrl: 'https://example.invalid', verified: true,
  aqua: `0x${'33'.repeat(20)}`, router: `0x${'44'.repeat(20)}`, payments: `0x${'55'.repeat(20)}`, usdc: address, startBlock: '1',
  tokens: [{address, symbol: 'USDC', decimals: 6, mock: true}, {address: `0x${'22'.repeat(20)}`, symbol: 'oUSD18', decimals: 18, mock: true}],
};
const now = 1_800_000_000_000;
const projected = {height: 10n, hash, updatedAt: new Date(now - 1000), canonical: true, projectionVersion: 1};
const materialization = {deploymentId: `0x${'12'.repeat(32)}`, identityMatches: true, cursor: projected};
const state: IndexedState = {height: 10n, hash, status: 'indexing', updatedAt: new Date(now - 1000), canonical: true, materialization};
const dependencies: ReadinessDependencies = {
  async readDatabase() { return state; },
  async readRpc() { return {chainId: manifest.chainId, head: 12n, indexedBlockHash: hash}; },
};

test('readiness fails closed without verified deployment or configured database', async () => {
  const never: ReadinessDependencies = {async readDatabase() { throw Error('MUST_NOT_READ'); }, async readRpc() { throw Error('MUST_NOT_READ'); }};
  assert.equal((await checkReadiness(null, never, now)).code, 'DEPLOYMENT_UNAVAILABLE');
  assert.equal((await checkReadiness({...manifest, verified: false}, never, now)).code, 'DEPLOYMENT_UNAVAILABLE');
  assert.equal((await checkReadiness(manifest, undefined, now)).code, 'DATABASE_UNCONFIGURED');
});

test('readiness requires a recent non-resync cursor and a matching canonical RPC block', async () => {
  const ready = await checkReadiness(manifest, dependencies, now);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.financialExecutionEnabled, false);
  assert.equal(ready.block, '10');
  assert.ok(ready.ageMs! >= 1000 && ready.ageMs! < 10_000);
  for (const [cursor, code] of [
    [null, 'INDEXER_NOT_STARTED'],
    [{...state, status: 'resync_required'}, 'INDEXER_RESYNC_REQUIRED'],
    [{...state, updatedAt: new Date(now - 10_001)}, 'INDEXER_STALE'],
    [{...state, updatedAt: new Date(now + 20_000)}, 'INDEXER_STALE'],
    [{...state, canonical: false}, 'INDEXER_ORPHANED'],
  ] as const) {
    assert.equal((await checkReadiness(manifest, {...dependencies, async readDatabase() { return cursor; }}, now)).code, code);
  }
  for (const [rpc, code] of [
    [{chainId: 1, head: 12n, indexedBlockHash: hash}, 'RPC_CHAIN_MISMATCH'],
    [{chainId: 31337, head: 12n, indexedBlockHash: `0x${'cd'.repeat(32)}`}, 'INDEXER_ORPHANED'],
    [{chainId: 31337, head: 10n, indexedBlockHash: hash}, 'INDEXER_UNCONFIRMED'],
    [{chainId: 31337, head: 1012n, indexedBlockHash: hash}, 'INDEXER_CATCHING_UP'],
  ] as const) {
    assert.equal((await checkReadiness(manifest, {...dependencies, async readRpc() { return rpc; }}, now)).code, code);
  }
});

test('readiness redacts dependency errors and bounds an unresponsive read', async () => {
  const db = await checkReadiness(manifest, {...dependencies, async readDatabase() { throw Error('postgresql://secret-user:secret-password@example.invalid'); }}, now);
  assert.equal(db.code, 'DATABASE_UNAVAILABLE');
  assert.equal(JSON.stringify(db).includes('secret'), false);
  const rpc = await checkReadiness(manifest, {...dependencies, async readRpc() { throw Error('https://rpc.invalid/?secret-key=private'); }}, now);
  assert.equal(rpc.code, 'RPC_UNAVAILABLE');
  assert.equal(JSON.stringify(rpc).includes('private'), false);
  assert.equal((await checkReadiness(manifest, {...dependencies, readDatabase: () => new Promise(() => {})}, now, 20)).code, 'DATABASE_UNAVAILABLE');
});

test('a cursor rewind or resync occurring during RPC checks cannot return ready', async () => {
  for (const latest of [{...state, height: 9n}, {...state, status: 'resync_required'}] as const) {
    let reads = 0;
    const result = await checkReadiness(manifest, {...dependencies, async readDatabase() { return ++reads === 1 ? state : latest; }}, now);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.code, latest.status === 'resync_required' ? 'INDEXER_RESYNC_REQUIRED' : 'INDEXER_CHANGED');
  }
});

test('fresh raw indexing cannot hide missing, mismatched, lagging or stale deployment materialization', async () => {
  for (const [projection, code] of [
    [null, 'MATERIALIZATION_NOT_STARTED'],
    [{...materialization, identityMatches: false}, 'MATERIALIZATION_DEPLOYMENT_MISMATCH'],
    [{...materialization, cursor: null}, 'MATERIALIZATION_NOT_STARTED'],
    [{...materialization, cursor: {...projected, height: 9n}}, 'MATERIALIZATION_BEHIND'],
    [{...materialization, cursor: {...projected, height: 11n}}, 'MATERIALIZATION_AHEAD'],
    [{...materialization, cursor: {...projected, hash: `0x${'cd'.repeat(32)}`}}, 'MATERIALIZATION_ORPHANED'],
    [{...materialization, cursor: {...projected, canonical: false}}, 'MATERIALIZATION_ORPHANED'],
    [{...materialization, cursor: {...projected, projectionVersion: 2}}, 'MATERIALIZATION_VERSION_UNSUPPORTED'],
    [{...materialization, cursor: {...projected, updatedAt: new Date(now - 10_001)}}, 'MATERIALIZATION_STALE'],
    [{...materialization, cursor: {...projected, updatedAt: new Date(now + 20_000)}}, 'MATERIALIZATION_STALE'],
    [{...materialization, cursor: {...projected, updatedAt: new Date(NaN)}}, 'MATERIALIZATION_STALE'],
  ] as const) {
    let calls = 0;
    const result = await checkReadiness(manifest, {
      async readDatabase(received) { assert.deepEqual(received, manifest); return {...state, materialization: projection}; },
      async readRpc() { calls++; return {chainId: 31337, head: 12n, indexedBlockHash: hash}; },
    }, now);
    assert.equal(result.code, code); assert.equal(result.financialExecutionEnabled, false); assert.equal(calls, 0);
  }
});

test('readiness rechecks deployment materialization after RPC and reports the older freshness timestamp', async () => {
  for (const projection of [null, {...materialization, cursor: {...projected, height: 9n}}, {...materialization, identityMatches: false}, {...materialization, deploymentId: `0x${'34'.repeat(32)}`}]) {
    let reads = 0;
    const result = await checkReadiness(manifest, {...dependencies, async readDatabase() {
      return ++reads === 1 ? state : {...state, materialization: projection};
    }}, now);
    assert.equal(result.status, 'unavailable');
  }
  const older = new Date(now - 5000);
  const result = await checkReadiness(manifest, {...dependencies, async readDatabase() {
    return {...state, materialization: {...materialization, cursor: {...projected, updatedAt: older}}};
  }}, now);
  assert.equal(result.status, 'ready'); assert.equal(result.indexedAt, older.toISOString()); assert.ok(result.ageMs! >= 5000);
});
