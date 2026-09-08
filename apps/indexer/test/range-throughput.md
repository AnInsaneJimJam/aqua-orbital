# Bounded range reads and atomic empty coverage

Observed 2026-09-09 local date (2026-09-08 UTC). The live worker's prior sixteen-block passes had variable latency and a multi-thousand-block backlog on Arc, which was advancing approximately twice per second. A read-only RPC diagnostic indexed the actual deployment's first sixteen blocks into an isolated PostgreSQL schema. That historical sample took 3,872.434 ms, with sixteen log queries and 248 SQL queries (848.775 ms cumulative SQL time). The [original timing output](profile-live.json) is retained; it predates the new implementation and is not a repeatable performance guarantee.

The production worker now requests at most sixty-four blocks per pass; the callable synchronization helper keeps its one-block default. Native transport makes one `eth_getLogs` request over that numeric interval for the three verified deployment emitters. The response retains the two-MiB transport limit. Every returned log must belong to the requested interval and match its prefetched header hash, transaction index/hash, emitter and canonical payload bounds. Parent links authenticate the whole consecutive window against a freshly re-read canonical tip before any commit. Chain ID, head-minus-two limit, eight outstanding RPC requests, four concurrent activation getters, per-request deadlines and existing ancestor/resync checks remain enforced. Legacy RPC fixtures without the optional range method retain hash-pinned per-block reads.

Consecutive blocks with no scoped raw logs use one database transaction and the existing chain advisory lock. That transaction inserts a distinct canonical header and deployment coverage row for **every** block. It checks deployment identity, durable resync state, both cursors, neighboring canonical headers and the absence of conflicting retained logs from all three emitters. It advances cursors only after all coverage inserts succeed. Committed per-block invalidations remain available; no entity or financial state is invented. Event-bearing blocks retain their existing ordered, atomic materialization path. Idempotent empty-range replay checks all headers and coverage without refreshing readiness timestamps. Foreign-key cascades and deployment cursor rollback are unchanged.

Two new regression tests first failed against the prior implementation: the worker rejected the new range bound, and the empty-range database operation did not exist. Both failures were observed before implementation (49,739.249 ms process time). An initial post-change run passed the canonical range test but encountered a local PostgreSQL connection timeout during the second test's cleanup. The subsequent serialized run passed **6/6**: the two new tests plus four affected existing batch tests, with no failures, skips or cancellations (51,170.051 ms including startup and isolated schema setup).

- Malformed range-log identity and a changed final tip each leave all prepared blocks uncommitted; the valid sixty-four-block window retains its real unknown Aqua log and sixty-four lifecycle/swap coverage rows. Sixty-five blocks are rejected.
- An injected insert failure rolls back the entire empty run, including raw and deployment cursors. Replay is idempotent, a changed parent is rejected, canonical reorg rollback removes the orphan coverage, replacement replay succeeds, an existing relevant raw log contradicts emptiness, and durable resync prevents further writes.
- The four retained tests verify ordered lifecycle/invoice transitions, bounded concurrency, broken-parent/tip rejection, partial-prefix recovery around a failed event block, and common-ancestor rollback/replay.

Both database and indexer typechecks passed. `git diff --check` passed. No broad release campaign was run.

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm --filter @orbital/indexer exec tsx --test --test-concurrency=1 test/range.test.ts test/batch.test.ts
pnpm --filter @orbital/db typecheck
pnpm --filter @orbital/indexer typecheck
```

The final [real-window timing](profile-live-64.json) completed at **2026-09-08T22:06:07.912Z**. It read the existing verified deployment on chain 5042002 through `https://rpc.blockdaemon.testnet.arc.io`, indexed blocks **61131616 through 61131679**, retained one Aqua log and observed tip hash `0x4531d9e8a8f0544f01aff892c2b7afb1c66756ea8076c544eebfba00acb45811`. The synchronization call took **4,333.755 ms**, approximately **14.77 blocks/second**. It made sixty-five header reads (window plus fresh tip), one range log read (220.467 ms), and forty SQL queries (198.405 ms cumulative SQL time). The transport starts cold in this sample. Parallel request durations are cumulative and must not be added as elapsed wall time.

The manual [profiler](profile-live.mjs) requires `INDEXER_PROFILE_LIVE=1`; it permits only sixteen or sixty-four blocks and writes exclusively into a fresh isolated test schema. The profile excludes schema migration/setup and includes the synchronization operation. It does not alter the live worker's database, manifest, contracts or signer state. The successful isolated schema was removed afterward. To repeat the current sixty-four-block observation from `apps/indexer`:

```powershell
$env:INDEXER_PROFILE_LIVE='1'
$env:INDEXER_PROFILE_BLOCKS='64'
node --import tsx test/profile-live.mjs
```

This finite sample demonstrates practical headroom over the observed Arc cadence for this sparse historical window. It does not establish sustained provider capacity, heavy event-block throughput, actual live catch-up, finality, or Privy swap/payment qualification. Dense ranges that exceed the existing response limit fail closed; no adaptive request expansion or readiness relaxation was introduced.

Final SHA-256 source bindings:

| File | SHA-256 |
| --- | --- |
| `apps/indexer/src/materializer.ts` | `daa51bb3dac5690276688ff85253427ae61804a42aa53edd0c29f48d13381451` |
| `apps/indexer/src/rpc.ts` | `bf1acea9b443245fe42800eaf9e8c99ee0f29195faac720b2e8d1487b6390f0d` |
| `packages/db/src/empty-materialization.ts` | `fa1c77ee49b17824ae81955f08504150b008618cbfa0e611c44794934d8061d5` |
| `apps/indexer/test/range.test.ts` | `728125e161c1e0d455c7628e86f0bec24b606d1c0ce4f8fa84e2299cfa779b02` |
| `apps/indexer/test/profile-live.mjs` | `69c2444f2e0f85e644bdae5df7efbf1fcb659dd31ae2183faa4eee06fa2d311d` |
| `apps/indexer/test/profile-live.json` (historical sixteen-block observation) | `460db23333bc7412fa0ba6978cc5112964b1f5b5e21f3124079a8d6e7fb91a40` |
| `apps/indexer/test/profile-live-64.json` | `fa5ca7cc193991ee4dc1d01475f097ab1683d39cca6ee174b0119775606ecfcf` |
