# Numerical evidence — partial implementation

This is an evidence ledger for mathematical primitives and the integrated certified all-interior path, **not a completed proof of the mixed swap engine**. See [NUMERICS](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/NUMERICS.md) for the normative numerical contract and [paper ledger](../../docs/PAPER_IMPLEMENTATION.md) for source translations and counterexamples.

## Implemented domains and bounds

| Code symbol | Unit / representation | Current argument |
| --- | --- | --- |
| WideMath.Uint512 | unsigned integer, hi/lo uint256 limbs | Exact checked add/subtract/product/scale; arbitrary-numerator modular-inverse division and at most nine Newton root updates with exact postconditions; retained slow algorithms are test oracles |
| SignedWide / IntervalMath | signed magnitude 512-bit costs; directed signed 256-bit length intervals | Exact sign handling, four-corner wide products, directed positive-denominator quotient and roots; [evidence](interval-math.md) |
| TickGeometry.GRID | 2^32 key denominator | Validates signed domain before squaring n*GRID−key; ordinary key strictly below (n−1)GRID |
| TickGeometry coefficients | dimensionless Q128 lower/upper | Directed rational quotient and integer roots; sentinel virtual/sigma zero |
| OrbitalMath.x[i], radius sum | integer internal lengths, <2^160 | Onchain certificate n=2..8, ticks=1..8, positive radii, sorted keys and full-range sentinel |
| A, B | sum lengths <2^163; squared sum <2^323 | B and A² use wide products; no square of a length is assumed to fit uint256 |
| Knum | sum r*j, units length×2^32 | Ordinary j<7*2^32 and radius sum<2^160 give <2^195 |
| Slo/Shi, rhoLo/rhoHi | directed internal lengths | S sums directed per-radius contributions; rho uses exact nB−A² and directed n division/root |
| centered | (nR+K−A)×2^32 | Sign checked; magnitude <2^195; its square is wide |
| maximumDeviation | n*max(X)−A | Nonnegative by construction; <2^163 |
| virtual credit V | sum floor(r*mLower/2^128) | Principal lower bound x[i]>=V checked separately |

Native products inside the endpoint certificate stay below uint256: A*GRID and R*key <2^195, n*R*GRID <2^195, sigmaHi*GRID approximately <=2^160, and transverseHi*GRID <2^195. Products with maximumDeviation, centered and rho use WideMath. The exact nB−A² numerator is <2^326. Largest primitive product is <2^512. These bounds describe the current code only; future crossing/solver expressions need their own report.

## Endpoint acceptance argument and limits

All-interior states use the exact sphere reduction with each X_i<=R and squared distance<=R². Mixed states use exact key cross multiplication for the boundary prefix, rhoLo>=Shi, an upper bound on F, a lower bound on the smallest interior price, and a conservative check of the largest boundary key's reconstructed coordinate. False includes unresolved interval signs. Coefficients must be constructed by TickGeometry for the same n/key, never supplied as untrusted arbitrary tuples.

The reconstruction proof and boundary-price reduction are conditional on the stated hypotheses in the paper ledger. An independent read-only audit found no false-accept path by inspection under this coefficient provenance. It did not prove a complete solver, numerical output optimality, liveness or release readiness. The accepted mixed-boundary fixture is independently generated from per-tick minimizers; the rejected rounding fixture retains the discovered failure mode.

## Certified output-only segments and inward seams

`SlackCertificate.certifyFixedPartition` checks endpoints, the exact variance minimum and the only possible hidden maximum of a boundary coordinate. [The proof](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/SLACK_SEGMENT.md) derives integer moments, signed critical-point inclusion and the wide comparison without evaluating a fractional critical point. Its original-domain products are below `2^393`. Tests include both endpoints below the untouched mean, two-token degenerate moments, equality endpoints, a valid nonsingular release, and rejection of both retained interior-failure mechanisms.

`certifyInwardRelease` uses exact key-plane coordinates with denominator `2^32`; it does not round a crossing into a raw token amount. `OrbitalMath.certifyGridPoint` accepts proof numerators below `2^192` while leaving stored coordinates/radii below `2^160`. It scales the **original** represented virtual credit and directed sigma contributions. The largest reviewed endpoint product is below `2^454`; segment critical comparisons are below `2^457`. [The independent seam audit](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/SLACK_SEAM.md) reviews explicit-prefix equality checks, inward nesting and conservation of aggregate principal.

Every seam is checked using both one-sided reconstructions. The boundary count decreases strictly, so there are at most eight segments and seven inward seams; a zero-distance inward departure counts once. Canonical ending equality remains boundary. This certificate returns only feasibility and the number of inward seams. The future caller must combine that count with subsequent frontier transitions, enforce strict marginal-price rules where required, find the optimum, and establish one combined raw-output/slack budget. It must not treat seven tested seams as a measured complete-swap gas guarantee.

## All-interior output primitive

`SphereStep.step` derives the omitted-output radicand from the actual rounded starting vector and exact input, using 512-bit squares. It pays `floor((sqrt(radicand)-startingDeficit)/outputScale)` exactly through integer floor-root commutation. The returned length-valued `shortfallUpper` bounds unpaid ideal output and radial sphere slack by at most one output quantum. [Proof, limits and seeded test evidence](sphere-step.md).

