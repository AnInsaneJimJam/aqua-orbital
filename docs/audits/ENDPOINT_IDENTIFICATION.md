# Endpoint identification and scoped implementation

2026-09-08. **Primary verdict: conditional on a certified bracket and the
separate connection checks below.** `RootBracket` proves exact-root identity;
the new `FrontierEndpoint` binds it to actual reserves, a deterministic first
bracket proposal and one final raw payout. The broader discovery/connection
steps remain proposals. This does not close the mixed-engine proof. Results
and source provenance are in [endpoint evidence](../../test/evidence/frontier-endpoint.md).

Dependencies are [ROOT_CERTIFICATE](ROOT_CERTIFICATE.md),
[SLACK_SEGMENT](SLACK_SEGMENT.md), [SLACK_SEAM](SLACK_SEAM.md) and
[FRONTIER_SEGMENT](FRONTIER_SEGMENT.md), checked against the current
`CurveEvaluation`, `RootBracket`, `SlackCertificate`, `DualCertificate` and
`FrontierEvents/Turn` sources. No new result is attributed to the paper.

## 1. Exact problem and the identity already supplied by RootBracket

Keep one original integer baseline `X0`, the input/output pair `(i,j)`, and
unchanged immutable radii, keys, virtual contributions and token decimals.
Normalize raw **net** input exactly to `d=rawNetInput*10^(18-decimals_i)*2^64`,
checking metadata, range and input capacity before multiplication or GRID
lifting. Fix every coordinate other than output, with `X_i=X0_i+d`.
The initial release is the separate fixed-input problem `d=0`.

For a specified prefix, create `ctx=C.prepare(...)`. Let `G=2^32`; all bracket
coordinates use GRID numerators. A `RootBracket` result with `certified=true`
establishes a unique exact root `z* in [lo,hi]` of the **original** radical:

1. Both endpoints and the entire interval satisfy the fixed-partition domain,
   including the sheet, all prices and the hidden boundary-coordinate maximum.
2. Its high output price is strictly positive. Therefore the original radical
   decreases strictly with output reserve throughout the interval.
3. The low radical lower bound is nonnegative; the high upper bound is
   nonpositive. Continuity establishes existence, and monotonicity uniqueness.

This remains an identity certificate when refinement ends `Uncertain` or
`BudgetExhausted`; those statuses describe unresolved width/sign precision.
An uncertified bracket establishes neither a root nor global infeasibility.
An endpoint with just one zero interval bound is not an exact root.

At the identified root, `||g||=R`, `g>=0`, `g_j>0`, and
`sum(g)/R=n-h`. MATH-7 baskets therefore are the per-tick support minimizers
for that same exact price vector, including equality-side limits. Their sum
attains total support cost. The support inequality proves that no feasible
fixed-input endpoint in any partition has a smaller output reserve. This is
global **endpoint optimality**, not connected reachability from `X0`.

An identity record should retain the fixed-input problem/provenance, selected
prefix, output interval and remaining shared work budget. Its input coordinate
is exact; the input-minus-output reserve difference used for inward/outward direction is the interval
`[X_i*G-hi, X_i*G-lo]`. A zero-containing direction interval is not an inward
or outward classification. There is no reason to store an approximate root
as if it were an actual paid/reserved integer balance.

## 2. Deterministic first bracket proposal

The implementation accepts an explicitly selected prefix and tries
`zH=X0_j*G`, clipped to its exact upper partition window, with the final input
already applied. This point is only
a proposal: adding all input with zero output need not remain in the required
domain. Require `C.certifiesMembership(high)` and a strict positive output
normal lower bound before using it as a feasible high endpoint. If it fails,
return `Uncertain`/`NeedsFeasibleHigh`; do not exclude the trade or partition.

For a certified high, let `gamma>0` be its output-normal lower bound and
`deltaHi=-high.residual.lo`, in GRID length and squared-length units. The
fixed-domain derivative theorem gives, for output release `y`,

\[
F(z_H-y)-F(z_H)\ge 2\gamma y+y^2/n.
\]

Thus the deterministic proposal

