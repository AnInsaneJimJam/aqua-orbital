import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atomicBlock, indexerSnapshot, reconcileCanonicalChain, type BlockHeader} from '../src/index.js';
import {isolatedDatabase} from './helpers.js';

const chainId = 31337;
const block = (height: number, branch = 'a', parentBranch = branch): BlockHeader => ({
  number: BigInt(height), hash: `${branch}${height}`, parentHash: `${parentBranch}${height - 1}`,
});
const event = (height: number) => ({txHash: `tx${height}`, logIndex: 0, emitter: 'emitter', topic: 'topic', payload: {raw: '123456789012345678901234567890'}});

test('reorg atomically removes only orphaned chain blocks/logs, then replay and restart are idempotent', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 4; height++) await atomicBlock(db.pool, chainId, block(height), [event(height)]);
    await atomicBlock(db.pool, 1, block(1), [event(1)]);
    const before = await indexerSnapshot(db.pool, chainId);
    assert.deepEqual(before.cursor, {height: 4n, hash: 'a4'});
    const canonical = [block(4, 'b'), block(3, 'b', 'a'), block(2)];
    const result = await reconcileCanonicalChain(db.pool, chainId, before.cursor!, canonical);
    assert.deepEqual(result, {status: 'rolled_back', cursor: {height: 2n, hash: 'a2'}, removedBlocks: 2});
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events WHERE chain_id=$1', [chainId])).rows[0].count, '2');
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events WHERE chain_id=1')).rows[0].count, '1');
    for (const header of canonical.slice(0, 2).reverse()) await atomicBlock(db.pool, chainId, header, [event(Number(header.number))]);
    await atomicBlock(db.pool, chainId, canonical[0]!, [event(4)]);
    const after = await indexerSnapshot(db.pool, chainId);
    assert.deepEqual(after.cursor, {height: 4n, hash: 'b4'});
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events WHERE chain_id=$1', [chainId])).rows[0].count, '4');
    assert.equal((await reconcileCanonicalChain(db.pool, chainId, after.cursor!, [canonical[0]!])).status, 'unchanged');
  } finally { await db.close(); }
});

test('64 stored blocks includes the 64th candidate, and refuses a deeper reorg durably', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 66; height++) await atomicBlock(db.pool, chainId, block(height), [event(height)]);
    const snapshot = await indexerSnapshot(db.pool, chainId);
    assert.equal(snapshot.blocks.length, 64);
    assert.equal(snapshot.blocks[63]!.number, 3n);
    const canonical = Array.from({length: 63}, (_, index) => block(66 - index, 'b', index === 62 ? 'a' : 'b'));
    canonical.push(block(3));
    assert.equal((await reconcileCanonicalChain(db.pool, chainId, snapshot.cursor!, canonical)).removedBlocks, 63);
    for (const header of canonical.slice(0, -1).reverse()) await atomicBlock(db.pool, chainId, header, [event(Number(header.number))]);
    const deeper = Array.from({length: 64}, (_, index) => block(66 - index, 'c', index === 63 ? 'a' : 'c'));
    const result = await reconcileCanonicalChain(db.pool, chainId, (await indexerSnapshot(db.pool, chainId)).cursor!, deeper);
    assert.equal(result.status, 'resync_required');
    const failed = await indexerSnapshot(db.pool, chainId);
    assert.equal(failed.status, 'resync_required');
    assert.equal(failed.reason, 'NO_COMMON_ANCESTOR_WITHIN_64_STORED_BLOCKS');
    assert.deepEqual(failed.cursor, {height: 66n, hash: 'b66'});
    assert.equal((await db.pool.query('SELECT count(*) FROM indexed_blocks')).rows[0].count, '66');
    await assert.rejects(() => atomicBlock(db.pool, chainId, block(67, 'b'), []), /RESYNC_REQUIRED/);
    assert.equal((await reconcileCanonicalChain(db.pool, chainId, failed.cursor!, [block(66, 'b')])).status, 'resync_required');
  } finally { await db.close(); }
});

test('an older reconciliation snapshot cannot delete a concurrently committed block', async () => {
  const db = await isolatedDatabase();
  try {
    await atomicBlock(db.pool, chainId, block(1), []);
    const before = await indexerSnapshot(db.pool, chainId);
    await atomicBlock(db.pool, chainId, block(2), []);
    assert.equal((await reconcileCanonicalChain(db.pool, chainId, before.cursor!, [block(1, 'b')])).status, 'cursor_changed');
    assert.deepEqual((await indexerSnapshot(db.pool, chainId)).cursor, {height: 2n, hash: 'a2'});
  } finally { await db.close(); }
});

test('rollback SQL failure preserves the cursor, orphan logs and block rows', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 3; height++) await atomicBlock(db.pool, chainId, block(height), [event(height)]);
    await db.pool.query(`CREATE FUNCTION refuse_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_ROLLBACK_FAILURE'; END $$;
      CREATE TRIGGER refuse_rollback BEFORE DELETE ON chain_events FOR EACH ROW EXECUTE FUNCTION refuse_rollback()`);
    await assert.rejects(() => reconcileCanonicalChain(db.pool, chainId, {height: 3n, hash: 'a3'}, [block(3, 'b', 'a'), block(2)]), /TEST_ROLLBACK_FAILURE/);
    assert.deepEqual((await indexerSnapshot(db.pool, chainId)).cursor, {height: 3n, hash: 'a3'});
    assert.equal((await db.pool.query('SELECT count(*) FROM chain_events')).rows[0].count, '3');
    assert.equal((await db.pool.query('SELECT count(*) FROM indexed_blocks')).rows[0].count, '3');
  } finally { await db.close(); }
});

test('mixed canonical branches and out-of-window input are rejected before mutation', async () => {
  const db = await isolatedDatabase();
  try {
    for (let height = 1; height <= 3; height++) await atomicBlock(db.pool, chainId, block(height), []);
    const cursor = {height: 3n, hash: 'a3'};
    await assert.rejects(() => reconcileCanonicalChain(db.pool, chainId, cursor, [block(3, 'b'), block(2)]), /INCONSISTENT_CANONICAL_CHAIN/);
    await assert.rejects(() => reconcileCanonicalChain(db.pool, chainId, cursor, [block(4)]), /INVALID_CANONICAL_WINDOW/);
    await assert.rejects(() => reconcileCanonicalChain(db.pool, chainId, cursor, [block(2)]), /INVALID_CANONICAL_WINDOW/);
    await assert.rejects(() => reconcileCanonicalChain(db.pool, chainId, cursor, [block(3, 'b')]), /INCOMPLETE_CANONICAL_WINDOW/);
    assert.deepEqual((await indexerSnapshot(db.pool, chainId)).cursor, cursor);
  } finally { await db.close(); }
});
