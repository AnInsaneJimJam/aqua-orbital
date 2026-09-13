# All-interior, no-crossing exact-input path

2026-09-08. **Claim and verdict: proved as written under the immutable-metadata
and exact-arithmetic hypotheses below.** `InteriorSwap` certifies a complete
all-interior geometric path from the actual starting state to the actual
integer endpoint, together with a globally optimal ideal output and an
at-most-one-raw-output-unit retained shortfall. It explicitly defers tick
traversal. This is one production component of the eventual engine, not its
mixed-partition replacement and not a settlement implementation.

The finite implementation checks passed: **35 Solidity tests** (15 wrapper,
13 SphereStep, 7 endpoint certificate) and **5 independent reference tests**.
Both Solidity fuzz entries reported 257 cases. Exact arguments below establish
path coverage; numerical fixture agreement is not substituted for that proof.

## API, units and provenance

`InteriorSwap.exactInput(x,ticks,decimals,input,output,rawNetInput)` returns
`{amountOutRaw,reserves,netInputInternal,outputQuantum,shortfallUpper}`.
It does not mutate caller reserves, calculate fees, call tokens, modify custody
or settle transfers. `rawNetInput` is the already-selected **net** raw input.

For immutable token decimals `d`, the only conversion is
`q(d)=10^(18-d)*2^64` internal lengths per raw token unit. The wrapper validates
every supplied decimal in `[0,18]`, dimensions `[2,8]`, metadata length and the
distinct pair. It derives both input and output quanta; callers cannot supply
an arbitrary payout quantum. Returned lengths are original internal units,
not the GRID-denominator proof coordinates used by RootBracket.

**Metadata hypothesis:** the internal caller supplies the strategy's validated,
immutable token decimals and tick table. Ordinary keys satisfy TickGeometry's
exact domain, coefficients come from `TickGeometry.coefficients` at activation,
and radii/keys describe that same strategy. As with `OrbitalMath.certify`, this
helper does not authenticate an arbitrary caller-constructed coefficient table.
The activation/router layer remains responsible for that binding and its
separate configuration requirements. No existing math/router/SDK source was
edited for this task.

The actual starting vector must pass `M.certify`. A false result, including
interval uncertainty, produces `UncertifiedStart`; it does **not** prove global
infeasibility. Only a certified state that fails strict all-interior
classification produces `RequiresTraversal`. For total radius `R`, strict
classification is `sum(X)*GRID < R*firstOrdinaryKey`, with no cap check needed
when only the full-range tick exists. Equality is deliberately outside this
path. The validated endpoint certificate also enforces original lengths and
total radius strictly below `2^160` and represented principal lower bounds.

Before converting raw input, the wrapper compares
`rawNetInput <= floor((R-X_input)/q_input)` and requires it positive. Thus the
multiplication cannot overflow and input cannot exceed the nonnegative-price
branch. It then calls the existing [SphereStep](sphere-step.md) exactly once
from the actual state, with the decimals-derived output quantum. Zero raw
output retains SphereStep's typed `NoOutput` failure.

The rounded endpoint must again be strictly all-interior and pass `M.certify`.
Non-strict endpoint classification produces `RequiresTraversal` before any
endpoint certificate is interpreted; a remaining false certificate produces
`UncertifiedEndpoint`. `RequiresTraversal` can arise solely from rounding onto
a key and does not assert that the ideal curve necessarily crossed it.

## Whole-path certificate, including existing slack

Use the real definitions in [MATH](../../docs/MATH.md) and the unchanged rounding
contract in [NUMERICS](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/NUMERICS.md). Fix all untouched coordinates,
write input start as `a`, input deficit as `alpha=R-a`, original output deficit
as `w0=R-X_output`, and exact net input as `d`. Define

```text
J = sum_{k != input,output} (R-X_k)^2,
C = R^2-J,
v(t) = sqrt(C-(alpha-t)^2),     0 <= t <= d.
```

Starting sphere membership gives `v(0)>=w0>=0`. Positive accepted input gives
`0<d<=alpha`, hence `alpha>0` and
`v(t)^2-v(0)^2=t*(2*alpha-t)>0` for `t>0`. Therefore the exact final output
deficit `v(d)` is strictly positive. The output normal can be zero initially;
the path then has a continuous one-sided departure, and the implementation
does not divide by that zero normal. The final input normal may equal zero.

The ideal frontier path after an output-only release has output reserve
`R-v(t)`. On `v(t)>0`,

```text
v'(t) = (alpha-t)/v(t) >= 0,
v''(t) = -C/v(t)^3 < 0,
d^2/dt^2 [a+t+R-v(t)] = C/v(t)^3 > 0.
```

