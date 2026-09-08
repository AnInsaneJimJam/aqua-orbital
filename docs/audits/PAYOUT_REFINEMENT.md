# Payout-targeted refinement and authenticated continuation

This is a bounded optimization of the existing endpoint/path certificates, not
a replacement root theorem or a completed full-engine acceptance claim. The
underlying hypotheses remain [ROOT_CERTIFICATE](ROOT_CERTIFICATE.md),
[SLACK_SEGMENT](SLACK_SEGMENT.md), [FRONTIER_COMPOSITION](FRONTIER_COMPOSITION.md),
and NUM-8 through NUM-14. In particular, prepared geometry retains original-unit
directed contributions before GRID lifting; this change introduces no rounding
tolerance, coefficient approximation, or altered partition semantics.

Let `G=2^32`, `O=X_output*G`, and `Q=q*G`, where `q` is the original internal
length of one raw output token unit, derived from immutable decimals. The
unchanged whole-domain, strict high output-price, original-radical sign and
critical-point certificates identify a unique ideal root `z` in `[lo,hi]`.
Define

```
r = floor((O-hi)/Q)
A = O-r*Q.
```

The new method can stop when `r>0` and `A-lo <= Q`. Exact arithmetic gives
`A>=hi>=z>=lo`, hence `0<=A-z<=A-lo<=Q`. It also gives
`r*Q<=O-hi<=O-z`, so the payout never exceeds the ideal output. The endpoint's
existing bound `ceil((A-lo)/G)<=q` follows exactly, including equality. This is
the NUM-9 one-raw-unit allowance. If the exact ideal output is on the next raw
boundary, `r` can be one unit below that floor with shortfall exactly `q`.
Neither strict `<Q` nor uniqueness of the raw floor is required by that rule.
Testing width alone would be unsound: `[3.75G,4.5G]`, `O=6G`, `Q=G` has width
`.75G` but pays one unit and leaves the upper shortfall bound `1.25G`.

`RootBracket.refineForPayout` shares the ordinary method's entire domain/sign
setup and midpoint update. Exact two-sided endpoint/midpoint zeros keep their
existing `Exact` status. The appended `PayoutBounded` status identifies the
financial stopping criterion and does not claim GRID adjacency. Uncertain
residuals retain the existing outward enclosure; every performed midpoint is
charged, including an uncertain one. Ordinary `refine` disables the financial
criterion before any origin arithmetic and retains its behavior.

The direct helper checks `0<Q<2^256`, `0<=hi<=O<2^192` and positive `q`.
`r*Q<=O-hi` bounds its multiplication despite using 256-bit arithmetic. The
retained-reserve and gap subtractions are nonnegative. Production endpoint
callers additionally bind `q=10^(18-decimals_output)*2^64`, with decimals in
`0..18`, and certify original coordinates before lifting. Existing 512-bit
geometry arithmetic and bounds are unchanged.

`FrontierEndpoint.exactInputForPayout` uses this stop but executes the same
financial finalization as ordinary `exactInput`: one raw floor, exact original
reserves, bounded total shortfall, canonical-prefix equality, original
`M.certify`, selected-prefix GRID membership, and the entire extended retention
domain down to the root's low bound. `PayoutBounded` alone authorizes none of
these facts and establishes no event/path identity.

`resumeExactInput` accepts only original reserves, immutable ticks/decimals,
the pair and raw net input, selected prefix, proposed `lo/hi`, and remaining
budget. It rechecks original membership and metadata; reconstructs exact fixed
input coordinates and the prepared prefix; checks `lo<=hi<=O`; and calls the
ordinary root method on that retained proposal. Thus both signs, all endpoint
domains, strict output price and hidden-domain extrema are checked again. It
trusts no prior context or validation flag and imports no earlier-phase path
proof. Every finalization check runs again. This pure endpoint helper cannot
enforce budgets across unrelated calls: its caller must carry remaining work.

`FrontierComposition` retains its zero-budget initial and final-prefix discovery,
original-frame GRID release, physical event schedule and crossing allowance.
The chosen-prefix solve starts with the shared 160 midpoint budget. If its
fully checked endpoint and all arc/order checks succeed, composition ends.
Otherwise, an identified bracket with width greater than one and remaining
work gets at most one ordinary continuation from its retained bounds. The
continuation receives only `first.remaining`, never a restarted broad seed.
The final endpoint and the complete arc/order proof run again before success.

The result keeps `firstSolveUsed` and `resumeUsed`; aggregate work is their sum
and the final remaining value belongs to the last phase. The nested endpoint's
`used` is phase-local. Since each root method returns `used+remaining=budget`,
the outer identity is exactly `firstUsed+resumeUsed+remaining=160`. Initial
release and event crossing counts are unaffected. Only the outer
`FrontierPathCertified` status authorizes the nested payout. An uncertain or
repartitioned final result cannot inherit an earlier endpoint's authorization.

This optimization does not alter the proof of final retention (NUM-11 through
NUM-14), supply a monotone clipped raw-reserve path, repair seed-discovery holes,
resolve exact event/zero-price deferrals, or establish supported-range liveness
and full-transaction gas acceptance. The named tests and measured performance
are recorded in [payout-refinement evidence](../../test/evidence/payout-refinement.md).