\[
y_{seed}=\lceil\sqrt{n^2\gamma^2+n\delta_{Hi}}\rceil-n\gamma
\]

is a conservative root-distance bound **if the entire proposed vertical
domain is certified**. This uses exact wide products and a directed root,
not a small-residual stopping tolerance or division by a small normal.
No proof of root existence is used to derive the displayed inequality.

Find the exact lower window endpoint using signed comparisons before clipping:
the maximum of `V*G` and, for a mixed prefix,
`ctx.axial+(ctx.radius/G)*outerKey-fixedSumN`. Its upper key is similarly
affine; with only the sentinel remaining, an exact positive-price frontier
has `h<=n-1`. Bounds must also respect original coordinate capacity and
`z<=X0_j*G`. Intersecting those necessary conditions excludes only points
outside that specified window, not an entire swap.

Try `zL=max(windowLow,zH-ySeed)` without unsigned underflow. Clipping changes
the proposal only; it does **not** preserve the analytic lower-sign proof.
The implementation calls ordinary `RootBracket.refine`
on this proposal, thereby rechecking both signs and the full domain. It must
not treat a failed lower endpoint as globally outside or silently increase
economic tolerance. Retain the caller's remaining budget, initially at most
160, across all attempted roots and later refinements.

If an analytic seed proof is later consumed directly instead of rechecking
the low radical sign, that is a separately audited RootBracket API change.
It must first certify the whole domain and the exact inequality
`2*n*gamma*y+y*y >= n*deltaHi`. No existing source change is required for the
first coupler.

The first proposal executes the named n2/n3/n8 mixed fixtures and a six-decimal
input/output variant, verified against independent explicit-support roots.
It is not a theorem that this single feasible-high choice works for every
valid input or a claim of reachable prior raw-token history for every fixture.

## 3. One final raw payout and length-valued slack

For an identified final root, put `q=10^(18-decimals_j)*2^64` and choose

```text
rawOut = floor((X0_j*G-root.hi)/(q*G))
Xactual_j = X0_j-rawOut*q
shortfallUpper = ceil((Xactual_j*G-root.lo)/G).
```

Require positive raw output for the final public trade, its requested minimum
in the existing caller, and `shortfallUpper<=q`. Root width below `q*G` alone
does not imply this bound: final token flooring can add nearly one more raw
unit. If the comparison fails, refine within the shared budget or return
`Uncertain`; do not call the result complete after spending 160 steps.
All initial release and intermediate fractional outputs are already included
in `X0_j-z*`, so this formula applies the raw floor only once.

The actual rounded endpoint can be above `root.hi`. Re-run canonical
`M.certify` on the actual original integers; for the minimal implementation,
require its canonical prefix to equal the identified root's selected prefix.
Return `RequiresRepartition` otherwise, including a rounding-created key
arrival. That status does not assert the ideal root crossed the key. Extend
the fixed vertical **domain** certificate through `Xactual_j*G`, using full
endpoint checks plus `SlackCertificate.criticalPoints`, not just the old
bracket. A nonnegative output price at the actual rounded high is sufficient
for that extension; the identified root already has a strict output price.

In the same partition, the length shortfall also bounds radial slack. Let
`v=1/sqrt(n)*1`, `P=I-vv^T`, and

\[
T(X)=((A-K-nR)/\sqrt n,\;\|PX\|-S).
\]

For any two points, reverse triangle and orthogonality give

\[
\|T(X)-T(Y)\|^2\le(v\cdot(X-Y))^2+\|P(X-Y)\|^2=\|X-Y\|^2.
\]

At the identified root `||T||=R`; at the certified actual endpoint `||T||<=R`.
They differ only in output, so
`0<=R-sqrt(F(Xactual))<=Xactual_j-z*<=shortfallUpper<=q`.
Both sides use the same exact true `S`, enclosed by the original contribution
bounds. No stored contribution is recomputed and no invariant is reset.
This proof does not extend unchanged to a different rounded partition.

`DualCertificate` remains an independent optional output/exclusion witness:
exact integer prices select their own per-tick support branches. A false
dual quantum check is uncertainty about that witness; a true exclusion needs
its explicit `dotCost<supportLower` inequality. No approximate price vector
is needed for the root-interval shortfall proof above.

