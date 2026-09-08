# Independent payment search review

2026-09-08. Isolated source/proof audit. This reviewer read the proposal,
implementation policy, complete search implementation and complete focused
test file directly. The reviewer writes only this report; production changes,
test changes and captured RED/GREEN evidence are the implementing agent's work.

**Normalized claim.** Let `B` be a bigint with `2 <= B < 2^256`, let the
positive bigint seed be arbitrary, and let the eligible set contain `E` distinct
canonical lowercase bytes32 hashes, `0 <= E <= 32`. Each probe must return a
complete, validated result for exactly those orders at its requested amount.
Its non-null value represents at least one sufficient quote, with the actual
quote validation supplied by the caller. The caller supplies a synchronous
throwing checkpoint and a probe subject to the shared service deadline.
Under those hypotheses, every successful search return observes the stated
stage/member/batch ceilings, probes distinct amounts in `[2,B]`, and retains
only a copied value from a complete sufficient stage. It never certifies a
minimum input or infers insufficient liquidity from failed discovery.

**Primary verdict: proved as written.** This verdict applies to that restricted
pure-search contract and the final source pins below. The two concrete issues
found during review, unrestricted shared-memory retention and uncounted property
names, were corrected and independently rechecked. No remaining defect was
found in the scoped contract. Financial sufficiency, actual transport accounting,
canonical final checks and endpoint behavior remain named caller dependencies;
this report does not certify an integrated payment endpoint or G5 completion.

## Dependency graph

```text
seed/B/hash-domain checks                       [implementation]
  -> fixed copied eligible set                 [implementation]
  -> S = min(16, floor(128/E)), for E > 0       [integer arithmetic]
  -> complete-stage planned work ceilings       [loop guards + arithmetic]

seed clamp + saturated expansion + final B     [implementation]
  -> distinct expansion inputs in [2,B]         [inductive proof]
  -> successful H and heuristic cursor L < H   [implementation]
  -> midpoint strictly in (L,H), if H-L > 1    [integer arithmetic]
  -> distinct refinement inputs and termination [loop guards + shrinking interval]

complete-stage exact set check                 [implementation]
  + caller validates actual quote sufficiency  [named caller assumption]
  + accepted inert-data copy                   [implementation]
  -> retained observed sufficient witness      [source-level preservation]
  + synchronous checkpoints                   [named caller assumption]
  + canonical/funding/freshness final checks    [service dependency, not audited]
  -> authenticated payment observation         [conditional integration claim]

failed/uncertifiable probe
  -X-> infeasible lower endpoint or global exhaustion [counterexamples]
```

The proof uses local integer arithmetic and repository definitions. No external
theorem is needed. `MASTER_PROMPT.md` section 8 sets maxima of 16 expansions and
24 bisections; the implementation policy's smaller 8/8 schedule respects those
maxima. `docs/NUMERICS.md` NUM-8 explicitly permits unresolved-certificate failure.
NUM-9 does not supply the missing monotonicity of the successful oracle domain.
No successful test or status flag is used to prove its own callback assumptions.

## Obligation matrix

| Obligation | Status | Evidence or exact limitation |
| --- | --- | --- |
| Numeric domain and bigint arithmetic | Passed | Positive seed; `2 <= B < 2^256`; clamping, saturation and midpoints never use floating-point amounts |
| Fixed eligible set, including zero and 32 orders | Passed | Initial clone plus unique lowercase hash validation; zero orders returns without probing |
| Complete unchanged stage coverage | Passed | Exactly E outcomes, all in the expected set and pairwise distinct, implies every expected order appears once |
| Consistent sufficient-result marker | Passed | A non-null value is required exactly when one or more outcomes are `quoted`; malformed or contradictory stages abort |
| Cap reservation and duplicate avoidance | Passed | Increasing expansion, immediate termination at B, and strict interior midpoint invariant below |
| Eight expansion/eight refinement/16 stage caps | Passed | Independent loop guards plus the aggregate stage cap |
| 128 planned members and 28 planned batches | Passed | Four-range counting proof below; test covers every E in 1..32 |
| Actual RPC members, batching and retries | Conditional | The probe must issue exactly the internally prepared complete stage; the pure helper counts planned work and does not inspect network requests |
| Retained payload isolation | Passed for the enforced inert-data domain | Recursive fresh arrays/records; disallowed prototypes, accessors, shared memory and cycles reject |
| Payload size limits | Passed for accepted ordinary payloads | Depth, nodes, container width, signed bigint magnitude and aggregate text including property keys are bounded |
| CPU bound for arbitrary callback objects or proxies | Out of scope | Descriptor enumeration precedes container-size rejection; callback DTOs must already be ordinary and bounded |
| Retention after unsuccessful midpoint | Passed | Only a complete sufficient stage replaces the previous selected value |
| Transport/cancellation/final-checkpoint rejection | Passed at the callback boundary | Exceptions propagate; no catch returns an earlier witness; the final-return checkpoint has a dedicated test |
| Real elapsed deadline and interrupted pending probe | Conditional | Checkpoint must throw synchronously and the probe must settle or be aborted; the helper cannot interrupt a never-settling callback |
| Minimum input or complete discovery | Out of scope as a positive claim | Explicit false flag and countermodels below; an unsuccessful search supplies no liquidity proof |
| Invoice/funding/canonical pin/role/quote-byte authentication | Not addressed by this reviewer | These belong to the context, routing and final service layers |
| Remote latency, HTTP behavior, future execution or gas | Out of scope | Pure fixtures do not establish service liveness or payment execution |

