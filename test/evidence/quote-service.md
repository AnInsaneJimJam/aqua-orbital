# Canonical internal quote observations

2026-09-08 internal-service checkpoint. The later HTTP observation increment is
documented in [swap-quote-http.md](swap-quote-http.md); this note preserves the
scope and results before public swap observations were connected.

The internal `observeQuote` service connects the bounded routing
core to canonical database reads and native JSON-RPC batches. Public quote
endpoints remain disabled. Successful results explicitly retain
`financialExecutionEnabled: false`; `verified_at_pin` describes a complete
read observation at a particular block, not transaction permission, a liquidity
reservation, or mathematical certification beyond the invoked router quote.

## Data and identity boundary

The server supplies the verified deployment manifest and database/RPC ports.
Requests supply only the existing strict swap/payment intent. They cannot supply
a block timestamp, arbitrary call descriptor, RPC URL, cached financial witness,
or signed transaction. Intent validation is shared with the pure routing core.
The service has no public HTTP registration and adds no signer or cache.

The first database read uses the existing repeatable-read candidate query and
requires complete canonical lifecycle/swap coverage, the exact deployment
identity, a current confirmed cursor and matching immutable source records.
The candidate and inspection policies remain those in
[route-selection.md](route-selection.md): at most 200 recent successful-activity
records, at most 32 inspected, and explicit cap/failure counts. The service does
not replace these bounds with unbounded per-strategy queries or silently label
uninspected strategies ineligible.

The first RPC group checks chain ID, head and the pinned block hash, height and
timestamp. Head must equal the indexed confirmed cursor plus two. The actual
pinned timestamp, supplied by this trusted RPC observation, determines the
20-second expiry. The service compares it against its server wall clock plus
monotonic elapsed time: more than one second in the future is rejected; expiry
at or before observation time is rejected. The indexed timestamp must be valid,
at most one second ahead of observed time, and no more than ten seconds old.
The same checks apply after all reads; an older before/after index timestamp
determines returned freshness. These are explicit availability policies, not a
claim that the wall clock proves a chain timestamp correct independently.

Every getter and static quote uses the same EIP-1898 hash and intended caller.
Ordinary swaps use the wallet; payment mode uses the configured adapter caller
and recipient while retaining the independent payer. Financial/configuration
validation, canonical ABI re-encoding, whole gross input, exact output funding
ceiling and best-output/fee/hash ordering reuse the pure core. Explicit
per-candidate EVM reverts remain diagnostics. Group transport, protocol or
identity failures discard every partially accumulated result (`data: null`).

After selecting a best route and at most three alternatives, the service checks
RPC identity/head again and rereads the database at the original pin. The
deployment, pinned scope, coverage, candidate records, exact receipt fee totals
and truncation flag must be unchanged. An ordinary tip advance is permitted
when the pin remains canonical, its data remain identical, the new confirmed
cursor matches the final head minus two, and expiry/freshness still hold. It is
labelled historical. Reorg, changed source coverage/records, resync, stale index
time, changed pin timestamp, backwards head or identity mismatch yield no data.
This is an observed consistency boundary; it cannot prevent a chain change
after the final checks or authorize execution without fresh transaction review.

An observed empty result says `NO_ROUTE_IN_INSPECTED_SET`. It does not assert
that no liquidity exists. Payment mode still does not authenticate invoice
terms/status, solve sufficient input, or authorize a payment. No partial fills,
split routing, USD estimates, invented reserve balances or global-optimum claims
are introduced.

## Work and cancellation bounds

[quote-rpc.md](quote-rpc.md) documents the independently implemented transport:
native arrays of one to eight calls, no multicall, strict ID correlation,
256-KiB member / 2-MiB maximum aggregate response bounds, transport-only retries
at 250/750 ms, fixed response backing storage and elapsed-time checks through
ready/empty streamed reads. The service regenerates plans for every phase;
transport regenerates the selected batch again rather than trusting arbitrary
descriptors as execution authority.

