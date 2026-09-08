# Canonical swap observation HTTP boundary

2026-09-08. `POST /quotes/swap` and the documented
`POST /api/v1/quotes/swap` alias now expose the canonical internal observation
service when a verified deployment, database and coherent RPC/indexer state are
available. **Every success and failure retains
`financialExecutionEnabled: false`.** This connects a read endpoint, not a wallet
transaction flow, reservation, sponsor qualification or live deployment claim.
The payment quote endpoint remains unavailable; invoice authentication and
sufficient-input search are separate work.

## Request, response and trust boundary

The body is exactly the existing strict `quoteRequestSchema`: wallet, recipient,
pair addresses, positive raw input, bounded slippage and crossing limit. Query
parameters and unknown body fields are rejected. Amounts stay decimal integer
strings. The route normalizes addresses, then maps only these fields to the
internal `kind: 'swap'` intent. The server supplies its own manifest file,
database pool and runtime transport. No request can supply a timestamp, RPC URL,
configuration witness, call descriptor, spender, callback or transaction payload.

HTTP 200 carries the strict shared `swapQuoteObservedSchema`: normalized request,
request ID, chain/router/deployment/start identity, canonical observation and
current confirmed pin, historical flag, source freshness, bounded counts and
diagnostics, and a best whole-size route plus at most three alternatives. Each
retained route now also carries its already-validated immutable configuration.
This allows the SDK to recompute the order/configuration hashes and exact fee,
pair, caller, minimum and deadline bindings; it is not arbitrary backend calldata.
An empty inspected result remains 200 with `best: null` and
`NO_ROUTE_IN_INSPECTED_SET`, without asserting that no liquidity exists.

Errors use `swapQuoteUnavailableSchema`: `code`, generic `message`, `retryable`,
`field`, `requestId`, schema/status fields, disabled execution, unavailable
canonical verification and **`data: null`**. Malformed input/query is 400, an
oversized body is 413, rate/service capacity is 429, the internal total deadline
is 504, and deployment/index/RPC/source failures are 503. Parser/HTTP errors use
the same safe envelope on these two routes. Exceptions, response bodies,
connection details and remote RPC errors are not reflected. All responses set
`Cache-Control: no-store`.

The HTTP adapter uses the internal service documented in
[quote-service.md](quote-service.md) and the transport in
[quote-rpc.md](quote-rpc.md). It retains their exact intended caller, independent
native batches, same hash pin, coherent financial getter validation, full input
and output availability requirements, final canonical source checks, explicit
200-candidate/32-inspection policy and non-global ranking claim.

After the service completes, the adapter reloads the server's deployment file
and rejects any change. It validates the response DTO and checks current wall
expiry/index age again immediately before 200. A slow final file read therefore
cannot send an already-expired 20-second quote or an index observation older
than ten seconds. The original `observedAt` and source timestamps are preserved;
the adapter does not invent a newer canonical check. The service's bounded
20-second operation remains distinct from filesystem reads and HTTP upload/
delivery time. A chain or source change after final checks remains possible.

## Rate and cancellation behavior

Both aliases use **one shared limiter**, so switching paths cannot double the
budget. It enforces at most 30 admitted requests in any rolling 60 seconds plus
a burst capacity of five, refilling one token per two seconds. The clock is
monotonic and backward observations cannot mint credit. At most 5,000 IP entries
and 30 timestamps per entry are retained. Entries idle for 60 seconds are
removed in activity order. If the table is full, a new IP is rejected rather
than evicting an active budget. This is local process memory, not a distributed
rate limit; full-table rejection is a deliberate bounded availability policy.

The key is Fastify's socket IP with proxy trust disabled by default; supplied
`X-Forwarded-For` values do not create new budgets. Existing 120/minute read
limits and 16-KiB body limit remain in place. Swap routes use their stricter
shared limiter rather than independent alias-local plugin stores.

