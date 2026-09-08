# Mixed-partition root and global output certificate

2026-09-08. Repository-derived proof audit using [MATH](../MATH.md),
[NUMERICS](../NUMERICS.md), the authenticated-source ledger in
[PAPER_IMPLEMENTATION](../PAPER_IMPLEMENTATION.md), and the earlier
[fixed-segment](SLACK_SEGMENT.md) and [seam](SLACK_SEAM.md) audits.

**Claim and primary verdict: proved as written under the stated hypotheses.**
For any feasible candidate endpoint `Xc` and any exact nonnegative price
vector with `p_output>0`, the per-tick support-cost gap divided by that output
price bounds additional output from the same fixed-input endpoint problem.
A directed upper gap at most `p_output*rawOutputQuantum` therefore proves an
at-most-one-raw-unit shortfall. This proof is independent of the candidate's
persisted partition and of whether its reconstructed baskets minimize that
price vector. Feasibility and connected-path certification remain separate.

The fixed-partition root-bracketing statements below additionally require an
explicitly certified domain interval and a feasible bracket endpoint. Their
existence is a named input, not inferred from a failed endpoint certificate.

## 1. Exact endpoint problem and weak support inequality

Let the immutable tick reserve sets be `C_t=C(r_t,b_t)`, with the full-range
ball as specified in MATH. Let `X0` be the actual rounded starting geometric
reserves. After fixed normalized **net** input `d` of token `i`, a candidate
payout `y_c` of token `j` must have

```text
Xc_i = X0_i+d,
Xc_j = X0_j-y_c,
Xc_l = X0_l for l!=i,j.
```

No equal-price or convenient frontier state is substituted for `X0`. All
existing funded rounding slack remains part of the endpoint problem.

For any `p>=0`, `p_j>0`, define

```text
L_t(p) = min { p dot x : x in C_t },
L(p)   = sum_t L_t(p).
```

Every feasible endpoint `X'=sum_t x_t` satisfies `p dot X'>=L(p)` by summing
the defining per-tick inequalities. If `X'=Xc-y*e_j`, then

```text
0 <= y <= (p dot Xc-L(p))/p_j.
```

Thus, for any certified `L_lo<=L(p)`,

```text
gapUpper = p dot Xc-L_lo,
gapUpper <= p_j*Delta_j
```

proves that the maximum possible additional output is at most `Delta_j`.
Set `Delta_j=10^(18-decimals_j)*2^64` to obtain the specified one-raw-unit
bound. Comparing exact costs avoids division by a small output price and
avoids any arbitrary squared-residual tolerance.

The larger convex reserve sets also contain every endpoint admitted by the
additional MATH-7 branch/reconstruction conditions. Consequently their support
bound remains an upper bound if those extra conditions restrict the actual
optimum further. The candidate itself must still pass the separate required
feasibility and path checks before a payout is accepted.

The gap is unchanged if accounting consistently uses principal instead of
geometry: for represented virtual offsets `v_t`,
`L'_t=L_t-v_t*sum(p)` and `p dot (Xc-V*1)=p dot Xc-V*sum(p)` cancel the same
shift. Mixing principal coordinates with unshifted support costs is wrong.
Earned fees, Aqua allocation surplus and wallet donations do not enter either
geometric cost. No invariant or virtual contribution is reset.

## 2. Support functions with an independent branch decision

Let `G=2^32`, and use exact integer price weights. Define

```text
P1 = sum_i p_i,
P2 = sum_i p_i^2,
V_p = n*P2-P1^2 >= 0.
```

For the full-range ball,

```text
L_free = r*(P1-sqrt(P2)).
```

For an ordinary key `j` (`b=j/G`), put

```text
D = n*G-j,
E = n*G^2-D^2 > 0.
```

The unconstrained sphere minimizer satisfies the cap precisely when

```text
P1/sqrt(P2) >= n-b
    iff G^2*P1^2 >= D^2*P2.
```

All quantities squared here are nonnegative and `P2>0`, so no sign is lost.
Use the free support in this case, including equality. Otherwise use

```text
L_cap = r*(b*P1/n - sigma(b)*sqrt(P2-P1^2/n))
      = r/(n*G) * (j*P1-sqrt(E*V_p)).
```

The cancellation in the second line avoids a Q128 approximation to sigma.
The boundary branch cannot occur at `V_p=0`: equal nonzero prices give
`P1/sqrt(P2)=sqrt(n)>n-b` for every admitted nondegenerate cap.

