# Fixed-partition certified root bracket

2026-09-08. **Mathematical claim: proved as written under the prepared-context
and directed-arithmetic hypotheses below.** An accepted fixed-partition bracket
contains one frontier root, and every certified refinement preserves that root
and its feasible upper endpoint. A stopped refinement exposes its actual width;
it does not claim a raw payout or a complete swap certificate.

**Computation verdict:** implementation and finite assertions verified in the
recorded range. Nineteen root/residual tests, fourteen existing slack-certificate
tests and ten existing curve-evaluation tests passed. Three independent Python
tests verify root regeneration and Solidity golden agreement. These finite
campaigns support the implementation; the interval-domain and monotonicity
arguments below supply the uniform reasoning.

## Scope and interfaces

The mathematical definitions remain in [MATH](../../docs/MATH.md) and
[NUMERICS](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/NUMERICS.md). This implementation uses the
[fixed-segment proof](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/SLACK_SEGMENT.md) and
[root-certificate proof, section 6](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/ROOT_CERTIFICATE.md).
Their stated MATH-7 reconstruction and `rho>=S` sheet are retained.

`RootBracket.refine(xHi,ctx,output,zLo,budget)` accepts one unmodified
`CurveEvaluation.prepare` context and a vertical interval: all coordinates
except `output` stay fixed. Coordinates, `zLo`, and returned bounds are exact
integer **GRID-denominator lengths**, with `GRID=2^32`. Divide by GRID to recover
the original internal-length units. They are not normalized token atoms or raw
token amounts.

The prepared context enforces `2<=n<=8`, one through eight valid sorted positive
ticks followed by the unique full-range sentinel, and total original radius
strictly below `2^160`. Original protocol minimum-radius/activation rules remain
the caller's responsibility. Proof coordinates must be below `2^192`. The
chosen prefix partition remains fixed, including its chosen side of equality;
this helper performs no reclassification.

The result is `Bracket {status, certified, lo, hi, width, used, remaining}`.
`width=hi-lo` always. Bounds identify output **reserves**, so the upper endpoint
corresponds to the smaller payout. When `certified` is false, these fields do
not establish a root enclosure or any infeasibility witness.

| Status | Meaning |
| --- | --- |
| `UncertifiedDomain` | Endpoint or full-interval domain could not be certified; no root claim |
| `UncertifiedSigns` | Domain passed, but the required two directed residual signs did not; no root claim |
| `Exact` | Both residual bounds certify zero at the returned singleton |
| `Adjacent` | The certified root lies between adjacent GRID integers |
| `Uncertain` | A midpoint's sheet/residual enclosure could not decide a side; the last certified bracket is unchanged |
| `BudgetExhausted` | The certified bracket is wider than one GRID integer and its supplied refinement budget is exhausted |

The final four statuses have `certified=true`. That means the bracket theorem
holds, including a feasible upper endpoint; it is not an instruction to settle.
Malformed bounds, coordinate ranges and budgets above 160 revert with the
appropriate typed error. An uncertifiable endpoint does not become an outside
root sign. Output price zero at the upper endpoint is conservatively rejected;
the separate one-sided endpoint rule in ROOT_CERTIFICATE is not implemented here.

The caller supplies its **remaining shared** midpoint-evaluation budget, at most
160, and carries the returned `remaining` through other segments or resumptions.
Each attempted midpoint, including one that remains uncertain, spends one step.
There is no internal budget reset. Endpoint/domain checks are fixed work with
at most eight coordinates/ticks, not an uncounted convergence loop. An internal
caller can misuse any caller-owned state; repeatedly supplying a fresh 160
would violate this API's shared-budget contract.

## Domain and root-preservation proof

Both endpoints are evaluated by the original full `CurveEvaluation.evaluate`
path. They must be `Evaluated`, have certified aggregate and boundary price
signs, and satisfy the same context's partition, axial/coordinate constraints
and represented principal floors. The upper endpoint additionally has a
strictly positive certified output normal. The endpoint outside the invariant
ball is intentionally allowed to fail `F<=R^2`: the interval's domain proof
does not use ball membership as a premise.

For a mixed partition, the helper then calls the exact moment checks in
`SlackCertificate.criticalPoints`. This function was changed only from private
to internal and given explicit scope/preconditions; its arithmetic did not
change. Let `m=n-1`, let `c_i` be the untouched coordinates, and put

