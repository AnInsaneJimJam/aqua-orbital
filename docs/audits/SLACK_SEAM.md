# Inward slack seam audit

2026-09-08. Independent proof-audit of [MATH](../MATH.md),
[NUMERICS](../NUMERICS.md), [the paper ledger](../PAPER_IMPLEMENTATION.md),
[the fixed-partition audit](SLACK_SEGMENT.md), and the current
`OrbitalMath.sol` endpoint kernel. These are repository-derived calculations;
no new theorem is attributed to the paper authors.

**Normalized claim and primary verdict: proved as written under the hypotheses
below.** At an ordinary key equality, a feasible boundary-side MATH-7
reconstruction implies a feasible interior-side reconstruction after the
inward reclassification. The aggregate reserve vector, virtual offsets and
total principal are identical at the seam. Strict slack generally makes the
individual reconstructed baskets different. This proves a geometric seam
certificate, not a complete swap algorithm, output-error budget or economic
cycle result.

## Claim card and exact hypotheses

Fix `2<=n<=8`, immutable positive tick radii, valid ordinary keys and the
permanently interior full-range sentinel. Consider the largest currently
boundary ordinary key `b`, with radius `r>0`. Let the boundary-side statistics
be `(R,K,S)`, where `R>0` excludes this tick and `K,S` include it. Write

```text
sigma = sqrt(1-(n-b)^2/n) > 0
q     = 1-b/n > 0
A     = K+R*b                         // exact seam equality
rho   = ||X-(A/n)*1||
u     = (X-(A/n)*1)/rho
tau   = rho-S.
```

The boundary-side certificate includes `rho>=S`, `F<=R^2`, partition membership,
all reconstructed per-tick cap and principal inequalities, and each boundary
coordinate at most its radius. In particular the crossed tick gives
`u_max<=q/sigma`. Since it contributes `r*sigma>0` to `S`, `rho>0` here and `u`
is well-defined. This excludes using an all-interior `rho=0` point as though it
were already certified on the boundary side.

The incoming and outgoing vertical path segments must independently satisfy
the full fixed-partition segment certificate, including its variance minimum
and possible boundary-coordinate maximum. Endpoints alone are not a segment
certificate. A positive output marginal denominator remains a separate strict
condition when needed for a root solve.

## Exact one-sided conditions and inward nesting

On this seam the boundary-side invariant is

```text
F_B = n*R^2*q^2 + tau^2,
sigma^2 = 1-n*q^2.
```

Consequently its branch and invariant conditions are exactly
`0<=tau<=R*sigma`. Put `alpha=tau/R`, so `0<=alpha<=sigma`.

Moving the tick inward changes only the sufficient statistics:

```text
R_I = R+r
K_I = K-r*b
S_I = S-r*sigma
h_I = (A-K_I)/R_I = b
tau_I = rho-S_I = tau+r*sigma
beta  = tau_I/(R+r) = (R*alpha+r*sigma)/(R+r).
```

Thus `alpha<=beta<=sigma`, `tau_I>=0`, and

```text
F_I = n*(R+r)^2*q^2 + (tau+r*sigma)^2 <= (R+r)^2.
```

Every new interior normalized basket is `b/n*1+beta*u`. For a nonnegative
component of `u`, its coordinate upper bound follows from
`beta*u_i<=sigma*u_i<=q`; for a negative component the bound is immediate.
Equivalently `g_I,i=(R+r)*(q-beta*u_i)>=0`. The crossed tick's boundary-price
bound is essential: aggregate `g_B>=0` alone does not give this implication.

The norm inequality places each new interior tick inside its own sphere.
Its reserve sum is `r_t*b`, satisfying its cap because its key is at least
`b`. Every pre-existing boundary basket is unchanged. Their cap, price and
principal conditions therefore persist. All new interior principal lower
bounds follow from membership in the unchanged per-tick cap and the existing
certified virtual lower offset; the full-range ball has coordinate minimum
zero. No virtual contribution is recalculated at this crossing.

This proves inward feasibility nesting at the seam. It is not a two-way
equivalence. Starting from the interior side, the additional conditions
required to reconstruct the boundary side are

```text
rho >= S_I+r*sigma,
u_max <= q/sigma.
```

Given those conditions and the interior-side seam invariant, the same algebra
recovers the boundary-side invariant and prices. Without them, the interior
side can be feasible while the boundary side fails. For example, take `n=2`,
one radius-1 full tick and one radius-1 key-`3/4` tick, and `X=(3/4,3/4)`.
The all-interior side has `R_I=2`, `F_I=25/8<4`, positive prices and valid tick
baskets `(3/8,3/8)`. The boundary side has `S=sqrt(14)/8>rho=0` and fails.
An implementation must still enforce canonical boundary ownership when
persisting an exact equality; it cannot persist this interior-only example
under an unproved equality exception.

