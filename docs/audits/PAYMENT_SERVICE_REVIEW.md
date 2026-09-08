# Independent payment service review

2026-09-08. Isolated source/proof review of the read-only payment service and
its runtime composition. The reviewer read the implementation directly, used
the mathbox proof-audit general-logic and computation-dependent checklists,
and writes only this report. No production code, tests or shared evidence logs
were changed by this reviewer.

**Normalized claim.** For a valid server-owned verified deployment and a
well-formed payment request, assume the database dependencies return authentic
deployment-scoped canonical invoice/strategy snapshots, the RPC dependencies
execute the internally generated reads against the identified canonical block,
and the existing pure route/SDK validators correctly implement their stated
contracts. Their returned data are bounded ordinary DTOs, not hostile JavaScript
objects or mutating proxies. An observed swap-payment return then contains a
sufficient quote from a complete static stage at one invoice pin, with gross
input inside the authenticated user/balance/numerical bound, the exact invoice
minimum and bounded deadline, and a canonical SDK-built unsigned review plan.
A direct-USDC return instead authenticates exact invoice funding at that pin
and builds the direct payment plan; it requires no curve quote stage. Both
branches perform the stated final source/context/time checks and satisfy the
implementation policy's logical work bounds. Production runtime admission,
cancellation and weighted RPC capacity are shared with swaps.

**Primary verdict: proved as written.** This is the scoped conditional service
contract above, at the source pins below. No refuting defect was found in that
contract. It is not a security audit, a new proof of the numerical engine, a
claim of future execution, or proof that the public payment endpoint is complete.
Authenticity of the named dependencies remains an explicit hypothesis, not a
fact established merely by the service receiving a TypeScript object.

## Dependency graph

```text
verified server manifest + strict request       [schema / configuration input]
  + complete canonical indexed invoice source  [named DB hypothesis + checks]
  + chain/head/pin identity                      [named RPC hypothesis + checks]
  -> one initial invoice pin

internally generated 7/8 context reads at pin   [context + transport source]
  + canonical ABI decode and immutable binding  [context source / generated ABI]
  + exact indexed/onchain term and status match [funding validation]
  -> invoice due, expiry, balance, allowance
  -> direct due or swap bound B and seed        [bigint arithmetic]

one candidate scan / inspection set at pin     [routing + DB hypothesis]
  -> fixed eligible set E <= 32
  + complete per-stage descriptors and replies [service + transport]
  + certified full-size pure quote validation   [named existing route contract]
  -> sufficient complete stage at requested g
  + bounded search / copied retained data       [existing search proof + source]
  -> retained sufficient witness; no minimum claim

final same-pin context and identity
  + final invoice/candidate covered DB snapshots
  + whole-operation freshness/expiry/cancel checks
  + canonical SDK transaction reconstruction
  -> unsigned historical-pin observation

per-operation member charges + native batching [service / transport arithmetic]
  + one runtime quote lease and weighted RPC pool
  -> stated logical work and local admission ceilings
```

No external mathematical theorem is needed. The prior
[search review](PAYMENT_SEARCH_REVIEW.md) supplies the pure search invariants;
its implementation and policy were also read here. Solidity quote correctness,
generated ABI authentication, database provenance and SDK validation are
existing project dependencies. This review checks how the service composes
them; it does not turn their finite tests into universal engine or database
proofs. There is no circular use of the service's `observed` flag as evidence.

## Obligation matrix