## Counting and integer invariants

For `E>0`, put `S=min(16,floor(128/E))`. Each entered stage increments the
stage counter once, the planned member counter by E, and the planned batch
counter by `ceil(E/8)`. Entry is forbidden at `stagesUsed>=S`. Therefore a
returned result with P entered stages has `P<=S`, `P*E<=128`, and `P<=16`.
Expansion has its separate cap `min(8,S)`; refinement has its separate cap eight. An aborted stage does
not produce a result, even though its work was charged before the callback.

The batch maximum follows without assuming a monotone quote oracle:

| Eligible E | Per-stage batches | Bound on total planned batches |
| --- | ---: | ---: |
| 1..8 | 1 | 16 |
| 9..16 | 2 | `floor(128/9)*2 = 28` |
| 17..24 | 3 | `floor(128/17)*3 = 21` |
| 25..32 | 4 | `floor(128/25)*4 = 20` |

E=9 attains 28 with 14 stages and 126 members. E=32 attains 128 members with
four stages and 16 batches. The documented combined ceilings are arithmetically
correct if their stated caller schedule is honored: `6+16+96+128=246` members
and `2+2+12+28=44` batches. At most three transport attempts multiply these by
three, giving 738 transmitted members and 132 HTTP attempts. Direct-USDC's
separate claimed schedule gives 20 members, four batches, 60 transmitted members
and 12 attempts. This review does not establish that the service implements
those schedules.

The first expansion amount is the seed clamped into `[2,B]`. After an
unsuccessful probe at `x<B`, saturated doubling gives an amount strictly larger
than x and no larger than B. The reserved final expansion overwrites that amount
with B. An earlier probe at B already terminates expansion, so that overwrite
cannot duplicate B. If all completed expansion stages are unsuccessful and no
exception occurs, B is tested before search exhaustion is returned. A successful
stage may stop expansion earlier, as the policy permits.

After the first sufficient stage, `1<=L<H<=B`, where L is the preceding failed
input or one. For `H-L>1`, `M=floor((L+H)/2)` satisfies `L<M<H`. Success replaces
H with M; failure replaces only the heuristic cursor L with M. In either case,
the new open interval excludes M and every earlier tested amount. All inputs
remain distinct and valid. At adjacency no new midpoint exists. The independent
caps also stop large intervals before all integer points can be resolved.

These conclusions include B=2, seed=1, seeds above B or above uint256, and input
amounts above `2^53`. A seed above uint256 is intentionally legal and clamped;
only the transported bound and probed amounts have the uint256 constraint here.
The service must handle an effective swap cap below two before invoking this
helper. No fee-output monotonicity assumption is used in this proof.

## Retention, discovered defects and correction

The first reviewed implementation used `structuredClone` on unrestricted T.
A local execution returned a sufficient payload containing a SharedArrayBuffer
whose uint32 value was initially five. Later unavailable probes changed the
original backing memory to zero. The result retained input five but its copied
buffer read zero. Different wrapper objects did not isolate the witness.

The final implementation replaces that operation with a recursive copier.
Each accepted mutable payload container is newly allocated; primitive leaves
are immutable. Ordinary records may have Object.prototype or null prototype;
arrays must be dense ordinary arrays. Own enumerable data descriptors are
copied with `defineProperty`, including names such as `__proto__`, without
invoking accessors or assigning through a prototype setter. Symbols, functions,
undefined, non-safe-integer numbers, typed arrays, shared buffers, other object
prototypes and cycles are rejected. Repeated acyclic references are copied into
separate subtrees and counted each time.

The accepted payload limits are depth 24 with root depth zero, 8,192 expanded
value nodes, 512 entries per array/record, bigints strictly between `-2^256` and
`2^256`, and 1,048,576 aggregate UTF-16 units for string leaves and copied
property names. Array `length` is structural metadata, not a copied payload
property. An intermediate revision omitted property names from the text budget;
the payload `{['x'.repeat(1048577)]:true}` was accepted. The final source counts
the names and rejects this witness. Enumeration cost for an arbitrarily large
source object is not bounded by acceptance rejection; the policy now states
the ordinary bounded-DTO precondition explicitly.

