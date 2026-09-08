import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atomicBlock, atomicDeploymentBlock, reconcileCanonicalChain, type BlockHeader} from '@orbital/db';
import type {DeploymentManifest} from '@orbital/shared';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {deploymentScope} from '../../indexer/src/materializer.js';
import {createReadDependencies} from '../src/runtime.js';
import {checkReadiness, type ReadinessDependencies} from '../src/readiness.js';

const address = (byte: string) => `0x${byte.repeat(20)}` as `0x${string}`;
const hash = (height: number) => `0x${height.toString(16).padStart(64, '0')}`;
const block = (height: number): BlockHeader => ({number: BigInt(height), hash: hash(height), parentHash: hash(height - 1)});
const manifest: DeploymentManifest = {
  chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', explorerUrl: 'https://example.invalid', verified: true,
  aqua: address('33'), router: address('44'), payments: address('55'), usdc: address('11'), startBlock: '1',
  tokens: [{address: address('11'), symbol: 'USDC', decimals: 6, mock: true}, {address: address('22'), symbol: 'oUSD18', decimals: 18, mock: true}],
};
const scope = deploymentScope(manifest);
async function setup() {
  const db = await isolatedDatabase();
  const runtime = createReadDependencies(db.pool.options.connectionString!);
  const dependencies: ReadinessDependencies = {...runtime.dependencies, async readRpc(_manifest, cursor) {
    return {chainId: manifest.chainId, head: cursor.height + 2n, indexedBlockHash: cursor.hash};
  }};
  return {db, dependencies, check: (configured = manifest) => checkReadiness(configured, dependencies),
    async close() { await runtime.close(); await db.close(); }};
}

test('real DB: raw-only and another deployment cannot provide readiness for the configured deployment', async () => {
  const env = await setup();
  try {
    await atomicBlock(env.db.pool, manifest.chainId, block(1), []);
    assert.equal((await env.check()).code, 'MATERIALIZATION_NOT_STARTED');
    const other = deploymentScope({...manifest, router: address('66')});
    await atomicDeploymentBlock(env.db.pool, other, block(1), [], []);
    assert.equal((await env.check()).code, 'MATERIALIZATION_NOT_STARTED');
    await atomicDeploymentBlock(env.db.pool, scope, block(1), [], []);
    const ready = await env.check();
    assert.equal(ready.status, 'ready'); assert.equal(ready.financialExecutionEnabled, false);
    const stored = await env.dependencies.readDatabase(manifest);
    assert.equal(stored?.materialization?.deploymentId, scope.id);
    assert.equal(stored?.materialization?.identityMatches, true);
  } finally { await env.close(); }
});

test('real DB: confirmed raw tip does not hide partial backfill or stale deployment ingestion', async () => {
  const env = await setup();
  try {
    await atomicBlock(env.db.pool, manifest.chainId, block(1), []);
    await atomicBlock(env.db.pool, manifest.chainId, block(2), []);
    await atomicDeploymentBlock(env.db.pool, scope, block(1), [], []);
    assert.equal((await env.check()).code, 'MATERIALIZATION_BEHIND');
    await atomicDeploymentBlock(env.db.pool, scope, block(2), [], []);
    assert.equal((await env.check()).status, 'ready');
    await env.db.pool.query("UPDATE deployment_cursor SET updated_at=now()-interval '11 seconds'");
    await env.db.pool.query('UPDATE indexer_state SET updated_at=now()');
    assert.equal((await env.check()).code, 'MATERIALIZATION_STALE');
  } finally { await env.close(); }
});

test('real DB: immutable manifest identity is required; public transport and presentation changes do not change scope', async () => {
  const env = await setup();
  try {
    await atomicDeploymentBlock(env.db.pool, scope, block(1), [], []);
    for (const changed of [
      {...manifest, startBlock: '0'},
      {...manifest, tokens: manifest.tokens.map(token => token.address === address('22') ? {...token, decimals: 6} : token)},
      {...manifest, tokens: manifest.tokens.map(token => ({...token, mock: false}))},
    ]) assert.equal((await env.check(changed)).code, 'MATERIALIZATION_DEPLOYMENT_MISMATCH');
    const transport = {...manifest, rpcUrl: 'https://rpc.invalid/?private-key=never-persist', explorerUrl: 'https://other.invalid', tokens: [...manifest.tokens].reverse().map(token => ({...token, symbol: 'Renamed'}))};
    const ready = await env.check(transport);
    assert.equal(ready.status, 'ready'); assert.doesNotMatch(JSON.stringify(ready), /private-key|never-persist/);
    // Corrupted role columns must fail even when identity JSON remains unchanged.
    await env.db.pool.query('UPDATE deployments SET router=$1', [address('77')]);
    assert.equal((await env.check()).code, 'MATERIALIZATION_DEPLOYMENT_MISMATCH');
  } finally { await env.close(); }
});

test('real DB: deployment cursor needs a versioned marker at the same canonical block height/hash', async () => {
  const env = await setup();
  try {
    await atomicDeploymentBlock(env.db.pool, scope, block(1), [], []);
    await atomicDeploymentBlock(env.db.pool, scope, block(2), [], []);
    await env.db.pool.query('UPDATE deployment_cursor SET hash=$1', [hash(50)]);
    assert.equal((await env.check()).code, 'MATERIALIZATION_ORPHANED');
    await env.db.pool.query('UPDATE deployment_cursor SET hash=$1', [hash(2)]);
    await env.db.pool.query('UPDATE deployment_blocks SET block_hash=$1 WHERE height=2', [hash(1)]);
    assert.equal((await env.check()).code, 'MATERIALIZATION_ORPHANED');
    await env.db.pool.query('DELETE FROM deployment_blocks WHERE height=2');
    assert.equal((await env.check()).code, 'MATERIALIZATION_ORPHANED');
    await env.db.pool.query('DELETE FROM deployment_cursor');
    assert.equal((await env.check()).code, 'MATERIALIZATION_NOT_STARTED');
  } finally { await env.close(); }
});

test('real DB: atomic canonical rewind during RPC and deployment-only change cannot return ready', async () => {
  const env = await setup();
  try {
    await atomicDeploymentBlock(env.db.pool, scope, block(1), [], []);
    await atomicDeploymentBlock(env.db.pool, scope, block(2), [], []);
    env.dependencies.readRpc = async () => {
      await reconcileCanonicalChain(env.db.pool, manifest.chainId, {height: 2n, hash: hash(2)}, [
        {number: 2n, hash: hash(52), parentHash: hash(1)}, block(1),
      ]);
      return {chainId: manifest.chainId, head: 4n, indexedBlockHash: hash(2)};
    };
    assert.equal((await env.check()).code, 'INDEXER_CHANGED');
    env.dependencies.readRpc = async () => {
      await env.db.pool.query('DELETE FROM deployment_cursor');
      return {chainId: manifest.chainId, head: 3n, indexedBlockHash: hash(1)};
    };
    assert.equal((await env.check()).code, 'MATERIALIZATION_NOT_STARTED');
  } finally { await env.close(); }
});
