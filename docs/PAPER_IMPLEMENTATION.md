# Paper-to-implementation ledger

## Source and evidence policy

Source: **Orbital**, Dan Robinson, Ciamac Moallemi, Dave White, June 2, 2025, [official publication](https://www.paradigm.xyz/writing/orbital). Source acquisition, byte hash and extraction metadata belong under `docs/sources/`. HTML must retain mathematical notation; a text extraction with missing equations cannot authenticate a formula.

The paper supplies the mechanism. MATH supplies translated coordinates and explicitly labeled local derivations; NUMERICS supplies additional integer certification obligations. None of those obligations is proved merely because the document requires it. Orbswap (arXiv:2510.05428v1) is comparative context, not the mechanism to implement.

## Traceability

| Mechanism / requirement | Implementation | Acceptance / current status |
| --- | --- | --- |
| Sphere, equal-price point, spherical caps | packages/reference/orbital.py; TickGeometry.sol | Analytic reference/geometry unit tests pass; full GEO campaign outstanding |
| Virtual reserves and depeg interpretation | Reference minimizers; coefficient intervals | Analytic virtual/minimum fixtures pass; full depeg/display/budget campaign outstanding |
| Interior sphere / additive boundary consolidation | OrbitalMath.sol; FrontierComposition.sol; OrbitalStorage.sol | Per-tick witnesses, certified mixed paths and canonical actual-state reconstruction integrated; broad differential/cycle campaigns outstanding |
| Supporting prices and physical branch | Reference dual/primal checks; endpoint/arc/turn certificates | Conditional whole-path proof integrated; strict negative-price exclusion is separate from unknown/zero sign; equality/discovery liveness outstanding |
| Fixed-partition swap | Independent per-tick dual oracle; InteriorSwap.sol; CurveEvaluation.sol; RootBracket.sol | Interior and composed mixed paths integrated with shared budgets; named discovery/order deferrals and full supported-range acceptance remain open |
| Both roots and inward/outward crossings | Reference frontier_events; FrontierEvents.sol; FrontierSchedule.sol | Directed both-root schedule and connected mixed traversal integrated; exact ideal endpoint/touch handling and full crossing campaign outstanding |
| Raw amounts, intervals, conservative payouts | WideMath; SignedWide; IntervalMath; DualCertificate; FrontierEndpoint; SDK amounts | Conditional whole-path composition uses one final raw floor, output/slack bounds and certified retained seams; economic histories and release campaigns outstanding |
| Maker-owned Aqua strategy | OrbitalSwapVMRouter lifecycle/storage | Official Aqua activation/backing/retirement tests pass; full SETTLE/SHARED campaigns outstanding. Ownership is an Aqua adaptation |
| Once-per-swap maker fee and invoice adapter | Custom fee opcode; OrbitalPayments.sol | Actual once-only fee and interior/mixed Router settlement pass locally; adapter evidence is separately recorded in the evidence index; Arc/Privy receipts outstanding |

## Open proof obligations

The component audits below establish conditional results for convex-set minima, consolidated branches, connected arcs, all-token prices, conservative schedules, reconstructed solvency and one final payout. Their composition authorizes only certified paths. [The current release-gap review](audits/RELEASE_GAP_REVIEW.md) identifies the remaining equality, discovery, economic-history and campaign obligations. For every result retain hypotheses, proof or counterexample, tested ranges, source locator and dependent code/tests; component proofs do not establish full supported-range liveness.

Use explicit per-tick baskets at >=100 decimal digits for reference fixtures, increase precision, and compare small cases by a separate constrained optimization method. Never use a second copy of the production torus solver as its own oracle. Large-dimensional experiments establish only their recorded bounded range.

## Rounded endpoint audit

Independent audit on 2026-09-08 refutes unconditional positive-price preservation by output flooring. Conditional cap-membership proof: interior reconstruction has squared sphere distance `(r_t/R)^2 F` and sum `r_t h`; boundary reconstruction lies on its sphere and cap plane. With valid partition, `F<=R^2`, `rho>=S`, and certified virtual minima, these establish cap membership and nonnegative principal in exact arithmetic.

Aggregate `g>=0` establishes `x_t,i<=r_t` for interior ticks only. A boundary tick additionally requires `u_max <= (1-b/n)/sigma(b)`. Writing `d=n-b`, the bound is `d/[sqrt(n)*sqrt(n-d^2)]`; its derivative in d is positive, hence it decreases with b. Checking the largest boundary key suffices, subject to directed interval certification.

Counterexample: n=3, full-range radius 1, ordinary radius 1 at b=7/4; K=7/4, S=sqrt(69)/12. Unit prices `p=(0,(5+sqrt(7))/8,(5-sqrt(7))/8)` give `X=2(1-p)`. Retain epsilon=10^-6 in the second asset (zero-based coordinate 1). At 100 and 160 digits, F-1 is approximately -1.911436857888e-6 and every aggregate g is positive, but the boundary tick's coordinate 0 exceeds radius by approximately 6.770390713575e-8. The sphere/cap checks still pass. Arbitrarily small positive epsilon has the same local branch defect.

This is an exact-real endpoint construction with bounded numerical evidence, not a complete reachable integer/raw-token transaction regression. The guarded engine is not disproved. Directed endpoint/path checks and a combined slack bound are now implemented below; a reachable version of this particular adversarial construction and representative liveness remain separate obligations.

## Crossing and slack-path audit

The global M4 quadratic for each ordinary key enumerates every crossing on the exact frontier: `Ac=K+Rb` and `rho_c=S+R sigma(b)` are unchanged by assigning the equality tick to either partition. The two roots are candidates, not evidence of connected traversal. `packages/reference/orbital.py:frontier_events` validates candidates using explicit per-tick support baskets. The two-asset inward/outward regression checks both roots at 110 and 160 digits. This diagnostic does not certify the intervals between events.

The proposed **endpoint-only** reduction of a rounded starting state to the frontier by lowering its output coordinate remains rejected. The independent audit found that this segment can leave `rho>=S` and reenter, even with valid endpoints, key-plane events and input/output equality. Convexity preserves membership in the sum of reserve sets, but does not preserve this particular reconstruction sheet.

Retained fixture: n=4, full radius R=2, ordinary radius r=10^-6, exactly quantized b=2+2^-31. Set S=r sigma(b), Ac=(R+r)b, k=sqrt(3)/2, c=(Ac+3S/k)/4 and v=3S/4. Untouched coordinates are `(c+v,c-v/2,c-v/2)`. Output falls from `c+2S/k` to the lower root of the radius-(R+r) sphere with those untouched coordinates. The released output is approximately 1.05591053087603e-9 whole tokens, below one six-decimal raw unit. At output c, the cap remains boundary but `rho/S=sqrt(27/32)<1`. Endpoints, selected pair equality and the only key event pass.

`packages/reference/tests/test_slack_path.py` reproduces this strengthened fixture at 110 and 160 digits. It is an exact-real small-slack construction; integer transaction reachability remains unproved. The integer embedding in `fixtures_slack.py` retains the interior variance failure between valid endpoints of the same partition; it is also not a claimed reachable raw-token history.

The subsequent [fixed-partition audit](audits/SLACK_SEGMENT.md) proves a sufficient finite certificate: both endpoint certificates, the variance minimum, and the sole possible interior maximum of the largest untouched boundary coordinate. The maximum is separate from both the variance minimum and input/output equality. `SlackCertificate.sol` implements exact wide moment comparisons and retains separate failures for the variance hole and hidden boundary-price peak.

The [inward seam audit](audits/SLACK_SEAM.md) proves feasibility nesting for a boundary-to-interior reclassification with slack. Individual MATH-7 baskets may change, but their per-token changes cancel under single-maker ownership. Exact GRID-denominator seam checks preserve the original represented virtual and sigma contributions. `certifyInwardRelease` concatenates separately certified segments with both one-sided seam checks, at most eight segments/seven inward seams. This is an output-only path certificate, not a root finder or evidence of raw-token reachability.

These results resolve the particular segment-interior and inward-seam obligations under their stated hypotheses. The later composition supplies conditional rounded-start traversal, event ordering and the combined output/slack budget. Representative liveness, mixed economic histories and the required campaigns continue to block G1/G2 acceptance.

## Scalar and global-output certificates

The [original-radical audit](audits/CURVE_EVALUATION.md) reviews directed scalar
and normal enclosures without squaring the radical into an unfiltered quartic.
The [frontier event audit](audits/FRONTIER_EVENTS.md) derives both roots from
exact pair sums/differences and separately certifies physicality. Independent
vector/basket fixtures are retained with their regeneration script and hashes in
[primitive evidence](../test/evidence/curve-primitives.md).

The [global support-gap proof](audits/ROOT_CERTIFICATE.md) supplies an output
bound from arbitrary exact nonnegative prices with positive output weight.
Every tick's support branch must come from those prices; a retained strict-slack
seam counterexample disproves reusing the persisted reserve partition. Directed
support costs in `DualCertificate.sol` give a valid lower objective and global
exclusion witness without requiring the proposed prices to be the candidate's
exact supporting normal. Finding a tight witness, proving candidate/path
feasibility and composing one final raw-output budget remain separate.

The [fixed-frontier segment theorem](audits/FRONTIER_SEGMENT.md) proves price
and principal validity between identified exact frontier endpoints. Same-branch
arcs use endpoint certificates; an inward-to-outward arc also needs an upper
discriminant bound at the largest boundary key to exclude intervening crossings.
The finite reference checks retain an endpoint-only hidden-crossing example.
`RootBracket.sol` supplies a separate fixed-partition root enclosure with whole
vertical-domain checks and a shared refinement budget. Its independent price-space
oracle uses per-tick support baskets, not the production radical as its root
equation. [Bracket evidence](../test/evidence/root-bracket.md).

The linked initializer is independently compared with the paper's equal point
and direct one-coordinate slice quadratic across 12 precision-stable cases.
Those [initializer fixtures](../test/evidence/initializer-oracle.md) establish
the recorded finite comparisons; they do not expand the frontend or onchain
supported range or replace the complete differential campaign.

The [all-interior path proof](../test/evidence/interior-swap.md) combines the
actual starting slack, a convex-sum bound along the lower sphere frontier and
a monotone clipped path to the actual raw endpoint. A final supporting price
vector gives the global ideal-output witness, while exact integer squares
establish at most one raw output quantum of shortfall and radial slack. The
router supplies authenticated immutable metadata and binds quanta to decimals.
[Real local execution](../test/evidence/interior-execution.md) now combines this
component with the once-only input fee, actual Aqua transfers and atomic invoice
settlement. The separate mixed-partition composition is described below.

The [fixed-input endpoint coupler](../test/evidence/frontier-endpoint.md) now
binds actual reserves and immutable token units to a certified original-radical
root. Its exact normal supplies the global support witness; conservative raw
flooring and an extended same-partition domain check bound both omitted output
and radial slack. Independent explicit-basket goldens cover n=2,3,8 at 110/160
digits. The [derivation and limits](audits/ENDPOINT_IDENTIFICATION.md) separate
endpoint identity from the still-required initial connection, ordered crossings
and rounded endpoint reclassification. The caller must carry the remaining
refinement budget across every helper call.

The [GRID release extension](../test/evidence/slack-grid-release.md) now accepts
an exact fractional proof endpoint and selected seam side while preserving the
original canonical-start API. The [event scheduler](../test/evidence/frontier-schedule.md)
enumerates both roots in one actual-state frame, checks strict input/output
order and walks adjacent ideal prefixes. Its independent price-space corpus
includes fourteen events across eight ticks. The [implemented composition](audits/FRONTIER_COMPOSITION.md)
joins these certificates with identified initial/final roots under shared
refinement/crossing budgets. Nine independent explicit-basket cases agree on
whole-path output, endpoint enclosures and slack, including inward/outward
double crossings. [Evidence and conditional reviews](../test/evidence/frontier-composition.md)
preserve the assumptions of each component. Production router integration now
passes the initialized history below. Endpoint equality, full supported-range
liveness and complete gas acceptance remain open.

The [payout-targeted refinement](audits/PAYOUT_REFINEMENT.md) is a numerical
implementation choice derived from NUM-9's existing one-raw-unit allowance,
not a statement from the paper. Given an independently certified ideal-root
bracket, it stops only when the combined raw-floor and root-gap bound fits
that allowance. Endpoint and complete path predicates still run. A retained
bracket can be reauthenticated and continued using the remaining shared
budget when coarse event order is unresolved. The [near-event fixture and
independent reference](../test/evidence/payout-refinement.md) exercise both
phases, retain discovery counterexamples and distinguish helper gas from
full deployment acceptance.

The [final-retention repartition proof](audits/OUTWARD_RETENTION_PROPOSAL.md)
is also repository-derived. Reversed GRID release checks every intervening
one-sided seam, while a triangle inequality shows radial defect cannot jump
upward at outward reclassification. Its pure-library implementation retains one
final raw floor and the original combined error/crossing budgets. The
[initialized token-unit sequence](../test/evidence/reachable-traversal.md) derives
an outward trade followed by an inward/outward trade from the paper-based
initializer and actual preceding payout. [Actual Router/Aqua integration](../test/evidence/mixed-execution.md)
now reproduces both raw outputs, ordered outward/inward crossings, canonical
actual metadata and principal/fee separation. Only a complete
`FrontierPathCertified` result may authorize a mixed settlement.

The [strict negative-price exclusion](audits/NEGATIVE_PRICE_EXCLUSION.md) is a
repository-derived schedule improvement. It excludes only an algebraic event
branch proved to have a negative common supporting price; an unknown or exact
zero sign remains retained. Exact rational fixtures bind that distinction. This
resolves the named initialized reverse-trade deferral without claiming general
event equality or seed discovery. The current full contract and reference
checkpoints, deployment observations and release blockers remain separately
listed in [the evidence index](../test/evidence/INDEX.md).