| Obligation | Status | Evidence / limitation |
| --- | --- | --- |
| Strict input and server-owned deployment | Passed | Manifest and request parsing; deployment/token/payer-role checks before financial reads |
| One covered invoice pin | Passed under the named DB/RPC hypotheses | Initial invoice snapshot must be complete, current and covered from start; identity binds chain, hash, timestamp and two-block display delay |
| Exact term/status authentication | Passed | Indexed invoice view and all onchain tuple fields agree, including zero unpaid payment fields; arbitrary getter failure cannot establish absence |
| Exact direct funding and swap gross bound | Passed | Due checked against both max and balance; swap `B=min(max,balance,floor((2^160-1)/q))`, `q=10^(18-d)*2^64`; all arithmetic uses bigint |
| Allowance semantics | Passed | Allowance determines a bounded approval; it does not incorrectly reduce the financial search domain |
| Correct adapter caller/recipient and payer/maker separation | Passed at composition | Context funding reads use payer; inspection/quote reads use adapter; routing excludes settlement-role conflicts; SDK rebuild verifies the selected order/pair |
| Exact due and expiry in quote/plan | Passed | Payment minimum is invoice due; deadline is `min(pin timestamp+20, invoice expiry)`; service and route inputs share these authenticated terms |
| Fixed eligible set and complete stages | Passed | One inspection set; every later amount re-prepares and matches eligible IDs; service rejects incomplete, duplicated, foreign or altered request descriptors |
| Retained result remains sufficient | Passed under the route-validator hypothesis | `QUOTED` comes only from validated complete full-size output at least due and within output availability; the callback supplies a local value and search copies it |
| Unknown search versus insufficient funding | Passed | Empty/failed bounded search is 503 unavailable, not an insufficiency proof; exact direct/max/balance or sub-two swap bound conflicts use 422 |
| Final data/canonical/time checks | Passed for the stated observation semantics | Context equality, identity, invoice and strategy pinned equality, cursor/head consistency, and post-DB/post-plan checkpoints |
| Continuous canonicality or reserved future funds | Out of scope | Sequential read observations cannot reserve a chain state or prevent a later reorg, spend, approval change or payment |
| Actual logical member/batch accounting | Passed for production dependency composition | Charge immediately precedes each internally prepared complete group; read transport emits that group and retries the same payload at most twice |
| Shared RPC/quote admission and pending DB work | Passed | One weighted counter, one two-service counter and shared lease implementation; lease survives aborted responses until tracked DB transactions settle |
| Whole-operation interruption | Passed locally | Timer/AbortSignal race interrupts pending dependencies; checkpoints catch elapsed time even when timers are delayed; real transport participates in abort |
| Remote server cancellation/latency | Out of scope | Local abort/release does not prove an upstream node has stopped processing a transmitted request; bounds are not a network latency guarantee |
| Source mutation after callback return | Passed for bounded ordinary DTOs and server-owned dependencies | Initial/final retained snapshots and contexts are copied; search copies selected routing payload; no await occurs after final synchronous plan checks |
| HTTP publication, shared IP limiter and public SDK decoder | Not addressed | Separate boundary work was still in progress during this review |
| Signed payment, receipt, Privy or Arc qualification | Out of scope | Every service return explicitly denies execution/eligibility authority and supplies only review plans |

## Preservation and work argument

The funding module verifies terms before deriving any financially meaningful
search quantity. It permits only an unpaid matching invoice, validates exact
recipient splits and contract-admissible terms, and rejects an expired invoice.
For swaps, `B*q < 2^160` and `(B_numeric+1)*q >= 2^160` hold for the independent
numeric cap `B_numeric=floor((2^160-1)/q)`; user max or balance may reduce B
further. The seed is only a unit-parity proposal. It is clamped into `[2,B]`
without being represented as a price or sufficient input. Direct funding uses
the exact due and does not charge a curve fee.

The candidate set is discovered once. Complete getter groups are stored and
reused at the same pin. Each amount stage rebuilds the internally generated
quote plan and checks that its eligible IDs equal the initial set. `complete`
requires exactly one outcome for each request descriptor in that group and
allows only fulfilled hex data or a typed EVM revert. Transport/protocol
failures cannot be silently treated as an unavailable midpoint. Only after
every group finishes does the pure route selector construct a value; a selected
route necessarily has the requested full gross input, output at least the exact
invoice due, the correct order identity and supported live output availability.
This establishes the sufficient-value hypothesis needed by the search proof.

Search may replace a retained result only with another complete sufficient
stage. The final route's amount is therefore inside `[2,B]`, even though the
service does not redundantly compare `selected.input` to the route amount:
both were constructed locally from the same stage argument. Plan construction
then rebuilds config/order, supplies adapter caller/recipient, and uses the
authenticated due and expiry. No calldata is accepted from the request or RPC
reply as a transaction plan. The approval targets the input token with the
adapter as spender and exactly the selected amount. SDK validation and final
checkpoints can still reject the whole result.

Let I be the inspected count, E the eligible count, and P completed search
stages. Then `0<=E<=I<=32` and `P<=min(16,floor(128/E))` for positive E. Each
inspection uses three members, each stage E members, and each read group has
at most eight. The service charges the actual prepared group length immediately
before calling the runtime dependency. Consequently swap totals satisfy:

```text
identity members = 6
context members  = 16
inspection members = 3I <= 96
quote members = PE <= 128
logical members <= 246
native batches = 4 + ceil(3I/8) + P*ceil(E/8) <= 44
```