Thus the pair reserve sum is convex. If `v(0)=0`, continuity extends convexity
to that endpoint. Its maximum over the closed interval is attained at an
endpoint. The initial released sum is no greater than the actual starting
sum; the exact final sum is no greater than the rounded final sum. Both actual
sums passed the strict first-key comparison, so the entire ideal arc lies
strictly below every ordinary key. Untouched sums are constant.

There is also a monotone path ending at the **actual** rounded endpoint, without
reversing any output at the end. Put

```text
wPaid = w0 + amountOutRaw*q_output <= v(d).
```

Initially release output only until its deficit is `min(v(0),wPaid)`. Then
increase input from `0` to `d` with output deficit `min(v(t),wPaid)`. Before
clipping, this is the same sphere arc. Once clipped, output is held fixed while
remaining input enters; its reserve sum increases only to the certified actual
endpoint. If clipping already holds initially, the whole input leg is this
horizontal interior segment. Output is monotone throughout. The vertical
release decreases reserve sum, the arc uses the convex endpoint bound, and the
clipped segment uses its increasing final-sum bound. All phases stay strictly
below the first key.

Every phase also stays inside the radius-R ball: the output deficit never
exceeds `v(t)`, and the input deficit stays nonnegative. All coordinates remain
between zero and R, so aggregate price normals `R-X_i` are nonnegative. For
each tick, the all-interior MATH-7 basket is exactly `(r_t/R)*X`. Its norm and
cap constraints follow by scaling the aggregate ball and strict sum bound;
its coordinates are at most `r_t`. The proved cap minimum bounds each
coordinate from below by the true minimum and hence by the represented virtual
credit. This establishes per-tick principal solvency throughout, not merely
a small aggregate residual. No tick ownership or virtual contribution changes.

The mathematical release/clipping witness is not implemented as separate
rounded transfers. SphereStep solves the final output directly from the actual
state; the single raw net input and single raw output remain exact.

## Global optimum and the retained raw-unit bound

Let `X*` be the exact final sphere root, including actual starting slack.
Define the exact price vector `p=R*1-X*`. Then `p>=0`, `||p||=R`, and
`p_output=v(d)>0`. Each free supporting basket is
`r_t*1-r_t*p/R=(r_t/R)*X*`, and its sum is below every tick cap because the exact
root sum is no greater than the certified rounded final sum. Consequently
every tick attains its free support minimum at that basket, including the
full-range tick.

For any other feasible aggregate `Y` in the **same immutable tick bundle**,
including a different partition, summed per-tick support gives
`p dot Y >= p dot X*`. Holding the input and untouched coordinates fixed yields
`p_output*(Y_output-X*_output)>=0`. Positive output price therefore proves that
no feasible endpoint can have a smaller output reserve. This is the global
fixed-input optimum, not merely a locally chosen sphere root. No positivity
assumption on the final input normal is needed.

SphereStep returns

```text
amountOutRaw = floor((v(d)-w0)/q_output),
shortfallUpper = ceil(v(d))-wPaid <= q_output.
```

Because `w0` and the quantum are integers, computing the exact integer floor
root first does not alter this raw floor. The actual omitted output is
`v(d)-wPaid`, nonnegative and strictly below one quantum; the returned integer
upper bound is at most that quantum. Reverse triangle inequality between the
ideal and actual final deficit vectors also gives
`R-||R*1-X_actual|| <= v(d)-wPaid <= shortfallUpper`. Thus the same
length-valued quantity bounds radial slack. It includes all actual starting
slack; there is no invariant reset, arbitrary residual tolerance or fictitious
input. Cross-trade cycle and historical-state obligations remain separate.

## Arithmetic ranges and independent review

| Quantity | Bound |
| --- | --- |
| Each original X and accepted total R | `<2^160` |
| Sum of at most eight X values | `<2^163` |
| Raw quantum | `2^64 <= q <= 10^18*2^64 <2^124` |
| Raw net input after capacity check | `<2^96` |
| Exact net input and paid output length | `<2^160` |
| Strict first-key comparison products | `<2^195`, native uint256 |
| Sum of up to eight deficit squares | `<2^323`, retained in 512 bits |
| Root/ceiling and returned slack | At most R and q respectively |

Metadata checks occur before exponentiation; capacity comparison occurs before
raw multiplication. The existing sphere/endpoint primitives retain their
wide arithmetic and rejection behavior. An independent read-only source audit
by `/root/sdk_plans` found no acceptance defect under the stated metadata
provenance. It separately checked the clipped path, zero-initial-output-normal
argument, strict endpoint rule and exact final support witness.

## Finite verification and provenance