These formulas follow directly by minimizing a linear functional on the
sphere, or on its boundary plane using the transverse component of `p`.
They are also independently checked against the explicit per-tick
`supporting_basket` reference routine. The price-selected branch must be
recomputed for every tick. It is not the candidate's persisted partition.

Nonnegative support is a proved property, not a numerical clamp. A full ball
has `P1>=sqrt(P2)` for nonnegative `p`. For a cap, `j*P1>=sqrt(E*V_p)` follows
from `P1^2>=P2` and

```text
j^2-(n-1)*E = n*(j-(n-1)*G)^2 >= 0.
```

Equivalently the admitted cap lies in nonnegative geometric coordinates.
This fact permits unsigned lower-support arithmetic after a checked sign
comparison. It does not permit clamping an arbitrary negative radicand.

## 3. Why reconstructed slack baskets cannot substitute for support

Any exact `p>=0` with positive output component is a valid witness. It may be
generated by rounding a normalized version of the candidate's `g` vector to
integer weights. Such a choice need not be a supporting normal of that
candidate, and its support minimizers can have a different partition.
Neither `L(p)=p dot Xc` nor price-branch copying follows from nonnegative `g`.

Here is an exact-real counterexample. Take two tokens, one radius-1 full tick,
one radius-1 key-`3/4` tick, and

```text
Xc = (3/4+3*sqrt(7)/16, 3/4-3*sqrt(7)/16),
p  = (5/8-sqrt(7)/16,  5/8+sqrt(7)/16).
```

This is the strict-slack seam in SLACK_SEAM. Its persisted geometry has a
boundary cap. But `P1=5/4`, `P2=107/128`, and both **support minimizers** are
free, since `P1/sqrt(P2)>5/4=n-b`.

Incorrectly evaluating that cap on its boundary slice gives

```text
wrong L = 103/64-sqrt(107/128),
p dot Xc = 99/128,
wrong gap = sqrt(107/128)-107/128.
```

The wrong gap divided by `p_2` is strictly below `1/10`. Nevertheless releasing
`1/10` of output is feasible: both ticks become interior and each receives
half of `(Xc_1,Xc_2-1/10)`. Their cap sum is `7/10<3/4`, and the combined sphere
residual is

```text
463/128 + 1/4 + 1/100 + 3*sqrt(7)/80 < 4.
```

The strict inequalities follow without decimal approximations from
`21/8<sqrt(7)<3`; in particular squaring
`115/128+sqrt(7)/160` shows it exceeds `sqrt(107/128)`, giving the false
`1/10` upper bound. Both examples obey positive-price/principal constraints.
This disproves the shortcut even as an output bound, not merely as a choice
of witness. The retained integer fixture and its 110/160-digit regeneration
are in `test_root_certificate.py` and `DualCertificate.t.sol`.

## 4. Finite directed arithmetic used by `DualCertificate`

The implemented domain is `2<=n<=8`, at most eight positive-radius ticks with
valid sorted ordinary keys followed by the unique sentinel, original `X_i`
and total radius below `2^160`, and exact integer prices
`0<=p_i<=2^128`, `p_output>0`. Activation still imposes the protocol's minimum
radius; this geometry helper does not replace activation validation.

For a free support, compute

```text
T_free = ceil(sqrt(P2*2^224)),
L_free_lo = floor(r*(P1*2^112-T_free)/2^112).
```

For a cap support, compute

```text
T_cap = ceil(sqrt(E*V_p*2^160)),
L_cap_lo = floor(r*(j*P1*2^80-T_cap)/(n*G*2^80)).
```

Roots are upper enclosures and the final division rounds down, so every
result is a lower support cost. The checked center-minus-root differences
are nonnegative: the true support is nonnegative, and the center is an exact
integer upper bound for that scaled root, hence also for its ceiling.
No signed-cost approximation or undocumented zero clamp is needed.

| Quantity | Bound in the implemented domain |
| --- | --- |
| `P1`, `P2`, `P1^2`, `V_p` | `<=2^131`, `<=2^259`, `<=2^262`, `<2^262` |
| exact support branch comparison products | `<=2^326` |
| `E*V_p` | `<2^329` |
| free / cap scaled root radicands | `<=2^483` / `<2^489` |
| free / cap root ceilings | `<2^242` / `<2^245` |
| free / cap center numerators before multiplying `r` | `<=2^243` / `<2^246` |
| free / cap cost numerators including `r` | `<2^403` / `<2^406` |
| dot cost and summed support cost | `<2^291` |

