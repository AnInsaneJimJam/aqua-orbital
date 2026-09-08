# Canonical receipt metrics

2026-09-08. This increment implements read-only `GET /metrics` and the
`/api/v1/metrics` alias required by `MASTER_PROMPT.md` section 9.2. It serves
canonical receipt facts from PostgreSQL with deployment identity, coverage,
freshness and RPC block-hash checks. It does not enable financial execution,
quotes, reserve hydration, fundability claims, USD pricing or APY estimates.

**Final verification: 39 API tests (15 new metrics tests), six database tests,
and both API/database typechecks pass, with no skips or failures in the final
runs.** The final API run took 72.3 seconds with serialized test files.

## Response contract

`apps/api/src/metrics.ts` exports `MetricsResult` and `MetricsDependencies`.
The response has `schemaVersion:1`, `status:available|stale|unavailable`, a safe
machine-readable `code`, and `financialExecutionEnabled:false` in every case.
Available and stale responses use HTTP 200; unavailable responses use HTTP 503
and `totals:null`. Both paths send `Cache-Control:no-store`.

The canonical range is deployment `startBlock` through the aligned indexed
cursor. Coverage reports the expected, canonical and fully projected block
counts as decimal strings. `coverage.complete` describes that database
snapshot's coverage, independently of RPC availability: a later RPC failure
can have `complete:true` but still returns `totals:null` and unavailable status.
Coverage is independent of the existing lifecycle-only
readiness version. A missing historic swap marker prevents totals even when
the latest marker and `/ready` lifecycle projection are otherwise complete.

Totals contain:

- `basis:canonical-OrbitalSwapExecuted`, exact `swapCount`, and directed pair
  gross-input, net-input, fee and output amounts in raw token units.
- Per-input-token gross/net/fee sums, each with the allowlisted address,
  display symbol, decimals and `demo-token`, `settlement-usdc` or `onchain-token`
  classification. `nativeUsdc` is true only for nonmock configured settlement
  USDC on the documented Arc Testnet chain 5042002; local or mocked USDC never
  inherits that label. No sum combines unlike token units into dollars.
- `activeStrategyCountBasis:lifecycle-active` and
  `fundabilityVerified:false`. The count comes from the most recent canonical
  lifecycle snapshot for each order. It does not assert current Aqua funding,
  wallet balances, principal, available inventory or quote eligibility.
- First/last observed receipt block, hash, chain timestamp in seconds and ISO
  date. Empty fully covered histories have zero activity and `observedDates:null`.
  Indexer update time is never substituted for a receipt's chain timestamp.

Amounts and cumulative counts remain decimal strings. Each receipt is uint256,
but a cumulative sum need not fit uint256. PostgreSQL `count` is int64, so its
maximum receipt count multiplied by a uint256 amount is strictly below 2^319,
at most 97 decimal digits. The transport validates canonical unsigned strings
to that aggregate bound; money never passes through JavaScript `Number`.
Only bounded milliseconds/ISO-date formatting uses `Number`.

## Database and chain consistency

`packages/db/src/metrics.ts` reads state, coverage, source counts, sums,
lifecycle counts and receipt endpoints inside one read-only PostgreSQL
`REPEATABLE READ` transaction. It verifies immutable deployment identity JSON
and role columns, verified status, canonical raw/deployment cursors and their
height/hash agreement. Every height in the inclusive range must exist as a
canonical block with lifecycle version 1 and swap projection version 1.

It also compares the count of recognized custom-router raw events with the
count of projected receipts and receipts bound to the same canonical source,
emitter, topic, decoded kind and block height. Thus a missing projection cannot
be hidden by a complete block marker. Other topics and emitters, including
stock `Swapped`, Aqua `Pushed`, token transfers and settlement-token transfer
logs, do not add volume. Existing raw-event uniqueness and projection foreign
keys provide deduplication and canonical rollback; no secondary log counting
is introduced here.

RPC transport comes exclusively from the server-loaded verified manifest.
The controller requests chain identity, head, and cursor/first/last blocks,
deduplicating identical block heights. Every returned hash must match the
database snapshot; block dates come from those checked headers. The runtime
also checks the returned block number. At most five RPC requests are needed
for a metrics check. A weighted capacity counter shared with readiness limits
both paths to eight outstanding reads; shutdown aborts pending transport.

A second bounded database read after RPC must match the complete first
snapshot. Canonical rewind, changed coverage, changed totals, changed cursor or
changed timestamps invalidates the response. Each response is an observation
of checked snapshots, not a finality guarantee or protection against a reorg
after the observation. Two blocks of confirmation retain their existing
display-delay meaning.

Complete checked data older than 10 seconds is explicitly stale, including
elapsed verification time. A chain head ahead of cursor+2 also labels it stale.
A head behind cursor+2, resync-required state, wrong chain, mismatched block,
missing configuration/database, incomplete coverage, invalid date or bounded
read failure returns unavailable with no fixture fallback. Existing
`checkReadiness`, `/ready`, SSE invalidation and quote gating remain unchanged.

## Verification

The first nine behavioral tests were written against unavailable stubs and
observed failing before implementation. The HTTP route test separately failed
with HTTP 503 before route wiring. Subsequent tests exercise consistency and
runtime limits. Fifteen focused tests pass:

- Verified scope and no-configuration failures; no invented zero activity.
- Actual generated custom-event ABI fixtures ingested through the existing
  materializer into isolated PostgreSQL; two uint256-maximum gross receipts
  produce an exact cumulative amount above uint256 and output above 2^53.
