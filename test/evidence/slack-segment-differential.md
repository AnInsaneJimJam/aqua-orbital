# Independent slack-segment fixture evidence

The reference now has **12 named fixed-partition fixtures**: eight accepted and
four rejected. It also has **two accepted three-asset inward-seam witnesses**,
covering one and two fractional seams. All outcomes and explicit reconstructed
baskets are stable at 110 and 160 decimal digits in the stated checks.

This is bounded numerical evidence for the segment mathematics. It is not a
completed cross-language release campaign, a directed interval proof, or a claim
that these integer states have been reached by raw-token transactions.

## Independent computation

Generator: `packages/reference/fixtures_slack_segments.py`.
Tests: `packages/reference/tests/test_slack_certificate.py`.
Data and computation manifest: [slack-segment-differential.json](slack-segment-differential.json).
The finite-point argument is recorded in
[SLACK_SEGMENT.md](../../docs/audits/SLACK_SEGMENT.md).

The generator never imports or executes a Solidity solver. Canonical partitions
are found by enumerating candidate prefixes and applying the defining exact
rational key inequalities. Integer/rational moments locate the untouched-coordinate
mean and the possible maximum of the largest untouched transverse coordinate.
Their inclusion in a closed segment is decided exactly, including endpoints one
internal unit away from the critical point.

At every selected point the reference independently reconstructs **every tick**
using MATH-7. It checks that the reconstructed baskets sum to the actual integer
aggregate, and separately evaluates each tick's sphere, cap, virtual-principal,
and price-coordinate inequalities. It also checks `rho>=S`. It does not use the
production aggregate invariant test or the cancelled boundary-critical inequality
as a substitute for the per-tick calculations.

The point set comprises the two endpoints and any included analytic variance or
boundary-coordinate extremum. This is not dense sampling: the separate exact
finite-point theorem is the reason the point set is sufficient for each fixed
partition. The numerical evaluations remain conditional on precision and their
explicit tolerance; the theorem is not proved by these evaluations.

Values are normalized by the fixture's `scale=10^40` before numerical checks.
Squared residuals consequently have squared normalized-length units. The sign
tolerance is `10^(-precision+20)*max(1,totalNormalizedRadius^2)`. At 110 versus
160 digits, every compared metric and basket coordinate differs by less than
`10^-65` in these normalized units. This tolerance is offline numerical evidence;
it is not an allowed production reserve slack or an interval enclosure.

## Fixed-partition cases

Every fixed-partition fixture has independently valid canonical endpoints.

| Fixture | Result | Distinguishing assertion |
| --- | --- | --- |
| `all_interior_release` | Accept | Sphere branch including an equal-reserve endpoint |
| `mixed_boundary_release` | Accept | Actual integer rounding of per-tick supporting baskets at prices `(1,4,8)`, followed by a partial release |
| `variance_hole` | Reject | `rho<S` at the mean of untouched coordinates despite valid endpoints |
| `variance_safe_prefix` | Accept | The prefix of that same construction ending at a pair-reserve equality stays admissible |
| `boundary_peak_straddles_mean` | Reject | A reconstructed boundary coordinate exceeds its radius only at the hidden maximum |
| `boundary_peak_below_mean` | Reject | Both output endpoints are below the untouched mean; the same maximum must still be included |
| `two_asset_boundary_equality` | Accept | `D=H=0` and exact canonical boundary equality |
| `two_asset_partition_change` | Reject for scope | Lowering the endpoint by one internal unit changes partition; each endpoint remains feasible |
| `critical_at_lower_endpoint` | Accept | Critical point is exactly the lower bound |
| `critical_at_upper_endpoint` | Accept | Critical point is exactly the upper bound |
| `critical_one_unit_below_interval` | Accept | Critical point is outside by one internal unit |
| `critical_one_unit_above_interval` | Accept | Critical point is outside on the opposite side by one internal unit |