All wide values remain below 512 bits. `P2`, `P1^2`, variance, costs and gap
are not narrowed to uint256. The native center products and denominators fit
256 bits; the actual support quotient can exceed that width and uses wide
division. Root rounding cannot overflow a 256-bit result under the displayed
radicand bounds. The ordinary-key domain is rechecked exactly; stored sigma
and virtual coefficient fields are deliberately unused.

The support-cost underestimation satisfies

```text
0 <= L_free-L_free_lo < r/2^112+1,
0 <= L_cap-L_cap_lo < r/(n*2^112)+1,
0 <= L-L_lo < 2^48+8.
```

This last bound is in price-weight times internal-length units. Even with the
smallest positive integer output weight, it is below a `2^64` internal-unit
raw quantum. This controls arithmetic enclosure error only. It does not
bound a poor choice of prices, prove that every near-zero price ratio is
representable with 128-bit weights, or guarantee that every valid trade
passes the one-raw-unit comparison.

`evaluate` returns exact dot cost, lower support, an upper gap, an exclusion
flag and a diagnostic count of price-selected boundary supports. If dot cost
is strictly below lower support, exclusion is proved and `gapUpper` must not
be interpreted as a shortfall. `certifiesQuantum` checks the exclusion flag
before comparing the gap. It is an output-bound test only; it can never
replace the candidate's feasibility/path certificate or the caller's binding
of `quantum` to token decimals.

## 5. Global exclusion and safe bracket construction

If `p dot X<L_lo`, then `X` is outside the sum of the tick reserve sets.
This is a rigorous infeasibility witness. With fixed other coordinates and
`p_output>0`, it also excludes every smaller output reserve. A failed
`M.certify` does not establish this condition: it may indicate interval
uncertainty, a branch issue or another failed obligation.

Writing `C_p=sum_{i!=j} p_i*X_i`, every feasible output reserve must satisfy

```text
z >= (L_lo-C_p)/p_j.
```

If this bound is above a known coordinate/principal floor, it supplies a
strictly excluded integer point `ceil((L_lo-C_p)/p_j)-1`. Preserve the sign
of `L_lo-C_p` before unsigned arithmetic. If the bound is at or below that
floor, it does not provide an excluded point inside the supported domain.
Do not turn the floor itself into an infeasible endpoint by clipping blindly.

A fixed-price support cost can be reused across candidate output coordinates
for the same immutable tick set; only `C_p+p_j*z` changes. Recomputing up to
eight high-precision square roots at every bisection is unnecessary. A new
price vector requires new support costs. Gas acceptance remains unmeasured
for a complete router execution.

## 6. Fixed-partition radical monotonicity and domain limits

Fix `(R,K,S)`, the input coordinate after the proposed input, and all untouched
coordinates. Let only output reserve `z` vary. A domain interval `[z_L,z_H]`
must establish throughout:

- the intended partition and `A-K<=nR`;
- `rho>=S` and, if `S>0`, positive `rho`;
- every aggregate normal sign and every boundary-coordinate price bound;
- coordinate/representation bounds and the aggregate principal floor.

For the outside endpoint of a root bracket, this **domain** certificate need
not claim `F<=R^2` or per-tick ball membership: violating that inequality is
the expected exclusion. Root and accepted-candidate feasibility checks add
those requirements back.

The fixed-segment audit proves the needed interval domain checks using the
two endpoints, the variance minimum, and the possible interior maximum of
the largest untouched transverse coordinate. Its price-extrema proof does
not assume `F<=R^2`; thus it can also certify the domain part of a bracket
whose lower endpoint lies outside the invariant sublevel set.

Let `m=n-1`, `mu` be the mean of untouched coordinates, `J` their squared
deviation sum, `t=z-mu`, and `alpha=m/n`. Then

```text
rho^2=J+alpha*t^2,
g_output=R-z+K/n+S*alpha*t/rho,
dg_output/dz = -1+alpha*S*J/rho^3 <= -1/n,
dF/dz = -2*g_output.
```

The inequality uses `S/rho<=1`, `J/rho^2<=1`; it is invalid before certifying
the whole interval's `rho>=S`. For `S=0`, simplify to the sphere identities
without dividing by `rho`.

