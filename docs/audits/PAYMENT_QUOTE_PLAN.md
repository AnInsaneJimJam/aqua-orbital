# Payment quote observations: bounded implementation proposal

**Current implementation status, 2026-09-08:** the strict request, generated read
ABI, invoice/funding validation, bounded search, canonical service/final checks,
shared runtime/HTTP admission, public aliases and unsigned-plan SDK decoder are
implemented and tested. Quote caching and wallet transaction integration remain
unfinished. [Current evidence](../../test/evidence/payment-endpoint.md) and
[search policy](PAYMENT_SEARCH_POLICY.md) supersede the original implementation
status and proposed larger work ceilings below. The 8/8, 16-stage, 128-member
policy stays within the master specification's maxima.

The following proposal is retained as historical design/audit context. Its
original byte-for-byte [preimplementation copy](archive/PAYMENT_QUOTE_PLAN-preimplementation.md)
matches the proposal hash in the independent search review. Section 8's
document-only write scope applied to that original reviewer task; the user's
standing instruction authorizes implementation and local commits.

2026-09-08. **Proposal only; the payment endpoint is not implemented.** Existing source, deployment manifests, and completed evidence remain unchanged. This is a G5 preparation increment, not G1 closure, payment execution enablement, Arc deployment verification, or Privy qualification. The existing user authorization covers continued implementation; the design decisions below are internal engineering work.

**Claim under review:** a bounded search can return an exact input, within the payer's observed balance and chosen maximum, for which a canonical static Orbital quote supplies at least the immutable invoice amount. The stronger claim that the search finds the minimum input, or finds a route whenever one exists, is not justified by the current numerical contracts.

**Primary proof-audit verdict: incomplete, with the smallest missing implication.** Quote failure is not a proved lower bound on output or a monotone insufficiency predicate. A sufficient-result implementation can proceed without that implication if it retains an actually successful quote, labels the search limits, and never reports failed discovery as proof of insufficient liquidity. Implementation and executable tests of that restricted contract remain outstanding.

## 1. Specification and existing boundaries

The authority is [MASTER_PROMPT](../../MASTER_PROMPT.md), sections 8, 9.1, and 9.2. Mathematical uncertainty retains its meaning from [NUMERICS](../NUMERICS.md), especially NUM-8, NUM-9, NUM-13, and NUM-14. The [root certificate](ROOT_CERTIFICATE.md) and [frontier segment](FRONTIER_SEGMENT.md) proofs have explicit feasibility and branch hypotheses; neither proves that production exact-input calls succeed on an interval of gross inputs.

Current reusable components are:

| Component | Existing responsibility | Missing payment responsibility |
| --- | --- | --- |
| `packages/db/src/invoice-reads.ts` | Repeatable-read canonical invoice history, immutable terms, source receipts, coverage, pinned status | No live `getInvoice` or payer funding observation |
| `packages/db/src/strategy-reads.ts` | Bounded canonical registered-strategy candidate records and receipt coverage | No payment search |
| `apps/api/src/route-selection.ts` | Validated order/config/pair, distinct payer and adapter roles, three getters per inspected strategy, full-fill static quote selection | Its internal payment minimum is supplied by its caller; no invoice authentication, funding read, or sufficient-input search |
| `apps/api/src/quote-service.ts` | Single-pin orchestration, identity and database rechecks, shared deadline, honest unavailable results | Repeating the service would repeat discovery/getters and could change the pin; it must not be used as a search loop |
| `apps/api/src/quote-rpc.ts` | Independent native JSON-RPC batches, exact descriptors and IDs, bounded responses, retries and cancellation | No typed invoice/funding batch |
| `apps/api/src/quote-http.ts` and `runtime.ts` | Strict swap observation endpoint, final freshness check, bounded limiter, weighted RPC capacity and two active quote services | Swap and payment must share these budgets; payment currently has an unavailable stub |
| `packages/sdk/src/plans.ts` | Locally reconstructed approval and payment plans using validated invoice/config/quote inputs | No public payment observation decoder or authenticated API response |

The SDK's generated `paymentsAbi` currently contains the four transaction methods. The read methods `getInvoice`, `USDC`, `ROUTER`, and `allowedToken` require a separate additive `paymentsReadAbi`, generated from the authenticated existing artifact. Existing function groups and their provenance must remain intact.