The compiling wrapper stub produced **13 behavioral failures** before
implementation. After those passed, two additional tests covered the clipped
interior path and maximum radius/eight-token raw conversions. Final command
from `packages/contracts`:

```powershell
forge test --match-contract '^(InteriorSwapTest|SphereStepTest|CertificateTest)$' --fuzz-seed 0x20260908 -vv
```

Result: **35 passed, zero failed/skipped**, 15+13+7 tests; both fuzz tests
reported 257 cases. Compilation took 12.15 seconds; suites took 0.22258 seconds.
Coverage includes all six directed pairs/three ticks, unchanged caller memory,
decimals 0 through 18, input conversion before overflow, positive input/zero raw
output, initial output price zero, final input price zero, valid mixed and
equality starts, actual rounded key equality, uncertifiable starts, released
slack and the original `2^160` boundary. The added slack fixtures assert
geometry, not a reachable previous raw-token history.

The independent generator
[fixtures_interior_swap.py](../../packages/reference/fixtures_interior_swap.py)
uses three tokens with decimals `[6,6,18]`, radii `[100,200,400]` whole internal
units, keys `[3/2,7/4,full]`, and start `[500,400,100]` whole internal units.
Initial sphere normals are proportional to `[2,3,6]`. Each directed pair gets
exactly one whole net input token.

The primary oracle solves fixed-reserve matching in price space through
explicit per-tick `supporting_basket` calls, with at most 30 Newton iterations
at 110 and 160 digits. It never uses the production sphere/torus residual as
its root equation. It validates support baskets, then checks the **rounded**
MATH-7 baskets using exact rational sphere/cap/minimum-principal/price
inequalities. Integer squares independently certify the ideal deficit ceiling,
actual feasibility and infeasibility of one extra raw output. No dense samples
are used as a path certificate.

| Pair | Decimals in/out | Expected raw output |
| --- | --- | ---: |
| 0 -> 1 | 6 / 6 | 664264 |
| 0 -> 2 | 6 / 18 | 332407920811817970 |
| 1 -> 0 | 6 / 6 | 1491935 |
| 1 -> 2 | 6 / 18 | 498959199764142272 |
| 2 -> 0 | 18 / 6 | 2975367 |
| 2 -> 1 | 18 / 6 | 1991721 |

The independent reference task recorded four stub failures, then five passing
tests in 0.922 seconds, including automatic agreement with the Solidity output
and slack literals. Reproduce from repository root:

```powershell
python -m unittest discover -s packages/reference/tests -p test_interior_swap.py -v
python packages/reference/fixtures_interior_swap.py
```

The combined six-pair Solidity test measured 554,634 gas, including six calls,
preparation and assertions. The maximum-radius/eight-token test measured
128,022 gas. These are helper-test observations, not complete router, SwapVM,
Aqua, invoice or Arc gas acceptance.

Mixed traversal, fee execution, settlement, binding configuration to deployed
state, publication and live sponsor flows remain outside this scoped component.
The broader event/root primitives are still required for the eventual full
engine. The flagship's six-pair fixture here does not prove that every trade
in the three-tick product can use this path or close its release gates.

## Retained computation manifest

The embedded manifest records the finite source/run scope. Its schema was
validated with the installed mathbox computation-audit validator and input
hashes were recomputed from the shared workspace.


