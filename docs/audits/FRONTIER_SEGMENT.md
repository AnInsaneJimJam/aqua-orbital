# Fixed-partition exact-frontier segment certificate

2026-09-08. Repository-derived proof using [MATH](../MATH.md),
[NUMERICS](../NUMERICS.md), [ROOT_CERTIFICATE](ROOT_CERTIFICATE.md),
[FRONTIER_EVENTS](FRONTIER_EVENTS.md), and [SLACK_SEGMENT](SLACK_SEGMENT.md).
The cap definitions and notation provenance remain in the authenticated
[paper ledger](../PAPER_IMPLEMENTATION.md). No new theorem is attributed to
the paper authors.

**Claim and verdict: proved as written under the exact-frontier and endpoint
hypotheses below.** A fixed-partition, input-increasing/output-releasing
frontier arc has a finite certificate. Two certified endpoints suffice when
the arc stays on one side of the traded-reserve equality. An arc that passes
from `X_input<X_output` to `X_input>X_output` additionally needs one signed
discriminant comparison at the largest boundary key. This comparison proves
that its turning point stays in the same partition. Endpoint checks alone
do not establish that condition; an exact counterexample is retained below.

This statement applies to exact frontier points or certified enclosures of
identified exact frontier roots. `M.certify` returning true for an ordinary
rounded state does not establish its hypotheses.

## 1. Claim card and finite checks

Fix immutable ticks, their represented virtual contributions, one partition,
and exact consolidated `R>0`, `K`, `S`. Fix the input/output token pair and
every untouched geometric reserve `c_k`. Fees and Aqua surplus are excluded.
Consider two identified exact endpoints `X0`, `X1` with

```text
X1_input > X0_input,  X1_output < X0_output,
X1_k = X0_k = c_k for untouched k.
```

Both endpoints must certify the **same specified one-sided partition**,
`F=R^2`, the outer branch, all reconstructed cap/principal constraints, every
`g_k>=0`, and `g_output>0`. Their aggregate principal is funded, their geometric
coordinates respect the implementation range, and their virtual offsets are
the same original represented offsets. Canonical classification alone is not
a substitute for selecting the intended side at a key equality.

For the mixed case `S>0`, write `b_-` for the largest boundary key and `b_+`
for the next interior ordinary key, or `n-1` if only the full-range sentinel
remains interior. The closed proof interval is `b_-<=h<=b_+`; a production
segment must separately account for any endpoint reclassification.

Classify endpoint differences `w=X_input-X_output`:

1. **Inward arc:** `w0<=w1<=0`. It runs from larger to smaller `h`.
2. **Outward arc:** `0<=w0<=w1`. It runs from smaller to larger `h`.
3. **Arc through a turn:** `w0<0<w1`. In addition to the endpoint certificates,
   require `D(b_-)<=0`, with `D` defined below.

A turning endpoint with `w=0` can belong to either adjacent arc. Moving from
outward to inward is incompatible with increasing input and releasing output.
Equalities need exact or interval-certified identification, not a sign chosen
from an enclosure containing zero.

For case 3, `D(b_-)<0` means the lower key has no real intersection for these
untouched reserves; `D(b_-)=0` means the curve only touches that key at its
turn. If `D(b_-)>0`, two lower-key crossings intervene and this fixed-partition
arc must be split. A sign enclosure that remains unresolved is uncertifiable.

The all-interior case `S=0` is handled by the sphere reduction in section 7,
including the equal-price point where a transverse direction is undefined.

## 2. Frontier parameterization and the discriminant

Put

```text
q(h)=1-h/n,
sigma(h)=sqrt(1-n*q(h)^2),
A(h)=K+R*h,
rho(h)=S+R*sigma(h),
C=sum(c_k),  U2=sum(c_k^2),
s(h)=A(h)-C,
D(h)=2*A(h)^2/n+2*rho(h)^2-2*U2-s(h)^2.
```

For `S>0`, valid `b_-` ensures `sigma(h)>0` throughout the proof interval.
Nonnegative exact-frontier normals imply `h<=n-1`: their normalized norm is
one and their sum is `n-h`, so their nonnegative sum is at least their norm.
Thus `q>0`. These domains are not inferred by clamping a square root.

The two roots are

```text
inward:  a(h)=(s(h)-sqrt(D(h)))/2, z(h)=(s(h)+sqrt(D(h)))/2,
outward: a(h)=(s(h)+sqrt(D(h)))/2, z(h)=(s(h)-sqrt(D(h)))/2.
```