Therefore `g_output(z_H)>0` proves strict monotonicity throughout output
release. A certified zero at `z_H` gives a valid one-sided vertical statement:
`g_output(z_H-y)>=y/n>0` for `y>0`, without dividing by zero. If the original
radical has `F(z_H)<=R^2` and `F(z_L)>=R^2`, continuity and this monotonicity
give a unique frontier root in that interval, including endpoint equality.
An unresolved sign enclosure gives neither side of a bracket.

At that root, the reconstructed common normal is `p=g`, with `||g||=R>0`
and `sum(g)/||g||=n-h`. Interior ticks are precisely on their free support
branches, and boundary ticks are on the cap support branches; if boundaries
exist then `rho-S>0` at a frontier root because their valid keys exceed
`n-sqrt(n)`. Thus the root attains the summed support cost. If its output
component is positive, the support inequality excludes every lower output
reserve, proving global optimality of that endpoint even against alternative
tick partitions. Connected reachability from the actual starting state is
still a different obligation.

Partition limits are affine key-plane intersections. A variance hole is
explicit: if `S^2>J`, then `|t|<sqrt((S^2-J)/alpha)` is forbidden. Travel from
the positive-`t` side must stop at the first boundary of that hole; it cannot
jump to the valid negative-`t` side. If `S^2<=J`, this particular hole is absent.
The remaining normal/coordinate limits must also be located or certified
before taking a bracket across them. A zero-price endpoint requires an
explicit one-sided rule, not an arbitrary extrapolation.

For directed radical signs, exact axial arithmetic and rho/S enclosures give

```text
F_lo = axial_lo+max(0,rho_lo-S_hi)^2,
F_hi = axial_hi+(rho_hi-S_lo)^2
```

after proving the branch. `F_lo>R^2` is an exclusion for that fixed-partition
reconstruction; `F_hi<=R^2` together with the domain/reconstruction checks
certifies membership. Otherwise refine within the prescribed work budget or
return an explicit uncertifiable result. Neither a low residual nor an
endpoint checker returning false supplies the missing sign.

## 7. Error bounds near zero output price

The implemented support certificate rejects `p_output=0`. Such a price gives
no output bound after cancellation of that coordinate. Another exact positive
integer output weight can still be tried, but its full support cost must be
recomputed. A limiting argument without a finite successful inequality is
not a certificate.

On a separately certified fixed-partition root interval, monotonicity also
gives an optional derivative-based amount bound. If `g0=g_output(z_H)>=0`,
`delta=R^2-F(z_H)>=0`, and the root is reached after release `y`, then

```text
delta >= 2*g0*y+y^2/n,
y <= delta/(sqrt(g0^2+delta/n)+g0).
```

If `delta=0`, monotonicity gives `y=0` directly. For `delta>0` and `g0=0`,
the bound becomes `y<=sqrt(n*delta)`. Use directed upper delta and lower
normal bounds; this is an amount estimate derived from inequalities, not a
tolerance imposed on `F`. It is not implemented by `DualCertificate`, and it
requires the certified root interval before any key/branch limit. It cannot
be applied unchanged across a slack seam where the partition changes.

An independent principal floor can also bound additional output by
`Xc_output-V`, useful when that is already within a raw quantum. It need not
be tight near a zero-price tangent endpoint.

## 8. Audit scope and implementation evidence

Dependency graph: per-tick convex reserve definitions -> analytic support
minima with exact price-based classification -> summed support inequality ->
global endpoint exclusion/output bound. Directed arithmetic is an independent
leaf establishing `L_lo<=L`. Candidate feasibility/path certificates are
separate leaves and are never inferred from a small dual gap.

| Obligation | Status |
| --- | --- |
| Global endpoint output bound from arbitrary exact `p>=0,p_j>0` | Passed by the support inequality |
| Safe support from candidate's persisted partition | Failed; retained counterexample |
| Finite directed support costs and 512-bit bounds | Implemented with displayed error/range proof |
| Mixed-partition and zero-other-price support cases | Included in finite tests |
| Fixed-partition monotonic original radical/root uniqueness | Passed under the explicit interval-domain hypotheses |
| Finding a feasible bracket for every supported trade | Not addressed; existence cannot be inferred from adding all input without output |
| Candidate feasibility, actual path, both-root event order | Separate obligations |
| Price selection tight enough in every extreme case | Not established |
| Full bounded refinement, solver liveness and router gas gate | Not established |

Measured commands, test results, fixture provenance and the computation
manifest are recorded in [dual-certificate evidence](../../test/evidence/dual-certificate.md).
No full mixed-partition production root solver is claimed by this document.
