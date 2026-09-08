import type pg from 'pg';
import type {DeploymentScope} from './materialization.js';

export type MetricsBlock = {height: string; hash: string};
export type ReceiptPairTotals = {
  tokenIn: string; tokenOut: string; inputDecimals: number; outputDecimals: number;
  swapCount: string; grossInputRaw: string; netInputRaw: string; feeRaw: string; amountOutRaw: string;
};
export type ReceiptMetricsSnapshot = {
  code: string; chainId: number; deploymentId: string;
  cursor: MetricsBlock | null; indexedAt: string | null;
  coverage: {fromBlock: string; toBlock: string | null; expectedBlocks: string; canonicalBlocks: string; coveredBlocks: string};
  totals: null | {swapCount: string; activeStrategyCount: string; pairs: ReceiptPairTotals[];
    firstSwap: MetricsBlock | null; lastSwap: MetricsBlock | null};
};

/** All reads, including coverage and amounts, share one read-only MVCC snapshot. */
export async function readReceiptMetrics(pool: pg.Pool, scope: DeploymentScope, swapTopic: string): Promise<ReceiptMetricsSnapshot> {
  const snapshot: ReceiptMetricsSnapshot = {code: 'INDEXER_NOT_STARTED', chainId: scope.chainId, deploymentId: scope.id, cursor: null, indexedAt: null,
    coverage: {fromBlock: scope.startBlock.toString(), toBlock: null, expectedBlocks: '0', canonicalBlocks: '0', coveredBlocks: '0'}, totals: null};
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const row = (await client.query(`SELECT c.height,c.hash,s.status,s.updated_at,b.hash IS NOT NULL AS canonical,
      d.deployment_id,d.verified AND d.identity=$3::jsonb AND d.aqua=$4 AND d.router=$5 AND d.payments=$6
        AND d.usdc=$7 AND d.start_block=$8::numeric AS identity_matches,
      p.height AS projection_height,p.hash AS projection_hash,p.updated_at AS projection_updated_at,
      pb.hash IS NOT NULL AS projection_canonical
      FROM indexer_cursor c JOIN indexer_state s ON s.chain_id=c.chain_id
      LEFT JOIN indexed_blocks b ON b.chain_id=c.chain_id AND b.height=c.height AND b.hash=c.hash
      LEFT JOIN deployments d ON d.chain_id=c.chain_id AND d.deployment_id=$2
      LEFT JOIN deployment_cursor p ON p.chain_id=d.chain_id AND p.deployment_id=d.deployment_id
      LEFT JOIN indexed_blocks pb ON pb.chain_id=p.chain_id AND pb.height=p.height AND pb.hash=p.hash
      WHERE c.chain_id=$1`, [scope.chainId, scope.id, JSON.stringify(scope.identity), scope.aqua, scope.router, scope.payments, scope.usdc, scope.startBlock.toString()])).rows[0];
    if (!row) return snapshot;
    if (row.status !== 'indexing') { snapshot.code = 'RESYNC_REQUIRED'; return snapshot; }
    if (!row.canonical) { snapshot.code = 'INDEXER_ORPHANED'; return snapshot; }
    if (!row.deployment_id || row.projection_height === null) { snapshot.code = 'MATERIALIZATION_NOT_STARTED'; return snapshot; }
    if (!row.identity_matches) { snapshot.code = 'MATERIALIZATION_DEPLOYMENT_MISMATCH'; return snapshot; }
    if (!row.projection_canonical) { snapshot.code = 'MATERIALIZATION_ORPHANED'; return snapshot; }
    if (row.height !== row.projection_height || row.hash !== row.projection_hash) { snapshot.code = 'MATERIALIZATION_BEHIND'; return snapshot; }
    const height = BigInt(row.height);
    if (height < scope.startBlock) { snapshot.code = 'MATERIALIZATION_RANGE_INVALID'; return snapshot; }
    snapshot.cursor = {height: height.toString(), hash: row.hash};
    snapshot.indexedAt = new Date(Math.min(new Date(row.updated_at).getTime(), new Date(row.projection_updated_at).getTime())).toISOString();
    snapshot.coverage.toBlock = height.toString();
    snapshot.coverage.expectedBlocks = (height - scope.startBlock + 1n).toString();
    const range = [scope.chainId, scope.id, scope.startBlock.toString(), height.toString()];
    const coverage = (await client.query(`SELECT count(*)::text AS canonical_blocks,
      count(*) FILTER(WHERE m.projection_version=1 AND m.swap_projection_version=1)::text AS covered_blocks
      FROM indexed_blocks b LEFT JOIN deployment_blocks m
      ON m.chain_id=b.chain_id AND m.deployment_id=$2 AND m.height=b.height AND m.block_hash=b.hash
      WHERE b.chain_id=$1 AND b.height BETWEEN $3::numeric AND $4::numeric`, range)).rows[0];
    snapshot.coverage.canonicalBlocks = coverage.canonical_blocks;
    snapshot.coverage.coveredBlocks = coverage.covered_blocks;
    if (coverage.canonical_blocks !== snapshot.coverage.expectedBlocks || coverage.covered_blocks !== snapshot.coverage.expectedBlocks) {
      snapshot.code = 'SWAP_COVERAGE_INCOMPLETE'; return snapshot;
    }
    // A coverage marker alone cannot conceal a recognized custom raw event
    // with no projection, nor a receipt detached from its canonical source.
    const sources = (await client.query(`SELECT
      (SELECT count(*)::text FROM chain_events e JOIN indexed_blocks b ON b.chain_id=e.chain_id AND b.hash=e.block_hash
        WHERE e.chain_id=$1 AND e.emitter=$3 AND e.topic=$4 AND b.height BETWEEN $5::numeric AND $6::numeric) AS raw_count,
      count(*)::text AS receipt_count,
      count(*) FILTER(WHERE r.router=$3 AND b.height=r.block_number AND e.emitter=$3 AND e.topic=$4
        AND e.decoded_version=1 AND e.decoded_payload->>'kind'='strategy_swap')::text AS bound_count
      FROM swap_receipts r LEFT JOIN indexed_blocks b ON b.chain_id=r.chain_id AND b.hash=r.block_hash
      LEFT JOIN chain_events e ON e.chain_id=r.chain_id AND e.block_hash=r.block_hash AND e.tx_hash=r.tx_hash AND e.log_index=r.log_index
      WHERE r.chain_id=$1 AND r.deployment_id=$2 AND r.block_number BETWEEN $5::numeric AND $6::numeric`,
      [scope.chainId, scope.id, scope.router, swapTopic, scope.startBlock.toString(), height.toString()])).rows[0];
    if (sources.raw_count !== sources.receipt_count || sources.bound_count !== sources.receipt_count) {
      snapshot.code = 'SWAP_RECEIPT_COVERAGE_MISMATCH'; return snapshot;
    }
    const pairs = (await client.query(`SELECT token_in,token_out,input_decimals,output_decimals,count(*)::text AS swap_count,
      sum(gross_input_raw)::text AS gross_input_raw,sum(net_input_raw)::text AS net_input_raw,
      sum(fee_raw)::text AS fee_raw,sum(amount_out_raw)::text AS amount_out_raw
      FROM swap_receipts WHERE chain_id=$1 AND deployment_id=$2 AND block_number BETWEEN $3::numeric AND $4::numeric
      GROUP BY token_in,token_out,input_decimals,output_decimals ORDER BY token_in,token_out,input_decimals,output_decimals`, range)).rows;
    const active = (await client.query(`SELECT count(*)::text AS active FROM (
      SELECT DISTINCT ON(s.order_hash) s.lifecycle FROM strategy_snapshots s
      JOIN indexed_blocks b ON b.chain_id=s.chain_id AND b.hash=s.block_hash AND b.height=s.block_number
      WHERE s.chain_id=$1 AND s.deployment_id=$2 AND s.block_number BETWEEN $3::numeric AND $4::numeric
      ORDER BY s.order_hash,s.block_number DESC,s.log_index DESC
      ) latest WHERE lifecycle='active'`, range)).rows[0].active;
    const ends = (await client.query(`(SELECT block_number::text AS height,block_hash AS hash,'first' AS endpoint
      FROM swap_receipts WHERE chain_id=$1 AND deployment_id=$2 AND block_number BETWEEN $3::numeric AND $4::numeric ORDER BY block_number,log_index LIMIT 1)
      UNION ALL (SELECT block_number::text AS height,block_hash AS hash,'last' AS endpoint
      FROM swap_receipts WHERE chain_id=$1 AND deployment_id=$2 AND block_number BETWEEN $3::numeric AND $4::numeric ORDER BY block_number DESC,log_index DESC LIMIT 1)`, range)).rows;
    const endpoint = (name: string): MetricsBlock | null => { const value = ends.find(item => item.endpoint === name); return value ? {height: value.height, hash: value.hash} : null; };
    snapshot.totals = {swapCount: sources.receipt_count, activeStrategyCount: active,
      pairs: pairs.map(pair => ({tokenIn: pair.token_in, tokenOut: pair.token_out, inputDecimals: pair.input_decimals, outputDecimals: pair.output_decimals,
        swapCount: pair.swap_count, grossInputRaw: pair.gross_input_raw, netInputRaw: pair.net_input_raw, feeRaw: pair.fee_raw, amountOutRaw: pair.amount_out_raw})),
      firstSwap: endpoint('first'), lastSwap: endpoint('last')};
    snapshot.code = 'METRICS_COMPLETE';
    return snapshot;
  } finally {
    // Read-only transactions have no changes to commit; rollback also covers
    // every early unavailable return.
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}
