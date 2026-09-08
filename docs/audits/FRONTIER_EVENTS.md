# Exact-frontier event enclosures

2026-09-08. Repository-derived reformulation of MATH-10/MATH-11, implemented in
`FrontierEvents.sol`. This note proves the algebra and describes directed
enclosures at one key. It does not prove that every returned candidate lies on
the next connected path segment or complete the swap traversal.

## Pair-sum formulation

Fix an ordinary key `b=j/G`, where `G=2^32`. Use the canonical boundary prefix
through that key and the immutable radii to construct

```text
Ac = K+R*b
rhoc = S+R*sigma(b)
Bc = Ac^2/n+rhoc^2.
```

These are the exact frontier values from MATH-10, including the outer-sheet
choice of positive transverse radius. Moving the equality tick to the other
partition leaves these exact values unchanged. This equality is about the
frontier; it is not an assumption about reconstructed slack baskets.

Let `C` and `U2` be the sum and squared sum of the untouched coordinates. At
the event, input/output reserves `a,z` satisfy

```text
s = Ac-C = a+z
a^2+z^2 = Bc-U2
delta^2 = (a-z)^2 = 2*(Bc-U2)-s^2
n*delta^2 = 2*Ac^2+2*n*rhoc^2-2*n*U2-n*s^2.
```

Thus both M4 roots are retained without subtracting nearly equal floating-point
quadratic terms:

```text
inward candidate:  a=(s-delta)/2, z=(s+delta)/2
outward candidate: a=(s+delta)/2, z=(s-delta)/2.
```

With `delta>0` and strictly positive output price, MATH-10 gives the named
directions. A zero difference is a tangent candidate, not a transition. Progress
is measured against the **actual original** integer reserves: `d=a-X0_in` and
`y=X0_out-z`. This also applies when that original state has retained slack;
no original invariant constant is reset. It does not itself release that slack.

## Directed implementation

The routine validates the original state and constructs the same original
per-tick upward/downward sigma contributions used elsewhere. It encloses
`rhoc` by adding a directed enclosure of `R*sigma(b)`. Exact `Ac` and every
integer untouched coordinate are lifted by `G`; rho endpoints are also lifted.
Consequently the key sum is exact even when its stored-unit value is fractional.
Generic frontier roots remain irrational; their integer endpoints are enclosures,
not asserted exact rational crossings.

Every displayed squared term is calculated in 512-bit arithmetic before exact
subtraction. A negative upper discriminant proves no real intersection. An
interval overlapping the negative and nonnegative domains is `Uncertain`, with
no square-root clamp. Nonnegative lower/upper discriminants are divided outward
by `n`, then square-rooted downward/upward. If only the lower difference bound
is zero, crossing versus tangency is uncertain. Only an exact zero enclosure
can be labeled `Touch`.

For separated roots, signed halves round outward, including negative odd
numerators. Input/output progress intervals keep signed values. A candidate
behind the starting point, beyond remaining input, with negative output, or
overlapping an already consumed event is not silently discarded here: the
traversal must classify these conditions with its own exact work bounds.

## Conditional physical certificate

At a key frontier, all interior normalized baskets have
`b/n*1+sigma(b)*u`. Boundary keys are no larger than this key. For the largest
coordinate, the common price requirement is

```text
sigma(b)*(n*Xmax-Ac) <= (n-b)*rhoc.
```

The implementation checks this with an upper coordinate bound, upper sigma
coefficient and lower rho bound, using exact cross multiplication by `G` and
`Q=2^128`. The largest boundary key supplies the strongest boundary price bound.
It separately requires a strict lower output-price bound. Input/output reserve
lower endpoints must cover the original represented virtual credit; untouched
reserves inherit that check from initial validation.

These checks prove the exact enclosed event has valid per-tick reconstruction,
principal floors and nonnegative prices, with positive output price. A false
`physical` field includes numerical uncertainty; it is not a proof that the
geometric event cannot be physical. The engine must not skip such an event
and jump across an uncertified interval.

## Widths and remaining obligations

Original coordinates and total radius stay below `2^160`. Lifted individual
coordinates/radius/rho are below `2^192` up to the small directed endpoint
carry; their sums are below `2^196`. The uncombined event discriminant terms
are below `2^394`. The pair difference and signed halves remain below `2^198`,
well inside int256. Price cross products fit below `2^360`. All squared
products are wide; none is narrowed before division or subtraction. Coefficients
must come from TickGeometry for the same dimension and key.

The routine computes candidates for one ordinary key. A complete engine still
must select adjacent keys, resolve both candidates against remaining input and
the current departure direction, order intervals, reject ambiguous or inadmissible
paths, count transitions, certify all intermediate frontier segments, and round
the final combined output only once. Event uncertainty cannot be repaired merely
by paying one raw unit less.

An independent read-only audit found the displayed algebra, interval directions,
physical checks and ranges sound under the stated coefficient provenance. Tests
retain both directions against the explicit-tick oracle, stable at 110/160
digits, a definitely negative discriminant, near-tangent uncertainty, signed
behind-start roots, invalid domains and wide coordinates. A three-token case
retains real roots that fail the per-tick physical filter. Goldens regenerate
from `packages/reference/fixtures_curve_primitives.py --write`.
Red/green output and current hashes are linked in
[primitive evidence](../../test/evidence/curve-primitives.md).
These bounded tests do not constitute the required full differential, invariant,
mutation, gas or economic-cycle campaigns.