## 2. Proposed HTTP contract

Expose both `POST /api/v1/quotes/payment` and its existing short alias only after this proposal, the search contract, and their tests are reviewed. The request is strict:

```text
{ invoiceId, payer, tokenIn, maxInputRaw, maxCrossings }
```

`invoiceId` is bytes32; payer and token are nonzero canonical addresses; `maxInputRaw` is a positive decimal uint256 string; `maxCrossings` is an integer from 0 through 16. Deployment, output token, adapter, RPC URL, block, timestamp, order, recipient, caller, calldata, and minimum output are server-derived. Unknown fields and query parameters fail before work is admitted.

This refines the earlier discussion that included a payment slippage field. The proposed payment minimum is **exactly `amountDueRaw`**, fixed for every search call and the final review plan. It therefore satisfies the adapter's `max(due, minimum)` rule and avoids changing the threshold after quoting. Maximum input protects the payer's chosen spend limit; refund is an estimate of output above the due amount. A separate user-controlled refund-protection minimum would need another explicit design and final exact-traits quote. It is outside this increment.

Selecting the manifest USDC address chooses direct payment. Its exact input is the due amount; swap fees and refund are zero. `maxCrossings` remains validated but is reported as not applicable to this branch. Direct payment does not enumerate strategies or invoke the AMM.

The successful envelope should be a new shared strict discriminated union, not a swap envelope with renamed fields:

```text
schemaVersion: 1
status: observed
financialExecutionEnabled: false
paymentEligibilityVerified: false
canonicalVerification: verified_at_pin
requestId, exact normalized request
chainId, deploymentId, deploymentStartBlock, router, payments, usdc
asOf { height, hash }, currentIndexedBlock, historical
freshness { indexedAt, ageMs, head, blockTimestamp, observedAt }
data {
  mode: direct | swap
  invoice: exact terms, status and canonical creation/update provenance
  amountDueRaw, recipients [{ address, bps, amountRaw }]
  funding: { token, decimals, balanceRaw, allowanceRaw, spender,
             userMaxInputRaw, effectiveMaxInputRaw, approvalRequired }
  amountInRaw, amountOutRaw, feeRaw, refundRaw, minimumOutRaw, expiresAt
  route: null | validated payment route
  alternatives: at most three routes, all for the same selected input
  coverage, candidate/inspection/eligibility counts, final-stage diagnostics
  search: limits, stages used, quote calls used, per-strategy outcome counts,
          selection: sufficient_observed_input, minimumInputCertified: false
  unsignedPlan: canonical review-only payment and optional exact approval
}
```

No recipient identity beyond addresses or raw memo content is introduced. Amounts and monetary calculations remain bigint/decimal strings. Split amounts for all but the last recipient are `floor(due*bps/10000)`; the final recipient receives the exact remainder. A zero raw split produced by a small due amount is not silently rounded upward. No USD price, estimated APY, reservation, signing permission, or claim of current fundability is included.

The unsigned plan is required by MASTER section 9.2. This note does **not** authorize an executable returned plan or wallet action. A future review-only representation may be constructed only with SDK builders, and the client decoder must independently reconstruct all bytes, chain, target, spender, payer, input, invoice ID, order, indices, minimum and deadline from the request, manifest, and validated observation. It returns an observation rather than an execution port or wallet action. The representation itself needs review before implementation. Omitting this field instead would leave that requirement explicitly open; enabling an observation endpoint would not by itself complete it.

Unavailable responses retain `data:null`, execution false, and `{code,message,retryable,field,requestId}`. Proposed status mapping is:

| Condition | HTTP / meaning |
| --- | --- |
| Malformed body, extra query, disallowed address or token | 400, invalid request |
| Invoice absent after complete canonical source verification | 404, absent at the reported scope; never inferred from an RPC revert alone |
| Canonically paid/cancelled invoice, or expired deadline | 409, observed invoice state prevents this proposal |
| Direct input exceeds user maximum or observed balance | 422, exact observed funding bound fails |
| Shared quote rate/admission limit | 429 |
| Missing deployment, source coverage, RPC identity, inconsistent data, or search budget finds no sufficient quote | 503, unavailable; `SEARCH_EXHAUSTED` does not mean all liquidity is insufficient |
| Overall work deadline expires | 504, no partial result |