The batch upper bound uses the search proof's 28 maximum search batches.
Member and batch maxima occur on different distributions. Direct payments use
two three-member identities plus two seven-member contexts: exactly 20 members
and four batches on an observed return. Canonically checked absence uses only
the two identities. With at most three identical-payload transport attempts,
the policy's 738 transmitted members / 132 HTTP-attempt bounds for swaps and
60 / 12 for direct payments follow. Counts are logical operation counts, not a
claim that every remote request is physically cancelled when locally aborted.

The runtime's shared lease increments admission synchronously before starting
either service. A third service is rejected immediately. Every quote-related
DB operation is tracked, including invoice reads. Aborting a service does not
release its admission while PostgreSQL work remains pending; it waits for those
promises, whose implementations include transaction rollback/client release.
No later service phase starts after the raced operation loses to cancellation.
The same RPC weight counter is used by payment context, quote, identity and
the other existing readers; each native batch reserves its full member count.

## Temporal checks and exact limits of the claim

The service derives elapsed time from `performance.now()` with one initial
wall-clock anchor. It checks the total timeout, every accepted indexed timestamp
against the ten-second age limit, block-time plausibility, and the earlier of
invoice/quote expiry throughout the operation. Optional refinement stops when
less than or equal to two seconds of usable budget remain. This reserve does
not promise final checks will finish; a slow final DB read still causes failure.

Initial and final context are read at the same EIP-1898 canonical hash. Final
identity must still bind that hash/timestamp, with a nondecreasing head. Final
invoice and strategy snapshots retain all pinned terms/records/coverage. If the
confirmed index advances normally, both final source cursors must agree with
the observed final head, while the response retains the original pin and marks
it historical. These are sequential observations, not an atomic chain/DB lock.
A reorg after the last observed identity is not ruled out. `verified_at_pin`
must retain that meaning at later boundaries; no consumer may infer future
payability or cryptographic finality from it.

The response's `observedAt` and age are captured before synchronous SDK plan
construction. A final checkpoint after construction rejects expiry/staleness
crossed during that work. HTTP loading/serialization and delivery happen later
and need their own final checks. This review does not certify those pending
publication checks or treat the unsigned plan as wallet authorization.

## Independent computation checks