```text
C = sum(c_i), U2 = sum(c_i^2), M = max(c_i),
H = m*U2-C^2 >= 0, D = m*M-C >= 0, T = m*z-C.
rho^2 = (n*H+T^2)/(m*n).
```

The variance minimum occurs at `T=0` when it is included. In that case the
exact comparison `H>=m*Shi^2` proves `rho>=Shi>=S` there. Otherwise the minimum
is an endpoint, already certified. An ordinary positive-radius boundary tick
has `Shi>0`, so a passing mixed interval also avoids `rho=0`.

For `D>0`, the maximum of the largest untouched transverse unit coordinate can
occur at `T*=-H/D`. The signed inclusion tests are performed by unsigned exact
cross multiplication, including equality at either endpoint. If it is included,
the boundary-coordinate price inequality for the largest key `j` becomes

```text
GRID^2*(n*D^2+H) <= (n*GRID-j)^2*(D^2+H).
```

This is an exact-key identity: the true squared sigma cancels. It does not
replace true sigma with a rounded endpoint at the critical point. Endpoint
checks use directed upper sigma as before. The output transverse coordinate is
monotone, so its upper bound is already checked at an endpoint. When `D=0`,
`H=0`, covering the two-dimensional degeneracy; the variance test still forbids
jumping between sheets through the untouched mean. No dense sampling is used
to claim coverage of the interval.

The fixed-segment proof establishes that, after the sheet check, the smallest
untouched aggregate normal has its minimum at an endpoint. Furthermore,

```text
dg_output/dz = -1 + ((n-1)/n)*(S/rho)*(J/rho^2) <= -1/n,
J = sum((c_i-C/m)^2).
```

Thus positive `g_output(zHi)` implies positive output normal throughout the
interval. All affine coordinate, principal, axial and fixed-partition
inequalities interpolate between their endpoints. For an all-interior context,
the exact sphere normals `R-X_i` provide the same conclusions without dividing
by rho. Boundary equalities select one context; no claim of identical
one-sided tick allocation or slack seam continuity is made.

Now require directed residual signs

```text
(F-R^2)_lo(zLo) >= 0,
(F-R^2)_hi(zHi) <= 0.
```

The exact radical is continuous on the certified sheet and has derivative
`dF/dz=-2*g_output<0`. The intermediate value theorem and strict monotonicity
therefore give a unique root in the interval. At the upper endpoint and at the
root, the full domain plus `F<=R^2` imply MATH-7 cap and principal feasibility by
the established reconstruction identities. Below the root, `F>R^2` is a
fixed-partition reconstruction exclusion, not an exclusion inferred from a
false Boolean endpoint check.

Each midpoint is strictly inside a nonsingleton integer bracket. A certified
nonnegative lower residual moves only `lo`; a certified nonpositive upper
residual moves only `hi`. If both bounds certify zero, the root is exact and
the bracket collapses. A one-sided zero bound alone does not imply equality.
When the interval overlaps zero, or the radical status is non-Evaluated, no
bound changes. Restricting a certified domain interval preserves all its
domain properties. Induction proves root inclusion and upper-endpoint
feasibility after every successful update and on every early return.

With `k` successful midpoint updates, width is at most the initial width divided
by `2^k`, rounded up. A failed uncertain attempt consumes budget without this
contraction. A 160-step limit need not reach adjacent **GRID** integers from a
192-bit proof span. The retained maximum-length test intentionally returns
width `2^29` after spending 159 steps following another segment's one step.
No integer progress is silently discarded, and no raw-unit claim is inferred
from the step count.

## Residual-only optimization and range audit

Full endpoint/domain checks run once. `CurveEvaluation.prepareVertical` caches
the exact untouched sum and full 512-bit sum of squares. At a new output `z`,
`A=C+z` and `B=U2+z^2` are exact. `evaluateResidual` returns the separate
`ResidualEvaluation` type, with sheet status and residual bounds but **no**
membership or price fields; `certifiesMembership` cannot accept that type.

For the sphere, wide signed cancellation evaluates

```text
F-R^2 = B+(n-1)*R^2-2*R*A.
```

For mixed partitions, full and residual-only evaluation share the same
`_mixedResidual`: exact `nB-A^2`, directed rho, the unchanged `rho>=Shi` test,
and the original axial/transverse residual enclosure. No squared-polynomial
surrogate, new tolerance, coefficient scaling change, or clamped radicand was
introduced. Both builders' results must remain unmodified and refer to the
same coordinates/context. The residual-only path does not recheck partition,
principal or prices; RootBracket's full-domain proof supplies those premises
before its first use. Non-Evaluated residual fields are invalid. Sphere rho
fields are explicitly documented as unused zeros, not actual rho enclosures.