All responses use `Cache-Control: no-store`. Cancellation after a disconnected socket sends no replacement response. Safe fixed messages and reason codes must not include RPC error text, URLs, database details, or raw exception content.

## 3. Canonical invoice and funding observations

For the swap branch, first read the bounded strategy candidate snapshot at the current confirmed indexer cursor; use that exact height/hash as the request pin. Read the invoice detail at that pin. For direct USDC, the latest covered invoice snapshot establishes the pin. Verify both source snapshots against the same verified deployment, canonical coverage, and current indexing state. The strategy source must include the separate swap-projection coverage required by its existing reader.

At that hash, one internally generated native batch contains at most eight independent calls:

1. `payments.getInvoice(invoiceId)`.
2. `payments.USDC()`.
3. `payments.ROUTER()`.
4. `payments.allowedToken(tokenIn)`.
5. `tokenIn.balanceOf(payer)`.
6. `tokenIn.allowance(payer, payments)`.
7. `tokenIn.decimals()`.
8. `USDC.decimals()`; deduplicate this with call 7 for direct USDC.

Every `eth_call` uses the same EIP-1898 hash with `requireCanonical:true`, an explicit server-derived `from`, canonical ABI calldata, and zero value. These context getters may use the payer as `from`; strategy getters and router quotes use the adapter. The manifest determines all targets. The transport neither accepts caller-authored descriptors nor treats internal descriptor objects as execution permission. Results must have canonical ABI encoding, exact expected types and lengths, and no trailing data.

Require exact adapter/router/USDC binding, allowed token, and decimals matching the manifest and strategy configuration. Compare every returned immutable invoice term and status with the canonical indexed record. An unpaid onchain record must have zero payer, input, received, refund, and route fields. Unknown, in-progress, inconsistent, paid, or cancelled records cannot become an unpaid payment proposal. The getter does not expose the creation nonce: authenticate the invoice ID by its canonical emitter/receipt and exact lookup, rather than inventing a nonce to recompute it.

Payer must be distinct from adapter, router, and Aqua. Swap candidates whose maker equals the payer or another forbidden settlement role are excluded. Adapter is both quote caller/taker and quote recipient. Invoice recipients retain the contract's actual rules: one to three unique nonzero addresses excluding the adapter, positive integer shares summing to 10,000. Do not add an unsupported ban on payer-as-recipient or infer customer identity from it.

For selected input decimals `d`, set `u = 10^(18-d) * 2^64`. The swap search cap is:

```text
B = min(userMaxInputRaw, observedBalanceRaw, floor((2^160 - 1)/u)).
```

Use exact bigint arithmetic, including intermediate products wider than uint256; all transported values retain their declared bounds. With the allowed fee rates 100/500/1000 ppm, gross input one has zero net input, while any gross at least two has positive net input. A cap below two cannot produce a supported swap proposal. Allowance does not reduce `B`: insufficient allowance is an explicit exact approval requirement, not evidence that approval already exists. Native gas and recipient transfer success remain unverified.

Repeat the same context batch after search and require exact equality with the first. This tests consistency of the fixed-hash RPC observation, not current-state freshness beyond the pin. The final identity check and canonical database rechecks are still mandatory.

## 4. Search algorithm and proof boundary

Keep at most 200 canonical registered candidates, sorted by successful activity block and log index descending, then fee and hash ascending. Use activation only as the existing no-fill activity fallback. Retain the current explicit first-32 inspection policy, and record `NOT_INSPECTED_CAP` for the rest. Three financial getters are fetched once for each inspected strategy. Their validated immutable results can be reused across input amounts at the same pin; no repeated 200-item RPC inspection is permitted.

A fixed pool requires invariant local admission throughout search: all probed amounts lie in `[2,B]`, token decimals match the same manifest, normalized gross fits the same bound, and role/config checks do not change. Recompute exact descriptors and fee/amount checks per stage; do not accept a cached eligibility object as an authority. A stage quotes all eligible strategies at **one** exact input and fixed minimum `due`, in independent batches of at most eight. A partially completed stage cannot become a retained result.

Proposed deterministic search:

1. Derive a raw seed `ceil(due * 10^d / 10^6)`, then clamp to `[2,B]`. This is a denomination-based starting point, not a price estimate or proof of a bracket.
2. Perform at most 16 expansion probes, counting the seed. Double with bigint saturation at `B`; if necessary, reserve the last expansion for exactly `B`. Skip duplicate inputs. Stop expansion when a complete stage contains a sufficient quote or after the cap has been tested.
3. Retain that stage's complete results and successful upper input `H`. Use the preceding tested input as a search cursor `L` (or one if there was no preceding probe). This is not a certified infeasible lower endpoint.
4. Perform at most 24 midpoint probes at `floor((L+H)/2)`, stopping at adjacent integers. A complete stage with a sufficient result replaces `H` and the retained stage. A complete stage without one moves only the heuristic cursor `L`; its failures prove no output bound. A transport/protocol/identity failure aborts the request rather than moving a cursor.
5. Return the retained complete sufficient stage after final verification. Rank routes at that exact retained input by maximum raw output, fee ascending, then order hash; expose at most three alternatives. No split or comparison of outputs from different input amounts is called the best whole-size quote.

Every probe must use the adapter's exact final traits: adapter caller/taker and recipient, exact token indices, exact input mode/transfer flags, `minimum=due`, the shared deadline, and the requested crossing bound. The existing selector currently derives a possibly larger output minimum from slippage. A payment-only adaptation must preserve the fixed due threshold in the returned plan; swap behavior remains unchanged. Retaining a successful stage avoids an unbudgeted final search quote: the bytes already match the proposed payment route at the immutable pin.

The search can retain a previous sufficient stage when a later complete midpoint stage reverts or is uncertifiable. It cannot return that stage after the overall deadline, source-change, or final consistency checks fail. Retain only the winning stage, current stage, and bounded aggregate diagnostics, rather than all raw HTTP bodies from all probes.

### Why failed quotes cannot certify a bracket

Even suppose ideal output is the monotone integer function `f(g)=g` and the invoice due is two. A partial certified oracle may return output two at input two, a typed uncertifiable failure at input three, and output four at input four. This is consistent with a numerical implementation allowed to reject unresolved signs. Observing failure at three cannot prove inputs at or below three are insufficient: input two is sufficient.

This is a countermodel to the proposed inference, not a claim that an observed Orbital fixture has this exact failure pattern. Likewise, a bounded probe set can miss a successful input between failed probes. The fee-adjusted net input `g-ceil(g*feePpm/10^6)` is nondecreasing for the allowed rates, but that fact alone proves neither production quote totality nor monotonicity of its successful/certifiable domain. NUM-9 also permits a certified one-raw-unit shortfall, subject to additional conditions; it does not establish a monotone returned-payout map over all gross inputs.

The strongest safe statement is therefore conditional on the retained data: **at the authenticated pin, this exact full-input static router call returned output at least due, satisfied the checked live availability and role/config constraints, and used input within the observed balance and user maximum.** It does not certify minimum input, discovery completeness, future payability, gas sufficiency, approval, successful recipient transfers, or a mined payment.

## 5. Exact work and transport bounds

Let `I<=32` be inspected strategies, `E<=I` be eligible strategies after getter validation, and `P<=40` be complete search stages: at most 16 expansions plus 24 midpoint probes. A stage can terminate early only by aborting the request or skipping a duplicate; it cannot silently omit eligible candidates while claiming complete stage coverage.

| Swap work | Logical RPC members | Native batches, each at most 8 |
| --- | ---: | ---: |
| Initial and final chain/head/pinned-block identity | 6 | 2 |
| Initial and final invoice/funding context | at most 16 | 2 |
| One-time strategy config/state/availability | `3I <= 96` | `ceil(3I/8) <= 12` |
| Search | `P*E <= 1280` | `P*ceil(E/8) <= 160` |
| **Aggregate maximum** | **1,398** | **176** |

Each native batch has at most three HTTP attempts, because only read transport failures receive the 250/750 ms retries. Thus the maximum is 528 HTTP attempts and 4,194 transmitted JSON-RPC members, including retries. These are ceilings, not targets. Direct USDC uses two seven-member context batches and two three-member identity batches: at most 20 logical members, four batches, 12 HTTP attempts, and 60 transmitted members. No search or strategy getter is used for direct USDC.

