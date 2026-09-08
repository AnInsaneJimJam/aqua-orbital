# Mathematical and release gap review

Reviewed 2026-09-08 against the mixed-capable Router checkpoint in
[mixed-execution.md](../../test/evidence/mixed-execution.md). This is a read-only
requirements/source/evidence audit: no Solidity, reference or campaign was run
for this note. Concurrent full-checkpoint, invoice and deployment work is not
counted here. Existing manifests identify the runs actually observed.

**Verdict: incomplete release argument.** The current implementation has a
conditional accepted-path argument and actual initialized mixed executions. The
smallest missing implication is from those certificates and finite cases to
ordinary valid-state acceptance across the advertised parameter domain, followed
by the required economic, mutation and resource campaigns. No concrete new
false-acceptance defect was found in this targeted inspection. This is not an
independent security audit or a universal correctness/liveness proof.

## 1. Claim and authority

The claim under review is G1/G8 acceptance of an exact-input, maker-owned Aqua
strategy using the paper's per-tick convex sets, actual rounded reserves,
certified nonnegative supporting prices, at most one output-quantum shortfall,
and bounded work. It assumes authenticated immutable configuration and linked
code, supported standard-accounting tokens, and the original-radius coefficient
provenance required by the source. Pure math certificates do not authenticate a
maker, deployed library or token by themselves.

