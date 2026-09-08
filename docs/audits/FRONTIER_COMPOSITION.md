# Compose identified frontiers into one certified path

Status: bounded design followed by explicitly authorized tests-first helper
implementation, 2026-09-08. **No router integration or supported-range engine
acceptance is claimed by this note.** It reviews the current
`FrontierEndpoint`, `SlackCertificate`, `FrontierSchedule`, `FrontierEvents`,
`FrontierTurn`, `RootBracket` and `CurveEvaluation` interfaces against
[FRONTIER_SEGMENT](FRONTIER_SEGMENT.md), [GRID_RELEASE](GRID_RELEASE.md), and
[ENDPOINT_IDENTIFICATION](ENDPOINT_IDENTIFICATION.md).

`FrontierComposition` is one closed-input math certificate. It regenerates every witness
from actual reserves and immutable strategy metadata, then joins the existing
initial release, ideal frontier arcs and one final retention interval. It
accepts no caller-provided root bracket, event array, curve context or physical
flag. The implementation remains separate from the router and settlement.

The authorized visibility-only promotion uses public pure compiler-linked
Composition and Endpoint library entries. It preserves this argument and all
original-frame inputs; it does not expose a caller-supplied proof authorization
path. See [linked-math promotion evidence](../../test/evidence/linked-math-promotion.md).

## 1. Proposed API and meaning

```text
certify(actualX, validatedTicks, immutableDecimals, input, output, rawNetInput,
        maxCrossings)
    -> Result {
        status: Uncertain | UncertifiedStart | RequiresRepartition |
                TransitionLimit | FrontierPathCertified,
        endpoint: FrontierEndpoint.Result,
        initial: FrontierEndpoint.Identity,
        transitions: [{key, inward, initialRelease}],
        releaseCrossings, frontierCrossings,
        refinementUsed, refinementRemaining, crossingRemaining,
        firstSolveUsed, resumeUsed, resumeAttempted
    }
```

Invalid dimensions, metadata, pair or nonpositive/over-capacity input are
explicit input errors. Only `FrontierPathCertified` authorizes its proposed
mathematical payout. This remains a net-input math component: fees, minimum
output, token custody and atomic settlement are separate caller obligations.
The nested endpoint retains actual reserve integers, normalized net input,
output quantum, raw payout, final prefix, root identity and length-valued
shortfall. Ordered transitions place initial inward release keys before the
later frontier keys and preserve both directions. The existing bound of eight
tokens/eight ticks is retained, as are 160 shared midpoint evaluations and
the caller's `maxCrossings<=16` total counted transitions. A failure or deferred
case does not redefine the release's required supported range.

The API validates original `X`, metadata and raw input before lifting, using
the same exact quantum `10^(18-decimals)*2^64` and pre-multiplication capacity
bound as `FrontierEndpoint`. Its budget ledger starts at 160 and maxCrossings;
there is no public witness or per-segment budget reset. Tick coefficients
must retain activation provenance, even where `CurveEvaluation.prepare`
independently regenerates geometry. No identity data or fee balances enter X.

## 2. Bounded witness discovery

1. Compute the original canonical prefix by exact key comparisons after
   original `M.certify`. Try `identifyInitial(X,ticks,output,prefix,0)` for at
   most that prefix and its inward successors, hence at most eight prefixes.
   A zero-budget certified bracket already identifies its unique exact root.
   Failed proposals are not declarations that those partitions are impossible.
   For a candidate, require the new GRID release certificate from actual X to
   its exact bracket high in its selected prefix. Retain the first candidate
   for which those two independent certificates pass.
2. Discover the final root prefix with at most eight
   `exactInput(...,candidatePrefix,0)` calls. Use only `root.identified` for
   discovery; the other fields of a non-`EndpointCertified` result authorize
   no payout. Root identity, its fixed input and positive output normal prove
   the same global ideal endpoint optimum through the existing support proof.
   If more than one prefix identifies it, this can represent a key equality;
   the minimal policy may defer equality rather than invent a departure rule.