The entire quote service has one 20-second elapsed deadline, not 20 seconds per probe. Each batch receives the smaller of eight seconds and the remaining service budget, including planning, retry delays, streamed reading and parsing. A monotonic elapsed check must also run during synchronously available stream chunks and pure stage work. Native batch response members remain at most 256 KiB and the batch at most its member count times that bound, with a fixed buffer. Identity batches do not bypass these controls.

The runtime continues to admit at most two quote services, across swap and payment together, with no service queue; all their logical calls share the weighted eight-call capacity. Each service issues at most one native batch at a time. No 200-per-item RPC loop or unbounded promise fan-out is introduced. The swap and payment aliases share a single bounded per-IP limiter: 30 requests per minute, burst five, at most 5,000 IP entries; read limits and the 16 KiB body bound remain intact.

Swap preparation uses at most four high-level database reads: initial and final candidate snapshots plus initial and final invoice snapshots. Direct payment uses two invoice reads. Each existing reader is a multi-statement repeatable-read transaction, so this is not a claim of four SQL statements. Statement/connection timeouts and pool size remain bounded. AbortSignal does not cancel current PostgreSQL work; service admission remains held until its pending database promises settle, even if the HTTP deadline has already returned unavailable. No unbounded cleanup queue is permitted.

**Material liveness limitation:** 176 sequential batches would consume almost the whole 20-second budget even at roughly 114 ms per batch before database or computation costs. The ten-second freshness rule is stricter still: using the existing conservative earliest `indexedAt`, an initial age of `a` milliseconds leaves at most `10000-a` milliseconds before final validation becomes stale. Even an initially zero-age snapshot would allow only roughly 57 ms per batch at the theoretical maximum. Available work time is bounded by the minimum of that freshness remainder, the service deadline, and the invoice/quote expiry remainder.

The maximum search cannot be promised to finish on a typical remote RPC. The deadline must fail honestly; this proposal does not increase it or reduce validation to obtain a result. The 40-by-32 schedule is a **cost ceiling under review, not an approved default policy**. The priority is useful bounded discovery under one authenticated context: stop at a sufficient result when appropriate and choose a separate aggregate probe budget before implementing optional refinement. MASTER specifies maxima, so consuming every permitted expansion and midpoint is not a requirement. A smaller aggregate budget and early-return policy need an exact counter/batch accounting and diagnostic contract of their own. A deterministic latency/budget test is cheaper than implementing a public route that usually times out.

## 6. Expiry, final rechecks, and historical meaning

Read pinned block timestamp `t` from trusted RPC; never accept it from HTTP. Let the stored invoice expiry be `e`. Use the same deadline for every search call and review plan:

```text
deadline = min(t + 20, e).
```

Require exact uint40 bounds, `e>t`, and wall-clock time strictly before the deadline. The contract treats `block.timestamp>=e` as expired, and swap requires its deadline to be strictly after the executing block timestamp. Equality is therefore expired. Do not reapply the creation-only five-minute/30-day window to an older invoice. Reject pinned timestamps more than one second in the observed wall-clock future; keep the existing ten-second indexer freshness requirement.

The initial identity must match the verified chain, pin and confirmed cursor with the existing two-block policy. After context/search, repeat context and identity; the pinned timestamp/hash and all fixed-hash context data must agree, and head cannot go backward. Re-read both database scopes at the pin, require identical pinned source/data, current indexing rather than resync, complete coverage, matching deployment, and head/current-cursor coherence. Separate repeatable-read transactions are acceptable only with these same-pin bindings and final comparison; they are not described as one cross-query database transaction.

An ordinary tip advance need not invalidate an immutable pinned observation. If final cursor advances while the pin remains covered and canonical, retain the original pin and label `historical:true`. This means unpaid **at that pin**, even if a later block has changed the invoice. `paymentEligibilityVerified:false`, expiry, and mandatory re-quote before signing preserve that distinction. If the product instead requires latest-indexed invoice status for every returned quote, that stricter policy must be approved explicitly; it would discard searches during normal advancement. It cannot be approximated by presenting pinned status as current.

After the final manifest file reload, check cancellation, exact deployment identity, wall-clock expiry and indexed age again immediately before HTTP 200. Do not refresh `observedAt` to conceal elapsed time. The SDK additionally rejects observations that have expired or become stale while in transit. Neither a second fixed-hash read nor a canonical pin guarantees state remains unchanged after that pin.

