import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atomicBlock, indexerSnapshot, type BlockHeader} from '@orbital/db';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {syncOnce, type ReadRpc, type RawLog} from '../src/worker.js';

const config = {chainId: 31337, startBlock: 1n, emitters: ['0xaaaa']};
function header(height: number, branch = 'a', parentBranch = branch): BlockHeader {
  return {number: BigInt(height), hash: `${branch}${height}`, parentHash: `${parentBranch}${height - 1}`};
}
function log(block: BlockHeader): RawLog {
  return {blockNumber: block.number, blockHash: block.hash, transactionHash: `tx${block.hash}`, logIndex: 0, address: '0xaaaa', topics: ['0xtopic'], data: '0x'};
}
function fixture(headers: BlockHeader[], head = headers.at(-1)!.number): ReadRpc {
  const byNumber = new Map(headers.map(block => [block.number, block]));
  return {
    async getBlockNumber() { return head; },
    async getBlock(number) { const block = byNumber.get(number); if (!block) throw Error('RPC_BLOCK_UNAVAILABLE'); return block; },
    async getLogs(number) { return [log(await this.getBlock(number))]; },
  };
}

test('worker reorg recovery runs without new confirmed blocks, replays, then resumes idempotently', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 3; height++) await atomicBlock(db.pool, config.chainId, header(height), []);
    const fork = [header(1), header(2, 'b', 'a'), header(3, 'b')];
    assert.deepEqual(await syncOnce(db.pool, config, fixture(fork)), {status: 'rolled_back', block: 1n, hash: 'a1', removedBlocks: 2});
    assert.equal((await syncOnce(db.pool, config, fixture(fork))).status, 'idle');
    const rpc = fixture([...fork, header(4, 'b'), header(5, 'b')]);
    assert.equal((await syncOnce(db.pool, config, rpc)).block, 2n);
    assert.equal((await syncOnce(db.pool, config, rpc)).block, 3n);
    assert.equal((await syncOnce(db.pool, config, rpc)).status, 'idle');
    assert.deepEqual((await indexerSnapshot(db.pool, config.chainId)).cursor, {height: 3n, hash: 'b3'});
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count, '2');
  } finally { await db.close(); }
});

test('RPC changes while the common ancestor is scanned cause retry without rollback', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 3; height++) await atomicBlock(db.pool, config.chainId, header(height), []);
    const rpc = fixture([header(1), header(2), header(3, 'b', 'a')]);
    const read = rpc.getBlock.bind(rpc); let topReads = 0;
    rpc.getBlock = async number => number === 3n && ++topReads > 1 ? header(3, 'c', 'a') : read(number);
    assert.equal((await syncOnce(db.pool, config, rpc)).status, 'retry');
    assert.deepEqual((await indexerSnapshot(db.pool, config.chainId)).cursor, {height: 3n, hash: 'a3'});
  } finally { await db.close(); }
});

test('an RPC missing a stored block does not delete history or declare a deep reorg', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 3; height++) await atomicBlock(db.pool, config.chainId, header(height), []);
    await assert.rejects(() => syncOnce(db.pool, config, fixture([header(1), header(3, 'b')])), /RPC_BLOCK_UNAVAILABLE/);
    const state = await indexerSnapshot(db.pool, config.chainId);
    assert.equal(state.status, 'indexing');
    assert.deepEqual(state.cursor, {height: 3n, hash: 'a3'});
  } finally { await db.close(); }
});

test('a lagging RPC head cannot delete potentially canonical stored history', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 4; height++) await atomicBlock(db.pool, config.chainId, header(height), []);
    assert.deepEqual(await syncOnce(db.pool, config, fixture([header(1), header(2)])), {status: 'retry'});
    assert.deepEqual((await indexerSnapshot(db.pool, config.chainId)).cursor, {height: 4n, hash: 'a4'});
  } finally { await db.close(); }
});

test('mixed block logs, removed logs and unverified emitters cannot advance the cursor', async () => {
  const db = await isolatedDatabase();
  try {
    const rpc = fixture([header(1), header(2), header(3)]);
    const good = log(header(1));
    for (const bad of [{...good, blockHash: 'orphan'}, {...good, removed: true}, {...good, address: '0xevil'}, {...good, blockNumber: 2n}]) {
      rpc.getLogs = async () => [bad];
      await assert.rejects(() => syncOnce(db.pool, config, rpc), /RPC_INVALID_BLOCK_LOG/);
      assert.equal((await indexerSnapshot(db.pool, config.chainId)).cursor, null);
    }
    rpc.getLogs = async () => [good, good];
    assert.equal((await syncOnce(db.pool, config, rpc)).status, 'indexed');
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count, '1');
  } finally { await db.close(); }
});

test('persistent resync state prevents RPC and further automatic ingestion after restart', async () => {
  const db = await isolatedDatabase();
  try {
    await atomicBlock(db.pool, config.chainId, header(1), []);
    assert.equal((await syncOnce(db.pool, config, fixture([header(1, 'b')]))).status, 'resync_required');
    const rpc: ReadRpc = {async getBlockNumber() { throw Error('MUST_NOT_CALL_RPC'); }, async getBlock() { throw Error('MUST_NOT_CALL_RPC'); }, async getLogs() { throw Error('MUST_NOT_CALL_RPC'); }};
    assert.equal((await syncOnce(db.pool, config, rpc)).status, 'resync_required');
  } finally { await db.close(); }
});