This primitive does not establish an all-interior path through arbitrary ordinary caps, select crossings or reconcile Aqua inventory. Its output quantum must come from verified token decimals. Tests include independent square inequalities, actual starting slack, mixed decimal quanta and lengths near `2^160`; these do not replace the full differential/cycle campaign.

`InteriorSwap.exactInput` supplies the missing no-crossing wrapper. It certifies
the actual start, binds input/output scales to immutable decimals, checks input
capacity before multiplication and requires strict all-interior classification
at start and rounded end. The [path proof](interior-swap.md) covers initial
slack release, a lower sphere arc and a clipped monotone path to the actual
payout. A final global support witness and exact squares bound retained output
and radial slack by one output quantum. Mixed or key-equality cases explicitly
defer to traversal; no numerical tolerance is substituted.

The [real router integration](interior-execution.md) passes this actual endpoint
to authenticated strategy storage. It recomputes exact A/B, keeps V/radii fixed,
updates only net input and actual raw output principal, and increments version
once. The fee wrapper records `ceil(gross*ppm/1_000_000)` separately. Actual Aqua
gross-input/output allocation changes preserve the prior wide surplus exactly;
final all-token backing and exact touched-token deltas are independently checked
after approval cleanup. These equations are verified in six-pair sequential
execution and bounded two-leg cycle tests, not a whole-product release campaign.

## Evidence actually run

- `pnpm test:reference`: analytic benchmarks, explicit primal/dual witnesses, all six flagship pairs, both crossing roots, actual slack constraints, and two retained counterexamples. Specified fixtures are stable at 110/160 decimal digits. Dimension sweep is 2,3,4,8,16,32 for per-tick feasibility only.
- `pnpm test:contracts`: wide arithmetic, Q128 coefficient intervals, endpoint certificates and contract integration unit tests. Local fuzz profile only. See contracts.txt for exact entry points/counts.
- The reference supports numerical diagnostics, not a universal proof. It does not import the production torus library.

The [wide-performance report](wide-performance.md) records primary-source/MIT
provenance, arbitrary-numerator division and full-width root proofs, retained
legacy oracles, and measured helper gas. [Scalar/event evidence](curve-primitives.md)
records proof-coordinate bounds, directed residuals/normals, both exact-frontier
roots and the independent basket corpus. [Dual-certificate evidence](dual-certificate.md)
records a global output-bound inequality, independent price-selected branches,
wide support costs and their rounding-error bound. These results do not supply
missing complete-engine work or a release gas measurement.

`RootBracket.refine` now certifies a fixed-partition vertical domain using full
endpoint checks and exact interior critical comparisons, then narrows a signed
original-radical bracket. It retains a shared caller-supplied budget at most 160,
and returns certified width/status without claiming a raw payout. The cached
midpoint evaluator has no membership API. [Evidence and limitations](root-bracket.md).

The [exact-frontier segment theorem](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/FRONTIER_SEGMENT.md)
separately establishes connected price/principal validity from identified exact
endpoints and, when needed, a lower-key discriminant comparison. Its hypotheses
exclude ordinary rounded slack endpoints. [Independent initialization evidence](initializer-oracle.md)
now compares the linked initializer with paper-derived integer enclosures across
12 cases without reproducing production virtual-coefficient rounding.

## Current composition and remaining G1 obligations

The [fixed-input endpoint coupler](frontier-endpoint.md) originally certified
same-prefix raw payouts. [Final-retention promotion](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/outward-retention-promotion.md)
now certifies outward prefix changes through reversed GRID release and exact
one-sided seams, sharing the same crossing ledger. The composed path joins
actual-start release, identified frontier arcs and final retention with one
raw floor and one combined output/slack bound. Unknown discovery, ordering,
domain and budget results remain non-executable.

[Actual mixed Router/Aqua execution](mixed-execution.md) reproduces a derived
initialized outward trade and reverse inward/outward trade from its actual raw
payout, including canonical metadata and principal/fee separation. This is one
n3/three-tick history, not the required complete distribution. Strict
[negative-price exclusion](negative-price.md) resolves its named extraneous
root; exact zero and uncertain sign remain distinct.

The [32-configuration mixed pilot](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/mixed-pilot.md) adds 128 independent net-input
actions propagated from actual raw payouts. The preserved baseline deferred one
n3/eight-tick reversal; an exact, independently reviewed lower-sheet proposal
recovers it and the fresh linked replay matches all 128 actions. This is a
bounded discovery improvement. The matrix has no release/retention transitions
and its two largest n8 diagnostic calls already exceed the provisional Arc cap.

Still required: exact ideal event endpoint/touch rules; authenticated initial
bracket refinement for the retained ordering deferral; representative discovery
and liveness; broader independent initialized/actual-state differential checks;
reachable adversarial fixtures; mixed economic cycles accounting for funded
slack; full fuzz/invariant/mutation campaigns; and worst-range transaction gas.
See [the release-gap review](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/RELEASE_GAP_REVIEW.md) for precise
source boundaries and priorities. This partial ledger does not authorize a
verified target deployment or imply G1/G2 release acceptance.