The returned payload remains mutable by its recipient. The proved isolation
claim concerns later mutations of callback-owned payload objects; it is not an
immutability or object-freezing promise. The generic TypeScript parameter T is
still broad, so unsupported runtime values abort instead of being retained.

## Partial-oracle countermodels and deadline boundary

For ideal output `f(g)=g` and due two, consider an oracle that succeeds for
g>=2 except that input three is uncertifiable. With seed=B=5, the implementation
probes `[5,3,4]` and returns four. Input two is sufficient but unprobed. Failure
at three therefore cannot justify an infeasible lower endpoint or a minimum
input claim. This is a logical countermodel, not an observed Orbital numerical
fixture.

A separate oracle succeeds only at input three. With seed two and B=100, the
probes are `[2,4,8,16,32,64,100]`; no sufficient point is discovered and the helper
returns `search_exhausted`. Even testing the cap does not prove that liquidity
is insufficient. Both examples leave `minimumInputCertified:false`.

Checkpoints occur before/after stage work and before returning a retained
result. A thrown probe error, malformed stage, rejected payload or thrown
checkpoint rejects the search; none is reclassified as an unavailable midpoint
that allows a previous result to escape. The new final-return test declines
optional refinement, then makes the subsequent final checkpoint throw; it
verifies rejection after exactly one successful probe.

The helper has no timer or abort controller of its own. Synchronous checkpoints
must enforce cancellation, expiry and freshness; returning a rejected Promise
from a checkpoint does not satisfy this contract. The probe must participate
in the request's cancellation/deadline mechanism. The fake elapsed-time test
shows optional refinement can be skipped at the caller's two-second reserve;
it neither demonstrates two seconds suffice for final checks nor establishes
real RPC latency. Authentication and final observation publication happen in
the caller after this pure search result.

## Source and finite checks

Reviewed base: `d2f3fdf48b025c0ecdabeea03665a321568ad34b`; the new files were
uncommitted while reviewed. Final SHA-256 pins:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/payment-search.ts` | `02AD64D617DDE797D53B8CDDCCF49F0F274470B8FF995EDCF12CC369F1AF80D0` |
| `apps/api/test/payment-search.test.ts` | `BF2D691997C6AC3CA636B73DE417CAAEF04322FBE8022097E2A59FD6124A7DC8` |
| `docs/audits/PAYMENT_SEARCH_POLICY.md` | `126AAD5E5CE7EE66A83A762F238B0BB8389852ED1F8102DAC0B3B72765B5E729` |
| `docs/audits/PAYMENT_QUOTE_PLAN.md` | `08904B3F385AE8B5C139EB4198FBD8AEC294A0AFA622789AAFAC34935CC5FAD7` |

Independent command, run from the repository root using Node v22.18.0 and
pnpm 10.34.5:

```text
pnpm --filter @orbital/api exec tsx --test test/payment-search.test.ts
```

Final result: 16 tests passed, zero failed, skipped or cancelled. The test file
enumerates all E from one through 32 for the worst-case schedule and includes
cap reservation, bigint boundaries, partial-oracle behavior, complete/reordered
mixed outcomes, malformed-stage rejection, retained mutation, payload rejection,
fake latency, cancellation and the actual final-return checkpoint failure.
Its fee fixture exercises selected gross/net values; it does not establish
contract quote behavior or fee-oracle monotonicity.

Additional reviewer-only checks used `node --import tsx --input-type=module`
with source supplied on stdin from `apps/api`, without writing fixtures or
shared evidence. They reproduced the two defects before correction, the
discovery counterexample, acceptance/rejection at arrays 512/513, depths 24/25,
expanded nodes 8192/8193, and both signed bigint endpoints. The final text-budget
check accepted exactly 1,048,576 units and rejected 1,048,577 for both a property
name and a name-plus-value total. These finite checks supplement the source
argument; they are not exhaustive payload fuzzing or a remote latency campaign.

## Remaining implication and cheapest next check

There is no remaining gap in the normalized pure-search claim. The precise
next integration obligation is that a `quoted` outcome and its payload mean
an authenticated complete static stage at the requested input, fixed invoice
minimum and unchanged eligible set, while the actual stage calls and final
canonical/time/funding checks honor the shared schedule. The strongest safe
statement here is preservation of the caller's sufficient observed witness
within the planned search bounds.

The cheapest next check is a service test binding a retained result to the
exact adapter-context quote bytes and invoice/funding pin, then changing final
context or expiring the shared deadline and requiring the whole observation to
fail. Integrated routing, public responses, SDK reconstruction, transaction
execution and target-network qualification require their own evidence.