The additional integer ranges are conservative:

| Quantity | Bound / handling |
| --- | --- |
| GRID coordinate, represented R/S/V | `<2^192` |
| Cached/total sums, `m*z`, `D` | `<2^195` |
| Cached/total squared sums | `<2^387` |
| Exact `nB`, `A^2`, `H`, `D^2` | `<2^390` |
| Residual wide intermediates | `<2^391` |
| Largest lifted critical-point cap products | `<2^461`, retained in 512 bits |
| Sphere native `2R` | `<2^193`; its product with A is wide |
| Midpoint and width | `<2^192`; `lo+(hi-lo)/2` cannot overflow |
| `used`, `remaining` | At most 160 and their sum equals the supplied budget |

The prepared-context bounds also make all prior full-evaluation interval
quotients fit int256, as audited in the scalar evidence. Critical formulas are
valid in one consistent length scale, so lifting all coordinates and Shi
preserves their comparisons. No original stored radius domain is enlarged.

An independent read-only reviewer (`/root/sdk_plans`) checked cached-moment
identity, shared radical signs, status/type separation, critical-test
preconditions, endpoint-zero handling, unchanged uncertain bounds and the
shared budget. The reviewer found no acceptance defect under the documented
prepared-state hypotheses. The suggested sphere-rho documentation clarification
was applied. Root separately reviewed the residual-only arithmetic.

## Tests and independent root oracle

The first compiling root stub produced 13 behavioral failures. The implemented
primitive passed all 13, then gained n=3 and n=8/two-boundary liveness fixtures.
Four separate residual-only tests failed against compiling preparation/residual
stubs before the optimization was implemented. Final focused command:

```powershell
forge test --match-contract '^(RootBracketTest|SlackCertificateTest|CurveEvaluationTest)$' --fuzz-seed 0x20260908 -vv
```

Run from `packages/contracts`: **43 passed, zero failed/skipped**, comprising
19 root/residual tests, 14 existing slack tests and 10 existing scalar tests.
The root fuzz test reported 257 cases. Compilation took 32.01 seconds; suite
wall time was 2.18 seconds. Existing tests include both one-sided fractional
key equalities and boundary-price failure despite positive aggregate normals.

Root tests retain exact sphere roots at endpoints and midpoints; an irrational
sphere root checked by Python `isqrt`; zero/one-step/shared budget behavior;
unchanged caller reserves; uncertain midpoint preservation; invalid ranges,
partitions and zero output price; same-sign endpoint rejection; the hidden
variance hole; and the hidden boundary maximum at both moderate and near-limit
GRID widths. The sphere fuzz family uses all uint128 seeds, mapping `a=seed+1`,
`R=5a`, fixed input coordinate `3a`, and `z in [0,a]` before GRID lifting. Exact
wide square inequalities independently check each returned side of the root;
no valid fuzz input is discarded.

The retained root generator is
[fixtures_root_bracket.py](../../packages/reference/fixtures_root_bracket.py).
It solves in **price space**: fix output price to one, then find the other
positive prices for which the sum of explicit per-tick `supporting_basket`
coordinates equals every fixed reserve. It uses at most 30 multidimensional
Newton iterations with a precision-dependent numerical tolerance, at 110 and
160 decimal digits. Neither production torus evaluation nor RootBracket is
used as the root equation. The existing scalar fixture table supplies only
coordinates, radii, keys and named partitions.

After reserve matching, the generator separately constructs every MATH-7
basket and checks agreement with the supporting baskets. The independent
`verify_baskets` checks each sphere/cap, coordinate principal/price bounds,
aggregate reconstruction and analytic support-cost equality. The n=2 result
also agrees with an independent closed radical expression. Agreement at two
precisions and these numerical checks are finite oracle evidence; they are
not outward-rounded interval proofs.

| Dimensions / ordinary boundary ticks | Floor of root output reserve in GRID units |
| --- | --- |
| 2 / 1 | `44500767304604138371755601356080263154504059660318` |
| 3 / 2 | `118110706132445067948266727102904585864375072737707` |
| 8 / 2 | `468195371646119086619158565181678623455543623944581` |

Reproduce and automatically compare the Solidity literals from repository root:

```powershell
python packages/reference/fixtures_root_bracket.py
python -m unittest discover -s packages/reference/tests -p test_root_bracket.py -v
```

