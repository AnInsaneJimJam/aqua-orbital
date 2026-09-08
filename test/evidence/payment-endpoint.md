# Public payment quote observations

2026-09-08. G5 service/runtime/HTTP/SDK increment over `0cbc607`. Both
`POST /quotes/payment` and `POST /api/v1/quotes/payment` now return validated,
unsigned payment review plans for a configured verified deployment. This is
local read-path evidence. Wallet execution, the required quote cache, persistent
demo, Privy qualification and Arc deployment remain open.

## Implemented behavior

The strict request contains `invoiceId`, `payer`, `tokenIn`, `maxInputRaw` and
`maxCrossings`. It cannot supply invoice terms, spenders, RPC URLs, block pins,
minimum output or transaction bytes. Direct USDC uses the exact invoice due;
other supported inputs use the existing [sufficient-input search](payment-foundation.md).

The service authenticates indexed and onchain invoice terms at one canonical
hash, checks payer funds and adapter bindings, and inspects a fixed candidate
set once. Every retained search stage has complete quote results. The invoice
due is the exact output minimum and its expiry limits the 20-second quote
deadline. Unknown numerical/revert results remain unavailable probes. Search
exhaustion does not establish insufficient liquidity or a minimum input.

Before publication it rechecks context, identity, invoice and candidate source
snapshots, freshness and expiry. Consistent canonical tip advancement retains
the original historical pin. A getter revert cannot become invoice-not-found;
404 requires complete, canonical, empty indexed coverage and final checks.
Matching terminal/expired invoices return 409; authenticated funding-limit
failures return 422. Other incomplete observations expose no partial plan.

The runtime shares two service admission slots and an eight-member weighted
RPC reservation with swaps and other reads. Cancelled SQL work holds admission
until its transaction and client release finish. Payment HTTP adds one overall
20-second deadline covering initial/final manifest reads and service work.
All four swap/payment aliases share the burst-five, thirty-per-minute IP budget.
Responses use `Cache-Control: no-store`; malformed and oversized requests have
bounded error envelopes. A disconnected client aborts downstream work.

The SDK decoder independently binds deployment/request/invoice identity, exact
splits, funding bounds, route hashes and ordering, fee/refund/minimum arithmetic,
counts and deadlines. It reconstructs every retained route and compares both
the payment and bounded approval to the existing canonical transaction builders.
The HTTP boundary also runs that decoder before publication. All responses keep
`financialExecutionEnabled:false` and `paymentEligibilityVerified:false`;
successful plans are `reviewOnly:true`. They grant no signing authority or
reservation of funds. No application private key or server signing path is added.

## Work bounds and independent review

The service's actual counters enforce six identity, at most sixteen context,
ninety-six inspection and 128 quote members, with at most 246 logical members
and 44 native batches. These ceilings count logical work, not transport retry
attempts. Existing retries are separately bounded to two for transport errors.
Direct USDC needs twenty members in four batches. The retained test with
32 inspected / 9 eligible candidates reaches fourteen search stages,
126 quote members and **244 total members in 44 native batches**.

The [isolated service review](../../docs/audits/PAYMENT_SERVICE_REVIEW.md) proves
its stated conditional preservation/accounting claim under authentic database
and RPC observations and the named route/SDK validator contracts. It found no
defect in that scope; its twenty source pins were revalidated. Public schemas,
HTTP and the new SDK decoder are outside that independent review. Their evidence
is the adversarial regression coverage below, not an independent security audit.

## Verification and retained failures

- Thirteen service tests cover direct/swap plans, the work ceiling, missing or
  malformed members, funding/status, final source/context changes, historical
  pins, expiry during SQL work, cancellation and optional refinement cutoff.
- Four new runtime tests use real native HTTP batches and isolated PostgreSQL
  schemas. They cover materialized invoices/strategies, shared admission under
  blocked SQL, weighted capacity shared with metrics, and shutdown cancellation.
  [Focused output](payment-runtime-green.txt) also includes four existing swap
  runtime regressions, eight total.
- Ten HTTP tests cover both aliases, real PostgreSQL/native-RPC-to-SDK round
  trips, strict input/body handling, final manifest replacement/expiry, altered
  calldata, the shared limiter, both stalled manifest reads using controlled
  timers, and an actual disconnected socket followed by successful recovery.
- Ten SDK decoder tests cover direct/swap/absence fixtures, scope and request
  mutation, invoice/funding limits, every retained route, counts, exact plan
  bytes, direct zero-AMM semantics and current-clock expiry. The three wire
  fixtures are explicitly synthetic; their generator invokes the real service
  with named fixtures, without a live wallet or onchain transaction.
- Two new shared structural-schema tests supplement the prior five tests.

Retained RED outputs: [service](payment-service-red.txt),
[runtime](payment-runtime-red.txt), [wire schema](payment-response-red.txt),
[decoder](payment-read-red.txt), and [HTTP](payment-http-red.txt).
The [initial service run](payment-service-initial.txt) had a test-selection error:
it compared the first same-amount quote instead of the winning order; the test
now checks the selected order hash. The [decoder availability counterexample](payment-read-availability-red.txt)
exposed that `OUTPUT_UNAVAILABLE` can label either failed inspection or an
eligible quote above its funding ceiling. The decoder now uses aggregate stage
outcomes to distinguish those cases. It does not claim to authenticate omitted
raw getter results from wire diagnostics alone.

The [initial HTTP RED harness](payment-http-initial.txt) leaked its fixture when
stub registration threw before `finally`. The owned test child was stopped,
its uniquely identified PostgreSQL schema removed, and registration moved inside
the cleanup guard. The retained clean RED rerun has eight failures and no
cancellations; the final focused run has ten passing tests. Four older tests now
expect 400 for an empty payment body, replacing the removed stub's 503 behavior.

Full API/SDK/shared/type-check output and before/after source hashes are recorded
in [the endpoint checkpoint](payment-endpoint/checkpoint.json), produced by
`python scripts/audit-payment-endpoint.py` with `TEST_DATABASE_URL` set. It does
not hash installed dependency contents, compiler caches or external database
state. Earlier [foundation evidence](payment-foundation.md) and its source pins
remain historical. No Solidity, numerical reference or browser campaign was
rerun for this backend/SDK increment; their prior evidence retains its scope.

The complete run passed **195 API**, **89 SDK**, **7 shared** tests and workspace
type checking, with zero failures, cancellations or skips. The TAP durations are
205.739 seconds for API and 15.915 seconds for SDK. Every enumerated source input
had the same bytes before and after all four commands. The earlier full
[168-test API](api-checkpoint-168.txt) and [79-test SDK](sdk-checkpoint-79.txt)
transcripts are retained separately; current `api.txt` and `sdk-green.txt` are
exact copies of the accepted endpoint run.

## Remaining work

The cache, fresh wallet observations/simulation, post-approval re-quote and
explicit transaction controllers remain required before payment execution.
The current frontend presentation is unchanged. Full G5, mathematical/release
campaigns, persistent local demonstration and real Privy/Arc receipts remain
separate acceptance requirements.