## 7. Dependency and obligation audit

The dependency graph is:

```text
verified manifest + canonical receipt coverage       [existing code / tests]
  -> exact invoice/config identity and pin            [new comparison required]
  -> typed fixed-hash getters + funding observation   [new transport required]
  -> successful exact adapter-context quote           [existing router + new search]
  -> full fill, output>=due, cap and availability      [existing core + new binding]
  -> final canonical/time checks                      [existing pattern + new service]
  -> sufficient observed result                      [conditional implementation claim]

failed/uncertifiable quote
  -X-> proved insufficient lower endpoint             [missing implication]
  -X-> minimum input / complete discovery              [not claimed]
```

| Obligation | Audit status | Evidence or remaining work |
| --- | --- | --- |
| Payer distinct from adapter caller/recipient, maker conflict excluded | Passed for existing internal core | `route-selection.ts` and `OrbitalPayments.sol`; public request binding still to implement |
| Canonical exact invoice terms and status | Conditional | Existing DB source proof; add ABI getter comparison and malformed/changed record tests |
| Exact due split and refund | Passed as integer formula | Contract floor/remainder implementation; new DTO/decoder tests still required |
| Same traits for successful probe and review plan | Conditional | Fix payment minimum to due and cap deadline; compare exact calldata in tests |
| Retained result supplies due within maximum/balance | Conditional | Requires complete successful stage and final context equality |
| Failure implies insufficient input below probe | Failed | Partial-oracle countermodel above; NUM-8 expressly permits uncertifiable failures |
| Minimum input or discovery whenever any route exists | Not addressed as a product claim | Requires the missing totality/monotonicity implication and stronger termination proof |
| Finite aggregate request work | Passed as a proposed counting bound | 40 stages, 32 eligible, 1,398 logical members; implementation counters not yet tested |
| Completion of all allowed work within 20 seconds | Not addressed | Latency/resource campaign required; timeout must remain a legitimate outcome |
| Future payment execution, gas and transfer success | Out of scope | Observation remains non-executable and requires later transaction integration |

This audit uses repository definitions and source inspection, not a new external theorem. Checks performed for this proposal were read-only inspections of MASTER, NUMERICS, ROOT_CERTIFICATE, FRONTIER_SEGMENT, the payment contract, invoice readers, route selection, quote service/transport/HTTP/runtime, shared schemas, and SDK plan/ABI generation. No mathematical experiment or payment endpoint test is represented as completed by this note.

## 8. Future source ownership and tests-first sequence

Only this new document is in the currently authorized write scope. If implementation is approved, proposed source ownership is:

| Future files | Scope |
| --- | --- |
| New `apps/api/src/payment-search.ts` | Pure bounded search state, stage bookkeeping, successful-result retention |
| New `payment-validation.ts`, `payment-quote-service.ts` | Exact invoice/funding binding and canonical orchestration |
| New `payment-quote-rpc.ts` | Internally generated context batch using the existing bounded transport policy |
| New `payment-quote-http.ts` | Strict request/response and both aliases |
| `route-selection.ts` | Payment-only fixed minimum/deadline support; no change to swap semantics |
| `runtime.ts`, `server.ts`, `quote-http.ts` | Shared admission, database cleanup tracking, limiter and structured error routing |
| Possible internal `rpc-read-batch.ts` extraction | Reuse private transport mechanics with existing regression tests; no generic public descriptor API |
| New shared payment quote DTO module and additive export | Strict discriminated response and bounded exact fields |
| SDK ABI generator/generated read group | Additive `paymentsReadAbi`, compiler/source provenance and getter encoding tests |
| New SDK payment observation decoder, fixtures and tests | Rebuild invoice/route/unsigned plan and bind it to request, manifest, pin and time |
| New focused tests and evidence files | RED/GREEN records, exact bounds, source hashes and limitations |

No database migration, indexer change, production contract change, frontend change, deployment write, or account service is expected. Shared exports and SDK work must be coordinated before edits; completed deployment/checkpoint sources stay frozen.

Start with the following meaningful RED tests, before behavioral implementation:

