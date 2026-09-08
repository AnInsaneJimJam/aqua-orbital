# Exact GRID endpoint for inward slack release

This repository-derived extension implements a proof-only connection from
actual original-unit reserves to a fractional output coordinate. It applies
the fixed-partition theorem in [SLACK_SEGMENT](SLACK_SEGMENT.md) to the same
finite inward-seam loop already used by `SlackCertificate`. No paper theorem
is changed, and this certificate does not identify a root or select a payout.

## Claim and interface

`certifyInwardReleaseToGrid(start,ticks,output,endNumerator,endCount)` returns
`(true,crossings)` only if the closed output-only segment from the canonical
original `start` to `endNumerator/GRID` has the required MATH-7 feasibility and
price-domain certificates in each visited prefix. The end prefix is explicit;
it is a one-sided proof endpoint, not an authoritative raw-token balance.

The caller supplies the strategy's unchanged validated tick table, including
coefficients computed by `TickGeometry` at activation. A failed certificate
includes interval uncertainty and is not a global infeasibility proof.

The API first requires canonical `M.certify(start)`. Only after that original
range check does it lift coordinates. It requires decreasing output and an
end prefix no greater than the canonical start prefix, and independently
checks `M.certifyGridPoint(end,ticks,endCount)`. An incorrect selected prefix
cannot bypass its exact key inequalities or reconstruction checks.

The original `certifyInwardRelease` continues to require both original-unit
`M.certify` calls and both canonical classifications. It delegates only after
those unchanged checks. Thus equality at its final endpoint retains its
original canonical side; the new method does not silently redefine it.

## Exact seam decomposition

For a fixed prefix let `R` be the original sum of interior radii and let
`Knum=sum(radius*key)` over boundary ticks. Write `C=sum(untouched reserves)`.
The next inward key plane for the largest boundary key `j` is exactly

```text
z_seam * GRID = Knum + R*j - C*GRID.
```

Every quantity on the right is an integer. The implementation stores this
numerator without division, and stops at the next required seam or at its exact
final proof coordinate according to the selected prefix. There
is no intermediate token floor or original-unit rounding. A seam at which
the final prefix is already reached is checked without crossing it.

Each piece checks both GRID endpoints in its own prefix and then the exact
variance-minimum and hidden boundary-maximum conditions of SLACK_SEGMENT.
For an all-interior piece, the sphere, coordinate and partition conditions
are convex/affine, so the two endpoint certificates suffice. The fixed-prefix
theorem therefore certifies every point, rather than sampled points.

After a seam, the loop removes exactly the crossed tick from the boundary
prefix: `R += radius`, `Knum -= radius*key`, and it subtracts that same tick's
previously rounded original-unit upper sigma contribution. It does not
recompute sigma or virtual credit using a lifted radius. Both endpoints in
the next prefix are checked again, so the new side of the seam must certify
independently before success.

At a canonical starting equality, the first piece can have zero length;
its inward departure is counted once. At a final exact equality, choosing
the inward side requires one final departure and a zero-length piece in the
selected prefix. Choosing the boundary side stops before that departure.
These checks are necessary because slack-state reconstructions can differ
on the two sides: `h=b` alone does not imply frontier equality. No equality
side is inferred from the other.

Prefix count decreases by one per departure and starts below the number of
ticks. With at most eight ticks including the full-range sentinel, there
are at most seven crossings and eight pieces. Checked targets cannot increase
output, fall below the requested endpoint, or skip a selected partition.
The untouched coordinates and caller's original memory vector remain unchanged.

## Width and source obligations

Canonical original certification bounds each reserve and total radius below
`2^160`, with `2<=n<=8`. A requested end numerator is compared with the
already bounded original output times `GRID=2^32` before use, so every proof
coordinate is below `2^192`. Reserve sums, `Knum` and seam terms are below
`2^195`. The existing fixed-domain moment comparisons remain below `2^457`,
within checked 512-bit arithmetic. No new squared value is truncated to 256
bits, and no new economic tolerance is introduced.

The theorem uses exact true sigma sums. Original directed contribution
rounding and GRID lifting enclose those same sums; the shared loop subtracts
the exact previously included upper contribution at each departure. This
maintains the existing conservative endpoint and branch inequalities.

## Evidence and limits

[slack-grid-release.md](../../test/evidence/slack-grid-release.md) records
tests-first results, source hashes and the independent finite corpus. Its
fractional one-sided seam fixtures distinguish an exact proof endpoint from
an extra floor that would change the selected partition. Named n2/n3/n8
`FrontierEndpoint.identifyInitial` roots connect from their actual starts to
their fractional certified highs in Solidity.

This closes that bounded initial-release connection capability. It does not
make `FrontierEndpoint` a whole-swap certificate: connecting the high to its
identified root uses that root bracket's separate domain and monotonicity
proof, and subsequent arcs still need their own event and path certificates.
No new raw payout, LP ownership transition policy, invariant reset, slack
budget, full mixed traversal, complete gas acceptance or reachable history
for every numerical fixture is established here.
