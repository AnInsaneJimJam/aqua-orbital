# Bounded whole-size routing core

2026-09-08. This increment adds canonical candidate selection and pure read-call
planning/result selection. Public quote endpoints remain disabled. Every plan
and selection says `financialExecutionEnabled: false` and
`canonicalVerification: pending`; a caller-provided result object is not treated
as an authenticated RPC witness, a reservation, or permission to transact.

## Candidate query and explicit limits

`readStrategies(..., {kind: 'candidates', tokenIn, tokenOut})` reuses the existing
read-only repeatable-read canonical strategy query. Deployment identity, current
and pinned canonical markers, lifecycle and swap coverage, raw-event/snapshot
bindings, immutable activation records and receipt consistency are checked in
that same database snapshot. There is no parallel list-plus-per-item database
lookup or invented financial inventory.

The query returns at most **200** active, pair-matching registered records.
Order is latest successful activity block descending, canonical log index
descending, fee PPM ascending, then order hash ascending. A strategy's latest
successful custom swap is its activity; activation is the fallback when it has
no fills. Retired strategies are excluded. Fee totals for these candidates come
from one bulk exact-integer receipt query at the same pin.

`LIMIT 200` caps full candidate records; a SQL count window supplies the
truncation flag without returning a 201st configuration. This is an enumeration
bound, not a claim that PostgreSQL physically examines only 200 rows: canonical
history validation, latest-record selection and sorting still inspect the
relevant indexed history under existing database timeouts.

The pure core validates immutable metadata and local role, pair and normalized
amount constraints, then inspects only the first **32** locally accepted
candidates. Remaining rows retain `NOT_INSPECTED_CAP` diagnostics. This is an
explicit preliminary inspection policy; it can leave usable liquidity
uninspected. It is distinct from declaring 32 strategies eligible, and does not
claim maximum liquidity or a global optimum.

Counts distinguish `scanned` (candidate records considered), `locallyAccepted`,
`inspected`, `eligible` for quote probing, successful `quoted`, `failed`, and
`notInspected`. Coverage reports both limits and whether the database scan was
truncated. These facts let a later orchestrator extend inspection deliberately
without treating an incomplete search as exhaustive.

## Pure stages and exact caller context

`prepareRouting` generates three getter descriptors per inspected strategy.
`prepareWholeSizeQuotes` validates complete getter responses and generates
whole-size router quote descriptors only for coherent live/backed observations
with positive output funding ceilings. It reuses the strategy config/state/
availability validator documented in [strategy-reads.md](strategy-reads.md).
`selectWholeSizeQuotes` reconstructs these stages before accepting their result
sets, so an arbitrary replacement descriptor is not accepted as the plan.

Every descriptor is an independent `eth_call` to the fixed manifest router with
explicit intended `from`, zero value, locally constructed calldata, and the same
`{blockHash, requireCanonical: true}` pin. The result's complete request descriptor
must match, with no duplicate or unknown result IDs. Getter and quote data must
decode and re-encode to exactly the same compiled ABI bytes. Calls are grouped
into planned batches of at most eight. These are plans; no quote transport,
network scheduler, retry or cancellation implementation is claimed here.

Ordinary swaps use the wallet as caller and the requested recipient. Payment
mode retains the independent payer while forcing both router caller and
recipient to the configured payments adapter. It rejects payer/maker conflicts
and invalid settlement roles. The resulting route retains `kind` and `payer`
separately from caller/recipient. Payment mode does not authenticate invoice
terms/status, search for sufficient input, authorize payment, or implement a
direct-USDC payment quote.

Quote probes use canonical taker traits, the full gross input, the caller's
crossing bound, and a deadline equal to the supplied pinned block timestamp plus
20 seconds. Ordinary probing uses a present zero minimum threshold, which the
actual `OrbitalOrderCodec.validateTaker` accepts; payment probing uses its
explicit minimum. The selected minimum is positive and applies bounded slippage
rounding while preserving any payment minimum.

The actual SwapVM quote ABI returns exactly `(amountIn, amountOut, orderHash)`.
Selection requires the full gross input, matching order hash, positive output
meeting the requested minimum and output at or below the validated live funding
ceiling. The input fee is computed exactly from the validated configuration;
it is not invented as a fourth quote return. No crossing arrays or path metadata
are fabricated from this three-value response.

Successful routes rank by raw output descending, fee PPM ascending and hash
ascending. The result contains one best route and at most three alternatives.
All amount fields are decimal integer strings. Failures retain bounded generic
diagnostic codes; there is no split routing or global-optimum claim.

## Tests-first evidence

- `route-selection-red.txt`: all seven pure behavioral tests failed against the
  compiling unavailable stub before implementation.
- `route-candidates-red.txt`: both database tests failed against the compiling
  unavailable candidate reader. The fixture ingested actual generated event ABI
  bytes through the real materializer into a disposable PostgreSQL schema.
- `route-core-green.txt`: the initial combined **9/9** passed, including 205
  strategies distributed across blocks below the activation hydration limit;
  the query returned 200, preferred the later successful fill, excluded a later
  retirement, preserved historical pins, and rejected coverage/source gaps.
- `route-payer-red.txt`: a retained follow-up assertion proved that the first
  selection shape dropped the independent payer after checking it. The output
  now preserves payer and mode separately from the adapter caller/recipient.
- `route-selection-green.txt`: final pure **7/7** passed after that repair.
  Coverage includes all 40 locally accepted candidates becoming untradeable
  within the 32-inspection cap: exactly 32 failures, eight not inspected, zero
  eligible quotes. Tests also cover full-size versus partial results, exact
  quantities above 2^53, ranking/ties, at most three alternatives, role/caller/
  recipient/pin binding, unknown/missing/duplicate results, unavailable inventory
  and malformed ABI identities.
- API and database TypeScript checks passed on the final source.
- `route-selection-api90.txt`: final full API regression **90/90 passed**, zero skipped/cancelled,
  TAP duration 245,934.7332 ms. This retains the previous 81 tests and adds seven
  pure routing tests plus two real PostgreSQL candidate tests. Command:
  `node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/*.test.ts`,
  with the documented local `TEST_DATABASE_URL` and `NODE_ENV=test`.

Selected source and test SHA-256 hashes are recorded in
[route-selection.sources.json](route-selection.sources.json). This is a dated
local source snapshot, not complete dependency-closure or compiler/deployment
authentication. The prior strategy-read 81-test run is retained separately in
`strategy-reads-api81.txt`; `api.txt` records the latest integrated API run.

Pure ABI results are explicitly synthetic fixtures, not real onchain quote
receipts or mathematical oracle output. No production contracts, frontend,
HTTP route, runtime RPC execution, migration, signer or Privy integration changed.
Before public quote enablement, a trusted transport still needs to execute the
independent batch plans, bind header/chain/time, enforce shared capacity and
deadlines/cancellation, recheck canonical DB/RPC state, and apply the documented
freshness, cache, rate and transaction-review requirements. Current selections
deliberately retain the pending canonical-verification flag.