They have the required aggregate sum, squared sum, and untouched coordinates.
Consequently their transverse magnitude is exactly `rho(h)`, and `F=R^2`
on the original outer sheet. In particular `rho>S`; no hidden variance hole
occurs on this mixed frontier parameterization.

Direct differentiation gives

```text
sigma'(h)=q/sigma,
sigma''(h)=-1/(n*sigma^3),
D''(h)=-2*R^2-4*S*R/(n*sigma^3)<0.
```

For example, the coefficient of `h^2` in all nonradical terms of `D` is
`-R^2`, while its remaining radical term is `4*S*R*sigma(h)`. This verifies
the second derivative without cancellation assumptions. Hence `D` is strictly
concave. Nonnegative endpoint values alone already rule out an interior
negative discriminant between those parameter endpoints. Section 3 gives
the stronger monotonicity needed for the turning-point test.

## 3. Why traded prices cannot become negative between these endpoints

Let `p=g/R` be the normalized interior frontier normal. It is not an arbitrary
approximate price witness: at these exact points

```text
p_k=q-sigma*u_k,   ||p||=1,
u_k=(X_k-A/n)/rho.
```

Writing `delta=sqrt(D)>=0`, differentiation of the displayed `D` gives

```text
D'=4*R*(rho*q/sigma-(s/2-A/n)).
```

Therefore the normal of the larger traded reserve and that of the smaller
traded reserve are, respectively,

```text
p_large = sigma/(4*R*rho) * (D'-2*R*delta),
p_small = sigma/(4*R*rho) * (D'+2*R*delta).
```

At the endpoint with largest `h`, nonnegative traded normals imply
`D'>=2*R*delta`. Strictly positive output price makes `D'>0` there: this is
immediate when `delta>0`, and at `delta=0` both traded normals coincide.

Because `D''<0`, `D'` is strictly decreasing with `h`. Thus `D'>0` everywhere
below that endpoint down to `b_-`, even before deciding whether `D` is
nonnegative. It follows that `D` is strictly increasing on this whole interval.
Where `D>=0`, its square root is increasing. Hence

```text
T(h)=D'(h)-2*R*sqrt(D(h))
```

is strictly decreasing. Its value is nonnegative at the largest-`h` endpoint,
so it is nonnegative everywhere below it and strictly positive at every
smaller `h`. This proves both traded normal signs throughout the arc.

Strict output price is also preserved. On the inward side output is the
larger reserve, so its strict minimum sign occurs at that side's largest
`h`, covered by its endpoint certificate. On the outward side output is the
smaller reserve: `p_small>0` follows from `D'>0`, including at the turn. An
outward endpoint may have `p_input=0`; this does not create a zero output
denominator. The public flow still requires positive total input and output.

## 4. Untouched and boundary prices

For an untouched reserve `c_k`, define the signed constant

```text
H_k=n*R+K-n*c_k.
```

This is a local constant, not a tick key. The exact normalized normal becomes

```text
p_k=(S*q+H_k*sigma/n)/rho
   =sigma/(n*rho) * (H_k+n*S*q/sigma).
```

Since

```text
d(q/sigma)/dh=-1/(n*sigma^3)<0,
```

the parenthesized sign expression is nonincreasing with `h`. Every untouched
normal is therefore nonnegative throughout the arc if it is nonnegative at
the largest-`h` endpoint. This proof does not require `H_k>=0` and must not
convert it to unsigned arithmetic before checking its sign.

On this **exact frontier**, the boundary price checks then follow from the
interior ones. For every coordinate,

```text
p_k>=0 => u_k<=q(h)/sigma(h)
             <=q(b_t)/sigma(b_t)  for each boundary key b_t<=h.
```

The last inequality uses the same strictly decreasing threshold. Thus every
boundary basket also has `x_tick,k<=r_tick`. A strict output interior normal
likewise implies a strict output normal for boundary baskets. This implication
is false for general retained-slack reconstructions; the separate rounded-state
boundary checks in NUM-13 and SLACK_SEGMENT remain mandatory there.

With the specified partition, MATH-7 now gives an exact sphere and cap
reconstruction for every tick. Each basket's geometric lower bound is its
true cap minimum, and its represented virtual credit does not exceed that
minimum. Hence every tick's principal is nonnegative, and the reconstructed
baskets sum to the same `X` at every point.

## 5. Connected orientation and the unique possible turn

For `delta>0`, the inward derivatives are

```text
da/dh=R/2-D'/(4*delta),
dz/dh=R/2+D'/(4*delta).
```