## What jumps, and what is conserved

The crossed tick's old normalized basket is `b/n*1+sigma*u`. Its change is

```text
delta_crossed = -r*R/(R+r)*(sigma-alpha)*u.
```

Each previously interior tick of radius `r_t` changes by

```text
delta_t = r_t*r/(R+r)*(sigma-alpha)*u.
```

The latter changes sum to the negative of `delta_crossed`; all other boundary
changes are zero. Each tick's own reserve sum is unchanged since `sum(u)=0`.
Therefore the following are conserved exactly at the reclassification:

- aggregate `X`, `A`, `B`, `rho` and every token's total geometric reserve;
- all tick radii, keys and represented virtual contributions, hence `V`;
- aggregate principal `P_i=X_i-V`, fee counters and Aqua allocations;
- the strategy maker, order hash and ownership of every token.

Individual per-tick token principal is redistributed by the displayed jumps.
It is not individually conserved. These jumps vanish exactly on the frontier
(`alpha=sigma`), and need not vanish merely because `h=b`.

An explicit nonsingular strict-slack example uses the same two ticks and
`u=(1,-1)/sqrt(2)`, `tau=sigma/2`. Then

```text
X = (3/4+3*sqrt(7)/16, 3/4-3*sqrt(7)/16)
old full basket = (3/8+sqrt(7)/16, 3/8-sqrt(7)/16)
old cap basket  = (3/8+sqrt(7)/8,  3/8-sqrt(7)/8)
new baskets    = (3/8+3*sqrt(7)/32, 3/8-3*sqrt(7)/32), each
F_B = 107/128 < 1
F_I = 463/128 < 4.
```

All coordinates obey their cap, principal and positive-price constraints.
The baskets differ, although their sum is exactly the same `X`. Replacing
`alpha=sigma/2` by `alpha=(1-epsilon)*sigma` makes this discontinuity arbitrarily
small while preserving its nonzero nature. This is exact-real evidence; it
does not claim reachability by an integer transaction.

The squared invariant deficits also differ. Writing the seam transverse
deficit `ell=R*sigma-tau>=0`, one has

```text
(R+r)*sigma-tau_I = ell,
R^2-F_B = ell*(R*sigma+tau),
(R+r)^2-F_I = ell*((R+2*r)*sigma+tau).
```

Thus `ell` is conserved here, but `R^2-F` is not. The norm slack
`R-sqrt(F)` is generally not conserved either. These identities can support
a future length-valued slack update; they do not justify resetting any
invariant or establish an at-most-one-raw-output-unit bound.

## Does witness discontinuity violate the current product?

MASTER section 5.2 explicitly makes per-tick baskets mathematical state inside
one maker-owned strategy and forbids separate per-tick custody/share contracts.
Section 6.3 fixes radii and virtual contributions but permits tick
reclassification. MATH-11 requires `X,V` and ownership to remain unchanged at
a crossing; the equations above meet those requirements. The docs do not
state a general continuity requirement for each mathematical basket during a
swap. The old MATH-8 prohibition concerns changing liquidity at an incorrectly
reinitialized basket; this seam changes neither liquidity nor the aggregate
state.

For cap feasibility alone, both one-sided witnesses suffice. Indeed, each
cap intersected with its coordinate price halfspaces is convex, so the linear
interpolation between the two witnesses is also per-tick feasible and sums to
the identical `X`. This interpolation is an existence observation, not an
additional MATH-7 reconstruction or an instruction to implement intermediate
noncanonical baskets.

There is one explicit wording conflict: MATH-6 says without a frontier
qualification that either equality representation gives the same economic
basket. If this means the individual MATH-7 tick baskets, the strict-slack
example disproves it. If it means the aggregate owned basket, that aggregate
does agree. A durable clarification must state that individual equality of
baskets holds on the frontier; slack equality preserves their aggregate and
requires the certified one-sided policy. This audit does not silently change
that sentence or waive it as a release requirement.

The gradients `g_B` and `g_I` can also differ at a slack seam. A feasible slack
witness is not itself a common supporting-frontier minimizer. One cannot
borrow the frontier price-ratio argument to assert a smooth economic price
through this strict-slack event.

## Vertical release and the maximum-output objective

During a nonzero vertical output release, `X_output` decreases and other
coordinates stay fixed. It would be incorrect to say that this whole release
preserves `X`. Only the zero-distance seam reclassification preserves it.
Within each partition, `h=(A-K)/R` decreases with output release. At a seam
both sides have the same `h=b`. Hence such a release encounters ordinary keys
in decreasing order, with only boundary-to-interior transitions. Each ordinary
key can be crossed at most once during this initial vertical stage.

