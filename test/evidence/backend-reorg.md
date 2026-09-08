# Raw indexer reorg and replay evidence

Observed 2026-09-08. This is a bounded G5 increment, not completion of backend materialization, quote routing, metrics, or the integrated official-Aqua demonstration.

## Implemented behavior

- `packages/db/src/reorg.ts` reads a consistent cursor/history snapshot, checks a descending canonical header chain, and finds a common ancestor among the latest **64 stored blocks including the cursor block**. Therefore the largest recovered orphan suffix is 63 blocks. No common ancestor, including when the first stored deployment block is orphaned, persists `resync_required` without deleting evidence.
- Rollback uses the same chain advisory lock as ingestion. Orphan block deletion, raw-log foreign-key cascade, cursor rewind, status update, and reorg notification occur in one PostgreSQL transaction. A stale expected cursor cannot delete a concurrently ingested block. SQL failures roll everything back.
- `indexer_state` makes an excessive reorg durable across restarts. `atomicBlock` refuses new ingestion while that state is set. The worker exits unsuccessfully on it; automatic restart does not clear it.
- `apps/indexer/src/worker.ts` checks the stored tip even if no new block has two confirmations. It rechecks the observed top after scanning ancestors and checks log block hashes, numbers, removed flags, and allowed emitters before ingestion. A missing block, an inconsistent RPC branch, or a lower/lagging head cannot delete stored history.
- Following a bounded rollback, ordinary ingestion resumes at the common ancestor plus one. Repeated block/log ingestion is idempotent. The worker keeps the existing two-block display delay, without treating it as finality, and disables viem block-number caching for reconciliation.
- Raw payloads now include version `1`; no monetary values are converted to JavaScript numbers. The Drizzle raw-event schema now expresses the migration's existing cascading foreign key.

## Tests first and observed results

The five new PostgreSQL tests initially failed against compiling `REORG_SNAPSHOT_NOT_IMPLEMENTED` / `REORG_RECONCILIATION_NOT_IMPLEMENTED` stubs; the original ingestion test passed. The six worker tests initially failed against a compiling `REORG_WORKER_NOT_IMPLEMENTED` stub. After implementation:

| Command | Observed result |
| --- | --- |
| `pnpm --filter @orbital/db test` with `TEST_DATABASE_URL` | 6 passed, 0 failed, 0 skipped |
| `pnpm --filter @orbital/indexer test` with `TEST_DATABASE_URL` | 6 passed, 0 failed, 0 skipped |
| `pnpm --filter @orbital/db typecheck` | Passed |
| `pnpm --filter @orbital/indexer typecheck` | Passed |
| `pnpm --filter @orbital/db migrate` with the local Docker `DATABASE_URL` | Passed; additive raw reorg state table applied |

All twelve tests use actual PostgreSQL with a unique schema per test, apply both SQL migrations, and remove only their own schema after closing connections. The worker's read-only RPC is a deterministic fixture; no mainnet/testnet transaction, live Aqua integration, or receipt-derived metric is claimed by these tests.

The suite covers rollback and replacement replay; other-chain preservation; restart idempotence; the 64-candidate boundary and excessive reorg; durable stop; stale concurrent snapshot; injected SQL deletion failure; partial/mixed canonical scans; RPC changes during scan; missing RPC block; lagging RPC head; wrong/removed log blocks; unexpected emitter; duplicate raw log; and the two-block display delay.

## Running and integration boundaries

Apply the additive migration with `DATABASE_URL` set and `pnpm --filter @orbital/db migrate`. Tests need `TEST_DATABASE_URL`; local development can use the documented Docker database. No additional credential is required.

For the worker, set a verified `DEPLOYMENT_MANIFEST` and `DATABASE_URL`, then run `pnpm --filter @orbital/indexer start`. Automatic bounded raw replay is part of normal start. The existing `--replay` command still explicitly refuses a destructive full reset: full materialization replay and a reviewed recovery operation for `resync_required` remain unimplemented.

The current cursor and status remain scoped to one configured deployment set per chain; concurrent unrelated deployment sets on the same chain are not supported. The worker still ingests one block at a time, rather than implementing the planned adaptive 500-block batching. Future materialized strategy/payment tables must join the rollback transaction or use cascading/rebuild semantics before their APIs are enabled. API freshness, resync suppression of executable quotes, SSE invalidation consumers, and receipt-derived metrics remain separate outstanding integration work. `status='indexing'` alone is not evidence of fresh or complete state.