The preceding price proof makes the first strictly negative when it is the
inward input derivative, and the second positive. Decreasing `h` therefore
increases input reserve and decreases output reserve. On the outward root
these derivatives exchange places: increasing `h` increases input and
nonincreases output. Output decreases strictly in the interior of any
nontrivial arc, with a possible zero input price only at the final endpoint.

Since `D` is strictly increasing below the largest endpoint, it has at most
one zero there. If both endpoints are on the same root, the interval between
their `h` values has `D>=0`; the parameterized curve supplies the required
connected arc with the stated orientation.

For an inward-to-outward arc, continuity requires `a=z` somewhere, hence
`D=0`. The condition `D(b_-)<=0`, together with the positive values at the
strictly inward/outward endpoints, proves there is exactly one such root

```text
h_turn in [b_-, min(h0,h1)).
```

No approximation to `h_turn` is required to prove this existence and location.
The inward root from `h0` to `h_turn` and the outward root from `h_turn` to `h1`
meet at the same geometric point. There `D'>0`, so both traded prices are
strictly positive. To check the join without treating a singular square-root
derivative as finite, use the signed difference `w=a-z`. Strict monotonicity
of `D` defines a unique `h(w)` by `D(h(w))=w^2`, with

```text
dh/dw=2*w/D'(h),
a(w)=(K+R*h(w)-C+w)/2,
z(w)=(K+R*h(w)-C-w)/2.
```

At `w=0`, `dh/dw=0`, `da/dw=1/2` and `dz/dw=-1/2`. These derivatives are
continuous because `D'(h_turn)>0`. Thus the two sides form one regular graph
with `dz/da=-1`. The square-root parameter's unbounded derivative at the join
is a parameter singularity, not a discontinuity or a zero-price trade.

The maximum `h` on this joined arc is at an endpoint. Its minimum is the
certified turn. It therefore stays in the specified partition. If instead
`D(b_-)>0`, the zero lies below the lower partition boundary or does not exist
on this outer-sheet domain, and the same-partition joined arc is impossible.

Monotonic input/output reserves and constant untouched reserves preserve all
aggregate principal floors and coordinate bounds from the endpoint checks.
Funded output is bounded by the final principal floor. No virtual contribution,
fee reserve, invariant constant or untouched balance changes during this proof.

## 6. Counterexample to unrestricted endpoint-only certification

Take `n=2`, one radius-1 key-`5/8` tick and one radius-1 full-range tick. Let
`X0` be their explicit support aggregate at prices `(2,1)` and `X1` at `(1,2)`:

```text
X0 = (1+(5-sqrt(7))/16-2/sqrt(5),
      1+(5+sqrt(7))/16-1/sqrt(5)),
X1 = (X0_output, X0_input).
```

Both endpoints are exact feasible frontiers with positive prices and the
same mixed partition, since their free normalized sum is
`2-3/sqrt(5)>5/8`. Input increases and output decreases. But in that fixed
partition `R=1`, `K=5/8`, `S=sqrt(14)/16`, and at the lower key

```text
D(5/8)=2*(2*S)^2=7/16>0.
```

The extra turn check rejects. Indeed `a=z` would force `rho=0` for two tokens,
which is impossible with `rho>=S>0`. The actual economic path crosses inward
through the key, turns in the all-interior partition, then crosses outward.
Its equal-price turn is `(2-sqrt(2),2-sqrt(2))`, below the ordinary key in
normalized sum. The two endpoints alone conceal those two transitions.

## 7. All-interior sphere, including `rho=0`

For `S=K=0`, put

```text
J_pair=R^2-sum_untouched((R-c_k)^2),
z(a)=R-sqrt(J_pair-(R-a)^2).
```

This is the positive-output-normal root. Endpoint certification gives
`c_k<=R`, `a<=R`, and a strictly positive radicand at the start. As input
reserve increases, that radicand increases, so the root stays real, output
decreases, and its output normal remains positive. The input normal remains
nonnegative by the final `a<=R` check. Principal floors follow by monotonicity.

Also `A(a)=C+a+z(a)` is convex:

```text
A''(a)=J_pair/(J_pair-(R-a)^2)^(3/2)>0.
```

Thus its maximum, and therefore the maximum `h=A/R`, is at an endpoint.
All ordinary ticks remain interior if the endpoint upper-key conditions hold.
There is no boundary lower key to test, and `rho>=S=0` is automatic. The
equal-price point needs neither division by `rho` nor a fabricated direction.
This is a separate simplification, not evaluation of the mixed formulas at
`sigma=rho=0`.