1. Pure search: exact 16/24 caps, clamping/deduplication, cap tested, bounded integer termination, amounts above 2^53, fee plateaus, complete-stage retention after midpoint reverts, and no minimum-input claim. Include the partial-oracle countermodel and a sufficient point missed by the finite probe set.
2. Request-wide counters: 32 eligible strategies and every stage force the exact worst-case member/batch bounds; more than 32 locally valid candidates stay `NOT_INSPECTED_CAP`; getter-ineligible candidates do not get quoted. Test latency, expiry and cancellation before all 40 stages complete.
3. Invoice/context validation: canonical created/paid/cancelled history, missing coverage versus honest absence, unknown/in-progress getter, changed terms/recipients/amount, wrong adapter/router/token/decimals, all forbidden settlement roles, balance and maximum caps, allowance-required state, and exact large-value split/remainder/refund.
4. Native transport: exact independent hash-pinned calldata/from for each typed context call, unordered response IDs, duplicate/missing/foreign IDs, canonical ABI re-encoding, strict per-candidate EVM revert versus whole-group transport/protocol failure, byte/chunk/deadline bounds, retry limits and cancellation listener cleanup. Use local HTTP fixtures only.
5. Service with disposable PostgreSQL schemas: invoice and candidate snapshots at one canonical block; same-block invoice lifecycle ordering; tip advance with an honestly historical response; pinned reorg; final source, indexed timestamp, deployment and funding/context changes; deadline clipped by invoice expiry; future timestamp; direct USDC without strategy reads; pending SQL retains admission after timeout.
6. Actual Fastify HTTP: both aliases share swap/payment rate and admission budgets, malformed body/query, unconfigured deployment, 16 KiB body, no-store errors, delayed final manifest reload, disconnect/supersession, and `financialExecutionEnabled:false` everywhere.
7. SDK: strict response shape, echoed payer and selected token/max, immutable invoice and receipt binding, exact minimum/deadline and refund, all candidate quote/config/version fields, ranking/alternatives/counts, direct branch, every calldata/target/spender mutation, amount widths, stale/future/expired responses, and structured unavailable responses. Decoder must never supply execution permission.

Run focused tests and typechecks first; the warranted final regression includes existing API, SDK, shared and DB checks with captured TAP output. Record fake RPC data as fixtures, never as a verified deployment or live payment receipt. A later disposable Anvil end-to-end payment quote/payment campaign is separate work within the existing implementation scope; it is not part of this proposal's completed evidence.

## 9. MASTER alignment and decisions needed before implementation

The bounded sufficient-result claim fits MASTER's requirement to find a sufficient exact input or show unavailable. MASTER does not promise the global minimum. Its words “bracket expansions” and “bisections” must not be used as evidence that a failed quote is a certified infeasible endpoint. This proposal retains their numerical work caps while explicitly treating failed midpoint probes as search heuristics.

The 40-probe cap is interpreted as 40 **amount stages**, each with up to 32 independent strategy quotes, not 40 aggregate router calls. That interpretation is compatible with the per-strategy cap but materially affects cost and requires an explicit implementation decision. The first-32 inspection policy is the already documented preliminary routing limitation; it does not establish that every eligible strategy among the 200 was inspected.

Fixed `minimum=due` and `deadline=min(pin time+20, invoice expiry)` make the quote and adapter plan identical and preserve the required invoice protection. They require small internal payment-type/core changes; applying the existing swap minimum/deadline logic unchanged is insufficient. The request deliberately omits a slippage/refund-protection field that the documented payment endpoint does not require.

Returning a review-only canonical unsigned plan satisfies the endpoint's plan field without enabling execution. Returning no plan would be a deliberate incomplete increment and must be recorded as such. The required quote cache is still open: this proposal uses no cache, matching the current incremental swap observation scope. It cannot be called full G5 completion while that requirement or transaction integration remains open.

The cheapest next check is review of the fixed-minimum, historical-pin and sufficient-only semantics, followed by selection of a useful aggregate probe budget below the theoretical ceiling and a pure search/budget RED/GREEN suite with deterministic latency tests. Review-only plan representation is a separate decision; executable returned plans remain unauthorized. Those results should precede public HTTP implementation. No relaxation of NUMERICS, supported onchain ranges, verified-deployment requirements, or signer authorization is proposed.