- Historic marker 0 and missing intermediate marker despite latest coverage 1.
- Actual pinned stock/Aqua/ERC20 event signatures excluded from counting;
  missing custom receipt rejected despite apparently complete markers.
- Stale status, catching-up head, wrong chain/hash, resync and identity changes.
- Canonical rewind during RPC rejects the original snapshot; next observation
  has the surviving receipt count after database cascade.
- Empty history and lifecycle retirement, with no invented receipt dates.
- Bounded RPC failure/redaction, including stalled-read timeout.
- Deterministic writer commit between the coverage read and amount reads:
  the first read retains its original complete two-receipt MVCC snapshot,
  while a subsequent read observes incomplete coverage and exposes no totals.
- Single-receipt-block date deduplication and hash mismatch rejection.
- Actual Fastify 200/503 responses for both paths; no-store, execution false,
  unchanged unavailable `/ready` and payment-quote route.
- Production runtime against isolated PostgreSQL and a local HTTP JSON-RPC
  server, checking exact header requests and their timestamps.
- Simultaneous metrics/readiness requests reach exactly eight outstanding
  HTTP calls, reject excess capacity, release capacity and reject after close.
- A delayed first database read accepts timestamps created during the request,
  while timestamps actually ahead of the observation remain rejected.

The receipts in this suite are synthetic ABI fixtures authenticated by the
existing ingestion path, not transactions executed by the production curve.
The uint256-limit fixture intentionally tests storage/transport arithmetic;
it makes no claim that the onchain 160-bit engine accepts those swap sizes.
The local HTTP RPC supplies deterministic block headers, not Arc evidence.
See [swap-materialization.md](swap-materialization.md) for projection validation
and separate real router settlement evidence for executed financial flows.

All database tests use the documented local-only `TEST_DATABASE_URL` profile
and fresh disposable schemas with migrations 0001–0004. No normal database
contents or indexer source were changed by this increment.

Independent read-only review found and reproduced one availability bug: the
future-timestamp check originally compared a timestamp observed after a slow
database read against request-start time. A regression set both database
timestamps from Node wall time after a 1.2-second delay and failed before the
fix. The check now includes monotonic elapsed time, as the final freshness
calculation already did. A separate reviewer replay with a 2.3-second delay
returned `METRICS_AVAILABLE`, age 79 ms, two receipts after the fix. The reviewer
found no additional scoped defect in coverage, raw/receipt binding, MVCC, RPC
identity or snapshot recheck. No reviewer source edits were made.

An additional retained red check clarified database coverage versus RPC
availability; it failed before `coverage.complete` was preserved independently.

The first full parallel run passed 37 of 38 API tests; the existing PostgreSQL
LISTEN test hit its two-second query timeout while the full database suite and
typechecks also ran. All 14 then-existing metrics tests passed in that run.
The unchanged LISTEN test and full 38-test API suite subsequently passed with
serialized test files. The final run adds the independently found timing
regression. This resource-contention failure is retained rather than hidden by
raising production or test timeouts.

Reproduction uses Node 22.18.0, pnpm 10.34.5 and local PostgreSQL 16.15. From the
repository root in PowerShell, with the documented disposable-test profile:

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
$env:NODE_ENV='test'
pnpm --filter @orbital/api exec tsx --test --test-concurrency=1 test/*.test.ts
pnpm --filter @orbital/db test
pnpm --filter @orbital/api typecheck
pnpm --filter @orbital/db typecheck
```

Source checkpoint: dirty working tree based on commit
`2ecc6ce2f180fde239c13feee7dd09247c0d1b07`, 2026-09-08 approximately 04:58 UTC.

| Source | SHA-256 |
|---|---|
| `packages/db/src/metrics.ts` | `e2271bbaa118d4eff6aac793156b205ba0ceb01a062f9d5ac47cd2e6a7259ea0` |
| `packages/db/src/index.ts` | `067bc36fbeeea5c71f06e772550da9269e80182d59a6772300f1e3e485486aad` |
| `apps/api/src/metrics.ts` | `d3adc4fd1da37b44cff8cedaac39df54ff65d389cffc0dd80b436663c367a2dc` |
| `apps/api/src/runtime.ts` | `f3047fdac00a9731e161bdd0ed2b4f74c78ba9983a0cb76d6a2a114e0399c5c1` |
| `apps/api/src/server.ts` | `66b2f8ac0794f6c81295311625c913f19e05571129343deefda01f98adb03e76` |
| `apps/api/test/metrics.test.ts` | `19e3e3eba03f118857ad3095e73704a7e1a125257273a43ad67ee6a965d573f2` |
| `apps/api/test/metrics-runtime.test.ts` | `ca9bbd9b3ec8b0e4a9dbd340f78d156c43608122fb175424baa64df8848e7a15` |
| `apps/api/test/metrics-fixture.ts` | `f3919c8a542f365412c02034d25d3615d4cec5e594420e0cf3592ddda846c826` |
| Unchanged migration `0004_swap_receipts.sql` | `54cdc62ee03438a104eafd474e8839d7407a64757f76055d3408057e78c0de9d` |
| Imported SDK `src/generated/abi.ts` | `491aaf2ab09811bfb1f83d6c0f037b8b4325b05bedfd57be26191b57e3b67a32` |

## Limits

This endpoint is an honest historical receipt projection, not completion of
G5's financial reads or routing. All-range queries have the runtime's existing
bounded database timeouts; large-history performance has not been benchmarked.
There is no USD conversion, TVL, APY, per-tick state reconstruction, live Arc
deployment claim or Privy-wallet demonstration in this increment.