Concatenating fully certified fixed-partition segments and the proved seams
gives a continuous feasible **aggregate** path, with unchanged radii, virtual
offsets and fee separation. The initial validation, canonical endpoint rule,
strict output-price conditions and every segment's interior critical checks
remain necessary. Inward nesting supplies a seam implication, not those
missing segment checks.

Let a subsequent trade add a fixed amount `d` of input to original state `X0`,
and let `y0` be the certified initial output release. The final constraints
are still `X_in=X0_in+d`, unchanged untouched coordinates, and membership in
the same sum of the fixed tick reserve sets. If `z*` is the minimum final
output reserve for that feasible endpoint problem, then

```text
y0 + ((X0_output-y0)-z*) = X0_output-z*.
```

Thus counting the release in the total leaves the endpoint optimization
objective unchanged. At the seam itself the problem is literally identical
because even `X` is unchanged. Per-tick witness redistribution creates no
additional assets or separate LP entitlement.

This endpoint argument does not prove that a remaining positive-input path
from the released state reaches `z*` without leaving the required connected
branch. Nor does it prove that a locally certified frontier root is that
global minimizer. Those are still the frontier traversal/supporting-price and
independent-reference obligations. No whole-swap optimum or cycle economics
claim follows from the seam lemma alone.

## Exact rational seams and the lifted endpoint kernel

For integer original lengths and `G=2^32`, a vertical seam has

```text
z_seam = (K_num+R*j-C*G)/G,
```

where `C` is the sum of untouched coordinates and `K_num/G=K`. Thus its output
coordinate has denominator dividing `G`; the other coordinates, radii and
represented contributions can all be lifted by `G` exactly. This statement
is specific to vertical key intersections. Generic `(M4)` frontier crossing
roots need not be rational with this denominator.

For original coordinates/radius sum below `2^160`, lifted lengths are below
`2^192`. With `n<=8`, the current endpoint kernel has these conservative bounds:

| Expression | Upper power bound |
| --- | --- |
| `A`, `n*maximum`, maximum deviation | `<2^195` |
| lifted `K_num`, `A*G`, `n*R*G`, `centered` | `<2^227` |
| `nB`, `A^2`, `nB-A^2` | `<2^390` |
| `centered^2` before division by `n*G^2` | `<2^454` |
| `rhoHi`, `rhoHi-Slo` | `<2^194` |
| interior-price cross products | `<2^421` |
| boundary-price cross products | `<2^357` |
| lifted fixed-segment critical-point comparisons | `<2^457` |

The last bound is the fixed-partition audit's `<2^393` bound plus 64 bits from
scaling squared lengths. These products fit 512 bits. Native pre-products such
as `transverseHi*G`, `sigmaHi*G`, and `(n*G-key)*rhoLo` fit 256 bits under valid
coefficient provenance. Coefficients remain dimensionless Q128 values. There
is no need to shift the large variance numerator left by 256 to obtain its
length root; doing so would exceed these bounds. The current kernel uses a
wide division/root directly and does not make that shift.

`certifyAtScale` computes the original represented `V` and original directed
`S` contributions first, then multiplies them by the coordinate scale. This
preserves the authoritative virtual credit and sound enclosures of the same
exact `S`. In particular it does not replace `G*floor(r*mLo/Q)` by
`floor(G*r*mLo/Q)`, which can differ. Recomputing tighter exact-geometry `S`
enclosures could be valid proof-only arithmetic, but must not redefine stored
contributions or virtual accounting.

The selected prefix checks are sound by induction: removing a tick after
`h_old>=b` gives `h_new>=h_old`, so each removed key remains a valid boundary.
The first retained ordinary key checks `h_final<=b_next`, implying the same
for every later sorted key. Equality is accepted on either selected side.
The sentinel is never removed. The all-interior sphere branch is evaluated
before constructing `u`, avoiding the zero-variance division.

This source review is conditional on coefficients having been generated for
the same valid key and dimension, as the interface explicitly requires. It is
not a replacement for the kernel's tests or the full caller range audit.
One reviewed interface detail was reported to the implementer:
`boundaryCount=type(uint256).max` initially selected the private canonical mode
rather than rejecting an invalid explicit prefix. The public wrapper now
rejects `boundaryCount>=ticks.length`; the correction was verified by rereading
the source. The original issue was not an observed false-feasibility acceptance.

## Obligations, evidence and next check

Dependency graph: valid tick geometry -> exact seam equality ->
`0<=alpha<=sigma` and crossed boundary-price bound -> convex-combination
reconstruction -> per-tick feasibility and cancellation of witness jumps ->
aggregate feasibility at the seam. Whole-segment certificates are separate
leaves; output optimality is not used to prove feasibility.

