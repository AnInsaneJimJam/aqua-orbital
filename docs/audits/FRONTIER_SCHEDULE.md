# Both-root frontier schedule certificate

2026-09-08. **Primary verdict: conditional on the identified-root and physical
certificates supplied by `FrontierEvents`, validated immutable metadata, and
the endpoint provenance specified below.** The conservative component is now
implemented in `FrontierSchedule.sol`, with a same-call ideal-prefix walk.
[Implementation and finite evidence](../../test/evidence/frontier-schedule.md)
record 15 Solidity and 7 independent reference checks. This remains a scheduling
certificate, not a full traversal proof.

## 1. Claim and fixed frame

For a validated strategy with `2<=n<=8`, at most eight positive-radius ticks,
ordinary keys strictly sorted before the unique full-range sentinel, use:

- the original actual integer geometric reserves `X0`, including their slack;
- the unchanged input/output indices `(i,j)` and untouched coordinates;
- one exact positive normalized **net** input `d` in original internal units;
- the immutable radii, keys, and authenticated coefficient/virtual contributions.

Let `G=2^32` and `D=d*G`. Every event uses the original frame
`inputProgress=(a-X0_i)*G`, `outputProgress=(X0_j-z)*G`. Never restart this frame
at an event, replace `X0` by an ideal point, subtract a rounded event input from
`d`, or round an event payout into an authoritative balance. Initial slack
release has input progress zero and remains a separate operation.

The proposed successful result certifies a complete, strictly ordered list of
the identified physical ordinary-key crossings in `0<inputProgress<D`, while
certifying that no unresolved key root can meet either endpoint of that closed
input range. Each other separated root is definitely outside `[0,D]`; each
other key is either `NoRoots` or an exactly located touch outside `[0,D]`.

This conclusion does not say the listed points are connected by the intended
economic path. Endpoint connection, segment and turn certificates, canonical
seams, final rounding, fees and settlement remain additional obligations.

## 2. Minimal useful API

One bounded pure function is sufficient for the first component:

```text
enumerate(X0, ticks, input, output, netInputInternal,
          initialIdealPrefix, finalIdealPrefix, remainingCrossings)
    -> Result { status, events, remainingCrossings }

Event { keyIndex, key, FrontierEvents.Candidate enclosure }
status in { OrderingCertified, Uncertain, CrossingLimit, InconsistentPrefixes }
```

Below, Ready means the implemented `OrderingCertified`; TransitionBudgetExceeded
means `CrossingLimit`. More specific diagnostic reasons are possible future
additions, not current API fields. A non-Ready result never authorizes consuming
its partially assembled list. Invalid metadata, pair, zero input, input capacity,
or a transition allowance above 16 should produce explicit argument errors.

Validate `M.certify(X0,ticks)` and the same coefficient-provenance requirement
as the existing helpers. Before lifting `d`, require
`X0_i<=sum(r_t)` and `d<=sum(r_t)-X0_i`. This bounds `D<2^192` and prevents
overflow before multiplication. This API receives already normalized net
input; it does not infer decimals, fees, gross input, or a wallet amount.

There are at most `2*(ticks.length-1)<=14` separated candidates. A fixed
14-element work array, a counted output prefix, and bounded insertion sorting
are sufficient. Never enumerate the sentinel. Return a success only after all
ordinary keys have been classified and all order checks have passed.

`remainingCrossings` is the caller's remaining allowance under the 16-transition
cap, after any already certified initial-release seams or departures. Reserve
one transition for each scheduled separated crossing. If the list needs more,
return `TransitionBudgetExceeded`; do not return a truncated Ready schedule.
An empty Ready schedule is allowed with zero remaining transitions. This pure
helper cannot enforce that callers preserve the allowance across calls.

This counter is not the shared 160-evaluation root-refinement budget. Enumeration
does not call `RootBracket.refine` or claim to consume that budget. Its fixed
work and repeated `atKey` validation still require gas measurement.

## 3. Classify root status before reading candidate fields

Call `FrontierEvents.atKey(X0,ticks,i,j,k)` for every ordinary index `k`.

| `atKey` status | Safe first-component treatment |
| --- | --- |
| `NoRoots` | Discard the key: the upper discriminant is strictly negative. |
| `Uncertain` | Return Uncertain. Candidate fields are not certified bounds and cannot be used to discard this key. |
| `Touch` | Apply the exact doubled-position filter below; otherwise return Uncertain/TouchUnresolved. |
| `Separated` | Independently classify both candidates using section 4. |