## 4. Initial release and later event composition

An initial `d=0` identity can connect to actual `X0` by two pieces. First,
certify release from `X0` to the feasible `root.hi/G`, splitting exact affine
key planes in descending order and checking both sides of every seam. Then
the RootBracket domain/monotonicity proof certifies the remaining release
from `root.hi/G` to the exact root. The existing SlackCertificate public
routine accepts original integer endpoints; `root.hi/G` need not be one.
A GRID-endpoint extension is therefore required before claiming this full
connection. It must preserve original S/V contributions and canonical
equality ownership exactly as the existing seam proof requires.

A concrete descending search from any certified feasible high can try the
next exact lower seam or the principal floor. If a lower endpoint and the
whole domain certify the opposite radical sign, a bracket is obtained. If
they certify membership, the entire segment is feasible and the high can
advance there. A seam departure additionally certifies its other side. If
either sign/domain is unresolved, probe halfway back toward the current
certified high without moving that high. Every probe consumes shared work;
failure or a collapsed probe returns an explicit uncertifiable result.
This is a safe discovery procedure, not a proof of universal convergence.

For later traversal, enumerate both roots at every ordinary key using the
same original `X0` frame: untouched reserves never change, so event inputs
remain absolute progress relative to `X0_i`. This avoids accumulating rounded
fractional event input/output as authoritative balances. Keep event intervals
and initial/final root identities distinct. An event definitely behind zero
or after exact `d` can be ordered by interval comparisons; an overlap is not
an ordering certificate. `physical=false` can include numerical uncertainty
and cannot by itself discard a potentially required event.

Between consecutive identified roots/events, FRONTIER_SEGMENT supplies the
same-side arc proof; an inward-to-outward segment uses FrontierTurn at the
largest boundary. Both direction/order and partition-side endpoint identities
are required. Global enumeration alone does not establish connectedness.

## 5. Implemented component and remaining obligations

`FrontierEndpoint.exactInput` now implements pure actual-state/input binding,
deterministic seed proposal, ordinary RootBracket identity, one final raw
floor, same-partition extended domain and original integer endpoint/slack
checks. It retains an identified root in the result even if payout precision
is insufficient. `EndpointCertified` explicitly does not authorize a path or
settlement. `identifyInitial` returns only zero-input root identity; initial
release connection remains separate. Fourteen new Solidity tests cover the
named independent n2/n3/n8 mixed roots, nonzero input, mixed decimals, actual
start slack, uncertainty, invalid metadata/capacity, shared exhausted budget,
rounding-created repartition and an eight-token total radius near `2^160`.
Five Python tests reproduce the four raw-output/root/shortfall goldens at
110/160 digits and check explicit supporting and rounded MATH-7 baskets.

| Obligation | Current scoped status |
| --- | --- |
| Exact frontier identity from certified RootBracket | Passed under its domain/sign hypotheses |
| Global ideal endpoint optimum from its exact normal | Passed by the existing support proof |
| Strong-convexity seed implication | Passed only after whole proposed-domain certification |
| One-raw shortfall and same-partition radial bound | Implemented; proof above and scoped tests passed |
| A feasible high/root bracket for every supported input | Not established; first proposal may return uncertainty |
| Initial release to a noninteger GRID root high | Needs GRID endpoint extension and composition tests |
| Arbitrary zero-output-normal initial frontier | Deferred to a separately proved one-sided rule |
| Event ordering, both-root path composition and transition cap | Separate engine component |
| Rounded endpoint with another canonical prefix | Explicitly deferred by the minimal coupler |
| Full mixed execution, cycle campaigns and complete gas gate | Not established by endpoint identification |

The initial read-only design review was followed by the explicitly authorized
new helper/tests/reference implementation. Existing root and math helpers were
not changed. The full focused run passed 47 tests (14 endpoint, 19 root bracket,
14 slack); its computation scope, hashes and gas limitations are recorded in
the linked evidence. Those finite checks support the implementation and named
liveness assertions, not the unresolved whole-engine obligations in the table.
