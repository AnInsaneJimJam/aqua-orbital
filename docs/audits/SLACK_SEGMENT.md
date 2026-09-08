# Fixed-partition vertical slack segment audit

Date: 2026-09-08. Independent read of [MATH](../MATH.md),
[NUMERICS](../NUMERICS.md), the [paper ledger](../PAPER_IMPLEMENTATION.md),
`packages/contracts/src/libraries/OrbitalMath.sol`, and the retained reference
counterexamples. These are repository-derived calculations, not a theorem
attributed to the paper authors.

**Claim and verdict: proved as written in exact arithmetic under the fixed-partition
hypotheses below.** A vertical segment has a finite certificate consisting of its
two endpoint certificates, its variance minimum, and at most one additional
boundary-coordinate maximum. This proves the required reconstruction and price
inequalities at every point of that segment. It does not prove a complete swap
algorithm, a bounded-slack update, or a transition policy between partitions.

## 1. Claim card

Fix `n>=2`, one output coordinate `z`, and all other coordinates `c_i`. Let
`z` range over the closed interval `[z_lo,z_hi]`, where releasing output moves
from `z_hi` to `z_lo`. Fix a valid set of ticks **and the same partition throughout
this interval**. Its exact consolidated values are `R>0`, `K`, and `S>=0` as in
MATH-4. Keys, radii, and virtual offsets do not change.

Both endpoints must have certificates for this same partition establishing:

- valid reserve domain and principal lower bounds;
- partition inequalities and `A-K<=nR`;
- `rho>=S`, `F<=R^2`, and every aggregate `g_i>=0`;
- every reconstructed boundary coordinate at most its tick radius.

For strict output-price use, also require `g_output(z_hi)>0`. A zero value there
can only be used by a separately specified one-sided endpoint rule.

When `S>0`, add these two checks:

1. The minimum of `rho` on the segment is at least `S`.
2. The largest untouched transverse coordinate, at its sole possible interior
   maximum, meets the price bound of the largest boundary key.

Then the same geometric, cap-membership, principal, and nonnegative-price
conditions hold at every point of the segment, with the unchanged MATH-7
reconstruction and `rho>=S` sheet. No invariant constant is reset.

The endpoints may include a key equality only when the certificate applies to
the specified partition. A canonical endpoint checker that changes partition at
that equality is not automatically such a certificate. Requiring the same
canonical partition at both endpoints is a conservative sufficient initial
implementation policy; it does not resolve liveness across slack-state events.

## 2. Coordinates that expose every critical point

Write `m=n-1`, and define quantities from the untouched coordinates:

```text
mu = sum(c_i)/m
d_i = c_i-mu
J = sum(d_i^2)
t = z-mu
alpha = m/n
rho^2 = J + alpha*t^2
```

Here `J>=0` and `sum(d_i)=0`. Let `c_M=max(c_i)` and `d_M=c_M-mu>=0`.
The centered unit coordinates are

```text
u_output = alpha*t/rho
u_i      = (d_i-t/n)/rho.
```

With `S>0` and the certified `rho>=S`, all denominators below are positive.
The exact derivatives are

```text
du_output/dt = alpha*J/rho^3 >= 0
du_i/dt      = (-J/n-alpha*d_i*t)/rho^3.
```

Since `u_M-u_i=(c_M-c_i)/rho>=0`, the only coordinates relevant to an all-token
upper bound are `u_M` and `u_output`. If `d_M>0`, `u_M` has precisely one possible
critical point,

```text
t_star = -J/(m*d_M),
```

and it is a maximum: the numerator of its derivative decreases strictly with
`t`. There is no interior minimum. If `d_M=0`, every deviation is zero, so `J=0`;
on an interval avoiding `t=0`, `u_M` is constant. The `rho>=S>0` check forces the
interval to avoid zero in that case. These statements include `n=2`.

Consequently the full boundary-coordinate check needs only endpoints and
`t_star` when it belongs to the segment. The output component attains its maximum
at `z_hi`, already checked at an endpoint. A pair-reserve equality is not a
replacement for this critical point or for the variance minimum.

## 3. Aggregate prices need no extra critical points

Simplifying MATH-5 gives

```text
g_i      = R-c_i+K/n + S*u_i       (untouched i)
g_output = R-z+K/n   + S*u_output.
```

On `rho>=S`,

```text
g_i-g_M = (c_M-c_i)*(1-S/rho) >= 0.
```