## 8. Directed implementation and finite work

The mixed certificate adds no scan of the continuous path. Given certified
exact-frontier endpoints and their root directions, it needs at most one new
signed discriminant evaluation, at `b_-`, for an arc through a turn. The
existing event algebra supplies that evaluation. With `G=2^32`, define exact
lifted values

```text
AN=K_numerator+R*j_-,
CN=G*sum(c_k),
U2N=sum((G*c_k)^2),
sN=AN-CN,
rhoN=G*(S+R*sigma(b_-)).

n*G^2*D(b_-)=2*AN^2+2*n*rhoN^2-2*n*U2N-n*sN^2.
```

Use original directed per-tick contributions for `S` and the directed
contribution of `R*sigma(b_-)`. Do not redefine virtual balances or rescale
previously rounded contributions into different accounting values. If the
**upper** signed discriminant is nonpositive, it certifies `D(b_-)<=0`.
A strict positive lower bound proves that this proposed joined segment needs
intervening crossings. An enclosure spanning the sign boundary supplies
neither conclusion.

This sign question differs from classifying an individual event as a crossing
or touch. An enclosure with negative lower bound and exactly zero upper bound
already proves the required `D<=0`, even if an event API calls the distinction
between no root and a touch uncertain. It does not prove a crossing, and the
segment proof does not need to choose between those two cases.

Under the existing `n<=8`, ticks `<=8`, original coordinates and total radius
`<2^160`, these are precisely the event expressions already bounded below
`2^394`; signed pair sums fit int256 and squared arithmetic stays 512-bit.
The derivatives in this proof need not be evaluated onchain. A new numerical
turn search, repeated square roots along the arc, or arbitrary residual
tolerance is unnecessary for this **certificate**.

Event/root intervals must identify exact points on the original frontier and
certify endpoint prices and direction/order. Integer feasible endpoints with
`F<R^2`, unrelated feasible roots, or interval boxes lacking root identity do
not satisfy the premise. `FrontierEvents.physical` is an enclosure proof for
its identified event; a future final-root interface must provide comparable
frontier identity and endpoint domain evidence. Directed price uncertainty
or unresolved direction remains a typed failure within the work budget.

The certificate does not itself find the final root, choose the earliest
event, combine fractional input/output enclosures, or certify the final raw
rounded state. Initial slack release, exact-versus-represented endpoint
connection, finite root bracketing, zero-output-price endpoint policies,
transition counting, dual shortfall and actual settlement remain separate.

## 9. Audit and finite evidence

| Obligation | Verdict and basis |
| --- | --- |
| Both frontier root identities and original outer sheet | Passed by sum/square-sum reconstruction |
| No hidden discriminant hole | Passed by strict concavity; stronger monotonicity from endpoint prices |
| All traded prices over the whole arc | Passed by `D'-2R*sqrt(D)` monotonicity |
| All untouched prices over the whole arc | Passed by decreasing `q/sigma` |
| Boundary prices and per-tick principal | Passed on exact frontier; not extended to slack states |
| Connected input/output orientation | Passed on each root and at the regular signed-difference join |
| Same partition through a turn | Passed exactly when the additional lower-key comparison permits the turn |
| Endpoint-only arbitrary-direction shortcut | Refuted by the retained two-token example |
| Finite directed endpoint/root identity implementation | Conditional on a named input; not implemented here |
| Full SwapEngine, rounding economics and release gates | Not addressed |

Dependency graph: exact fixed-partition frontier -> discriminant concavity ->
traded/untouched price propagation -> boundary reconstruction -> root
orientation and lower-key turn test -> connected principal-preserving arc.
Endpoint feasibility is an input; path feasibility is established by these
implications and is not used to prove itself. The local change of parameter
at the turn uses `D'>0`, established before dividing by that derivative.

The added reference test compares the parameterized points with the existing
independent explicit per-tick `supporting_basket`/`verify_baskets` routines.
It retains the endpoint-only counterexample and exercises mixed three-, four-
and eight-token turns using canonical `2^-32` keys, both root directions,
derivative identities and a zero-input-price endpoint. These are bounded
numerical checks, not a universal proof or a production interval implementation. The universal argument is
the displayed algebra and monotonicity reasoning.

Command and measured results are recorded with hashes in
[FRONTIER_SEGMENT.manifest.json](FRONTIER_SEGMENT.manifest.json). No existing
mathematical definitions or production contracts were edited by this task.