3. Enumerate the exact-frontier event schedule from **original actual X**,
   the one total normalized input, and those identified initial/final prefixes.
   Supply `maxCrossings-releaseCrossings`, never a fresh 16. Require
   `FrontierSchedule.Status.OrderingCertified`.
4. Call `FrontierEndpoint.exactInputForPayout` for the selected final prefix
   with the remaining midpoint budget. The earlier discovery call used zero.
   This separately named method stops only at the exact combined raw-floor and
   root-gap bound; it preserves every final endpoint check. Record actual
   `firstSolveUsed` against the one budget.
5. Prove the cumulative input/output order and every arc condition below.
   An unresolved initial direction or order may return `Uncertain` in the
   first implementation. Do not spend all 160 refinements on initial identity:
   that certificate normally needs only enough width to establish order and
   direction, whereas final payout needs the one-quantum bound.

Trying a bounded number of prefixes is discovery, not a universal liveness
argument. The current high/seed proposal can fail on feasible input, and the
first identified equality prefix can be inconvenient for final canonical
rounding. Such outcomes must remain explicit in implementation/evidence.

The implemented payout optimization allows at most one ordinary continuation
when endpoint or arc checks remain unresolved: `resumeExactInput` reconstructs
the original frame and selected context, rechecks retained `lo/hi` as proposals,
and refines them with only the first phase's remaining budget. All final
endpoint and arc checks run again. Aggregate work is
`firstSolveUsed+resumeUsed`; nested endpoint work remains phase-local. Only the
outer path status authorizes output. See [PAYOUT_REFINEMENT](PAYOUT_REFINEMENT.md)
for the exact stop, raw-boundary allowance, resumed proof and evidence. Initial
refinement and geometry reuse remain separate follow-up work.

## 3. Initial actual state to exact initial root

The initial endpoint has input reserve `X_input` and untouched reserves equal
to actual X. Its only variable is output, enclosed by `[lo0,hi0]/GRID`.

`certifyInwardReleaseToGrid(...,hi0,prefix0)` proves actual X to feasible high,
including both sides of any slack seams. RootBracket separately proves the
whole selected-prefix domain from `lo0` through `hi0`, strict output normal,
and an identified root between its two original-radical signs. Since F is
monotone on that certified output-only domain, the high-to-root subinterval
is feasible. Joining them therefore reaches that exact root without resetting
the invariant or rounding a proof coordinate to a token unit.

The initial release crossings are counted once. Choosing another narrowed
high in the same prefix does not create additional crossings. A bracket high
alone is neither frontier identity nor a substitute for the GRID release.

## 4. Keep one global progress frame

All following values are signed length numerators with denominator GRID.
Use initial actual balances as the origin throughout:

```text
initial exact root:
    d0 = [0,0]
    y0 = [X_output*GRID-hi0, X_output*GRID-lo0]
    w0 = [X_input*GRID-hi0, X_input*GRID-lo0]

event:
    d = candidate.input interval
    y = candidate.output interval
    exact direction = candidate.inward from the separated-root identity

final exact root:
    df = [netInputInternal*GRID, netInputInternal*GRID]
    yf = [X_output*GRID-hif, X_output*GRID-lof]
    wf = [(X_input+netInputInternal)*GRID-hif,
          (X_input+netInputInternal)*GRID-lof]
```

`y` is cumulative ideal output released, including the initial release.
`w` is input reserve minus output reserve; it is not output paid. Event
directions come from the sign of their exact separated square-root branch,
not an arbitrary choice inside a possibly wider coordinate box.

Require strict interval separation for every consecutive initial/event/final
pair `L,R`:

```text
L.d_hi < R.d_lo
L.y_hi < R.y_lo.
```

The schedule already checks those inequalities between events and places
events strictly between input zero and the total input. Composition still
must check the first and last joins, or the direct initial/final join when
there are no events. These checks prove strict input increase, strict output
decrease and `w_L<w_R` for the exact points. They also reject a physically
enclosed event that is ahead in input but behind the initial released output.
No event output is added approximately to another; all refer to the same X.