```json
{
  "schema_version": 1,
  "claim_id": "all-interior-no-crossing-swap-2026-09-08",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(InteriorSwapTest|SphereStepTest|CertificateTest)$' --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)\npython -m unittest discover -s packages/reference/tests -p test_interior_swap.py -v (cwd: repository)\npython packages/reference/fixtures_interior_swap.py (cwd: repository)",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solidity 0.8.30, optimizer 700, viaIR, Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows host; helper-test gas only, not complete swap gas acceptance"
  },
  "mathematics": {
    "assertion_tested": "All-interior actual-state exact-input conversion, no-crossing endpoint certificate, raw-output optimum/slack and independent explicit per-tick six-pair fixtures",
    "coefficient_domain": "Exact 512-bit/integer Solidity arithmetic; exact rational rounded baskets and 110/160-digit independent price-space support roots",
    "conventions": "Original internal lengths with U=2^64; raw quantum=10^(18-decimals)*U; validated immutable tick coefficients; strict start/rounded-end first key; actual slack is retained/released without reset",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/InteriorSwap.sol",
        "sha256": "ae67c603da75372f8ba9e520b8880594ac22518741ca5ceca25c2c864b799d0f"
      },
      {
        "path": "packages/contracts/test/InteriorSwap.t.sol",
        "sha256": "443a06b3e2aa5054667fbf24522d9bc997cc1e013e65adcebf3f03f0815eb065"
      },
      {
        "path": "packages/contracts/src/libraries/SphereStep.sol",
        "sha256": "fc913149d1c166afd5c15a3a9be37f05a026b1bb5d2fa2573ed867bb9e4f1de6"
      },
      {
        "path": "packages/contracts/test/SphereStep.t.sol",
        "sha256": "d10ad7d00744c84fbe0069e8edf698bac7d68e78384bfbe0abd8f309b5869d9c"
      },
      {
        "path": "packages/contracts/src/libraries/OrbitalMath.sol",
        "sha256": "6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb"
      },
      {
        "path": "packages/contracts/test/Certificate.t.sol",
        "sha256": "251eea7801234631e7438beb81a53651ced99b5ec57b7c5290cdcd488480ead2"
      },
      {
        "path": "packages/contracts/src/libraries/TickGeometry.sol",
        "sha256": "930431a7bab7d38ad1fc5b173d91a4f5e9340ca5af04631a46c61fc1fd35204b"
      },
      {
        "path": "packages/contracts/src/libraries/WideMath.sol",
        "sha256": "61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d"
      },
      {
        "path": "packages/reference/fixtures_interior_swap.py",
        "sha256": "984b7ba430e5b4ca6cbcc75396c4e7701904544c4f1dffde49d2515884fe8f70"
      },
      {
        "path": "packages/reference/tests/test_interior_swap.py",
        "sha256": "73b7972e3f1ab7adb774e95699034b505b1998060094f91e2589943efa638c29"
      },
      {
        "path": "packages/reference/orbital.py",
        "sha256": "4d13eb4a96ff96dcfc32e3a73ec722cf6d3a8694bcb53365e44e887f54dd6352"
      }
    ],
    "bounds": {
      "focused_solidity_tests": 35,
      "interior_swap_tests": 15,
      "sphere_tests": 13,
      "endpoint_tests": 7,
      "fuzz_entries": 2,
      "reported_cases_per_fuzz_entry": 257,
      "reference_tests": 5,
      "directed_pairs": 6,
      "fixture_dimensions": 3,
      "fixture_ticks": 3,
      "fixture_token_decimals": [
        6,
        6,
        18
      ],
      "tested_token_decimals_range": [
        0,
        18
      ],
      "maximum_dimensions": 8,
      "maximum_original_length_bits": 160,
      "raw_quantum_maximum_bits": 124,
      "maximum_cap_comparison_bits": 195,
      "maximum_deficit_square_sum_bits": 323,
      "oracle_precisions": [
        110,
        160
      ],
      "oracle_maximum_newton_steps": 30
    },
    "non_claims": [
      "Mixed-partition traversal engine",
      "Fees or settlement",
      "Authentication of arbitrary metadata",
      "Reachable previous raw-token history for every slack fixture",
      "Complete router/Aqua/invoice/Arc gas acceptance",
      "Exhaustive fuzzing or universal numerical convergence",
      "Full product or sponsor qualification"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Foundry seeded fuzz; independent support fixtures deterministic",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T03:20:25.243Z (Solidity test log timestamp)",
    "runtime_seconds": 0.22258,
    "timing_scope": "focused Solidity suites; compilation 12.15 seconds",
    "reference_started_at": "2026-09-08T03:17:02.547066Z",
    "reference_runtime_seconds": 0.922,
    "exit_status": 0
  },
  "outputs": [],
  "fixture_stdout_sha256": "b8be3ce5a254cc12471fb64f248bceb94a0b89715e5cbd855ba708816661cbee",
  "checks": [
    "13 compiling wrapper-stub behavioral failures",
    "35 final focused Solidity tests passed",
    "257 wrapper fuzz cases and 257 existing SphereStep fuzz cases",
    "4 independent reference stub failures followed by 5 passing tests",
    "Six pair output/slack literals agree with 110/160 support-basket regeneration",
    "Exact rational actual endpoint tick sphere/cap/minimum-principal/price witnesses",
    "Exact one-extra-raw square exclusions and deficit-ceiling inequalities",
    "Initial zero output normal, terminal zero input normal and clipped interior path",
    "Rounded key equality returns RequiresTraversal while false certificate has distinct status",
    "Independent read-only implementation and path/support audit passed under metadata provenance"
  ],
  "result": "Implementation and finite assertions verified in the recorded scope; whole-path and global fixed-input output proofs stated above under immutable validated metadata and arithmetic hypotheses",
  "residual_risks": [
    "Caller must bind decimals and coefficients to immutable strategy configuration",
    "RequiresTraversal needs eventual mixed engine handling",
    "No fees, settlement or live deployment covered",
    "Historical slack/cycle economics remain separate",
    "Helper-test gas does not certify complete SwapVM execution"
  ]
}
```
