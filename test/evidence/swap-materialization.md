# Canonical swap receipt materialization

2026-09-08. This increment projects `OrbitalSwapExecuted` receipt facts into
PostgreSQL. **31 indexer tests, six database tests and 11 unchanged API readiness
regressions pass; both package typechecks pass.** It uses the SDK's compiled
`swapEventsAbi`, authenticated deployment
identity, canonical block/transaction/log identity, and the activated immutable
configuration. It does not hydrate intermediate reserves or certify the curve
or path independently. Financial APIs remain disabled.

## Additive schema and version contract

Migration `0004_swap_receipts.sql` adds `swap_receipts`, `swap_pair_totals`, and
`deployment_blocks.swap_projection_version`. Applied migration 0003 remains
unchanged, SHA-256
`1dcdb0b45bf9ac98b3685762018a5a0b17c2982cd0bb47c3eccb10743130f20b`.

Existing `projection_version=1` continues to identify lifecycle and invoice
coverage only. Its API readiness interpretation is unchanged. The new swap
coverage field defaults to **0**, including on historical processed blocks;
only successfully decoded and atomically committed swap coverage sets it to
**1**. A lifecycle-ready deployment is not thereby swap-complete.

Receipt rows retain maker/order/taker/recipient, token indices and resolved
immutable token addresses/decimals, fee profile, gross/net/fee/output raw
amounts, resulting uint64 version, ordered tick-key/direction arrays, and
canonical block/hash/transaction/log identity. Every monetary value is a
decimal string backed by `numeric(78,0)` and checked against its uint256 range.
Receipt versions are positive uint64 values starting at two. No monetary value
or tick key passes through a JavaScript `Number` conversion.

The raw event foreign key cascades from canonical block removal. Swap version
snapshots use the same canonical event and retain the immutable config; the
latest strategy view still reports `financial_state_available=false`.
`swap_pair_totals` sums gross input, net input, fees and output **in each pair's
raw token units**, retaining both tokens and decimals. It makes no dollar,
stable-peg, normalized-volume or reserve-state claim. These sums cover the
canonical receipts currently projected; a future consumer must separately
verify complete swap coverage from deployment start through its fresh,
canonical deployment cursor before advertising complete metrics.

## Validation and ordering

The indexer checks the actual compiled event topic, expected router emitter,
strict ABI decode and exact re-encoding of all data and indexed topics.
Canonical log deduplication retains one event per block log index and rejects
conflicting duplicates. Block logs are processed in log order.

Within the locked database transaction, each swap requires the strategy
snapshot **strictly before that receipt position**, an active lifecycle,
matching maker, a distinct immutable token pair, supported fee profile,
permitted taker/recipient roles, positive net input and payout, and
`version=previousVersion+1`. Retirement now also requires the next exact
version after all preceding swap receipts. The lookup excludes any later
retirement already stored during historical backfill.

The immutable fee check is exact:

```text
fee = (gross * feePpm + 999999) div 1000000
net + fee = gross
```

JavaScript uses bigint and PostgreSQL uses integer `div` on integer-valued
numeric operands. `ceil(numeric division)` is deliberately excluded: division
can round before the ceiling at large magnitudes.

Crossing arrays must have equal lengths at most 16, boolean directions and
uint64 keys belonging to the strategy's ordinary keys. Sequence-local
adjacency is checked: after an inward crossing of key index `k`, the temporary
prefix count is `k`; after outward, it is `k+1`. Each subsequent crossing must
leave that prefix through its neighboring key. The first prefix is **not**
inferred from missing reserve state. These checks do not independently prove
the initial/final onchain mask, event endpoint, curve path or actual crossing
support; those remain contract and mathematical obligations.

## Historical backfill and atomicity

Before advancing normal indexing, the worker selects the oldest canonical
deployment block lacking swap coverage. It reuses retained router logs and
the already authenticated activation configuration, checking the config hash
again. It checks the historical block hash and transaction membership using
the read RPC; it does not use a block-end reserve getter as an intermediate
swap-state oracle.

Under the same chain advisory transaction lock used for ingestion/reorgs, it
rechecks the complete ordered router log set, including cardinality, identities,
topics and payloads. A changed batch returns `retry`. It then replays lifecycle
and swap facts chronologically, verifies existing lifecycle snapshots
idempotently, inserts missing receipt/version snapshots, and marks coverage.
Only successful new swap projections send committed entity invalidations.

Backfill never advances either cursor, refreshes readiness timestamps or
relabels an old block as new ingestion. A late malformed receipt or unexplained
retirement version gap rolls back every newly decoded payload, swap row,
snapshot and coverage update for that block. Canonical reorg deletion removes
receipt rows, their totals and corresponding strategy versions together; a
failed delete preserves the entire prior branch.

## Retained audit counterexamples

