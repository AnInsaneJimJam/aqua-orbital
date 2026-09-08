# Payment quote search and invoice/funding checks

2026-09-08. G5 component checkpoint on top of `d2f3fdf`. The public payment
quote endpoint, its canonical service/final checks, shared HTTP admission,
public response/SDK decoder and wallet controllers remain unfinished. No
payment execution, live RPC financial observation, Privy flow or Arc receipt is
claimed. The existing frontend template and production Solidity are unchanged.

## Implemented boundary

- The strict public request accepts invoice ID, payer, selected token, maximum
  raw input and crossing bound. It excludes caller-authored invoice terms,
  spenders, calldata, minimum output, expiry, RPC and block selection.
- The additive `paymentsReadAbi` contains exactly `getInvoice`, `USDC`,
  `ROUTER` and `allowedToken`, generated from the existing authenticated
  compiler artifact. Transaction and event ABI groups retain their identities.
- `payment-context.ts` constructs seven reads for direct USDC or eight for
  swap funding. All use one EIP-1898 canonical block hash, explicit payer and
  zero call value. Decoding requires the exact complete descriptor set,
  canonical ABI bytes, matching adapter immutables and token decimals.
- `readPaymentContext` uses the existing native transport's shared weighted
  reservation, member/stream bounds, two transport retries and cancellation.
  Any getter revert rejects the context. Indexed absence cannot be inferred
  from a revert. This wrapper is ready for service composition; it is not yet
  exposed by the production payment endpoint.
- `payment-validation.ts` compares all twelve stored invoice fields against
  the indexed record, validates receipt positions and contract-admissible terms,
  and distinguishes matching terminal/expired invoices from inconsistent data.
  It checks direct USDC funds or computes the exact bounded swap search domain.
  Allowance remains an approval observation, rather than a funding cap.
- `invoice-view.ts` extracts the existing exact recipient split and status
  rendering for reuse. Public invoice reads keep their previous behavior.
- Internal payment routing fixes its minimum to the invoice due and deadline
  to the earlier of the invoice expiry and block timestamp plus 20 seconds.
  A retained regression expires during the final database read and now fails
  explicitly. Swap slippage behavior is preserved.
- `payment-search.ts` implements the [bounded policy](../../docs/audits/PAYMENT_SEARCH_POLICY.md).
  It validates complete fixed-order outcomes, retains an isolated sufficient
  witness and checks cancellation/expiry checkpoints. Actual quote sufficiency,
  complete transport accounting and final canonical checks are caller obligations.

## Exact arithmetic and reviewed claim

For token decimals `d`, let `q = 10^(18-d) * 2^64`. The swap raw cap is
`min(userMaximum, balance, floor((2^160-1)/q))`. Since `raw*q` is an integer,
`raw*q < 2^160` is equivalent to `raw*q <= 2^160-1`; integer division gives
the greatest admissible raw value. Tests verify both maximality inequalities
for every integer `d` in 0..18 and independently exercise user/balance caps.
This does not prove a feasible trade exists at that value.

The unit-parity seed uses exact ceiling division of `due * 10^d` by `10^6`,
then clamps to `[2,B]`. It is a proposal, not a price or a sufficient quote.
Direct USDC uses the exact due without this search or its two-unit lower bound.
The invoice's stricter creation-time amount limit is retained from the adapter;
the creation-only five-minute minimum lifetime is not imposed on payment.

The [independent review](../../docs/audits/PAYMENT_SEARCH_REVIEW.md) proves the
scoped pure-search preservation and planned-work claim under explicit callback
assumptions. It found unrestricted SharedArrayBuffer retention and uncounted
property names in the payload budget; both were corrected and independently
rechecked. The [frozen original proposal](../../docs/audits/archive/PAYMENT_QUOTE_PLAN-preimplementation.md)
matches its historical proposal pin. The separate
[computation manifest](payment-search/manifest.json) hashes the actual pure
search inputs before and after its 16-test run. It records finite test bounds
and does not promote those tests into an integrated endpoint proof.

## Verification ledger

Focused initial failures and later checks are retained separately:

| Scope | Initial failure | Later evidence |
| --- | --- | --- |
| Pure search | [0/12 stub](payment-search-red.txt), [15/16 shared-memory defect](payment-search-review-red.txt) | [16/16 final pinned tests](payment-search/tests.txt), independent review |
| Additive read ABI | [0/3](payment-read-abi-red.txt) | [3/3](payment-read-abi-green.txt), complete SDK regression below |
| Strict request | [0/2](payment-request-red.txt) | [5/5 complete shared suite](payment-shared-green.txt) |
| Context plan/decoding | [0/6](payment-context-red.txt) | [6/6](payment-context-green.txt) |
| Context transport | [0/5 missing export](payment-context-rpc-red.txt) | [27/27 context/transport/search](payment-foundation-green.txt) |
| Invoice/funding validation | [0/9 stub](payment-validation-red.txt) | [9/9](payment-validation-green.txt) |
| Internal payment expiry and minimum | [routing failure](payment-routing-red.txt), [late expiry defect](payment-expiry-red.txt) | [55/55 affected routing/service checks](payment-routing-green.txt) |

The first context-transport command referenced a nonexistent root `tsx` entry;
its [runner error](payment-context-rpc-runner-error.txt) is not behavioral RED.
The initial combined routing attempt omitted `TEST_DATABASE_URL`, so its
[40-pass/14-fail result](payment-routing-missing-db.txt) is an environment
failure. The complete SDK regression caught a historical four-ABI-group count
assertion after the additive group was introduced
([78/79](payment-sdk-provenance-red.txt)); the assertion now identifies all
five expected groups. Type checking also caught a test tuple inferred as
possibly undefined ([transcript](payment-types-red.txt)); an explicit readonly
tuple fixes the test type without changing runtime assertions.

The full API suite passed **168/168 in 257.609 seconds**, SDK **79/79 in
74.690 seconds**, shared **5/5 in 4.324 seconds**, with zero failed, skipped or
cancelled tests. [API transcript](payment-api-full.txt),
[SDK transcript](payment-sdk-full.txt), [shared transcript](payment-shared-green.txt)
and [workspace TypeScript transcript](payment-types.txt) are retained. The
[checkpoint manifest](payment-checkpoint.json) pins the current source and
transcripts; it does not assert a pre/post source freeze for these full runs.
The separate pure-search runner does verify its own pre/post input hashes.
The prior [130-test API](api-checkpoint-130.txt) and
[76-test SDK](sdk-checkpoint-76.txt) transcripts remain historical.

Reproduce with `pnpm typecheck`, `pnpm test:sdk`, `pnpm test:shared`, and
`pnpm --filter @orbital/api exec tsx --test --test-concurrency=1 test/*.test.ts`.
For API tests first set the documented development `TEST_DATABASE_URL` and
start PostgreSQL; these checks use isolated schemas and deterministic RPC
fixtures. The pure search alone runs with `python scripts/audit-payment-search.py`.
No test here exercises the future public payment service or claims a live chain
payment. Solidity and browser behavior were not changed or rerun in this increment.

## Next integration obligation

Compose one canonical invoice snapshot, one candidate set, initial/final
context and identity reads, bounded complete search stages and final database
checks under the shared 20-second service deadline and ten-second freshness
limit. Share two active quote slots, eight weighted RPC members and the HTTP
limiter with swaps. Validate an unsigned review plan at the public/SDK boundary;
keep observations explicitly non-executable. Required cache, transaction
controllers, persistent demo and Privy/Arc verification remain separate work.
