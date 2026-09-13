# Swap quote observation decoder

2026-09-08. Nine focused SDK checks failed against the unimplemented decoder and
then passed. The complete SDK suite passed **72 tests**, zero failed/skipped,
in 23.665 seconds; SDK TypeScript checking also passed.

- [Focused RED](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/quote-read-sdk-red.txt), [focused GREEN](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/quote-read-sdk-green.txt),
  [complete SDK output](sdk-green.txt).
- [Decoder](../../packages/sdk/src/quote-read.ts),
  [tests](../../packages/sdk/test/quote-read.test.ts),
  [synthetic wire fixture](../../packages/sdk/test/fixtures/swap-quote-observation.json).

The decoder binds a strict HTTP observation to the separately supplied verified
manifest and requested wallet, recipient, pair, amount and limits. It checks
canonical envelope coherence and both server/client freshness, recomputes each
retained configuration/order hash, preserves exact bigint monetary arithmetic,
and checks fees, normalized ranges, minimum output, deadline, ranking and
successful diagnostics. Every retained alternative receives the same checks.

Malformed monetary values, wrong roles/deployments, stale/future timestamps,
inconsistent counts, duplicate/unranked routes, invalid metadata and added
transaction payloads are rejected. A consistent empty inspected set remains an
explicitly bounded observation. Unavailable responses require an HTTP error
status and contain no partial financial data. Positive state versions are wire
checks, not independent chain authentication.

The API owner independently reviewed the decoder without finding a concrete
false acceptance within this scope. The tests use declared local wire fixtures;
they do not authenticate an RPC server, prove quote execution, replace fresh
wallet reads/review/simulation, or establish sponsor qualification. The returned
envelope keeps `financialExecutionEnabled:false` and contains no transaction
plan. API/runtime compatibility checks are recorded separately as they complete.

```text
pnpm --filter @orbital/sdk exec tsx --test test/quote-read.test.ts
pnpm --filter @orbital/sdk test
pnpm --filter @orbital/sdk typecheck
```
