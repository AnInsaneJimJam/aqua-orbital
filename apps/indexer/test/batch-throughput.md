# Bounded indexer prefetch

Historical sixteen-block checkpoint. The later [range/empty-run checkpoint](range-throughput.md) raises the production bound to sixty-four, uses one range log query where available, and commits consecutive empty coverage rows atomically. The four tests below passed again at that checkpoint; their invalid-cap assertion now uses sixty-five.

Observed 2026-09-09. The prior production loop immediately repeated successful work but fetched only one block per invocation. A separate read-only Arc observation found twenty blocks over ten seconds, with warm individual RPC calls taking approximately 180–223 ms. That cadence motivated this change; it is not a live indexer throughput measurement.

`syncDeploymentOnce` retains its one-block default. The production entry point requests at most sixteen blocks, never beyond the observed head minus two. Independent chain identity/head reads run together. Headers and hash-pinned log requests use groups of at most eight; existing per-request payload, deadline and retry limits remain unchanged. Activation hydration retains the four-call limit and runs one block at a time, so a batch cannot multiply that concurrency.

Before writing, the worker validates every consecutive parent hash, including the deployment cursor's parent link, and freshly reads the selected tip again. A changed tip discards the whole prepared window. Given the existing trusted-RPC/block-hash assumptions, the consecutive parent chain binds every prepared block to that canonical tip. This remains an observation of canonical state, not proof of finality. The existing ancestor rollback, durable resync status and cached-log backfill are unchanged.

Database commits remain atomic per block and strictly ascending. A failed middle block can leave an already committed prefix, which the next pass authenticates before resuming. No batch-wide transaction, cursor shortcut, fabricated notification, readiness relaxation or schema change was introduced.

Four focused tests use real PostgreSQL in isolated schemas and deterministic read-only RPC fixtures with out-of-order completion. They cover:

- Sixteen-block bounded prefetch, exactly eight simultaneous reads, hash-pinned activation hydration, ordered activation/retirement and invoice creation/payment, exact large integer amounts, the two-block display delay, and idempotent completion.
- A broken parent chain and a changed final tip committing no prepared blocks, followed by recovery.
- A failed block eight preserving only blocks one through seven, then resuming without duplicate events.
- A nine-block reorg restoring active/unpaid state at common ancestor seven, followed by replacement-branch retirement/cancellation and removal of the orphan payment.

Before implementation, all four tests failed against the old worker: block one instead of sixteen, missing batch rejection, and no expected rollback because the old call had never indexed that suffix. The retained RED process took 15,565.565 ms. After implementation, **4/4 passed**, no failures/skips/cancellations, process time 31,500.414 ms including startup and isolated database setup. `pnpm --filter @orbital/indexer typecheck` passed after correcting a tuple inference in the new parallel identity reads.

Focused command (with the authorized local `TEST_DATABASE_URL`):

```powershell
pnpm --filter @orbital/indexer exec tsx --test test/batch.test.ts
pnpm --filter @orbital/indexer typecheck
```

No broad campaign, shared-service restart, live contract deployment or live catch-up benchmark was performed. Exact-head readiness can still reject observations while Arc advances; its separate policy review is outside this indexer change. These fixtures establish bounded work and ordered canonical recovery, not sustainable provider throughput or sponsor qualification.
