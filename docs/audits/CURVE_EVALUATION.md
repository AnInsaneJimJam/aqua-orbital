# Fixed-partition original-radical evaluation

2026-09-08. Repository-derived implementation and independent read-only audit.
The scoped enclosure and membership claims below passed inspection under an
unmodified `CurveEvaluation.prepare` context. This is not a complete root,
connected-path, output-error or settlement proof.

## Units and context

`evaluate` takes exact integer numerators `x_i=G*X_i`, with `G=2^32`. They may
represent fractional internal coordinates at a key plane. Stored coordinates
and the original total radius still remain below `2^160`; proof numerators
remain below `2^192`. Output normals are in these same lifted length units;
residuals are in squared lifted length units, encoded as signed 512-bit values.

For a chosen boundary prefix, `prepare` constructs

```text
R' = G*sum(interior radii)
K' = sum(boundary radius * integer key)
S'_lo = G*sum(floor(radius*sigmaLo/Q))
S'_hi = G*sum(ceil(radius*sigmaHi/Q))
V' = G*sum(floor(radius*virtualLo/Q)), Q=2^128.
```

It regenerates coefficients from the exact dimension/key, rather than trusting
the supplied coefficient fields. Each represented contribution is rounded in
the original units **before** multiplication by `G`, matching NUM-6 accounting.
It does not recompute rounded contributions from enlarged radii. The exact real
`S'=G*sum(radius*sigma)` lies in the displayed interval.

Sorted keys, a final full-range sentinel, positive radii, supported dimensions,
tick count and total-radius bounds are checked. The initializer remains
responsible for the protocol's additional minimum-radius/funding requirements.
The context must not be manually constructed or modified before evaluation.

## Domain and radical signs

Let `A=sum(x_i)`, `B=sum(x_i^2)`, and `c=n*R'+K'-A`. Principal floors and the
affine constraints `A>=K'`, `c>=0`, and the two adjacent key inequalities are
checked before the radical. At an exact key equality either chosen prefix is
allowed; each is a certificate for its own reconstruction, not an assertion that
the per-tick slack baskets coincide.

Wide arithmetic gives `rho'^2=(n*B-A^2)/n`. Floor and ceiling roots enclose
`rho'`; comparing the exact `n*rhoLo^2` with the undivided numerator detects
whether the ceiling must increase. No rounded equality is inferred from a
truncated quotient. A proved `rhoHi<S'_lo` yields `BelowSheet`; overlap at the
sheet boundary yields `UncertainSheet`. Neither result has valid residual or
normal fields. Neither is a global endpoint exclusion witness.

On the certified sheet `rhoLo>=S'_hi` with `rhoLo>0`, put

```text
tLo=rhoLo-S'_hi, tHi=rhoHi-S'_lo
FLo=floor(c^2/n)+tLo^2
FHi=ceil(c^2/n)+tHi^2.
```

These enclose the **original radical** `F=c^2/n+(rho'-S')^2`. Exact signed wide
subtraction of `R'^2` supplies the residual enclosure. A positive lower residual
excludes membership for this reconstruction; it must not be used as an
unconditional statement about another partition or reconstruction sheet.

## Normals and membership

For exact signed `d_i=n*x_i-A`, the normal is

```text
g'_i = c/n - (rho'-S')*d_i/(n*rho').
```

The implementation divides with outward rounding over the positive rho
interval. It applies the sign of `d_i` after bounding its magnitude, then
subtracts the adjustment interval from the directed axial center. Products are
wide; negative deviations never become unsigned wrapped coordinates.

All normal lower bounds must be nonnegative. Boundary baskets independently
require the largest boundary-key condition

```text
sigmaHi*G*(n*max(x)-A) <= (n*G-key)*rhoLo*Q.
```

The [endpoint reconstruction argument](../PAPER_IMPLEMENTATION.md) and
[segment audit](SLACK_SEGMENT.md) then establish each cap, sphere, principal
and price condition when the upper residual is nonpositive. Accordingly
`certifiesMembership` requires `Evaluated`, the complete price-domain flag,
and `residual.hi<=0`. A false result includes numerical uncertainty.