Thus `g_M` is the smallest untouched price. It is a constant plus `S*u_M`, whose
minimum on the segment is at an endpoint. Endpoint nonnegativity of `g_M`
therefore certifies every untouched price everywhere.

For the output price,

```text
dg_output/dz = -1 + alpha*S*J/rho^3
             = -1 + alpha*(S/rho)*(J/rho^2)
             <= -1+alpha = -1/n < 0.
```

The inequalities use `S/rho<=1` and `J/rho^2<=1`. Its minimum is at `z_hi`.
In particular a strictly positive output price there remains strictly positive
throughout release. This proof would be invalid before certifying `rho>=S` over
the whole interval; the retained counterexample specifically breaks that step.

## 4. The invariant and reconstruction remain feasible

Direct differentiation of M1 along this vertical line yields
`dF/dz=-2*g_output`. Since the preceding argument proves `g_output>=0`, `F` is
nonincreasing with `z`. Hence its maximum on the release segment is `F(z_lo)`;
the lower endpoint certificate gives `F<=R^2` everywhere. This is a derivative
argument on the specified sheet, not a claim that the torus sublevel set is
globally convex.

`A=sum(c_i)+z` and `h=(A-K)/R` are affine in `z`. Fixed-partition inequalities and
`A-K<=nR` follow everywhere from their endpoint inequalities. Exact aggregate
principal floors also interpolate because only `z` changes and the offsets are
constant.

For each interior tick, MATH-7 gives

```text
||x_tick-r_tick*1||^2 = (r_tick/R)^2*F <= r_tick^2
sum(x_tick) = r_tick*h.
```

The fixed-partition inequality supplies its cap constraint. Also
`1-x_tick,i/r_tick = g_i/R>=0`, giving its price-branch upper bound. For each
boundary tick, MATH-7 gives its cap-plane equality and sphere equality exactly.
Section 5 supplies its coordinate upper bound. Membership in the corresponding
cap gives its minimum coordinate bound from MATH-3; subtracting a certified
lower virtual offset leaves nonnegative per-tick principal. Summing the
reconstructions gives the same aggregate `X` throughout.

These facts prove feasibility, not that an arbitrary slack point is a supporting
frontier minimizer. They do not quantify how much existing slack is released.

## 5. Extra checks with integer moments and no critical-point root

For exact integer geometric coordinates define

```text
C = sum(c_i)
D = m*c_M-C                         // nonnegative length
H = m*sum(c_i^2)-C^2                // nonnegative squared length
T = m*z-C                          // signed length
rho^2 = (n*H+T^2)/(m*n).
```

`H=m*J` and `D=m*d_M`. These letters are local to this audit; `H` is not a tick
key or an invariant constant.

### Variance minimum

The minimum of `rho^2` occurs at `T=0` if that point is in the segment, otherwise
at the nearer endpoint. Endpoint certification already covers the latter case.
When `T_lo<=0<=T_hi`, use the exact comparison

```text
H >= m*S^2.
```

For a directed upper bound `S_hi>=S`, `H>=m*S_hi^2` is a sound conservative
integer certificate. It can reject a narrow uncertain case; it cannot turn a
negative branch gap into an accepted one. Retain the sign of `T`; unsigned
subtraction before the sign test would invalidate this procedure.

### Boundary-coordinate maximum

If `D=0`, then `H=0`, and endpoints suffice for this check after the branch test.
If `D>0`, the critical point is

```text
T_star = -H/D,
```

so its inclusion is tested without division by

```text
D*T_lo <= -H <= D*T_hi.
```

At that point direct substitution into `u_M` gives

```text
u_M(T_star)^2 = (n*D^2+H)/(m*n*H).
```

For `D>0`, `H>0` and `u_M(T_star)>0`. For the largest ordinary boundary key `b`,
its positive-price threshold is

```text
u_M <= (1-b/n)/sigma(b)
sigma(b)^2 = 1-(n-b)^2/n.
```

Both sides are nonnegative, and the denominators are strictly positive for a
valid nondegenerate key. Squaring is therefore equivalent, not a relaxation.
Substituting the critical value and cross multiplying gives

```text
(n*D^2+H)*(n-(n-b)^2) <= m*H*(n-b)^2
                        iff
n*D^2+H <= (n-b)^2*(D^2+H).
```

With the exact key `b=j/G`, `G=2^32`, the final test is

```text
G^2*(n*D^2+H) <= (n*G-j)^2*(D^2+H).
```