[MASTER_PROMPT §16–17](../../MASTER_PROMPT.md#L517) controls the gates.
[Its migration table](../../MASTER_PROMPT.md#L35) explicitly supersedes the old
pooled share/fee-escrow lifecycle and old production 32-token/64-tick limits.
[TESTS](../TESTS.md#L3), [MATH](../MATH.md) and [NUMERICS](../NUMERICS.md) retain
the mathematical definitions, distributions and evidence rules. In particular,
an explained precision/domain deferral is not a proof that the requested trade
is infeasible, and widespread ordinary deferrals do not satisfy the liveness
requirement merely because no unsafe output was returned.

| Domain | Required/implemented limit | Evidence distinction |
| --- | --- | --- |
| Onchain shape | 2–8 tokens, 1–8 ticks including a unique full-range anchor | Enforced by `OrbitalOrderCodec.validateShape`, lines 16–32; not a claim that every valid combination has been exercised in swaps |
| Amount units | Immutable decimals 0–18; raw normalization `10^(18-d) * 2^64` | Campaign values specifically include 0/6/8/18; the real initialized demo is sorted 6/18/6 |
| Geometric lengths | Each radius at least `10^12 * U`; radii, sum and actual coordinates below `2^160` | Wider ABI fields are not a larger supported numerical domain; proof-only GRID numerators are separate |
| Work | Caller crossing limit 0–16; at most 8 ticks; current composition shares 160 midpoint evaluations | Initial discovery spends zero; first final solve and at most one resume share the remainder. Crossing allowance covers release, ideal events and final retention |
| Reference-only | Retained n=16/32 and larger tick counts; offline n=100/1,000/10,000 | These are mathematical test ranges, not deployed limits. Existing `test_events.py:40` checks explicit baskets at n=2/3/4/8/16/32; it is not a large-dimensional swap campaign |

The 12 independent initializer fixtures already include n=5, eight ticks,
decimals 0/6/8/18 and near-maximum radius sums
([generator](../../packages/reference/fixtures_initializer.py#L23),
[Solidity tests](../../packages/contracts/test/InitializerOracle.t.sol#L44)).
Thus “n=5 is untested” would be wrong. The missing n=5 coverage is meaningful
mixed **execution/differential/stateful** coverage. Similarly, the fourteen-event
eight-tick scheduler fixture and maximum 8/8 activation are not an 8/8 complete
swap or its worst accepted gas measurement.

## 2. Accepted-path proof obligations already represented

The implementation now composes the following leaves. Their stated hypotheses
remain necessary; sampled oracle points corroborate them but do not prove that
every point of an interval is valid.

| Obligation | Source/proof/evidence | Current conclusion |
| --- | --- | --- |
| Exact/directed arithmetic and original coefficient contributions | `WideMath`, `SignedWide`, `IntervalMath`, `TickGeometry`; [numerical ledger](../../test/evidence/numerics.md), [wide arithmetic](../../test/evidence/wide-performance.md) | Wide intermediate bounds and directed rounding have component proofs and adversarial tests; no blanket conversion of every squared length to uint256 |
| Original-radical root identity and global ideal output | `CurveEvaluation`, `RootBracket`, `FrontierEndpoint`; [ROOT_CERTIFICATE](ROOT_CERTIFICATE.md#L278), [root brackets](../../test/evidence/root-bracket.md), [endpoint evidence](../../test/evidence/frontier-endpoint.md) | Domain/price checks plus opposite outward residual signs identify a root. Its exact positive-output supporting normal gives the global endpoint optimum; a small residual or a squared-root candidate alone does not |
| Hidden vertical-domain failures | `SlackCertificate.criticalPoints`; [SLACK_SEGMENT](SLACK_SEGMENT.md), [GRID release](GRID_RELEASE.md) | Exact variance minimum and possible boundary-coordinate maximum supplement endpoints. Original actual X connects to a fractional initial root high through checked one-sided seams |
| Both roots and connected ideal arcs | `FrontierEvents`, `FrontierSchedule`, `FrontierTurn`, `FrontierComposition`; [FRONTIER_SEGMENT](FRONTIER_SEGMENT.md), [composition](FRONTIER_COMPOSITION.md) | Internally regenerated physical candidates, strict input/output order, adjacent prefixes and the mixed turn discriminator support accepted arcs. Endpoint acceptance alone is insufficient |
| Explicit exclusion of irrelevant negative-price roots | `FrontierEvents.hasCertifiedNegativePrice`, `FrontierSchedule:44–49`; [NEGATIVE_PRICE_EXCLUSION](NEGATIVE_PRICE_EXCLUSION.md) | Only a separate strict lower-bound contradiction excludes these roots. Failed physical certification and exact zero remain unknown |
| One raw output and total retained slack | `FrontierEndpoint._finalize`, `RootBracket._payoutBounded`; [PAYOUT_REFINEMENT](PAYOUT_REFINEMENT.md), [outward retention](OUTWARD_RETENTION_PROPOSAL.md) | Actual retained reserve minus root lower bound must fit one output quantum; actual membership and every retained seam are checked. Same-prefix Lipschitz and outward-seam inequalities bound radial slack without another token floor |
| Consumption by actual execution | `OrbitalStorage.solve:146–151`, `commitResult:153`, `OrbitalSwapVMRouter`; [mixed execution](../../test/evidence/mixed-execution.md) | Only `FrontierPathCertified` authorizes the mixed result. Actual prefix/moments/principal/fee metadata and order-bound pending crossings are committed; events follow successful settlement |

The separate all-interior path remains relevant:
[InteriorSwap](../../packages/contracts/src/libraries/InteriorSwap.sol#L24)
uses the actual possibly slack start and an exact sphere solve. Its narrow probe
falls back to composition only at the two strict-cap boundaries. It does not
replace the starting vector with a speculative rounded sphere endpoint before
mixed solving.

The real sequence in
[ReachableComposition](../../packages/contracts/test/ReachableComposition.t.sol#L29)
and [MixedExecution](../../packages/contracts/test/MixedExecution.t.sol) closes
an important earlier gap: initialization, a gross 350,000,000 input producing
164,721,797 output, then a reverse gross 500,000,000 input producing 513,016,094
from the **actual previous payout**. The reverse path crosses inward and outward.
That is stronger than an arbitrary feasible mathematical state, while remaining
one n=3/three-tick family.

What remains mathematical is not “implement both roots” or “invent a whole-path
slack bound” again. It is the unimplemented endpoint/equality cases below,
representative discovery/liveness, and an explicit chained-state economic
argument/campaign that accounts for consumed funded slack. A per-call error
bound must not be treated as newly supplied wealth on every call. The existing
two-leg all-interior cycle family is useful but does not establish this for
mixed multi-step/multi-strategy histories.

## 3. Conservative deferrals and their exact scope

| Case | Current evidence and source | Missing step; interpretation |
| --- | --- | --- |
| Coarse initial root cannot order the first arc | `FrontierComposition:49–59` discovers initial roots with budget 0; `_arcs:119–122` demands separated output boxes. `FrontierComposition.t.sol:173` and `test_frontier_composition.py:128` retain a feasible n2 witness | Add authenticated initial-bracket continuation when needed, charging the same global 160 ledger, then repeat release, direction and complete arc checks. Final-only resume cannot narrow the initial box. This is a demonstrated solver liveness deferral, not infeasibility |
| Exact ideal start/end event or in-range tangency | `FrontierSchedule:32–49`; `FrontierSchedule.t.sol:54,113`; `FrontierComposition.t.sol:166` retains the exact n7 touch | Implement the MATH-11 one-sided departure/tangent/next-swap rule with exact equality and bounded zero-distance counting. Current strict open input window conservatively rejects equality/overlap. Do not discard a touch because it resembles a double numerical root |
| Initial zero output normal in composition | `RootBracket:40` and `FrontierEndpoint:154` require strict high output price; `FrontierComposition.t.sol:181` records a valid sphere example | A general mixed one-sided rule needs its own domain/arc proof. **The all-interior route already handles this sphere departure** (`InteriorSwap.t.sol:96`); the composition-only regression is not proof that the integrated router rejects that same all-interior request |
| Nonphysical candidate without strict exclusion | `FrontierPriceExclusion.t.sol` exact n6 witness and [exact Fraction oracle](../../packages/reference/fixtures_negative_price.py); scheduler preserves unknown | Exact zero or overlapping sign bounds are not negative-price proofs. A new admissible zero-price branch rule or stronger independent exclusion must be proved before broadening acceptance |
| Seed, discriminant, direction or residual uncertainty | `FrontierEndpoint._identify:131–166`, `RootBracket:63–72`, `FrontierComposition._arc:137–147` | A bounded high/low proposal is not a complete discovery method. No certificate follows when its domain/sign test fails. Measure these reasons on independently valid cases before choosing another seed, an initial resume or a directed precision improvement; no arbitrary tolerance or false-negative predicate may exclude a feasible root |
| Remaining raw retention/cap uncertainty | `FrontierEndpoint._finalize:80–119` | Outward prefix changes now succeed when reverse GRID release certifies them. Failure of that certificate remains a deferral; retain the actual-frame, whole-gap and per-tick checks. A lower actual prefix is rejected, although raising only output from an authenticated root should not produce that canonical direction |
| Work exhaustion or genuine price/principal hole | Shared ledger and caller crossing-limit checks; retained hidden-price/variance fixtures | Exhaustion is a resource result; a proved hole is a mathematical rejection. Neither should be silently grouped with successful ordinary cases or with unexplained solver failure |

Three old blockers are explicitly **resolved for their named witnesses**:
the n2 key-5/8 high-sheet seed
([SeedProposal](../../packages/contracts/test/SeedProposal.t.sol#L33));
the n3 rounding-prefix mismatch including seven retained seams
([OutwardRetention](../../packages/contracts/test/OutwardRetention.t.sol#L54));
and the n3 strictly negative extraneous key root
([FrontierSchedule](../../packages/contracts/test/FrontierSchedule.t.sol#L68)).
Do not relabel their historical oracle IDs as current failures. Conversely,
GRID release's exact-seam tests already pass
([SlackGridRelease:28–59](../../packages/contracts/test/SlackGridRelease.t.sol#L28));
their equality handling does not close equality in the separate ideal event
scheduler.

Safeguarded Newton is an optional accelerator in NUM-9. The implemented bracket
uses bisection, so an absent Newton step is not itself a release defect. Tests
for spurious squared roots, cancellation, derivative zero and preserved
uncertainty remain relevant; tests of a nonexistent Newton proposal cannot
substitute for these actual solver obligations.

## 4. Campaign gap matrix

The following is an evidence inventory, not a new aggregate test-count claim.
Current full-checkpoint counts belong to the evidence index after that run
finishes. Replaying a frozen archive reproduces its historical source, not the
latest working graph.

| Requirement | Evidence present | Still required |
| --- | --- | --- |
| Independent precision-stable reference | Explicit supporting-basket roots/events, integer/Fraction counterexamples and 110/160-digit literal bindings; [composition oracle](../../packages/reference/fixtures_frontier_composition.py), [reachable sequence](../../packages/reference/fixtures_reachable_traversal.py) | A systematic complete-swap differential distribution across n=2/3/5/8 and ticks=1/2/3/8, not only initialization, isolated algebra or named n2/n3/n8 paths |
| Larger reference domain | n=16/32 per-tick feasibility in `test_events.py:40` | Retained larger tick counts and offline n=100/1,000/10,000 computations with explicit resource budgets. No such large-dimensional execution campaign was found in the inspected reference sources/evidence |
| Arithmetic fuzz | Wide/signed/interval/sphere/payout/turn/fee fuzz and a separate 2,048-case dual-helper run | Broad mixed geometry and economic distributions; multiplying the count of a sphere or arithmetic family does not cover missing dimensions, caps or branches |
| Valid-action invariants | [Frozen all-interior handler](../../test/evidence/interior-stateful.md): CI 256×128 = 32,768 successful swaps, all six pairs, donations, controlled settlement failure/recovery and final retire/dock | Current-graph CI/release runs and mixed valid-action histories, including independent oracle comparisons and successful crossing counts. Existing handler deliberately remains all-interior, one maker/order, with a proved finite drift box |
| Multiple makers/shared inventory | [Mixed-capable graph replay](../../test/evidence/shared-inventory-mixed.md): 64 complete sequences, 35 swaps each, all pairs across three strategies/two makers, wallet/allowance depletion, exact ghosts, recovery and independent closure | This is sequence fuzz, not the required handler depth campaign. Its trades remain all-interior. Combine mixed crossings, invoice actions and adversarial funding/settlement without discarding unexpected valid failures |
| Economic properties | Exact conservation/fees/backing assertions; 256 seeded two-leg interior cycles; named mixed sequence | Mixed cycles accounting for initial funded slack; permutations, scale homogeneity, input/fee monotonicity, one net swap versus splits with documented fee/raw effects, perturbations around seams and depeg/repeg scenarios in TEST-6 |
| Branch/crossing coverage | Both roots, inward/outward/returning prefixes, initial release, one/seven retained seams, fourteen-event scheduler | TEST-7's 100 successful inward and 100 outward crossings for each n=3/5/32, with n32 reference-only, plus 20 return-to-original-partition regressions. Record actions, unique states/makers/pairs, unexpected reverts and handler coverage; no campaign report currently establishes these totals |
| Mutation | Negative regression fixtures exist | No passed campaign for the required semantic mutants. Isolated mutations must be shown to be detected by assertions, with baseline green and restored source identity; compilation failure alone is not a semantic mutant kill |
| Release resource/analysis | Bounded loops, actual linked sizes, scoped gas below | Whole required gas matrix, target transaction budget/headroom, meaningful branch coverage, static/dependency/compiler/storage review and three-seed release campaigns |

Foundry profiles are configured, not equivalent to observed campaign results:
[foundry.toml](../../packages/contracts/foundry.toml) sets default 256 fuzz/
32×64 invariant, CI 2,048/256×128, release 10,000/1,024×256. Release requires
at least three recorded seeds. `InteriorStateful.step:96–98` explicitly bounds
its finite domain to 256 swaps; extending depth needs a renewed bound, not merely
an environment override. Its current release depth is 256, within that bound.

The master requires these ten semantic mutants: swapped price ratio; wrong
aggregate boundary radius; endpoint-only crossing detection; wrong pair
resolution; twice-charged fee; raw Aqua balance as geometric principal; quote
writes; retired-state reset; disabled global lock; and payment status surviving
a failed split. Retain applicable additional TEST-8 arithmetic/virtual/transfer
mutants, while replacing explicitly superseded pooled-share mutants with the
maker-owned lifecycle obligations. A mutant ledger should state the edited
operation, compiling baseline/mutant, detecting test/assertion, run seed and
source hashes.

## 5. Gas and deployability remain distinct

The [mixed execution measurement](../../test/evidence/mixed-execution.md#L61)
records actual external-call gas of 5,166,603 for the first mixed swap,
5,833,358 for the reverse swap, and 3,791,206 for maximum 8/8 activation.
These include the named ABI/fee/storage/settlement work, exclude transaction
intrinsic gas and are not minimum-EIP150-gas measurements. The linked production
runtimes are below EIP170: Router 22,221, Storage 23,240, Composition 23,138,
Endpoint 22,458 and Settlement 6,658 bytes. Storage has only 1,336 bytes of
headroom at that checkpoint; every production change needs a graph rebuild.

This does not yet establish the master's default 3/3 no-crossing <=2,000,000 gas
target, a default double crossing, the **8-token/8-tick worst accepted complete
traversal**, or an invoice with three recipients and refund. Measure the actual
default strategy and canonical entry points, rather than substituting a cheap
mathematical helper or maximum activation. Include cold state, full calldata,
actual settlement, linked deployment identity and forwarded-gas constraints.

[ARC_DEPLOYMENT_STATUS](../ARC_DEPLOYMENT_STATUS.md) records a 30,000,000 block
limit and explicitly leaves the transaction cap unverified; its 16,777,216 cap
is a provisional inference, not an accepted target budget. This note did not
refresh that network research. The required 20% headroom must use the verified
transaction budget, not 80% of an observed block limit. Local fixture execution
does not settle Arc native-USDC behavior or official Aqua deployment identity.

## 6. Prioritized bounded next work

1. **Build a mixed valid-state differential pilot before buying more iterations.**
   Start with a deterministic 32-case matrix: n=2/3/5/8 × ticks=1/2/3/8 × two
   independently chosen nonsingular price/radius families. Include decimals
   0/6/8/18, actual initialized trajectories, and separately labeled arbitrary
   feasible baskets. Produce 110/160-stable expected support/root/event evidence.
   Feed each *actual retained output* into the next reference problem; do not
   replace it with an ideal frontier or admit only cases the production solver
   already accepts. Report every planned valid case and its classified result.
   Add the default strategy, the retained coarse-initial-order case, event
   perturbations and bounded depeg/healthy-pair examples as named supplements.
   The matrix is a pilot, not the final wide/minimum-cap or release corpus.
2. **Fix the demonstrated initial-order bottleneck with authenticated resume.**
   Use the retained n2 witness for tests-first development; regenerate the frame,
   refine the initial bracket only as needed, charge the shared remainder, and
   recheck initial release, direction, schedule joins and final financial proof.
   Do not reset 160 or trust caller-supplied certification flags. Keep the
   existing all-interior zero-price success and final-resume goldens unchanged.
   General seed or equality changes should follow the pilot's classified
   failures and their own proof review, not speculative widening of predicates.
3. **Extend stateful coverage with guaranteed mixed actions and unwind.**
   Preserve exact maker/strategy/physical ghosts, use independent feasible-action
   construction and fail unexpected reverts. Carry actual state across actions;
   cover both directions, retained seams, invoices and shared funding. Use a
   bounded pilot before CI. Merely raising the all-interior handler's count does
   not establish this coverage.
4. **Run semantic mutations and the missing gas cases on the frozen graph.**
   Prioritize endpoint-only crossing, wrong boundary contribution, principal
   contamination and missing settlement rollback; retain all ten required
   mutants. Measure the 8/8 accepted traversal and three-recipient invoice before
   broadening the release claim. Optimize existing boundaries if the budget
   fails; do not silently cut supported ranges.

Existing bounded commands, to run only after the checkpoint owner releases the
Forge slot, include:

```text
python -m unittest discover -s packages/reference/tests -p test_frontier_composition.py -v
python -m unittest discover -s packages/reference/tests -p test_reachable_traversal.py -v
forge test --root packages/contracts --match-contract '^(FrontierCompositionTest|ReachableCompositionTest|MixedExecutionTest)$' --fuzz-seed 0x20260908 --threads 2 -vv
python test/evidence/interior-stateful/run.py ci
python test/evidence/shared-inventory/run-mixed.py fuzz
```

The last two replay their explicitly frozen archives. For a current-graph CI
campaign, record effective configuration, source hashes and output separately:

```powershell
$env:FOUNDRY_PROFILE = 'ci'
forge test --root packages/contracts --match-contract '^InteriorStatefulInvariantTest$' --fuzz-seed 0x20260908 --threads 2 -vv
Remove-Item Env:FOUNDRY_PROFILE
```

That command still tests the existing interior handler only. A new mixed pilot
runner/handler is required for steps 1–3; no nonexistent command is presented as
working. After the required coverage exists, run the full `release` profile at
three named seeds (for example 0x20260908, 0x20260909, 0x2026090a), retaining each
run's actual counts and failures. A source change invalidates the claim that an
earlier run covered the new graph.

## 7. Documentation/command discrepancies found

These are reconciliation tasks, not newly discovered mathematical failures.
They were left unchanged during this read-only audit.

- [numerics.md:89](../../test/evidence/numerics.md#L89) still says changed rounded
  prefixes require repartition and lists implemented mixed composition,
  once-only whole-output error and mixed principal/fee execution as missing.
  Replace that status list with links to the current conditional proofs and the
  remaining cases above; keep its historical counterexamples.
- [PAPER_IMPLEMENTATION:53,97,120](../PAPER_IMPLEMENTATION.md#L53) contains older
  open-path/router statements alongside newer composition/retention sections.
  Distinguish historical milestones from the current conditional integration.
  The independent source paper remains authoritative for its statements, not
  for these repository-specific adaptation/status claims.
- [TESTS:5](../TESTS.md#L5) still describes a documentation-only task.
  [scripts/gate.mjs:2](../../scripts/gate.mjs#L2) still makes `test:invariants`
  fail with “campaign is not implemented,” although a scoped actual handler and
  its frozen CI evidence now exist. It must not be changed to an unconditional
  green gate; expose the implemented scope and retain outstanding release status.
- Old TESTS pooled lifecycle, production 32/64 and token-wide-scan wording is
  explicitly superseded by the master migration. It is not a basis for removing
  the current bounded token registry/accounting work. Larger **reference**
  distributions and applicable math/mutation cases remain required.

## 8. Source boundary

The inspected production source hashes below bind this review's code references;
the linked [mixed manifest](../../test/evidence/mixed-execution/manifest.json)
binds its own complete source/artifact closure and observed test results.

| Source | SHA-256 |
| --- | --- |
| `FrontierComposition.sol` | `2b0cced7ca334b9eb814d821edbdcd4ebb40b4fc9219dd9beddf7bc07599069f` |
| `FrontierEndpoint.sol` | `ecb7eb1206cd1fc3fe03341f31d1442b2aabd4eeba0eaf629faba5807a0335fd` |
| `FrontierSchedule.sol` | `36a26f299bcb9d3cb59b4b32480364b2cd6fea18752e2c416ef073e7c60662ef` |
| `OrbitalStorage.sol` | `7565599cc48ffe1080ff37770db0d3b400603a44bb7f9ebd18c163bac0699883` |
| `OrbitalSwapVMRouter.sol` | `e6c91e3c134e386369d7f5b39d74ccc8aa05f1e8894e2431630c39a4436c1f4a` |

Source inspection/search establishes the stated inventory, not a formal absence
proof for every file or every feasible input. Numerical stability, exact
counterexamples, component proof reviews, finite campaigns, deployment identity
and live Privy/Arc receipts remain separate kinds of evidence.
