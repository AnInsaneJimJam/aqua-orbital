# Directed exclusion of a definitely negative-price key root

Status: repository-derived certificate implemented in `FrontierEvents` and
consumed by `FrontierSchedule`, 2026-09-08. Focused results are recorded in
[negative-price evidence](../../test/evidence/negative-price.md).
This is a separate certificate from failure of `FrontierEvents.physical`. It
does not change the key-root formula, approximate a zero as negative, or assert
that a failed membership check establishes infeasibility.

## Claim and provenance

Assume `FrontierEvents.atKey` has returned `Separated` for a validated original
state, pair, immutable ordinary tick and its original coefficient enclosures.
The candidate and `A`, `rhoHi` must be the internally generated fields of that
same call. `A` is the exact seam sum numerator; every coordinate below uses
GRID length numerators. Reconstruct candidate absolute lower bounds as

```text
inLower  = start[input]*GRID + candidate.inputLo
outLower = start[output]*GRID - candidate.outputHi
untouchedLower[i] = start[i]*GRID.
```

The subtraction uses the upper cumulative-output bound because output is
released. These are lower bounds on the same exact enclosed event, not a
different point chosen independently from its box. Let `L` be their maximum and
`Delta=n*L-A`. If `Delta<=0`, this predicate provides no exclusion. Otherwise,
using `sigmaLo/Q <= sigma(b)`, `rho<=rhoHi`, and `b=key/GRID`, require strictly

```text
sigmaLo * GRID * Delta > (n*GRID-key) * rhoHi * Q.
```

All products and comparisons are exact wide unsigned operations after checking
the signed maximum and positive Delta. Since `key<n*GRID`, all factors have the
required nonnegative signs. For the coordinate achieving the lower bound L,

```text
sigma(b) * (n*X_i-A) > (n-b)*rho.
```

This is exactly the strict opposite of the nonnegative seam-price condition
in [FRONTIER_EVENTS](FRONTIER_EVENTS.md). At a true key frontier, interior
normalized baskets are `b/n + sigma(b)*u_i`, and the boundary tick has the same
normalized basket. The inequality gives a coordinate greater than its radius,
or equivalently a strictly negative common frontier normal. The mandatory
interior anchor fixes the supporting direction. Such an event cannot belong to
the accepted nonnegative-price branch. This conclusion concerns this enclosed
event only; it does not establish global infeasibility of the input trade.

Strict inequality is essential. Equality, a zero-containing price enclosure,
failed arithmetic preconditions, or failure of the existing physical certificate
without this additional strict proof remain unknown. No numerical tolerance or
clamp is added.

## Closed-input use

`Candidate` is unchanged. The internal `hasCertifiedNegativePrice` predicate takes
the original start/pair, the candidate's intervals, and its authenticated
`sumNumerator`, `rhoHi`, and immutable tick coefficients. It accepts no flag
asserting prior validity. FrontierSchedule calls it only on a separated,
nonphysical candidate freshly returned by its own `atKey` call. A true result
allows that candidate to be excluded from the physical event schedule; false
retains the current uncertainty behavior. All ordinary physical roots, both
directions, input limits, strict event order, prefix walk, turn certificates,
initial/final joins, and caller crossing budget remain unchanged.

The existing arc theorem independently proves nonnegative prices along every
accepted fixed-prefix segment. Excluding a proved negative-price event therefore
cannot remove a crossing on that certified segment. Merely excluding all roots
whose `physical` flag is false would lack this implication and remains invalid.

## Bounds and exact zero witness

The inherited event analysis bounds absolute signed candidate coordinates below
`2^198`; adding/subtracting the original `<2^192` coordinate remains safely in
int256. With `n<=8`, `n*L` and positive Delta are below `2^202`, hence fit uint256.
`sigmaLo<Q=2^128`, GRID is `2^32`, and key is below `8*GRID`. The first product is
below `2^362`. Conservatively carrying the directed rho endpoint carry gives
`rhoHi<2^196`, so the right product is below `2^359`. Wide products fit 512 bits.
Rejecting malformed/unrelated contexts is a
caller provenance obligation of this internal helper; an independent public
financial certificate is not proposed.

A useful exact-zero regression has n=6, one ordinary key `b=4`, a radius-S tick
and radius-S anchor. At the key choose normalized prices

```text
p = (0, 3/4, 1/2, 1/4, 1/4, 1/4),  ||p||=1, sum(p)=2.
X = 2*S*(1-p) = (2S, S/2, S, 3S/2, 3S/2, 3S/2).
```

Choose the traded pair input=1/output=2, or its opposite branch. These are
separated roots; untouched coordinate 0 has exactly zero price and output price
is positive. The directed negative-price inequality cannot be strict. A valid
all-interior original point for an in-window outward event is

```text
start = (2S, 9S/10, 2S-floor(sqrt(51*S^2/25)), 3S/2, 3S/2, 3S/2),
netInput = S/5.
```

The rounded output coordinate is inside the exact radius-2S sphere; its sum is
strictly below the key plane. The outward key event is at input increment S/10,
strictly inside the input window. The existing conservative physical check may
be unresolved at the untouched zero price, while the new strict exclusion must
remain false. This preserves a meaningful unknown-physical event regression.

## Reachable counterexample and required tests

The initialized n3 sequence's second trade identifies its initial and final
prefix-1 roots, but its schedule currently returns uncertainty. At key 1.5 it
has the required two physical roots. At key 1.75 the inward algebraic root lies
inside the input window but has a negative price; the other root is after the
input limit. Independent price-space enumeration records no positive-price pair
at the upper key. The added exclusion should allow the two lower-key crossings
without changing the independent raw output `513016094`.

Tests cover both reachable swaps, exact/ambiguous zero
prices, strict negative and strict positive cases, original output-bound reversal,
wide ranges, both root branches, insufficient crossing allowance and unchanged
arc/turn/order deferrals. The older key-1.8 test now explicitly requires the strict
inequality before accepting its empty physical schedule; its complete same-case
sphere path also certifies. The exact-zero unknown case above remains a separate
regression. Root and backend agents independently reviewed the proof and source
under the stated provenance and existing helper hypotheses, finding no concrete
defect. These conditional reviews do not close universal liveness, the full
release campaign, or real Router integration.
