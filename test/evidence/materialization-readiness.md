# Deployment materialization readiness

Observed 2026-09-08, final verification at 03:40 UTC. This is a bounded G5 read-dependency increment, not financial API or deployment completion. See [materialization evidence](materialization.md) for the projection schema and event coverage and [backend API evidence](backend-api.md) for the existing HTTP/SSE implementation.

## Behavior

`GET /ready` now requires the verified manifest's deployment projection, in addition to the existing raw-chain/RPC checks. The deployment ID is `keccak256(abi.encode(chainId, aqua, router, payments))`; immutable public identity also binds USDC, start block, and the sorted token address/decimals/mock list. Runtime checks both identity JSON and explicit role/start-block columns. RPC/explorer URLs and token labels are excluded from database identity; URLs may contain secrets. The API helper is cross-checked against the real indexer's scope by the PostgreSQL tests. No DB, indexer, SDK or dependency source was changed in this increment.

One SQL statement reads raw cursor/state, its canonical block, the expected deployment, its cursor, and its version-1 projection marker joined to the canonical block at the same height and hash. A different deployment's fresh cursor cannot satisfy this query. Missing registration or cursor, mismatched identity, missing/orphaned marker, unsupported projection version, or projection/raw height or hash disagreement fails closed. Both raw and projection timestamps must be finite, no more than 10 seconds old, and no more than one second in the future.

RPC must still report the expected chain ID, the raw cursor's canonical hash, and exactly `head = rawCursor + 2`. Thus recent backfill of old blocks does not count as current state. After RPC, another SQL snapshot rechecks raw cursor stability and all deployment conditions. The public result shape is unchanged; `indexedAt` and `ageMs` describe the oldest raw/projection observation across both reads. `financialExecutionEnabled` remains `false`. `/events` uses the same admission check and refuses a missing deployment projection before creating a subscription.

New failure codes are `MATERIALIZATION_NOT_STARTED`, `MATERIALIZATION_DEPLOYMENT_MISMATCH`, `MATERIALIZATION_BEHIND`, `MATERIALIZATION_AHEAD`, `MATERIALIZATION_ORPHANED`, `MATERIALIZATION_VERSION_UNSUPPORTED`, `MATERIALIZATION_STALE`, and `MATERIALIZATION_CHANGED` (deployment identity changed between reads). Existing raw-chain/RPC failure codes remain.

## Tests and results

Tests were written before the behavioral change. The initial focused run had **4 passes / 7 failures** in 18.501 seconds. Five real-PostgreSQL tests demonstrated that legacy readiness returned `READ_DEPENDENCIES_READY` for absent projections, partial backfill, wrong immutable identity, orphaned projection cursors, and deployment removal during RPC. Two unit tests additionally failed for manifest-aware dependency input and projection revalidation/freshness. These were the intended red cases, not suppressed skips.

With authorized local `TEST_DATABASE_URL` set, run:

```powershell
pnpm --filter @orbital/api exec tsx --test test/readiness.test.ts test/materialization-readiness.test.ts
pnpm --filter @orbital/api test
pnpm --filter @orbital/api typecheck
git diff --check -- apps/api
```

- Focused green: **11/11**, 7.897 seconds.
- Final full API suite: **24/24**, 11.928 seconds; no failures/skips/cancellations. Includes five isolated PostgreSQL materialization-readiness cases and existing committed-notification, shutdown/cleanup/backpressure, CORS/body-validation, and disabled-financial-route checks.
- Final API typecheck: passed. Diff whitespace check: passed (Git reported existing Windows line-ending conversion notices only).
- Environment: Node 22.18.0, pnpm 10.34.5, PostgreSQL 16.15. Existing Docker PostgreSQL was healthy; each database test used a newly created isolated schema with all migrations and removed only that schema afterward. Existing volume/data were preserved.

The new real-DB tests use the real `atomicBlock`, `atomicDeploymentBlock`, and canonical rollback transaction, with empty event batches because readiness concerns committed block coverage rather than invented financial fixtures. They cover raw-only indexing, another deployment, correct deployment catch-up, independent stale projection time, immutable identity changes, harmless transport/presentation changes, corrupt explicit role columns, a cursor without its canonical versioned marker, and concurrent canonical rewind/deployment removal. Unit tests cover future/invalid timestamps, ahead/behind projection cursors, unsupported versions, changed deployment identity during RPC, wrong RPC identity/hash/confirmation depth, recent ingestion far behind the chain, bounded unresponsive dependencies, and sanitized failures.

## Limits

The new database tests mock read-only RPC observations; they are not live-chain or Arc verification. The manifest's `verified` flag remains a trusted server configuration input. This change does not populate or authenticate currently absent deployment source/code-identity evidence, replace target network verification, or prove that a configured contract is correct. Readiness is a point-in-time read dependency check; a later reorg or new head may invalidate it. Existing SSE streams receive invalidations and must refetch rather than treating admission as a permanent guarantee.

Projection version 1 currently means lifecycle and invoice event coverage described in materialization evidence. It does not mean fresh token backing/balances, complete swap metrics, or a certified quote service. Strategy/invoice/metrics/financial endpoints remain unavailable; there is no signing path. Schema migration 0003 is required; a database without these tables fails `DATABASE_UNAVAILABLE`, never legacy raw-only readiness. Missing target deployments, live Privy qualification, and remaining mathematics are unaffected.

## Source fingerprints

SHA-256 of final tested API files:

| File | SHA-256 |
|---|---|
| `apps/api/src/readiness.ts` | `3f6f36525b868f2ea7a5f304d018942a90633c7de16ff7ed78aefa4d947dd81b` |
| `apps/api/src/runtime.ts` | `4b1dd47598d9fde8741f5a9421c5f509c85e8f3767157bc906f37a8756273ceb` |
| `apps/api/src/deployment-scope.ts` | `d98d1766b6e5389568fb63ca985ee0841f9215593fd9f13ead8aa11468f4c941` |
| `apps/api/test/readiness.test.ts` | `58979f778204d84927cb04b4aec3f2e45781c25270138ed67a6b8ad633f16a42` |
| `apps/api/test/materialization-readiness.test.ts` | `cd3cef062dfd9fc3f0a41da459ebdbc07689b615d4c8c079852b49235c71597e` |
| `apps/api/test/server-live.test.ts` | `a1922b5a608ee72dc6335bed0da39475824b701fd8700b7fe47e4503c36e7185` |