The Python tests produced three stub failures, then **3 passed** in 0.725 seconds.
They are part of the standard reference discovery command. No source or existing
reference fixture was replaced to accommodate a mismatch.

## Measured gas and remaining release obligations

The following are observed gas totals for the same named root tests, including
their preparation and assertions, under Solidity 0.8.30, optimizer 700, viaIR,
Cancun. They are not standalone router transactions or arbitrary gas-limit
assertions. The baseline used full curve/price evaluation at every midpoint.

| Test case | Full midpoint evaluation | Cached residual-only evaluation | Reduction |
| --- | ---: | ---: | ---: |
| 2 dimensions / 1 boundary tick | 51,700,505 | 7,962,929 | 84.6% |
| 3 dimensions / 2 boundary ticks | 48,464,449 | 5,907,063 | 87.8% |
| 8 dimensions / 2 boundary ticks | 207,732,480 | 7,658,923 | 96.3% |
| Irrational sphere golden | 759,533 | 564,390 | 25.7% |

Baseline source SHA256 values were RootBracket
`293921708656293590c598759d762750a086a70ab225caf93def2f65af718d3f`,
CurveEvaluation
`12022100b9e724d5e6cca395c03e9001206fc5d1301c5e40103337e47f102146`,
and RootBracket tests
`978282e7f90b92de1a8b966d1bdb7b2c50a20a7ad787c4f6cae5664468636894`.
The source change removed repeated normal/price computations and per-coordinate
moment reconstruction; it retained every initial full-domain obligation.

Roughly eight million measured helper-test gas remains material. There is no
complete-swap, Aqua-settlement or Arc gas acceptance in this evidence. Root
bracket discovery from the actual starting state, certified trade/event paths,
both-root event ordering, partition transitions, exact combined input progress,
raw payout selection, total shortfall certification, LP changes and cycle
economics are separate obligations. A finite bracket or an independently
regenerated root does not close G1/G2 or the full product release gates.

Dependency chain: prepared exact state and wide arithmetic -> directed endpoint
enclosures -> exact whole-interval moment/price certificate -> strict radical
monotonicity -> unique root -> inductive bracket preservation. Independent
supporting-basket fixtures and square inequalities test that implementation
chain without supplying a circular proof of it.

## Retained computation manifest

The manifest below records the tested sources, finite commands and limitations.
It was validated with the installed mathbox computation-audit manifest validator;
input hashes were recomputed from the workspace.