It requires wide integer products but no evaluation of `z_star`, `sigma`, or
`rho` at a fractional critical coordinate. The threshold decreases with `b`
(as derived in the paper ledger), so the largest boundary key checks every
boundary tick. A full-range sentinel is never used as this boundary key.

With `n<=8` and coordinates below `2^160`, `C,D,abs(T)<2^163`, `H<2^326`, and
every displayed critical-point product fits below `2^393`. Using 512-bit checked
arithmetic covers these products. A sum of squared coordinates or `D*T` must not
first be truncated into 256 bits. This is a range bound for these additional
tests, not a range proof for the entire solver.

For the less immediate right-product bound, let `L=2^160` and
`q_i=c_M-c_i`. Then `D=sum(q_i)` and
`D^2+H=m*sum(q_i^2)<m*(m-1)*L^2`, since at least one `q_i` is zero. A valid key
has `(n*G-j)^2<n*G^2`; hence their product is below
`n*m*(m-1)*L^2*G^2<=336*2^384<2^393`. The other side is below
`(n*m^2+m^2)*L^2*G^2<=441*2^384<2^393`.

## 6. All-interior special case

When `S=0`, a valid partition has no ordinary boundary ticks. Use the existing
exact sphere reduction before introducing `u`:

```text
F = sum((R-X_i)^2),  g_i=R-X_i.
```

On a coordinate line `F` is convex, so its maximum over the closed segment is
at an endpoint. The price and partition conditions are affine; the endpoint
checks suffice. The equal-price point `rho=0` is harmless here. No division by
`rho` and no artificial transverse-direction choice are needed.

## 7. Scope, liveness, and implementation obligations

The certificate accepts every exact fixed-partition segment satisfying its
conditions. Away from equality margins, sufficiently accurate directed endpoint
and `S` enclosures also accept an open neighborhood of that segment. Thus this
is not a rule that rejects all rounded states. Representative protocol liveness
still needs actual integer fixtures and the required differential campaign.

At a key equality with slack, `h=b` need not imply `rho-S=R*sigma(b)`. Moving a
tick from interior to boundary can therefore change its reconstructed basket,
even though the aggregate `X` and reserve sum are unchanged. Frontier equality
arguments cannot be reused without proving the needed slack-state properties.
This audit **does not** establish a multi-partition initial-release policy.

Other unresolved dependencies are root bracketing from the actual rounded
state, complete frontier event traversal, conservative combined output bounds,
the at-most-one-raw-unit shortfall, solvency after integer settlement, and cycle
economics. No G1/G2 release gate is closed by this document alone.

The cheapest next checks are meaningful red/green tests for the integer moment
comparisons, a regression rejecting the retained variance-hole fixture, an
accepted nonsingular mixed-boundary release, and differential comparison against
explicit per-tick reconstruction at high precision. Test a boundary maximum
inside the interval separately from the variance minimum.

## 8. Audit dependencies and evidence

| Obligation | Status | Basis |
| --- | --- | --- |
| Moment and derivative identities | Passed | Algebra in sections 2, 3, and 5 |
| Full-interval `rho>=S` | Passed conditionally on extra comparison | Exact quadratic minimum |
| Full-interval aggregate prices | Passed under branch check | Endpoint extrema argument |
| Full-interval boundary prices | Passed under critical check | Unique maximum and exact squared comparison |
| Full-interval invariant and cap membership | Passed | Monotonicity plus MATH-7 identities |
| Integer comparison range | Passed for the stated extra formulas | Bounds in section 5 |
| Endpoint interval implementation and coefficient provenance | Conditional | Existing certificate must be sound and use the same partition |
| Cross-partition rounded-state policy | Not addressed | Equality does not imply frontier reconstruction |
| Full solver optimality, raw slack budget, and release liveness | Not addressed | Separate numerical and protocol obligations |

Dependency graph: exact tick definitions and fixed partition -> moment identities
-> branch minimum -> price extrema -> invariant monotonicity -> reconstructed
cap/principal feasibility. Boundary-price extrema form a separate necessary leaf.
The branch check is not inferred from the conclusion, so the argument is not
circular. No new external theorem or numerical optimizer is a proof leaf.

The retained counterexample was rerun with:

```powershell
python -m unittest discover -s packages/reference/tests -p test_slack_path.py -v
```

Result: one test passed, reproducing the existing 110/160-digit variance-hole
construction. This confirms the old insufficient criterion remains represented;
it is not computational evidence of this certificate's universal soundness.
The universal statement above rests on the displayed exact calculations. No
production implementation or new fuzz campaign was run by this read-only audit.
