# Outward repartition during final retention — proposal

Status: repository-derived conditional proof, independently reviewed and now
implemented in the pure endpoint/composition libraries. The
[promotion evidence](../../test/evidence/outward-retention-promotion.md) records
148 affected tests passing, with one/seven-seam reference bindings. Router
integration and complete release acceptance remain pending. This note records
the bounded certificate construction and its proof/test obligations; it is not
a statement attributed to the paper. Definitions and units remain in [MATH](../MATH.md) and
[NUMERICS](../NUMERICS.md); the existing endpoint contract is in
[ENDPOINT_IDENTIFICATION](ENDPOINT_IDENTIFICATION.md).

## 1. Exact endpoint and a reverse release certificate

Fix the original actual reserves, the input coordinate and exact net input.
Let the identified final ideal output reserve be `z`, enclosed by the certified
GRID bracket `[lo,hi]` in ideal prefix `k`. Let `A` denote the output reserve
after the one final raw payout, also in GRID units. The existing floor rule and
total retention test give

```text
A >= hi >= z >= lo,       A-lo <= q*GRID.
```

Increasing only the output reserve increases the reserve sum. The canonical
prefix can therefore only move outward, from `k` to some `j >= k`, provided
both endpoints satisfy their certified prefix domains. This statement concerns
the final accounting operation; no intermediate token transfer is proposed.
Adjacent key-plane sums increase strictly: their difference is
`R_after*(b_next-b_current)>0`, since the remaining interior radius is positive
and ordinary keys are strictly increasing.

First certify the actual paid reserves with `M.certify`. Then apply the existing
`P.certifyInwardReleaseToGrid(actual, ticks, output, hi, k)` to these **final
fixed-input reserves**, not to the original input frame. Success certifies the
whole vertical interval from the actual point down to `hi`, including both
one-sided reconstructions at every crossed key. Its returned crossing count
must equal `j-k`. The certificate is a set-membership/path statement, so reversing
the parameter order gives the same certified points from `hi` to `A`.

The existing root theorem separately certifies the final same-prefix domain on
`[lo,hi]`, the unique ideal root and its strict output-price direction. Its
membership monotonicity gives the feasible segment from `z` to `hi`. Together,
these two segments certify retention from `z` to `A`. A failure to certify the
GRID high point or a seam remains uncertainty; the proposal does not replace
the high point with an uncertified low endpoint.

This reuse is stronger than checking the two endpoint reconstructions alone.
It retains the hidden-extremum checks and both sides of a slack seam. In
particular, the retained price/principal counterexamples remain rejections.

## 2. Radial slack across an outward seam

The following algebra uses exact real coefficients of the immutable quantized
tick key. Directed stored coefficients are enclosures, not substitutions for
this identity. For one prefix define

```text
T = ((sum(X)-K-nR)/sqrt(n), ||PX||-S),
delta = R-||T||.
```

Within a fixed prefix, `T` is 1-Lipschitz in `X` by orthogonal decomposition,
and hence `delta` can increase by at most the length of a vertical segment.
Certified membership supplies `delta >= 0`.

At an outward crossing of a tick of radius `r` and key `b`, let the old interior
radius be `R`, and let

```text
c = (b-n)/sqrt(n),       s = sqrt(1-c*c),       c*c+s*s=1.
```

At the key plane `sum(X)=K+R*b`, the old and new two-dimensional vectors are

```text
T_old = (c*R,       rho-S),
T_new = (c*(R-r),   rho-S-r*s),
T_old = T_new + r*(c,s).
```

The triangle inequality gives `||T_old|| <= ||T_new||+r`, and therefore

```text
delta_new = R-r-||T_new|| <= R-||T_old|| = delta_old.
```

Thus radial slack cannot jump upward at an outward seam. This argument does
not assert continuity of a slack reconstruction; equality holds on the exact
frontier, while a slack seam can change the radial defect. The two-sided
membership certificate is still required.

Starting at ideal-root slack zero, sum the within-prefix length bounds and the
nonpositive seam jumps. Their total vertical length is exactly `(A-z)/GRID`,
so the actual final prefix's radial slack is bounded by the existing total
shortfall, and hence by `q`. There is no per-segment raw-unit allowance.

## 3. Required implementation and evidence before acceptance

- Preserve original-frame root authentication, all endpoint price/domain checks,
  the sole raw floor and the exact combined `A-lo` retention bound. The reverse
  certificate must consume the exact fixed-input final reserves and `hi`.
- Return the final actual prefix and retention crossing count distinctly from
  the ideal root prefix. Store reconstructed metadata for the actual prefix;
  never persist the root's now-stale partition.
- Append outward retention keys after the initial-release and ideal-frontier
  transitions. Charge them against the same crossing allowance, without changing
  the midpoint ledger or introducing intermediate transfers. Check equality
  conventions against the existing one-sided GRID seam implementation.
- Check that the reverse release proves all hypotheses used above, including
  exact coefficient provenance, canonical start, selected final prefix, positive
  interior radius and both one-sided seam domains. Obtain an independent proof
  and source review before changing the acceptance branch.
- Begin with the retained rounding-created-repartition fixture and an independent
  explicit-per-tick reference. Bind exact raw payout, both prefixes, seam order,
  reconstruction, total shortfall and final-prefix radial slack at increased
  precision. Preserve hidden-domain and negative-principal counterexamples.
- Add meaningful failing tests for insufficient crossing allowance, multiple
  retained seams, equality at a seam, changed fixed-input frame, malformed
  configuration, a high point that cannot be certified and stale partition
  metadata. Full result/gas/size regressions are required after any added fields
  or linked-library changes.

This route may certify additional cases; it does not establish supported-range
liveness, handle every exact event equality or prove a complete engine release.

## 4. Independent review and bounded reference checkpoint

Two independent source/proof reviews found no concrete defect, conditional on
the existing root, membership and GRID release certificates and immutable
coefficient provenance. They confirmed the seam inequality's direction and
the distinction between a reversed set-membership certificate and an assumed
outward nesting theorem. Retention must remain a distinct transition phase;
its seams are not ideal-frontier roots with positive input progress.

The new independent [reference generator](../../packages/reference/fixtures_outward_retention.py)
and [tests](../../packages/reference/tests/test_outward_retention.py) began with
five failing stub tests and then passed five checks at 110/160 digits. They use
explicit per-tick supporting baskets and verify both reconstructions at each
seam, with nine samples in each retention segment. An independent rerun also
passed. The retained price/principal hole remains infeasible.

| Case | Ideal / actual prefix | Raw output | Retention seams | Segment samples |
| --- | --- | ---: | ---: | ---: |
| Existing n3 exact-seam arrival, output decimals 6 | 0 / 1 | 18,669,858 | 1 | 18 |
| n3, eight ticks, output decimals 0 | 0 / 7 | 18 | 7 | 72 |

Both cases have raw input `68669858` with six input decimals and the same
initial aggregate `[500,400,100]` whole units. The second uses six radius-10
ticks, one radius-40 tick, a radius-600 full-range tick and ordinary keys
`3*GRID/2 + [0..6]`. Its payout retains less than one whole output unit across
all seven seams. These geometric fixtures do not establish reachable token
histories or universal liveness. [RED](../../test/evidence/outward-retention-reference-red.txt)
and [GREEN](../../test/evidence/outward-retention-reference-green.txt) are
separate from production contract acceptance; the new files are included in
the standard reference audit's input hashes.