In particular, default zero-valued candidates from an Uncertain or Touch result
are not zero-input events. `physical=false` is not an infeasibility witness.
Neither paying less nor applying a numerical tolerance repairs a missing event
certificate.

For a Touch, the event discriminant is exactly zero: both traded reserves equal
`(sumNumerator-G*sumUntouched)/2`. Define the signed exact integer

```text
touchInputTimesTwo = sumNumerator - G*sumUntouched - 2*G*X0_i.
```

Discard the touch only if `touchInputTimesTwo<0` or
`touchInputTimesTwo>2*D`. This comparison also works for a half-GRID event
coordinate and requires no signed division or arbitrary rounding. Otherwise
return Uncertain, including exact equality with either endpoint. The current
Touch result has no physical certificate. Even a physical touch is not two
transitions and must not be converted into inward/outward crossing records.
The doubled position and its intermediate sums remain well inside int256
under the existing event range bounds.

This touch filter is not applicable to Uncertain: a zero-containing
discriminant interval does not establish an exact equal-reserve point.

## 4. Candidate range and physicality rules

For each certified separated candidate `[inputLo,inputHi]`, use signed
comparisons in this order:

1. If `inputHi<0`, discard it as definitely before the initial fixed-input
   frontier problem.
2. If `inputLo>D`, discard it as definitely after the requested final input.
3. If `inputLo<=0` or `inputHi>=D`, return Uncertain/BoundaryOverlap.
4. Otherwise the root lies strictly inside the interval. Require
   `physical=true`, or return Uncertain/PhysicalUncertified. Retain the whole
   enclosure, key index, key and direction flag.

The first two exclusions remain valid even when `physical=false`: any exact
root inside the supplied enclosure is outside the requested input range.
They use strict inequalities. `inputHi==0`, `inputLo==D`, an exact `[0,0]`
root, an exact `[D,D]` root, and intervals crossing either limit are deliberately
unresolved in this first component.

Do not use `outputHi<0`, the canonical prefix of actual `X0`, a failed
membership check, or an approximate root midpoint as an additional exclusion
rule. The minimal schedule does not need them. Output progress includes any
initial slack release; it is not a segment-local payout.

This intentionally restricted boundary policy avoids falsely dropping a
zero-distance inward departure or persisting the wrong equality owner at the
final input. A future boundary extension needs authenticated exact equality,
one-sided departure/arrival rules, and transition accounting. Mere overlap of
an event enclosure and an endpoint root interval is not an equality proof.

## 5. Strict ordering, without midpoint choices

Sorting by `inputLo` may propose an order. Before declaring Ready, check every
adjacent pair `previous,next` using the complete signed enclosures:

```text
previous.inputHi  < next.inputLo
previous.outputHi < next.outputLo
```

The second inequality is about cumulative released output, so its direction
is the same as input progress. Touching or overlapping intervals, including
equal integer enclosure endpoints, remain unresolved. Do not break ties by
key, direction, midpoint, token rounding, or an assumed path. Checking adjacent
ordered intervals suffices by transitivity; no unbounded search is needed.

The required inequalities are conservative sufficient certificates, not a
theorem that the present precision resolves every mathematically distinct
event. A future refinement mechanism must preserve the same exact root
identity and original frame, with explicit work accounting.

Direction comes from the separated-root identity: inward has `a-z<0`, outward
has `a-z>0`. Along increasing input and released output,

```text
(a-z)*G = (X0_i-X0_j)*G + inputProgress + outputProgress
```

strictly increases. Thus every retained inward event must precede every
retained outward event. Reject an outward-then-inward sequence as inconsistent;
do not reinterpret the flags. This consistency check does not locate a turn or
prove the intervening segments are admissible.

## 6. Same-call prefix walk

The implementation additionally checks `initialIdealPrefix` and
`finalIdealPrefix` against the list it just enumerated. Both prefixes must come from
authenticated exact-frontier endpoint identities for this same original frame,
pair, tick set and input. They must not come solely from the rounded actual
starting state's classification, which can change during initial slack release.

For an event at ordinary index `k`, walk the boundary-count state `c` as follows:

| Direction | Required incoming count | Outgoing count |
| --- | ---: | ---: |
| Inward | `k+1` | `k` |
| Outward | `k` | `k+1` |

These checks prevent jumping a key, changing a nonadjacent prefix, or consuming
the same direction twice. Require `0<=c<ticks.length` throughout and require
the final walked count to equal `finalIdealPrefix`. A mismatch fails this
certificate; it is not permission to modify the endpoint prefix or invariant.