```json
{
  "schema_version": 1,
  "claim_id": "fixed-partition-root-bracket-2026-09-08",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(RootBracketTest|SlackCertificateTest|CurveEvaluationTest)$' --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)\npython -m unittest discover -s packages/reference/tests -p test_root_bracket.py -v (cwd: repository)",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solidity 0.8.30, optimizer 700, viaIR, Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows host; no complete-swap gas acceptance"
  },
  "mathematics": {
    "assertion_tested": "Unique fixed-partition root bracket preservation, original radical-only equivalence, exact critical-domain rejection, bounded budgets, and independent per-tick support root fixtures",
    "coefficient_domain": "Exact integer/512-bit directed production arithmetic; independent numerical support-vector roots at 110/160 decimal digits",
    "conventions": "GRID=2^32 lifted lengths; fixed context; rho>=S sheet; positive high output normal; residual lower>=0 at low and upper<=0 at high; uncertainty preserves bounds",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/RootBracket.sol",
        "sha256": "9659a03745a5d2d1c3770748e78f201ccbadf1dc4b719a2505c104f94e29ffa3"
      },
      {
        "path": "packages/contracts/src/libraries/CurveEvaluation.sol",
        "sha256": "1537bc49e14837d32279279f99a1f09f937c3a9c17e7226fd7dbceab61a864be"
      },
      {
        "path": "packages/contracts/src/libraries/SlackCertificate.sol",
        "sha256": "fbd85875262f8a4a2004a26d85b0014b372312253cc9e224ed3f6cc9d6e33cf3"
      },
      {
        "path": "packages/contracts/src/libraries/WideMath.sol",
        "sha256": "61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d"
      },
      {
        "path": "packages/contracts/src/libraries/SignedWide.sol",
        "sha256": "8142108db5cc11ddf3a33e17855c7ca4a467f22687194967c28588aef6cb4426"
      },
      {
        "path": "packages/contracts/src/libraries/IntervalMath.sol",
        "sha256": "e7ea7cd4aa5bb7a63f52b665f1311667bb52715f8a4a5ad32a4dde30bd820898"
      },
      {
        "path": "packages/contracts/src/libraries/TickGeometry.sol",
        "sha256": "930431a7bab7d38ad1fc5b173d91a4f5e9340ca5af04631a46c61fc1fd35204b"
      },
      {
        "path": "packages/contracts/src/libraries/OrbitalMath.sol",
        "sha256": "6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb"
      },
      {
        "path": "packages/contracts/test/RootBracket.t.sol",
        "sha256": "2b89df005bf1014a6dcfa5800c2581351e472edbda1ca0265b22809a56554f6b"
      },
      {
        "path": "packages/contracts/test/CurveEvaluation.t.sol",
        "sha256": "34de5ba1aeaea49826d38959cc53e506ddff8b3da3d73149ec59c0c2292cdee4"
      },
      {
        "path": "packages/contracts/test/SlackCertificate.t.sol",
        "sha256": "5a6631553e3777af5892706f371dc8bc284123743b810a886cbae1f1a0240c11"
      },
      {
        "path": "packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol",
        "sha256": "ef0c9b0d9ecc07af1c754a85f5459510c1e9a54fd055b3d058201816a9357d5b"
      },
      {
        "path": "packages/reference/fixtures_root_bracket.py",
        "sha256": "6af21f4d853f25cedfacc1cfcdd93e4ff9a2e224598f32c1efcd8da179c3ccdd"
      },
      {
        "path": "packages/reference/tests/test_root_bracket.py",
        "sha256": "771018d96aa72fb5e39da7efe62e08ad617143b3a98f50c8834397931c7264f3"
      },
      {
        "path": "packages/reference/fixtures_curve_primitives.py",
        "sha256": "a07127b6a82a935a60496ba5926fdccbbc91722447e4e86f957c3005d92894a2"
      },
      {
        "path": "packages/reference/orbital.py",
        "sha256": "4d13eb4a96ff96dcfc32e3a73ec722cf6d3a8694bcb53365e44e887f54dd6352"
      }
    ],
    "bounds": {
      "focused_solidity_tests": 43,
      "root_residual_tests": 19,
      "existing_slack_tests": 14,
      "existing_scalar_tests": 10,
      "root_fuzz_entries": 1,
      "reported_root_fuzz_cases": 257,
      "reference_tests": 3,
      "golden_dimensions": [
        2,
        3,
        8
      ],
      "golden_precisions": [
        110,
        160
      ],
      "maximum_midpoint_budget": 160,
      "maximum_grid_coordinate_bits": 192,
      "conservative_critical_intermediate_bits": 461,
      "support_root_maximum_newton_steps": 30
    },
    "non_claims": [
      "Complete swap/event solver",
      "Initial root bracket discovery",
      "One raw output unit shortfall",
      "Partition seam path certificate",
      "Exhaustive testing",
      "Complete router or Arc gas acceptance",
      "Numerical fixture as universal interval proof"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Foundry fuzz generator; reference support roots are deterministic",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T02:49:41.947Z (focused Solidity test log timestamp)",
    "runtime_seconds": 2.18,
    "timing_scope": "focused Solidity suite wall time; compile 32.01 seconds",
    "reference_runtime_seconds": 0.725,
    "exit_status": 0
  },
  "outputs": [],
  "checks": [
    "13 compiling root-stub behavioral failures",
    "4 compiling residual-only stub behavioral failures",
    "43 focused Solidity tests passed",
    "3 reference-stub failures then 3 reference tests passed",
    "257 sphere fuzz cases checked by exact square inequalities",
    "Retained variance-hole and hidden boundary maximum rejected before refinement",
    "110/160 support-vector roots match Solidity integer floors",
    "Explicit per-tick MATH-7 reconstruction and analytic support-cost checks",
    "Independent read-only source audit passed under builder provenance",
    "Gas on same named tests: n2 51700505 to 7962929, n3 48464449 to 5907063, n8 207732480 to 7658923"
  ],
  "result": "Implementation and finite assertions verified in the stated range; uniform bracket argument conditional on documented exact/directed arithmetic and unmodified prepared state",
  "residual_risks": [
    "Caller must preserve prepared contexts and carry shared budget",
    "Midpoint coefficient uncertainty remains an explicit stop",
    "Residual-only evaluation deliberately cannot certify membership",
    "Approximately eight million helper-test gas is not whole-swap gas acceptance",
    "Full engine traversal, settlement, economic and release obligations remain separate"
  ]
}
```