In the variance-hole fixture, the untouched mean is distinct from **every**
untouched reserve. Explicit reconstruction at output equal to the largest
untouched reserve passes, while reconstruction at the mean fails the sheet
condition. Thus the failure cannot be repaired merely by checking pair equality.

The boundary-maximum regressions have positive branch margins at their hidden
maximum and pass every other per-tick condition there. Their sole failure is
`boundary_price`. Conversely the variance-hole case fails only `branch` in this
finite-point check. The two conditions exercise distinct failure modes.

The near-critical fixtures use a boundary key with a positive price margin, so
they isolate exact critical-point inclusion rather than incidental endpoint
rejection. Their one-internal-unit changes need not correspond to a payable raw
token amount; they test the mathematical comparison, not public swap liveness.

## Three-asset inward seams

These additional fixtures provide two independently feasible one-sided
reconstructions at every crossed seam. They are separate from the fixed-partition
corpus; `analyze` still rejects a partition change. `analyze_inward` constructs
exact seam sums from keys and radii, splits the vertical interval at those sums,
and checks each side with its specified partition. The midpoint is used only to
select the exact open-segment partition, never as a feasibility sample.

Let `s=10^40`, `G=2^32`, and use
`X_start=(61s/10,6s,61s/10)` with output coordinate 2.

| Fixture | Ordinary `(key,radius)` entries | Full radius | Final output reserve |
| --- | --- | --- | --- |
| `three_asset_one_fractional_seam` | `(3*2^31,s/100+1)` | `10s` | `29s/10` |
| `three_asset_two_fractional_seams` | `(floor(7G/5),s/100+1)`, `(3*2^31,s/100+3)` | `10s` | `19s/10` |

Boundary counts are respectively `1 -> 0` and `2 -> 1 -> 0`. At least one seam
in each fixture is fractional in stored internal units; no rounding to a
convenient integer coordinate is used. The exact rational coordinates are
exported as numerator/denominator pairs in the JSON, while all starting reserve,
radius, key, and final-reserve inputs are portable integer strings. A full-range
key is exported as `2^64-1`.

Both sides preserve the same aggregate at each seam, and every per-tick
feasibility/price check passes at 110 and 160 digits. The individual baskets
**differ** across the seam in these slack states. The tests explicitly retain
that fact. These witnesses establish numerical geometric feasibility of the
named one-sided reconstructions; they do not silently establish a separate
ownership policy, an invariant-frontier equality, or raw-token reachability.

## Verification and provenance

From the repository root:

```powershell
python -m unittest discover -s packages/reference/tests -p test_slack_certificate.py -v
python packages/reference/fixtures_slack_segments.py
```

The final focused test run passed **11 tests**, zero failures, in 0.288 seconds.
The generator verified both precision levels and exported the complete fixture
set. Tests were added before their supporting functions: the initial nine
reported the explicit unimplemented-fixture errors, and the two inward tests
likewise failed before their implementation. These were scaffold failures, not
claimed successful behavioral counterexample discovery.

The exported JSON was successfully validated with the installed mathbox
computation-audit `scripts/validate_manifest.py`. All three recorded source
SHA256 values were independently recomputed and matched. The retained generated
artifact SHA256 is
`e51662e065fcb2e26a432ce939c766887003dbad94d42f9c7a9084c599b0b471`.
Its manifest records the dirty source state, commit, command, Python/mpmath
versions, UTC start time, runtime, bounds, and non-claims. Regeneration refreshes
run metadata and therefore may change the artifact checksum.

Several fixed cases correspond directly to named Solidity tests in
`SlackCertificate.t.sol`; the JSON also supplies new portable edge/seam inputs.
This task did not automatically call Solidity for every exported fixture. A
full differential campaign must execute all applicable fixtures against the
corresponding contract entry point, retain any conservative rejection separately
from false acceptance, and expand the accepted corpus without weakening the
mathematical conditions.