At the exact crossing itself canonical equality belongs to `k+1`. The inward
arc departs on side `k`, while an outward arc departs on side `k+1`. This table
selects segment sides; it does not overwrite the boundary-owned equality point.
The two exact-frontier reconstructions coincide there, as proved in MATH-6 and
FRONTIER_EVENTS. This fact is not a permission to reclassify a rounded slack
state without the separate one-sided checks.

An empty schedule with equal initial/final prefixes proves only bookkeeping
consistency. It still needs a same-side segment or a valid FrontierTurn
certificate. The retained mixed two-token counterexample has equal endpoint
prefixes but two genuine crossings, so comparing prefixes alone is insufficient.

If this check accepts caller-supplied arrays, its provenance precondition must
be explicit. Replaying a forged, omitted, or differently framed event array is
not a certified schedule. Prefer consuming the result internally in the same
call that enumerated it; no public witness acceptance is needed for this stage.

## 7. What the eventual traversal must add

The implemented enumeration API receives prefix counts, not initial/final root identities.
Consequently it cannot bind cumulative output to either endpoint or certify
their connection. The composition layer must additionally establish:

1. Certified GRID initial release from actual `X0` to the identified `d=0`
   frontier, including every slack seam and its transition count.
2. Initial and final root identities in the same fixed frame. Their output
   progress intervals are `[X0_j*G-root.hi, X0_j*G-root.lo]`.
3. Strict output ordering between those endpoint identities and the first/last
   scheduled event, or a separately authenticated equality rule. Interval
   overlap is unresolved, just as for the event-event comparisons.
4. A FRONTIER_SEGMENT certificate for every intervening exact arc, with the
   intended one-sided prefix and all endpoint hypotheses. An inward-to-outward
   arc in a mixed prefix requires the lower-key FrontierTurn comparison.
5. Final endpoint/raw-payout certification, canonical rounding/repartition
   handling, the output minimum, shared work/transition limits, and settlement.

Even a complete enumeration is not a continuous path proof. In particular,
`physical=true` certifies its exact event point; it does not prove the next
event is connected to that point without crossing an inadmissible branch.

## 8. Independent regression plan

This matrix identifies checks and remaining extensions; only the cases recorded
in the linked evidence are claimed as passing. Keep independent
root values from explicit per-tick support at 110/160 digits; do not generate
expected schedule order by copying the production discriminant or sorting the
production candidate list.

| Fixture / obligation | Expected scheduling assertion |
| --- | --- |
| Existing n2 radius-1 key-`5/8` plus radius-1 sentinel, prices `(2,1)` to `(1,2)` | Both roots retained in inward/outward order; prefix `1 -> 0 -> 1`, despite equal endpoint prefixes. |
| Existing integer start and independent event goldens in `FrontierEvents.t.sol`, `SCALE=1e40`; use `d=SCALE` | Retain both strict-interior events, preserving original signed input/output enclosures. |
| Same integer start; use `d=SCALE/100` and `d=SCALE/10` | Respectively no event, then only the inward event; next root is definitely after the final input. |
| Existing behind-start n2 fixture `(1.04*SCALE,0.25*SCALE)` | Both negative-progress roots discarded; neither signed input nor output is narrowed to unsigned. |
| Existing n3 negative-discriminant fixture | NoRoots is safely discarded, including an empty Ready schedule. |
| Existing near-tangent n3 fixture | Uncertain remains unresolved; default candidate zeros are not interpreted as exclusions or touches. |
| Existing n3 real-but-unphysical event fixture `(1.89,1.89,0.1)*SCALE`, ordinary `floor(1.8*G)` plus sentinel, each radius SCALE; `d=0.01*SCALE` | Both unphysical roots are outside the allowed input interval and can be discarded using their input bounds. |
| Same n3 ticks, new start `(1.38,1.99,0.1)*SCALE`, `d=0.01*SCALE` | An in-range root with `physical=false` blocks Ready; see the independent geometric check below. |
| Exact touch position helper, positive/negative odd doubled numerators | Correct strict range decisions without signed division; in-range/boundary touch unresolved. This is a filter unit test, not fabricated `atKey` evidence. |
| Event interval around zero, around exact final `D`, and exact endpoint equality | All return BoundaryOverlap; equality never silently vanishes. |
| Two root enclosures whose midpoints sort but input intervals overlap | OrderUnresolved; no midpoint/key tie-break. |
| Disjoint input intervals with overlapping/reversed cumulative output intervals | OrderUnresolved even when input sorting succeeds. |
| Outward then inward, missing intermediate key, duplicated direction, or mismatched endpoint prefix | Prefix/orientation consistency fails. Label constructed arrays as checker tests, not genuine geometric events. |
| Allowance 0, exactly needed, one less than needed, and invalid 17 | Empty-only acceptance, exact consumption, budget failure, and typed invalid argument respectively. |
| 7 ordinary keys plus sentinel / wide existing n2 and n8 states | At most 14 candidates, checked ranges and bounded work; no onchain support above n8/ticks8 claim. |
| Original rounded start differs from its ideal zero-input frontier prefix | Enumeration still uses original coordinates; prefix walk uses authenticated ideal prefix, while initial seams consume their own allowance. |

