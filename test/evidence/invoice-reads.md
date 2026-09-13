# Canonical invoice reads and pinned merchant pages

2026-09-08. This increment adds read-only invoice detail and merchant invoice
listing at `/invoices/:id`, `/makers/:address/invoices`, and their `/api/v1`
aliases. It consumes existing canonical invoice materialization. There are no
new migrations, indexer mutations, contract changes, quote enablement, backend
signing or frontend changes.

**The full API suite passes 53 tests, including 14 invoice tests. Six database
regressions, three shared-schema regressions, and API/database/shared typechecks
pass, with no skips or failures in the final runs.** Database output is retained
in [invoice-db-regression.txt](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/invoice-db-regression.txt).

## Public contract

`packages/shared/src/index.ts` exports `invoiceReadSchema`, its
`InvoiceReadDTO` type, and bounded receipt/list/cursor schemas. Amounts, expiry,
versions and block heights are exact decimal strings. A detail record includes
merchant, adapter, settlement-token metadata, original amount and expiry,
ordered recipients with bps and exact raw amounts, memo hash, indexed status,
creation/latest custom-event receipt identity, and paid-only financial facts.
There is no memo plaintext, customer profile or provider identity data.

Every prefix recipient receives `floor(amountDueRaw*bps/10000)` using BigInt
integer division. The final recipient receives the exact remaining amount.
The retained large-atom fixture has due `70000000000000001`, shares 9000/1000,
and results `63000000000000000` and `7000000000000001`. It catches the previously
fixed PostgreSQL pre-floor division rounding class without reintroducing SQL
fractional division into the read path. The DTO checks each allocation and the
payment/status/receipt relations. It rejects floating-point or malformed money,
changed recipient atoms, altered event kinds and extra customer fields.

Paid records retain payer, input token and display metadata, exact input,
received settlement USDC, refund and route hash. Direct receipts require the
configured USDC token, zero route hash, input=received=due and zero refund.
Swap receipts require a non-USDC allowlisted input and nonzero route hash;
received-refund equals due. These describe the custom `InvoicePaid` receipt,
not generic transfers to a merchant. `InvoiceCancelled` and `InvoiceCreated`
remain distinct sources. A persisted unpaid invoice is not relabeled expired
or currently payable from local wall time.

The envelope reports schema version, deployment identity, checked `asOf`
height/hash, current indexed block, historical indicator, coverage and indexer
freshness. Every result has `financialExecutionEnabled:false`; every invoice
has `paymentEligibilityVerified:false`. Reading an invoice cannot authorize a
payment or prove present funding. Existing `/ready`, quotes and SSE policies
are unchanged.

Available and stale data use HTTP 200. Detail absence uses HTTP 404 only after a
complete canonical history check through the indicated block; the message
states that observation boundary. Missing configuration, database, RPC,
coverage or canonical identity returns HTTP 503 and no data. Invalid request or
cursor input returns HTTP 400; an orphaned pagination pin returns HTTP 409 and
asks the client to restart. HTTP errors carry code, safe message, retryable,
field and requestId. Responses send `Cache-Control:no-store`.

## Pagination and consistency

Listing defaults to 20 invoices and caps at 50. It orders immutable creation
position by block descending, log index descending, then invoice ID descending.
The SQL query uses a parameterized keyset predicate and fetches limit+1 to
determine whether another page exists; it has no unbounded offset parameter.

An opaque canonical base64url cursor is capped at 1024 characters and contains
version, chain, deployment, merchant, original canonical block pin, and last
creation tuple. The tuple must name an actual invoice for that merchant within
the pinned history. Cursors cannot cross deployments or merchants. They are
public read filters, not signatures or authorization tokens.

The first page uses the current indexed tip. Later pages preserve that pin and
select each invoice's latest canonical status **at or before the original
block**, so a later cancellation/payment does not rewrite an earlier page.
Ordinary tip advancement is allowed; the response marks older pins
`historical:true`. Only invalid or orphaned pins require restarting pagination.
An orphan after the first read invalidates the response instead of leaking
removed payment facts.

All database checks and rows share one read-only PostgreSQL `REPEATABLE READ`
transaction. They require verified deployment identity JSON and role columns,
aligned canonical raw/deployment cursors, a canonical versioned current
deployment marker, and every canonical lifecycle projection marker through the
pin. Invoice reads require `projection_version=1`; they deliberately do not
require independent swap-projection coverage.

The query counts the three recognized raw payment-contract events and binds
every invoice snapshot to its exact canonical source, emitter, decoded kind,
invoice ID, merchant and appropriate version. It separately authenticates the
creation source and immutable terms, plus paid financial fields. Source entity
equality and the snapshot primary key make this binding injective; equal raw
and bound-snapshot counts therefore reject an omitted source or detached row.
No stock swap, token transfer or native-token bookkeeping log is a payment.

RPC uses the server's verified manifest and checks chain ID, head, and the
pinned block hash/number with the existing two-block display delay. Its three
requests share the eight-request capacity bound with metrics/readiness. A
second bounded database snapshot must preserve the pinned identity, coverage
and rows. It may observe a newer current cursor; current resync, identity or
marker failure still blocks. A sampled RPC head that no longer matches the
subsequently observed current tip is labeled stale, while the checked pinned
history remains usable. Freshness includes elapsed verification time; data
older than 10 seconds is explicitly stale. This is not a finality guarantee.

## Verification and retained failures