From the repository root, Node v22.18.0 and pnpm 10.34.5:

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm --filter @orbital/api exec tsx --test test/payment-service.test.ts test/payment-runtime.test.ts test/quote-runtime.test.ts test/payment-context-rpc.test.ts test/payment-validation.test.ts
```

Result: **34 passed, zero failed/skipped/cancelled**, reported duration
17,529.1241 ms. The runtime tests use isolated PostgreSQL schemas and a local
HTTP RPC fixture with deterministic replies. They exercise actual production
read transport and DB materialization/read composition, not real EVM quote
execution. Tests cover direct/swap plan bytes, complete native batches, exact
funding, term mismatch, final source/context changes, deadline and freshness
races, 404/409/422 distinctions, retry/capacity release, cancellation, shared
swap/payment admission and pending locked PostgreSQL work.

A separate reviewer-only stdin execution, without writing a test fixture,
started `paymentServiceFixture(false,32)`, allowed only nine strategies to pass
inspection (typed EVM reverts for the other 23), set max and balance to
1,000,000,000, and returned output 100 only at inputs at least 999,999,999.
It observed a sufficient cap result after 14 stages with:

```json
{"identityMembers":6,"contextMembers":16,"inspectionMembers":96,"quoteMembers":126,"logicalMembers":244,"nativeBatches":44}
```

The observed work matched the dependency's actual recorded group/member counts;
stop reason was `aggregate_limit`, with `minimumInputCertified:false`. This
attains the combined native-batch ceiling, while the existing 32-eligible test
attains 128 quote members. These finite cases supplement the counting proof;
they are not exhaustive transport, concurrency or numerical-engine testing.

The implementing agent subsequently retained an equivalent 32-inspected /
nine-eligible regression in `payment-service.test.ts`, using due two, cap
65,536 and output two only at that cap. The reviewer read the added case and
reran `pnpm --filter @orbital/api exec tsx --test test/payment-service.test.ts`:
**13 passed, zero failed/skipped/cancelled**, reported duration 18,782.9954 ms.
Its exact work counters also attain 44 batches and 244 members. The source pins
below include this final test addition; production files remained unchanged.

## Source pins

Reviewed base commit: `0cbc607cda0ff74c9a657a16cdeeaf314b6cf257`. Service/runtime
changes were uncommitted. SHA-256 values were read after the independent tests.
The shared response schema/public decoder were being developed concurrently
and are explicitly outside this review.

| Source | SHA-256 |
| --- | --- |
| `apps/api/src/payment-service.ts` | `BBC2986F5469454445328664809D855C3DC618231822B8364716B66AFF21A649` |
| `apps/api/src/payment-search.ts` | `02AD64D617DDE797D53B8CDDCCF49F0F274470B8FF995EDCF12CC369F1AF80D0` |
| `apps/api/src/payment-context.ts` | `0630CBF475607B5A7F68A474E8736C2F357D1ABACDB2D49ADC9AE231DA919B42` |
| `apps/api/src/payment-validation.ts` | `5A1C83BB50023024A6CE90CF5391FCAF4AF1B1428D599AC446B89694F7CA3C9B` |
| `apps/api/src/quote-rpc.ts` | `46CD00E9D11E2DDCED09CBEAFA6913761F73D237C06CE8A524583674A2F993E3` |
| `apps/api/src/route-selection.ts` | `F6C3F395E649AC4C1DFC8329B3A1BBE1D66E96B160004232C9F29B306F2C9651` |
| `apps/api/src/runtime.ts` | `ED5D359A13100073B7527B2D9BAC78E14CBADBA1E24D587972764780DF3CCB38` |
| `apps/api/src/invoice-view.ts` | `B4365437D7FB2D25A752BFB3CB382944DE8E7EAFB2355CAED6CA3B1E59F9D36D` |
| `packages/sdk/src/plans.ts` | `47B2C93B1BCA1A29A262EEA735118B563917935C269B1D70AC2C06BDD2C8A518` |
| `packages/sdk/src/generated/abi.ts` | `49C2D751A4E28722B550AC22AC99FBB6C5ABED73A86DA4EDAB9FD2B75430A952` |
| `apps/api/test/payment-service.test.ts` | `B4E7F901544858B71AD6F19C0F87068533A5ECCC9E4AF36270768E58C669F3DC` |
| `apps/api/test/payment-service-fixture.ts` | `723C2CE919D5C215D90BBDAF02D2FB8576B4D08B8418AD80EF506E237C860308` |
| `apps/api/test/payment-runtime.test.ts` | `6EF62238289982710993C886BDC3859D3E5EB6DC10B57BB34788E95BC838F9B2` |
| `apps/api/test/payment-runtime-fixture.ts` | `86714FEA98612C118BBFA1940E1BB7D3480344166A77128BA5057AA188BDFACF` |
| `apps/api/test/quote-runtime.test.ts` | `7A1B616772F810E9EEC98FC0F800B13DDB68A808D6707995F85F95659B6B36F6` |
| `apps/api/test/payment-context-rpc.test.ts` | `BD1326ADC93083D4461E986F7060FBB3790E4680D0E8687355EEFC17AC58E361` |
| `apps/api/test/payment-validation.test.ts` | `DA4DFBB884E6DA15498ED76958158F43BBB4637492252B507682C6AC2A041380` |
| `docs/audits/PAYMENT_SEARCH_POLICY.md` | `126AAD5E5CE7EE66A83A762F238B0BB8389852ED1F8102DAC0B3B72765B5E729` |
| `docs/audits/PAYMENT_SEARCH_REVIEW.md` | `C82BE0DB48C00EA5BE35C61537CE8DCAB8501FF7D235F6ACE3170782AF621DBD` |
| `MASTER_PROMPT.md` | `C21E47ED029483F896921BB432F4E3917A4B3A9F9474F92AC64753F365D39885` |

## Remaining implication and next check

No gap remains in the normalized conditional service claim at these pins.
The strongest safe statement is that the service preserves an authenticated
sufficient historical-pin witness and constructs its bounded unsigned review
plan within the local work/admission policy. It cannot establish global route
optimality, minimum input, reserved funding, successful execution or sponsor
qualification.

The next required implication is that the public HTTP and SDK boundaries reject
altered scope/amount/caller/plan bytes and expired responses, recheck publication
configuration/freshness, share the quote limiter, and continue to treat decoded
data as review observations. A focused HTTP-to-SDK round trip with deliberate
plan mutation and delayed final manifest read is the cheapest next check.