Boundary/order checker tests may use explicitly synthetic interval records to
exercise exact inequalities. At least the successful two-root schedule and
real uncertain/physical cases must use the actual `FrontierEvents` source and
independent per-tick fixtures. Do not label mutated arbitrary JSON or structs as
independent geometric oracle evidence.

The proposed in-range unphysical fixture has an elementary per-tick check.
In units of SCALE its initial basket for each radius-1 tick is
`(0.69,0.995,0.05)`: squared distance from `(1,1,1)` is `0.998625<1`,
sum is `1.735<b`, and every coordinate is below 1. Thus the original aggregate
is an ordinary all-interior physical state. At the key, both tick baskets are
one half of the aggregate. The all-interior sphere and exact cap sum give

```text
A=2*b, B=8*b-8, a+z=2*b-0.1,
(a-z)^2 = 2*(B-0.01)-(2*b-0.1)^2.
```

For the actual key `b=7730941132/2^32`, these exact rational comparisons put
the inward event at `1.38<a<1.39` and `z>2`. Its input progress therefore lies
inside the requested `0.01` interval, but each reconstructed output basket has
`z/2>1` and fails the required price branch. A 110-digit Decimal evaluation of
these independent sphere/cap identities gives input progress
`0.0059945054776365656595...` and output reserve `2.1140054941498344044943...`.
These are a fixture-design check, not observed Solidity results or a
110/160-digit stable oracle campaign. The scheduler must retain uncertainty
here even though this particular example's exact branch violation is known:
its current input is only the non-excluding `physical=false` flag.

## 9. Audit dependencies and status

Dependency graph: immutable exact keys/coefficients and actual baseline ->
FrontierEvents discriminant identities/enclosures -> strict signed interval
exclusion or retained root identity -> physical endpoint certificates -> strict
input/output order -> adjacent prefix bookkeeping. Initial connection and
continuous segment/turn proofs are separate downstream inputs, so the schedule
does not assume a path in order to claim it has proved one.

| Obligation | Scoped verdict |
| --- | --- |
| At most two intersections at each ordinary key | Conditional on the existing FRONTIER_EVENTS proof/source contract |
| Safe exclusions outside the closed requested input range | Passed by exact enclosure comparisons |
| Exact doubled-location Touch filter | Passed from `delta=0` and the exact pair sum |
| Treating physical=false or unresolved discriminant as exclusion | Failed shortcut; explicitly prohibited |
| Strict accepted ordering and direction consistency | Passed under retained root identities and required comparisons |
| Prefix state changes at exact separated crossings | Passed as adjacency/bookkeeping, conditional on authenticated endpoint prefixes |
| New scheduler implementation and independent regression campaign | Not started by this proposal |
| Boundary equality/touch execution policy, complete path, liveness and gas | Not addressed by the first component |

Sources inspected: [FRONTIER_EVENTS](FRONTIER_EVENTS.md),
[FRONTIER_SEGMENT](FRONTIER_SEGMENT.md),
[ENDPOINT_IDENTIFICATION](ENDPOINT_IDENTIFICATION.md), MATH-6/MATH-10,
`FrontierEvents.sol`, its existing Solidity tests and the explicit-support
reference tests `test_events.py` and `test_frontier_segment.py`. No new external
theorem or numerical optimizer is an unchecked proof leaf in these filtering
rules. Existing test results belong to their original evidence; this read-only
proposal ran no Forge or reference campaign.

The strongest safe next claim is a bounded complete schedule under the strict
interior-event policy, followed by an independent prefix check. The cheapest
next implementation check is the retained n2 two-crossing regression: it must
return both ordered events and walk `1 -> 0 -> 1` before connecting any segment
or authorizing a trade.
