import type pg from 'pg';
import type {DeploymentScope} from './materialization.js';
import type {MetricsBlock} from './metrics.js';

export type InvoicePosition = {createdBlock: string; createdLog: number; invoiceId: string};
export type InvoiceReadQuery = ({kind: 'detail'; id: string} | {kind: 'list'; merchant: string; limit: number; after?: InvoicePosition}) & {pin?: MetricsBlock};
export type InvoiceSource = {blockNumber: string; blockHash: string; txHash: string; logIndex: number};
export type InvoiceRecord = {
  invoiceId: string; merchant: string; adapter: string; amountDueRaw: string; expiresAt: string;
  recipients: {address: string; bps: number}[]; memoHash: string; status: 'unpaid' | 'paid' | 'cancelled'; version: string;
  created: InvoiceSource; updated: InvoiceSource;
  payment: null | {payer: string; tokenIn: string; inputRaw: string; receivedRaw: string; refundRaw: string; routeHash: string};
};
export type InvoiceReadSnapshot = {
  code: string; chainId: number; deploymentId: string; currentCursor: MetricsBlock | null; asOf: MetricsBlock | null; indexedAt: string | null;
  coverage: {fromBlock: string; toBlock: string | null; expectedBlocks: string; canonicalBlocks: string; coveredBlocks: string};
  items: InvoiceRecord[] | null; hasMore: boolean;
};
export type InvoiceTopics = {created: string; paid: string; cancelled: string};
export async function readInvoices(pool: pg.Pool, scope: DeploymentScope, topics: InvoiceTopics, query: InvoiceReadQuery): Promise<InvoiceReadSnapshot> {
  const result: InvoiceReadSnapshot = {code: 'INDEXER_NOT_STARTED', chainId: scope.chainId, deploymentId: scope.id, currentCursor: null, asOf: null, indexedAt: null,
    coverage: {fromBlock: scope.startBlock.toString(), toBlock: null, expectedBlocks: '0', canonicalBlocks: '0', coveredBlocks: '0'}, items: null, hasMore: false};
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const row = (await client.query(`SELECT c.height,c.hash,s.status,s.updated_at,b.hash IS NOT NULL AS canonical,
      d.deployment_id,d.verified AND d.identity=$3::jsonb AND d.aqua=$4 AND d.router=$5 AND d.payments=$6 AND d.usdc=$7 AND d.start_block=$8::numeric AS identity_matches,
      p.height AS projection_height,p.hash AS projection_hash,p.updated_at AS projection_updated_at,
      pb.hash IS NOT NULL AND m.projection_version=1 AS projection_canonical
      FROM indexer_cursor c JOIN indexer_state s ON s.chain_id=c.chain_id
      LEFT JOIN indexed_blocks b ON b.chain_id=c.chain_id AND b.height=c.height AND b.hash=c.hash
      LEFT JOIN deployments d ON d.chain_id=c.chain_id AND d.deployment_id=$2
      LEFT JOIN deployment_cursor p ON p.chain_id=d.chain_id AND p.deployment_id=d.deployment_id
      LEFT JOIN deployment_blocks m ON m.chain_id=p.chain_id AND m.deployment_id=p.deployment_id AND m.height=p.height AND m.block_hash=p.hash
      LEFT JOIN indexed_blocks pb ON pb.chain_id=m.chain_id AND pb.height=m.height AND pb.hash=m.block_hash
      WHERE c.chain_id=$1`, [scope.chainId, scope.id, JSON.stringify(scope.identity), scope.aqua, scope.router, scope.payments, scope.usdc, scope.startBlock.toString()])).rows[0];
    if (!row) return result;
    if (row.status !== 'indexing') { result.code = 'RESYNC_REQUIRED'; return result; }
    if (!row.canonical) { result.code = 'INDEXER_ORPHANED'; return result; }
    if (!row.deployment_id) { result.code = 'MATERIALIZATION_NOT_STARTED'; return result; }
    if (!row.identity_matches) { result.code = 'MATERIALIZATION_DEPLOYMENT_MISMATCH'; return result; }
    if (row.projection_height === null) { result.code = 'MATERIALIZATION_NOT_STARTED'; return result; }
    if (!row.projection_canonical) { result.code = 'MATERIALIZATION_ORPHANED'; return result; }
    if (row.height !== row.projection_height || row.hash !== row.projection_hash) { result.code = 'MATERIALIZATION_BEHIND'; return result; }
    result.currentCursor = {height: row.height, hash: row.hash};
    result.indexedAt = new Date(Math.min(new Date(row.updated_at).getTime(), new Date(row.projection_updated_at).getTime())).toISOString();
    const pin = query.pin ?? result.currentCursor;
    const pinned = (await client.query('SELECT hash FROM indexed_blocks WHERE chain_id=$1 AND height=$2 AND hash=$3', [scope.chainId, pin.height, pin.hash])).rowCount;
    if (!pinned || BigInt(pin.height) < scope.startBlock || BigInt(pin.height) > BigInt(row.height)) { result.code = 'INVOICE_CURSOR_ORPHANED'; return result; }
    result.asOf = pin; result.coverage.toBlock = pin.height; result.coverage.expectedBlocks = (BigInt(pin.height) - scope.startBlock + 1n).toString();
    const range = [scope.chainId, scope.id, scope.startBlock.toString(), pin.height];
    const coverage = (await client.query(`SELECT count(*)::text AS canonical_blocks,count(*) FILTER(WHERE m.projection_version=1)::text AS covered_blocks
      FROM indexed_blocks b LEFT JOIN deployment_blocks m ON m.chain_id=b.chain_id AND m.deployment_id=$2 AND m.height=b.height AND m.block_hash=b.hash
      WHERE b.chain_id=$1 AND b.height BETWEEN $3::numeric AND $4::numeric`, range)).rows[0];
    result.coverage.canonicalBlocks = coverage.canonical_blocks; result.coverage.coveredBlocks = coverage.covered_blocks;
    if (coverage.canonical_blocks !== result.coverage.expectedBlocks || coverage.covered_blocks !== result.coverage.expectedBlocks) { result.code = 'INVOICE_COVERAGE_INCOMPLETE'; return result; }
    // Each snapshot binds one recognized source event and immutable creation
    // terms. Entity equality plus the snapshot PK makes this an injection into
    // raw event identities; equal counts therefore prove no source is omitted.
    const source = (await client.query(`SELECT
      (SELECT count(*)::text FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
        WHERE e.chain_id=$1 AND e.emitter=$3 AND e.topic IN($4,$5,$6) AND b.height BETWEEN $7::numeric AND $8::numeric) AS raw_count,
      count(*)::text AS snapshot_count,
      count(*) FILTER(WHERE i.adapter=$3 AND b.height=i.block_number AND e.emitter=$3 AND e.decoded_version=1
        AND e.decoded_payload->>'entityId'=i.invoice_id AND e.decoded_payload->>'maker'=i.merchant
        AND e.topic=CASE i.status WHEN 'unpaid' THEN $4 WHEN 'paid' THEN $5 ELSE $6 END
        AND e.decoded_payload->>'kind'=CASE i.status WHEN 'unpaid' THEN 'invoice_created' WHEN 'paid' THEN 'invoice_paid' ELSE 'invoice_cancelled' END
        AND i.version=CASE i.status WHEN 'unpaid' THEN 1 ELSE 2 END
        AND c.emitter=$3 AND c.topic=$4 AND c.decoded_version=1 AND c.decoded_payload->>'kind'='invoice_created'
        AND c.decoded_payload->>'entityId'=i.invoice_id AND c.decoded_payload->>'maker'=i.merchant AND cb.height=i.created_block
        AND c.decoded_payload->>'amountDueRaw'=i.amount_due_raw::text AND c.decoded_payload->>'expiresAt'=i.expires_at::text
        AND c.decoded_payload->'recipients'=i.recipients AND c.decoded_payload->>'memoHash'=i.memo_hash
        AND (i.status<>'paid' OR (e.decoded_payload->>'payer'=i.payer AND e.decoded_payload->>'tokenIn'=i.token_in
          AND e.decoded_payload->>'inputRaw'=i.input_raw::text AND e.decoded_payload->>'receivedRaw'=i.received_raw::text
          AND e.decoded_payload->>'refundRaw'=i.refund_raw::text AND e.decoded_payload->>'routeHash'=i.route_hash)))::text AS bound_count
      FROM invoice_snapshots i LEFT JOIN indexed_blocks b ON b.chain_id=i.chain_id AND b.hash=i.block_hash
      LEFT JOIN chain_events e ON e.chain_id=i.chain_id AND e.block_hash=i.block_hash AND e.tx_hash=i.tx_hash AND e.log_index=i.log_index
      LEFT JOIN chain_events c ON c.chain_id=i.chain_id AND c.block_hash=i.created_hash AND c.tx_hash=i.created_tx AND c.log_index=i.created_log
      LEFT JOIN indexed_blocks cb ON cb.chain_id=c.chain_id AND cb.hash=c.block_hash
      WHERE i.chain_id=$1 AND i.deployment_id=$2 AND i.block_number BETWEEN $7::numeric AND $8::numeric`,
      [scope.chainId, scope.id, scope.payments, topics.created, topics.paid, topics.cancelled, scope.startBlock.toString(), pin.height])).rows[0];
    if (source.raw_count !== source.snapshot_count || source.bound_count !== source.snapshot_count) { result.code = 'INVOICE_SOURCE_COVERAGE_MISMATCH'; return result; }
    const latest = `WITH latest AS (SELECT DISTINCT ON(i.invoice_id) i.* FROM invoice_snapshots i
      JOIN indexed_blocks b ON b.chain_id=i.chain_id AND b.hash=i.block_hash AND b.height=i.block_number
      WHERE i.chain_id=$1 AND i.deployment_id=$2 AND i.block_number BETWEEN $3::numeric AND $4::numeric
      ORDER BY i.invoice_id,i.block_number DESC,i.log_index DESC)`;
    if (query.kind === 'list' && query.after) {
      const after = query.after;
      const exists = await client.query(`${latest} SELECT 1 FROM latest WHERE merchant=$5 AND created_block=$6 AND created_log=$7 AND invoice_id=$8`,
        [...range, query.merchant, after.createdBlock, after.createdLog, after.invoiceId]);
      if (!exists.rowCount) { result.code = 'INVALID_INVOICE_CURSOR'; return result; }
    }
    const rows = query.kind === 'detail'
      ? (await client.query(`${latest} SELECT * FROM latest WHERE invoice_id=$5`, [...range, query.id])).rows
      : (await client.query(`${latest} SELECT * FROM latest WHERE merchant=$5
          AND ($6::numeric IS NULL OR (created_block,created_log,invoice_id)<($6::numeric,$7::integer,$8::text))
          ORDER BY created_block DESC,created_log DESC,invoice_id DESC LIMIT $9`,
        [...range, query.merchant, query.after?.createdBlock ?? null, query.after?.createdLog ?? null, query.after?.invoiceId ?? null, query.limit + 1])).rows;
    result.hasMore = query.kind === 'list' && rows.length > query.limit;
    result.items = rows.slice(0, query.kind === 'list' ? query.limit : 1).map(i => ({
      invoiceId: i.invoice_id, merchant: i.merchant, adapter: i.adapter, amountDueRaw: i.amount_due_raw, expiresAt: i.expires_at,
      recipients: i.recipients, memoHash: i.memo_hash, status: i.status, version: i.version,
      created: {blockNumber: i.created_block, blockHash: i.created_hash, txHash: i.created_tx, logIndex: i.created_log},
      updated: {blockNumber: i.block_number, blockHash: i.block_hash, txHash: i.tx_hash, logIndex: i.log_index},
      payment: i.status === 'paid' ? {payer: i.payer, tokenIn: i.token_in, inputRaw: i.input_raw, receivedRaw: i.received_raw, refundRaw: i.refund_raw, routeHash: i.route_hash} : null,
    }));
    result.code = 'INVOICES_COMPLETE'; return result;
  } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
}