Two additional failures were reproduced after the initial eight receipt tests
passed:

1. For gross `1000000000000000000001` and fee 500 ppm, PostgreSQL
   `ceil(gross*500/1000000)` returns `500000000000000000`, while the exact
   upward-rounded fee is `500000000000000001`. The original SQL constraint
   rejected a correct receipt. A full pipeline regression failed before the
   switch to `div(gross*500+999999,1000000)` and passed afterward.
2. A concurrent deployment sharing the router can extend a canonical block's
   raw logs after a backfill batch was read. The first implementation marked
   coverage complete without the additional receipt. A deterministic
   interleaving test observed that failure; the full-set comparison under the
   transaction lock now retries and the next pass includes both receipts.

The same integer-division issue also affected the pre-existing invoice split
view. For an admissible raw invoice amount `70000000000000001` with a 9000-bps
first recipient, the old `floor(amount*9000/10000)` returned
`63000000000000001`, one atom too high. The exact value is
`63000000000000000`; the final recipient must receive `7000000000000001`.
An additional regression observed both incorrect shares before the correction.
Migration 0004 now replaces that view additively with exact integer `div` for
each prefix share and gives the final recipient the exact remainder. Stored
invoices and migration 0003 are unchanged; existing rows receive the corrected
derived split automatically.

The independent `backend_reorg` reviewer reproduced both classes and checked
the corrected locked comparison with a separate two-deployment fixture. No
additional scoped issue was found in predecessor lookup, strict receipt
validation, coverage/readiness separation or canonical cascade logic.

## Verification scope

Tests use real disposable PostgreSQL schemas and synthetic read-only RPC
responses encoded from the actual compiled event ABI. These fixtures establish
projection behavior and exact representation, not live chain receipts. Ordered
crossing payloads likewise do not demonstrate mixed-tick engine execution.

Set the documented local `TEST_DATABASE_URL`, then run:

```text
pnpm --filter @orbital/indexer test
pnpm --filter @orbital/db test
pnpm --filter @orbital/api exec tsx --test test/materialization-readiness.test.ts test/readiness.test.ts
pnpm --filter @orbital/indexer typecheck
pnpm --filter @orbital/db typecheck
```

The original seven tests all failed before implementation. The initial eight
receipt tests passed before the independent audit identified the retained
counterexamples. All three arithmetic/concurrency regressions were observed
failing before their corrections. Final aggregate verification at approximately
**04:28 UTC** passed **31/31 indexer**, **6/6 database**, and **11/11 unchanged
API readiness** tests, with no failures or skips. Their reported durations were
56.29, 57.21 and 39.41 seconds respectively while run concurrently. Both DB and
indexer typechecks passed. The indexer total comprises ten swap receipt tests,
eleven lifecycle/invoice tests, four read-transport tests and six raw-worker
reorg tests.

Environment: Node 22.18.0, pnpm 10.34.5, PostgreSQL 16.15, Windows PowerShell;
the existing local PostgreSQL profile is used with per-test disposable schemas.
No persistent user schema or Docker volume was reset. The repository remains
a dirty development checkout; these results do not imply a deployed target.

Migration application uses the existing `pnpm --filter @orbital/db migrate`
command with `DATABASE_URL`. Normal worker startup performs bounded one-block
backfill automatically; no destructive rebuild is needed for this addition.
Full `--replay`/deep-resync recovery remains separately unavailable. No API,
frontend, signer, verified deployment manifest or live network was changed.

## Source checkpoint

| File | SHA-256 |
| --- | --- |
| `packages/db/migrations/0004_swap_receipts.sql` | `54cdc62ee03438a104eafd474e8839d7407a64757f76055d3408057e78c0de9d` |
| `packages/db/src/materialization.ts` | `3fbaf83d43519cf924b0b0b558184e67e6f4bdbfbd55684e16ee2eaf455dbcad` |
| `packages/db/src/materializationSchema.ts` | `a0189f767100a7bc85ebcca8cb255afee00b968ac1f42a8dad8516d435d5e3bd` |
| `apps/indexer/src/materializer.ts` | `71c8694cc2b441cd356305f73fa019ad8d2aa590f4e25973bb42bccb5e98f8d4` |
| `apps/indexer/src/worker.ts` | `17363b17b051e24c8e7dc39816cad820db66fdc8235a079fa2e281988f70ecce` |
| `apps/indexer/src/index.ts` | `9c98cc994b71b86600547a4585d888422aa97f671b6701220ce070c03c6b8725` |
| `apps/indexer/test/swaps.test.ts` | `1a59cb8c9021a50af5e161d667784d44e2494575953863fd613c316920b5ad5e` |
| `apps/indexer/test/materialization.test.ts` | `5fa05801994a7de83a1a870091360072c0700638da4b34277c0d23680f0eefe5` |