Original metadata/input bounds and these order checks keep accepted event
coordinates inside the original range: traded input is below the bounded
final input, output is below original output and above the final ideal output,
and untouched coordinates never change. Event physical certificates retain
principal lower bounds. All casts must occur after those signed/range checks.

## 5. One-sided partitions and endpoint identities

For an inward event at key index k, the arriving arc uses prefix k+1 and
the departing arc uses k. For an outward event the order is k then k+1.
These are exactly the prefix transitions that the schedule validates. Add
the identified initial and final root prefixes at the two ends.

An internally generated `Separated` candidate with `physical=true` identifies
the enclosed exact frontier at that key. It is not merely a feasible rounded
box. At an exact frontier seam, replacing `(R,K,S)` with
`(R+r,K-r*b,S-r*sigma(b))` leaves both `A=K+R*b` and
`rho=S+R*sigma(b)` unchanged. The two original MATH-7 reconstructions coincide
tick by tick. The event's exact nonnegative common normal and positive output
component therefore certify **both adjacent one-sided frontier endpoints**.
This implication uses frontier identity; it is not reused for slack seams.

The event's `physical` certificate must come from `FrontierEvents.atKey` in
this exact original frame and immutable tick table. The returned default
flags, a feasible `M.certify` state, a root bracket without `certified=true`,
or an arbitrary interval box do not satisfy this premise. No additional
calldata-supplied certificate type should be introduced.

## 6. Apply the arc theorem, including its turn leaf

For every pair of consecutive exact points, use its assigned common prefix,
identical untouched reserves and the proven strict progress order.

For prefix zero, apply the separate all-interior sphere proof in
FRONTIER_SEGMENT section 7. Its endpoint output normals are strictly positive,
and endpoint key/price/principal conditions suffice. Do not evaluate a mixed
transverse formula at `rho=0`, and do not require a lower-key turn test.

For a mixed prefix, obtain certified root direction from the w interval:
`w_hi<=0` proves nonpositive and `w_lo>=0` proves nonnegative. A separated
inward event proves strictly negative w; an outward event proves strictly
positive w, independently of any loose coordinate box. Then:

| Proven directions | Required additional check |
| --- | --- |
| Both nonpositive | Same inward arc; no turn test |
| Both nonnegative | Same outward arc; no turn test |
| Strictly negative then strictly positive | Prepare `FrontierTurn` for this prefix and require `ProvenNonpositive` |
| Positive then negative | Incompatible with proven progress; never accepted |
| Unresolved sign/side | Explicit uncertainty in the minimal implementation |

`FrontierTurn.prepare` must select `ticks[prefix-1]`, the **largest boundary**
key. Its `ProvenNonpositive` status encloses the exact original-geometry
`D(b_lower)<=0`. `ProvenPositive` means this proposed joined fixed-prefix arc
needs intervening crossings; it is not whole-swap infeasibility. `Uncertain`
proves neither conclusion. No output reduction can repair the missing path
certificate. In particular the retained n2 key-5/8 example has D=7/16 and
must fail a mixed direct turn, even with two valid endpoints.

An exactly identified w=0 endpoint fits either adjacent same-side case.
An interval that straddles zero does not. A one-sided interval touching zero
can prove a same-side case by its whole bound, but it does not prove the
strict two-sided hypotheses of the displayed turn case. Extending the turn
argument to all such unresolved endpoint signs may be possible by a finite
case union with `D<=0`; that is an explicit follow-up proof obligation, not
an implementation permission to choose signs conveniently.

Under these checks, the existing FRONTIER_SEGMENT theorem does justify each
accepted nontrivial arc: original frontier identity supplies its endpoints;
price monotonicity and discriminant concavity prevent hidden physical limits;
same-side orientation or the lower-key turn check supplies connectedness;
all per-tick sphere, cap and principal inequalities propagate. Adjacent arcs
meet at the same identified event, whose two reconstructions coincide. This
is a conditional composition argument; its code-level premises still require
tests and an independent review of the eventual helper.

## 7. One final financial rounding and retention