Client request abort or response-socket close aborts the service signal. This
propagates browser supersession when the browser cancels its old request; no
cross-user wallet-key cancellation registry was added. Active RPC work and later
batches stop, listeners are removed in `finally`, and runtime shutdown retains
the existing cancellation and shared-capacity behavior. The internal service's
pending-database admission rule remains intact: response cancellation does not
claim to cancel PostgreSQL or release an admission slot before its transaction
settles.

## Verification and limitations

- `quote-http-dto-red.txt`: both DTO behavioral tests failed against the
  unavailable schema stub. The implemented DTO passed both; malformed child
  values fail parsing without throwing, and nested extra fields/count/length/
  execution mutations are rejected.
- `quote-http-red.txt`: all six initial HTTP/limiter tests failed before route
  implementation, with no cancelled tests.
- `quote-http-preliminary.txt`: initial implementation passed 11 of 12 combined
  tests. The one failure was a test clock using 59 seconds of idle time while
  expecting the documented 60-second expiry. The corrected regression retains
  rejection at 59 seconds and acceptance at 60; production policy was unchanged.
- `quote-http-final-time-red.txt`: a separate retained regression reproduced
  HTTP 200 after a final manifest-read clock advance made the observation stale.
  The immediate pre-response freshness/expiry repair closes that edge.
- `quote-http-green.txt`: final focused **14/14 passed**, zero skipped/cancelled,
  TAP 45,948.369 ms: eight HTTP/limiter tests, two DTO tests and four existing
  runtime tests. Actual Fastify responses pass the SDK decoder.
- API and shared TypeScript checks passed after the final timing repair.
- `quote-http-api-preliminary.txt`: the first full run passed 129 of 130.
  One legacy readiness test expected the former unconditional quoter-disabled
  code. Its verified-manifest/readiness-only fixture correctly receives the new
  structured `QUOTE_DATABASE_UNAVAILABLE` response because it has no quote
  runtime/database. The assertion now verifies that code, `data: null`, disabled
  execution and request ID; no production behavior was changed for this test.
- `api.txt`: final full API regression **130/130 passed**, zero failed, skipped
  or cancelled, TAP 188,769.6487 ms. It retains the prior 120 tests and adds eight
  HTTP/limiter and two DTO tests. The preceding checkpoint remains in
  `quote-service-api120.txt`.

The positive HTTP tests use real disposable PostgreSQL schemas, the production
runtime, a temporary explicitly synthetic manifest and native JSON-RPC requests
to an actual localhost HTTP server. They cover both aliases, canonical identity
failure, deployment replacement, exact route metadata, no-store/error envelopes,
body/query rejection, shared alias/XFF-resistant rate limits, listener cleanup,
client disconnect and recovery. The limiter and final-file-time tests use
controlled clocks. These are fixture RPC outputs, not real curve outputs or
onchain execution receipts. No new production contract, migration, frontend,
signer or token approval path was changed.

Verification commands use the documented local-only `TEST_DATABASE_URL` and
`NODE_ENV=test`:

```powershell
node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/quote-http.test.ts apps/api/test/quote-dto.test.ts apps/api/test/quote-runtime.test.ts
node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/*.test.ts
pnpm --filter @orbital/api typecheck
pnpm --filter @orbital/shared typecheck
```

The separately implemented SDK decoder and its nine tests are documented in
[quote-read-sdk.md](quote-read-sdk.md). Its owner reviewed the HTTP policy and
found the final-file timing edge above. The HTTP owner independently reviewed
the decoder and found no concrete defect within its declared wire/deployment/
arithmetic coherence scope. Positive `stateVersion` is bounded metadata from the
server observation, not independently authenticated by an SDK chain read.
Neither review is a complete security audit.

Selected source hashes are in
[swap-quote-http.sources.json](swap-quote-http.sources.json). They represent a
dated local source/test snapshot, not an atomic filesystem snapshot, complete
dependency closure, verified compiler build or authenticated live deployment.
No in-memory quote cache was added; the full G5 cache requirement remains open.
Frontend quote display/refresh/review, executable transaction integration,
payment quote preparation and live wallet/network verification remain separate.