`strictOutputPrice` records only whether the selected normal has a strictly
positive lower bound. It must be combined with the other required fields by a
caller. At a full-range zero-price endpoint, membership can be true while this
flag is false; the test suite retains that distinction.

With no boundary ticks, exact sphere squares and `g'_i=R'-x_i` avoid division
by rho, including the equal-price case. The sphere residual is exact rather
than an interval widened by artificial transverse coordinates.

## Cached vertical evaluation

`prepareVertical` caches the exact untouched sum and squared sum. With proposed
output numerator z, `evaluateResidual` reconstructs `A=C+z` and `B=B_fixed+z^2`.
It shares the same mixed radical implementation with the full evaluator. For
the all-interior sphere it uses the exact wide identity
`F-R'^2=B+(n-1)*R'^2-2*R'*A`. Sphere rho fields are unused zero placeholders,
not enclosures of the actual transverse radius.

This API has a distinct `ResidualEvaluation` type with no membership or price
flags. It cannot be passed to `certifiesMembership`. An unmodified prepared
vertical/context pair and a separately certified whole-interval domain are
caller requirements; the reduced method checks axial/sheet prerequisites but
does not repeat every principal, partition and price test. Its signed costs
obey the same reviewed range bounds.

`RootBracket` performs full endpoint and critical-point checks before using
this reduced path. Midpoints therefore require only a radical sign. Exact
endpoint equality requires both residual bounds to be zero; an uncertain
midpoint leaves the preceding outward bracket intact. The caller carries the
remaining shared budget, never resetting it per segment. See
[bracket evidence](../../test/evidence/root-bracket.md) for the finite domain
argument, independent root goldens, measured costs and remaining limitations.

## Range review

Before `prepare` rejects an oversized original radius sum, at most eight
`uint192` radii sum below `2^195`; scaled accumulation and key products fit
uint256. For an accepted context, `R',S'_lo,S'_hi,V'<2^192`, because admitted
coefficients are at most Q and `ceil(r*c/Q)<=r`. `K'<2^195`.

With accepted proof coordinates, `A<2^195`, `B<2^387`, `n*B,A^2<2^390`,
`rhoHi<2^194` and `n*rhoHi<2^197`. Signed residual intermediates fit below
`2^391`. The inner native boundary-price product fits below `2^229`; its
outer wide products fit below `2^357`.

The normal quotient also fits int256 despite using a wide numerator. For each
coordinate, `abs(n*x_i-A)<=n*rho'`. Since `rhoHi<=rhoLo+1`, `tHi<=rhoHi` and
`rhoLo>=1`, its magnitude is at most
`ceil(rhoHi^2/rhoLo)<=rhoLo+3<2^195`. Axial bounds and the final signed sum
remain far below the signed 256-bit limit. No squared length is narrowed before
division or signed subtraction.

## Evidence and remaining work

Tests were first run against a compiling reverting stub. The independent
numeric corpus constructs explicit vectors and per-tick reconstructed baskets;
its residual uses the squared vector normal, not a copy of the production
axial/transverse evaluation. Integer floors, including wide residuals, regenerate
identically at 110 and 160 digits. It contains two-, three- and eight-token
examples with feasible and outside-invariant endpoints. These finite numerical
checks are not universal interval proofs.

Additional Solidity cases isolate an exact wide 3-4-5 sphere, sheet holes and
uncertainty, wrong partitions/principal floors, fractional equality on both
sides, boundary-price failure despite positive aggregate normals, and a zero
output normal. See [primitive evidence](../../test/evidence/curve-primitives.md).

Endpoint evaluation does not prove an entire bracket or path, find a feasible
bracket, select a tight global support witness, order events, allocate a shared
refinement/crossing budget, or establish final single-rounding/fee/settlement
safety. Those remain explicit caller and whole-engine obligations. A conservative
self-review preserved the displayed mathematics; substantive derivations above
were separately subjected to the independent audit.