The final `FrontierEndpoint` certificate binds exact total net input and
returns the only raw payout. It requires original integer endpoint membership,
the same canonical prefix as the ideal final root, a full extended vertical
domain and `ceil((actualOutput*GRID-lof)/GRID)<=outputQuantum`. The existing
1-Lipschitz argument bounds radial slack by that same length gap. This is the
combined [NUM-12 through NUM-14](../NUMERICS.md#4-conservative-reserve-slack)
obligation: authoritative X receives exactly net input and actual raw output;
the full actual reconstruction/principal/price certificate passes; retained
slack has a conservative length-valued bound of at most one output quantum.

The event comparisons above apply to the **ideal** path. The final paid output
can be less than the last ideal event's cumulative output because the one
final floor retains up to one quantum. Requiring the raw amount to exceed
every ideal event would impose an additional unsupported scope restriction.
Instead, combine the certified ideal traversal with the final same-prefix
vertical retention interval from the exact root to the actual endpoint. This
is NUM-11's single final accounting operation; no intermediate transfer is
made. It does not assert a separately clipped monotone curve that caps output
at the paid amount at every intermediate input. Such a curve would need its
own domain argument and is unnecessary for one final atomic settlement.

If final rounding changes the canonical prefix, retain the existing explicit
`RequiresRepartition` result. Solving that case later requires certifying the
actual endpoint/retention geometry in its new prefix; it cannot persist stale
ideal metadata or charge another raw output unit at a seam.

## 8. Precise deferrals and next validation

The minimal composition deliberately exposes these unresolved cases:

- A coarse initial bracket or fixed precision cannot certify direction or
  cumulative output order within the shared midpoint budget.
- The current schedule returns uncertainty for a required exact touch,
  near-touch, overlapping event interval, or event at input zero/final input.
  It does not yet implement direction-aware zero-distance departures or
  canonical final arrivals. Initial release may already have consumed an
  exact seam departure; a later endpoint-equality policy must count it once.
- A zero output normal needs a separately proved one-sided rule. Mixed
  initial zero-output-price cases are not justified by the current arc proof.
  Zero input normal at a valid final frontier is allowed by that proof, when
  endpoint interval certification can establish the required nonnegativity.
- A high/low discovery proposal fails, final output accuracy is insufficient,
  final canonical rounding changes the prefix, or a turn sign is unresolved.

`FrontierSchedule` never omits an in-window candidate merely because
`physical=false`: accepted enumeration excludes it only with definite input
position bounds or a negative upper discriminant. Its strict interior-event
policy is therefore conservative, not evidence of universal traversal liveness.
All endpoint-equality and supported-range obligations remain on the release
worklist; this proposal neither lowers those expectations nor enables the
mixed router by itself.

Before behavior, add named red tests for: connected same-prefix n2/n3/n8
arcs; the n2 inward/all-interior/outward two-root path; n3/n8 mixed turns with
a certified nonpositive lower discriminant; the hidden n2 positive-turn
counterexample; cumulative output behind initial release; spent root budget;
counted initial seams; zero/final-input event deferrals; uncertain directions;
one final output floor; and rounding-created repartition. Generate independent
explicit-support endpoint/event witnesses and compare the whole sequence at
110/160 digits. Measure complete helper gas after composing these costs.

The closed-input implementation now uses bounded zero-budget prefix discovery
and the existing final endpoint solve once. Fourteen compiling behavioral tests
failed against its placeholder before implementation; the first 14-test GREEN
passed ordinary n2/n3/n8, real two-/four-root sequences, initial release plus an
outward crossing, a mixed n3 turn and the retained deferrals. The final focused
run passed 88 tests including 18 composition cases and nine independent whole-
path root/output/shortfall tuples. Fifteen reference tests pass at 110/160
digits. Two independent conditional source/proof reviews found no concrete
defect. Their scope and hashes are recorded in
[frontier-composition.md](../../test/evidence/frontier-composition.md).
Its acceptance argument is assembled from the named certificates
above; remaining liveness, equality handling and complete gas behavior must be
demonstrated rather than assumed.