| Obligation | Status |
| --- | --- |
| Exact inward seam reconstruction/branch/price feasibility | Passed under the claim-card hypotheses |
| Aggregate principal/virtual/fee conservation at reclassification | Passed by the explicit jump sum |
| Identical per-tick baskets for arbitrary slack equality | Failed; exact example above |
| Reverse feasibility implication without extra checks | Failed; equal-coordinate example above |
| No per-tick custody transfer to another owner | Passed for the explicit maker-owned architecture |
| MATH-6 wording reconciled with strict slack | Requires durable clarification; no normative edit made here |
| Piecewise vertical path feasibility | Conditional on every fixed-partition segment certificate |
| Maximum-output endpoint objective unchanged | Passed as the stated endpoint identity |
| Remaining directed-path reachability and maximum-output solver | Not addressed |
| Lifted one-sided endpoint width/accounting | Passed by source inspection under valid coefficients; execution tests remain separate |
| Raw-output error/slack update and repeated-cycle economics | Not addressed |

The audit used exact displayed algebra and read-only source inspection. No
new numerical experiment, production change or general theorem from external
literature is an evidence leaf. The cheapest next checks are an actual rational
seam accepted from both explicit prefixes, rejection of wrong prefixes, a
real inward vertical segment split at that seam, and independent per-tick
reconstruction at the seam and immediately on both sides. Retain the example
where only the interior side is feasible to prevent silently weakening the
canonical equality rule.

## Follow-up source review: `certifyInwardRelease`

The new `SlackCertificate.certifyInwardRelease` and shared `criticalPoints`
helper were independently read after implementation. Under the same valid
tick/coefficient precondition, no false-accept route was identified by this
source review. This is a conditional implementation review of the seam and
fixed-segment lemmas, not an execution-test result or a complete solver verdict.

The routine first requires both original integer endpoints to pass canonical
certification. Its initial and final prefix counts come from those endpoints.
The working reserves are then lifted exactly by `G`, while `R`, `K_num` and
individual `S_hi` contributions retain original units. Consequently
`target=K_num+R*key-untouched*G` is the exact lifted output coordinate of the
next vertical key plane. Explicit bounds require every target to lie between
the current output and the requested final output.

For each segment, `certifyGridPoint` checks both endpoints against the same
explicit prefix. After a seam, the following iteration checks that identical
point with the new prefix before certifying any further output release. Thus
neither the nesting lemma nor an unchecked equality assignment substitutes
for the implemented two-sided certificates. When boundary ticks remain,
`criticalPoints` checks the variance minimum and any interior maximum of the
largest untouched transverse coordinate using `S_hi*G`. With no boundaries,
the endpoint ball/coordinate/partition checks are sufficient by convexity.

The signed critical-point inclusion is implemented without signed truncation:

```text
low=m*z_lo, high=m*z_hi, T= m*z-C
T_star=-H/D, with D>0

low<=C
H <= D*(C-low)
high>=C OR D*(C-high)<=H.
```

These are exactly `D*T_lo<=-H<=D*T_hi`; the second branch only forms `C-high`
when it is nonnegative. The variance test `low<=C<=high` is also exact.
The subsequent cap comparison is the already derived
`G^2*(nD^2+H) <= (nG-key)^2*(D^2+H)`. All moments and products use checked
wide arithmetic and satisfy the lifted bounds above.

On a transition, the routine subtracts the exact same original upward-rounded
`S_hi` contribution used when assembling the prefix, removes the same
`r*key` from `K_num`, adds `r` to `R`, and decreases the prefix count once.
For successive distinct descending keys, the seam-sum decrease is
`(R+r)*(b_old-b_new)>0` in real units. Initial equality permits one
zero-distance departure, but cannot cause repeated departures at that key.
The loop has at most eight segments and seven seams. An endpoint exactly on
the next key remains canonically boundary; a mere arrival at that final
equality is not counted as an inward departure. A zero-length release reports
zero crossings. Caller reserve arrays are copied before modification.

The returned count is the number of these initial inward transitions. The
caller must combine it with all subsequent frontier transitions and enforce
the user's tightened crossing bound and the global 16-transition limit.
The method certifies feasibility; it does not itself require positive output,
select the frontier endpoint, impose a strict output-price denominator, prove
remaining directed-path reachability, or enforce the raw-output shortfall and
slack budget. Those conditions remain explicit caller/engine obligations.

The reviewed test source contains accepted fractional-seam, two-seam,
seven-seam and zero-distance examples, plus retained variance-hole and hidden
boundary-maximum rejections. The initial source review covered two-token
crossings. Subsequent integration added a three-token/three-tick two-seam
fixture with independent explicit per-tick reconstruction at 110/160 digits,
and a larger-scale variant exercising lifted coordinates above `2^160`.
The read-only source audit did not run the Solidity tests; measured results
belong in [contracts.txt](../../test/evidence/contracts.txt) and the separate
[reference segment report](../../test/evidence/slack-segment-differential.md).