At most 96 getter calls and 32 quote calls are planned, with two three-call
identity groups: at most 134 logical RPC calls in 18 sequential groups. Every
group receives the lesser of eight seconds and the remaining overall service
budget. The total service budget defaults to 20 seconds and cannot be increased
by a caller option. Remaining time includes parsing/planning and database work.
Checkpoint checks discard work that exhausts the budget; synchronous finite
JavaScript work cannot be preempted mid-instruction. A superseding caller signal
or runtime shutdown stops later work and aborts active transport operations.

Runtime admission permits at most two quote workflows and immediately rejects
excess work. Each native group reserves its full logical weight against the
existing shared eight-read RPC budget, also used by readiness, metrics and
strategy reads. No unbounded transport queue is introduced.

Database reads are multi-statement repeatable-read transactions under the
existing pool maximum of four, three-second connection timeout, and three-second
per-statement/query timeouts. **AbortSignal does not cancel PostgreSQL.** A timed
out or cancelled service responds promptly but retains its admission slot until
every already-started complete database operation settles, including rollback
and client release. This prevents repeated short deadlines from admitting an
unbounded tail of database work. Shutdown closes the pool after outstanding
database operations settle; it does not claim a hard 20-second SQL shutdown.

## Verification

Tests were written before behavior. Retained outputs:

- `quote-service-red.txt`: all eight initial service tests failed against the
  unavailable stub, with no cancelled tests.
- `quote-runtime-red.txt`: all three initial production-runtime integration
  tests failed before the runtime exposed the internal service.
- `quote-budget-red.txt`: a regression exposed that dependency calls initially
  received no remaining overall budget. Every identity/getter/quote group now
  receives a positive bounded `timeoutMs`.
- `quote-admission-red.txt`: real PostgreSQL table locking reproduced premature
  admission release after two timed-out database reads. The third request now
  receives `QUOTE_CAPACITY` until the transactions actually settle; recovery
  after lock release is exercised.
- `quote-service-green.txt`: **21/21 passed**, zero skipped/cancelled, TAP
  72,700.3655 ms: ten service tests, four native HTTP/PostgreSQL runtime tests,
  and seven existing pure routing tests.
- API and database TypeScript checks passed after the final admission repair.
- `quote-service-api120.txt`: final full API regression **120/120 passed**, zero failed,
  skipped or cancelled, TAP 199,541.5095 ms. It retains all prior 90 tests and
  adds 16 transport, ten service and four runtime tests. The previous 90-test
  checkpoint is retained in `route-selection-api90.txt`.

The focused service tests use disposable PostgreSQL schemas populated through
the real canonical materializer. They cover final source/index-time mutation,
coverage gaps, reorg after quote reads, normal tip advance, exact quantities and
serialization, wrong identities/times, per-candidate failures, all-candidate
failure, group failure, supersession and deadline recovery. Runtime integration
loads an explicitly synthetic manifest from a disposable file and talks to an
actual localhost HTTP server. It verifies native batch sizes/order, swap and
adapter caller semantics, independent payer retention, shared RPC capacity,
shutdown and database admission retention. ABI results remain declared local
fixtures, not real onchain math output, successful transactions or deployments.

Commands use the documented local `TEST_DATABASE_URL` and `NODE_ENV=test`:

```powershell
node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/quote-service.test.ts apps/api/test/quote-runtime.test.ts apps/api/test/route-selection.test.ts
node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/*.test.ts
pnpm --filter @orbital/api typecheck
pnpm --filter @orbital/db typecheck
```

The parent independently reviewed the service and transport before final
verification and identified the database admission lifetime issue addressed
above. The service owner independently reviewed the frozen transport and found
no concrete defect in its scoped descriptor, protocol, memory, cancellation and
capacity checks. Neither review is a full security audit or live-network test.
Selected hashes in [quote-service.sources.json](quote-service.sources.json) are
a dated local source/test snapshot, not a complete dependency closure, atomic
filesystem snapshot or compiler/onchain deployment authentication.

Remaining release work includes public quote API/cache/rate and frontend review
integration, supported engine traversal/gas completion, live verified deployment
and wallet receipt campaigns. This increment makes no Privy, Arc or sponsor
qualification claim.