The initial unavailable stubs failed seven of eight behavioral tests before
implementation; the eighth negative unavailable test initially passed and was
strengthened to require the specific post-reorg rejection. The route test
separately failed HTTP 503 before wiring; its full TAP is retained in
[invoice-http-red.txt](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/invoice-http-red.txt).

Self-review added a regression showing that a valid old pin could bypass a
deleted current deployment marker. It failed HTTP 200 versus 503 before the current
marker join was added to match readiness. The failing output is retained in
[invoice-marker-red.txt](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/invoice-marker-red.txt).

Malformed DTO cases exposed a Zod refinement edge: object-level checks can run
after continuable child format errors, so `BigInt('1e18')` originally threw.
[invoice-dto-red.txt](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/invoice-dto-red.txt) retains the failure. The object
refinement now validates its numeric operands before BigInt arithmetic, leaving
the existing wire-format errors intact. The final suite checks malformed due,
block height and recipient amounts return unsuccessful `safeParse` results.

A requested follow-up probe checked first-recipient bps `1.5`, `NaN`,
`Infinity`, string `"9000"`, `-1` and `10001`: all returned unsuccessful
`safeParse` without throwing. The valid baseline parsed successfully.
`uint64Schema` and `uint40Schema` likewise rejected `"1e18"` without throwing,
as their existing shared tests already require. Integer type errors abort the
object refinement; no further source correction was warranted for that
suspected edge. The shared source hash below is this increment's checkpoint;
later frontend envelope additions are separate changes.

Fourteen focused invoice tests cover real PostgreSQL ingestion from compiled
event ABIs, exact wide splits and payment fields, same-block creation/payment,
cancellation, 55-invoice pagination, merchant isolation and input limits,
ordinary advancement between and during pages, historical unpaid statuses,
orphaned pins, lifecycle-only coverage, detached sources, stale/unavailable
states, shared DTO validation, HTTP contracts and production DB dependencies.
A deterministic writer commits between coverage and row reads; the first
transaction retains its original canonical cancelled invoice, and the next
read observes incomplete coverage. This tests actual MVCC isolation rather
than assuming endpoint consistency.

Root performed an independent read-only review of the pinned query, DTO and
controller and found no concrete defect in their scoped logic. The current
marker and malformed-DTO refinements described above followed self-review and
have explicit retained counterexamples. No source was changed by the reviewer.

The fixtures use real isolated PostgreSQL 16.15 and generated event ABIs, with
deterministic RPC headers. They are not new production-curve executions or
live Arc/Privy evidence. All schemas are disposable; normal database contents
were not changed.

The final full API run passed **53/53** with no failures/skips in 92.8 seconds.
[api.txt](api.txt) is the complete final API TAP artifact; the earlier
[invoices-focused.txt](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/invoices-focused.txt) records 14 focused passes before the
additional malformed-text cases were added to the same DTO test.

Reproduction uses Node 22.18.0, pnpm 10.34.5 and the documented local-only
PostgreSQL test profile. Each database fixture creates and removes an isolated
schema; API test files are serialized to avoid the recorded shared PostgreSQL
notification timeout under concurrent suites:

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
$env:NODE_ENV='test'
pnpm --filter @orbital/api exec tsx --test --test-concurrency=1 test/*.test.ts 2>&1 | Tee-Object -FilePath test/evidence/api.txt
pnpm --filter @orbital/db test
pnpm --filter @orbital/shared test
pnpm --filter @orbital/api typecheck
pnpm --filter @orbital/db typecheck
pnpm --filter @orbital/shared typecheck
```

Source checkpoint: dirty working tree based on
`2ecc6ce2f180fde239c13feee7dd09247c0d1b07`, 2026-09-08. Existing shared-file
hashes in earlier evidence remain historical checkpoints; this increment's
final shared/runtime/server hashes are:

| Source/artifact | SHA-256 |
|---|---|
| `packages/db/src/invoice-reads.ts` | `edf72d60ee1020bd3d172e108b1f4a386d3f917b29e4bdccca47f495f3718a87` |
| `packages/db/src/index.ts` | `f20c91a5102c54df8e973d59c175f01f790a59449aa32d79c3e80eabe1004be5` |
| `apps/api/src/invoices.ts` | `1d22cb561e1e54eceff28ba7791ea3e7106fb6d5a37956aa42e18fb4c9d7f4eb` |
| `apps/api/src/runtime.ts` | `fb8a47399072282f08dcb62011f6717731ece538f71ffd88a06e74a7dc1b4974` |
| `apps/api/src/server.ts` | `3373a8b53d58265468e69c4d05ceaa8a06fd55674f403bec4466753f27750216` |
| `packages/shared/src/index.ts` | `7c88cbef915894132f900a10a8b8f26775c533ce4c057d6e2355c4995c952e8f` |
| `apps/api/test/invoices.test.ts` | `87a9e5e86679f507e847d355f04cd002cc40a034d9e0e988d5ec76d86c91d5f0` |
| `apps/api/test/invoices-fixture.ts` | `ea9620b077dc2dce98cb51d9718fbfe48220f30d778f8c53910fbeb72e4660f1` |
| `test/evidence/api.txt` | `5e4c684890916ac16bc52f244695919c20c70c80452687c6d4ec2fd0b0c697bb` |

## Remaining scope

No current reserve/funding hydration, quotes, payment transaction preparation,
USD valuation, frontend integration or live wallet qualification is claimed.
The full-range coverage/source checks use bounded runtime database timeouts;
large-history query performance has not been benchmarked. A historical cursor
can cease to be available after canonical rollback or resync, and clients must
then restart from the current confirmed history.
