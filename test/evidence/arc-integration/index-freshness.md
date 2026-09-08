# Arc API freshness integration

Observed 2026-09-08 21:24 UTC. This is focused local fixture evidence, without live RPC, database, wallet authentication, signatures or settlement transactions.

The API imports `isFreshIndexedHead` from `@orbital/shared`: Arc chain 5042002 accepts a current indexed cursor two through eight blocks behind the observed head. Other chains retain exactly two blocks. Readiness, quote/payment services and public strategy/invoice/metrics freshness classifications use this policy. The 10-second indexed-data age, 20-second quote expiry, canonical block hashes, coverage and final pinned payload comparisons remain enforced.

Arc swap-funded payments retain one original canonical invoice/strategy pin as separately read current cursors advance. The service checks monotonic advancement, rejects same-height hash replacement, and requires both final current cursors to remain confirmed within the bounded lag window. The pure route preparer accepts this historical pin only for Arc payment intents; financial reads still target the original hash with `requireCanonical: true`. Identity work remains two reads / six RPC members.

Verification:

- `pnpm --filter @orbital/api exec tsx --test test/arc-index-freshness.test.ts test/readiness.test.ts test/payment-service.test.ts` — **30/30 passed**, 36.8 seconds reported total. Covers Arc lag boundaries, unconfirmed/orphan rejection, unchanged age checks, pinned quote recovery, independently advancing payment source cursors, rewinds/hash replacements, final payload/coverage changes, public read classifications and local-chain regressions.
- `pnpm --filter @orbital/api typecheck` — **passed** after the final route-preparer change.

The first run exposed the route preparer's prior exact-current-pin requirement; the progressing Arc payment fixture passed after that cause was fixed. During the same run alongside typechecking, the existing 32-order fixture exceeded its unchanged 10-second freshness limit and correctly returned `PAYMENT_INDEXER_STALE`. The final focused run above passed with typechecking performed separately; this does not establish throughput or latency guarantees.

Limits: readiness retains its final identical-cursor check, and metrics retains its identical-snapshot check. Either can transiently become unavailable during normal advancement. A final quote/payment cursor newer than the last observed head minus two still fails closed. This change does not complete live Privy flows, prove Arc throughput, or close mathematical/release campaigns.
