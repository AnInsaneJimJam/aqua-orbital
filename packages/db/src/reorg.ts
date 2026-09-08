import type pg from 'pg';
import {rollbackDeploymentCursors} from './materialization.js';

export const REORG_WINDOW = 64;
export type BlockHeader = {number: bigint; hash: string; parentHash: string};
export type Cursor = {height: bigint; hash: string};
export type IndexerSnapshot = {
  cursor: Cursor | null;
  status: 'indexing' | 'resync_required';
  reason: string | null;
  blocks: BlockHeader[];
};
export type Reconciliation = {
  status: 'unchanged' | 'rolled_back' | 'resync_required' | 'cursor_changed';
  cursor: Cursor | null;
  removedBlocks: number;
};
export async function indexerSnapshot(pool: pg.Pool, chainId: number): Promise<IndexerSnapshot> {
  const client = await pool.connect();
  try {
    // These rows must come from one snapshot while another worker may ingest.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const cursor = await readCursor(client, chainId);
    const state = await client.query('SELECT status, reason FROM indexer_state WHERE chain_id=$1', [chainId]);
    const blocks = await client.query('SELECT height,hash,parent_hash FROM indexed_blocks WHERE chain_id=$1 ORDER BY height DESC LIMIT $2', [chainId, REORG_WINDOW]);
    await client.query('COMMIT');
    return {
      cursor, status: state.rows[0]?.status ?? 'indexing', reason: state.rows[0]?.reason ?? null,
      blocks: blocks.rows.map(row => ({number: BigInt(row.height), hash: row.hash, parentHash: row.parent_hash})),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function reconcileCanonicalChain(
  pool: pg.Pool, chainId: number, expected: Cursor,
  canonical: readonly BlockHeader[],
): Promise<Reconciliation> {
  if (!canonical.length || canonical.length > REORG_WINDOW || canonical[0]!.number !== expected.height || canonical.some(block => block.number < 0n)) {
    throw Error('INVALID_CANONICAL_WINDOW');
  }
  for (let index = 1; index < canonical.length; index++) {
    const child = canonical[index - 1]!, parent = canonical[index]!;
    if (child.number !== parent.number + 1n || child.parentHash !== parent.hash) throw Error('INCONSISTENT_CANONICAL_CHAIN');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [chainId]);
    const cursor = await readCursor(client, chainId);
    if (cursor?.height !== expected.height || cursor.hash !== expected.hash) {
      await client.query('COMMIT');
      return {status: 'cursor_changed', cursor, removedBlocks: 0};
    }
    const state = await client.query('SELECT status FROM indexer_state WHERE chain_id=$1', [chainId]);
    if (state.rows[0]?.status === 'resync_required') {
      await client.query('COMMIT');
      return {status: 'resync_required', cursor, removedBlocks: 0};
    }
    const stored = await client.query('SELECT height,hash FROM indexed_blocks WHERE chain_id=$1 ORDER BY height DESC LIMIT $2', [chainId, REORG_WINDOW]);
    const canonicalByHeight = new Map(canonical.map(block => [block.number.toString(), block.hash]));
    const ancestor = stored.rows.find(row => canonicalByHeight.get(row.height) === row.hash);
    if (!ancestor) {
      const oldest = stored.rows.at(-1);
      // A failed partial RPC scan must never be mistaken for an excessive reorg.
      if (!oldest || canonical.at(-1)!.number > BigInt(oldest.height)) throw Error('INCOMPLETE_CANONICAL_WINDOW');
      await client.query(`INSERT INTO indexer_state(chain_id,status,reason) VALUES($1,'resync_required',$2)
        ON CONFLICT(chain_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_at=now()`,
      [chainId, 'NO_COMMON_ANCESTOR_WITHIN_64_STORED_BLOCKS']);
      await notify(client, {type: 'resync_required', chainId, block: cursor.height.toString(), hash: cursor.hash});
      await client.query('COMMIT');
      return {status: 'resync_required', cursor, removedBlocks: 0};
    }
    if (BigInt(ancestor.height) === cursor.height) {
      await client.query('COMMIT');
      return {status: 'unchanged', cursor, removedBlocks: 0};
    }
    // FK cascade removes raw logs and append-only projection snapshots together.
    // Latest-snapshot views then expose the exact surviving predecessor state.
    const removed = await client.query('DELETE FROM indexed_blocks WHERE chain_id=$1 AND height>$2', [chainId, ancestor.height]);
    await rollbackDeploymentCursors(client,chainId,ancestor.height);
    await client.query('UPDATE indexer_cursor SET height=$2,hash=$3 WHERE chain_id=$1', [chainId, ancestor.height, ancestor.hash]);
    await client.query(`INSERT INTO indexer_state(chain_id,status,reason) VALUES($1,'indexing',NULL)
      ON CONFLICT(chain_id) DO UPDATE SET status=excluded.status,reason=NULL,updated_at=now()`, [chainId]);
    const nextCursor = {height: BigInt(ancestor.height), hash: ancestor.hash as string};
    await notify(client, {type: 'reorg', chainId, block: ancestor.height, hash: ancestor.hash, previousBlock: cursor.height.toString(), previousHash: cursor.hash, removedBlocks: removed.rowCount});
    await client.query('COMMIT');
    return {status: 'rolled_back', cursor: nextCursor, removedBlocks: removed.rowCount ?? 0};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function readCursor(client: pg.PoolClient, chainId: number): Promise<Cursor | null> {
  const result = await client.query('SELECT height,hash FROM indexer_cursor WHERE chain_id=$1', [chainId]);
  return result.rows[0] ? {height: BigInt(result.rows[0].height), hash: result.rows[0].hash} : null;
}
async function notify(client: pg.PoolClient, payload: object) {
  // PostgreSQL delivers NOTIFY only when the enclosing transaction commits.
  await client.query("SELECT pg_notify('orbital_blocks',$1)", [JSON.stringify(payload)]);
}
