# Directed largest-boundary turn discriminant

The new `FrontierTurn` primitive proves the sign of one exact-frontier
discriminant. It does not certify endpoint identity, feasibility, a connected
path, or a complete swap. This implements the extra lower-key condition in
[FRONTIER_SEGMENT](../../docs/audits/FRONTIER_SEGMENT.md); the other hypotheses
of that theorem remain separate caller obligations.

## Interface and uniform arithmetic argument

`prepare(n, ticks, boundaryCount)` requires a nonempty canonical boundary
prefix and at least one interior tick. It calls `CurveEvaluation.prepare`,
which validates the dimensions, radii, ordered keys and full-range sentinel
and recomputes coefficients from the keys. The selected key is exactly
`ticks[boundaryCount-1].key`, the largest boundary key. Arbitrary coefficient
fields in `Tick` cannot influence this certificate. Binding the supplied tick
table to a strategy's immutable configuration remains the caller's job.

Write `G=2^32`, `Q=2^128`, `b=key/G`, and use the fixed-partition notation
`R,K,S` from MATH/FRONTIER_SEGMENT. At the key,

\[
A_* = K+Rb,\qquad \rho_* = S+R\sigma(b).
\]

`sumNumerator=G*A_*` is formed as `K_num+R*key`, exactly. In particular,
fractional original-length seam coordinates are retained. Each original
boundary contribution has its existing directed bounds
`floor(r*sigmaLo/Q)` and `ceil(r*sigmaHi/Q)`; these are lifted by `G`
after rounding. Preparation adds the similarly rounded `R*sigma(b)`
contribution. Thus `rhoLo <= G*rho_* <= rhoHi`. Recomputing a finer-rounded
version of the original `S` would change the represented problem and is not
done here.

`evaluate(context, untouched)` accepts `n-2` **original integer lengths**;
the context's lengths are already lifted by `G`. It requires an unmodified
prepare result. For `C_N=G*sum(c_k)`, `U2_N=G^2*sum(c_k^2)`, and
`A_N=G*A_*`, the signed output interval encloses

\[
nG^2 D(b)=2A_N^2+2n(G\rho_*)^2-2nU2_N-n(A_N-C_N)^2.
\]

All terms except the radius square are exact integer moments. The radius
bounds are nonnegative, so squaring them preserves their direction. Exact
signed 512-bit subtraction handles cancellation, including `A_N-C_N<0`.
Consequently `upper <= 0` proves `D(b)<=0`, and `lower > 0` proves
`D(b)>0`. Every other interval remains `Uncertain`; `[0,positive]` does not
become positive, and an exact `[0,0]` is nonpositive. The default enum value
also is `Uncertain`. No epsilon, clamp, square-root branch guess or endpoint
acceptance test is used to decide these signs.

For prepared inputs, `2<=n<=8`, tick count is at most 8, and every original
length and total radius is below `2^160`. Lifted coordinates/radius are below
`2^192`, sums below `2^195`, untouched squares below `2^387`, and a conservative
bound on each expanded term and their unsigned accumulations is `2^394`.
Every operation therefore fits the existing 512-bit arithmetic. In particular,
the signed pair sum is squared without casting it into an unsigned signed
representation. Shape/range errors and a default context revert explicitly.

Under the independently established exact-frontier endpoint, price, partition
and orientation hypotheses in FRONTIER_SEGMENT, this nonpositive sign is the
additional condition for an inward-to-outward turn to stay above the largest
boundary. The primitive alone establishes none of those hypotheses. A positive
discriminant can imply needed transitions only after the caller establishes
the same hypotheses. An uncertain result establishes no exclusion.

## Independent fixtures and retained counterexamples

The generator constructs every seam basket in a common unit transverse
direction, sums its coordinates, and computes the missing pair's squared
difference from those aggregate moments. That auxiliary direction is an
algebraic moment witness, not a claim of positive supporting prices. Separate
explicit supporting-basket witnesses verify the physical examples below.
Exact Python integers independently certify each Q128 coefficient enclosure;
the resulting directed signed limbs are compared with Solidity literals.

Thirteen named fixtures agree at 110 and 160 decimal digits:

- For two tokens, radii `s,s` and key `5/8`, exact `D=7s^2/16>0`.
  Both endpoint prices `(2,1)` and `(1,2)` give valid mixed frontier points,
  while the actual turn crosses below the key. This retains the counterexample
  to using endpoint validity alone. At tiny radius `s=1`, the lower enclosure
  is zero and the answer correctly remains uncertain.
- For seven tokens, radii `8s,8s`, key `35/8`, and untouched coordinates
  `(10s,10s,10s,9s,9s)`, `sigma=1/8` is exactly represented. Positive
  support prices `(5,5,6,6,6,7,7)` produce a true tangent with an exact zero
  interval; nonpositive acceptance is therefore live at an exact tangent.
- For eight tokens, radii `s,3s`, key `11/2`, and untouched coordinates
  `(3s,3s,3s,3s,3s,s+epsilon)`, exact
  `n*D=64s*epsilon-24epsilon^2`. At `s=10^40`, `epsilon=-1,0,+1`
  all remain uncertain despite the distinct exact signs. Larger signed
  perturbations give decisive signs. The negative case has a physically valid
  mixed turn verified by matching untouched reserves in price space with
  explicit per-tick supporting baskets (at most 30 Newton steps).
- The corpus also includes exact three-token signs, a negative pair sum,
  a fractional seam, a robust three-token negative discriminant and a
  two-boundary context whose largest key and pre-lift rounding matter.

An initial precision-stability failure was traced to applying floating-point
floor to an exactly integral one-key sphere moment. The generator now uses
the exact rational identity for that family and checks it against the explicit
high-precision baskets. A copied signed-limb typo was caught by the automatic
Solidity literal comparison and corrected. Neither failure was treated as
numerical tolerance or suppressed.

## Verification and scope

Ten behavioral tests failed against a compiling revert stub before behavior
was implemented. Four independent reference tests likewise failed against
their stub. The final focused run passed 29 Solidity tests: 12 turn tests,
7 existing event tests and 10 existing evaluation tests. The turn fuzz test
reported 257 cases with seed `0x20260908`, comparing exact three-token results
with an independently expanded integer polynomial. Maximum-width cases cover
dimensions 2, 3, 7 and 8. The five reference tests pass, regenerate all 13
fixtures at both precisions and compare three exact signed 512-bit endpoint
goldens with Solidity. An independent read-only source audit found no
acceptance defect under the documented prepared-context assumptions.

```powershell
# cwd: packages/contracts
forge test --match-contract '^(FrontierTurnTest|FrontierEventsTest|CurveEvaluationTest)$' --fuzz-seed 0x20260908 -vv
# cwd: repository
python -m unittest discover -s packages/reference/tests -p test_frontier_turn.py -v
python packages/reference/fixtures_frontier_turn.py
```

The counterexample helper test measured 154,909 gas, including tick building,
preparation, evaluation and assertions. The combined four-dimension wide test
measured 634,657 gas. These are finite helper-test observations; they do not
establish a whole-swap or traversal gas budget. Full mixed traversal,
root-identity composition, rounded-state initial release and target deployment
are outside this component's acceptance claim.

## Retained computation manifest

The embedded manifest records the finite source/run scope. Its schema and all
input hashes were checked with the installed computation-audit validator.

```json
{
  "schema_version": 1,
  "claim_id": "directed-frontier-turn-2026-09-08",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(FrontierTurnTest|FrontierEventsTest|CurveEvaluationTest)$' --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)\npython -m unittest discover -s packages/reference/tests -p test_frontier_turn.py -v (cwd: repository)\npython packages/reference/fixtures_frontier_turn.py (cwd: repository)",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solidity 0.8.30, optimizer 700, viaIR, Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows host; measured helper-test gas only"
  },
  "mathematics": {
    "assertion_tested": "Directed largest-boundary exact-frontier discriminant signs preserve zero/nearzero uncertainty, exact seam and original sigma contribution rounding",
    "coefficient_domain": "Exact signed/unsigned 512-bit Solidity; exact Python integers and rational moments; 110/160-digit independent explicit per-tick baskets",
    "conventions": "Largest canonical boundary key; original untouched lengths, GRID-denominator context, returned interval encloses n*GRID^2*D; unmodified prepared context; no endpoint or path identity implied",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/FrontierTurn.sol",
        "sha256": "f1d9fc9cf528310040214af00101907ee011efd2be18f58b9394ea7843378e34"
      },
      {
        "path": "packages/contracts/test/FrontierTurn.t.sol",
        "sha256": "0b5d386a1e504fa2447c47895c552b20d464e22a6b1b85ac7d0132207deb188b"
      },
      {
        "path": "packages/contracts/src/libraries/CurveEvaluation.sol",
        "sha256": "1537bc49e14837d32279279f99a1f09f937c3a9c17e7226fd7dbceab61a864be"
      },
      {
        "path": "packages/contracts/test/CurveEvaluation.t.sol",
        "sha256": "34de5ba1aeaea49826d38959cc53e506ddff8b3da3d73149ec59c0c2292cdee4"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierEvents.sol",
        "sha256": "5fd37fd1cf314474a22eeda3856743d95f98da6b49d06671921f5e6c5b120721"
      },
      {
        "path": "packages/contracts/test/FrontierEvents.t.sol",
        "sha256": "8dede26540626afb1cd817159327fa96cd8a52dfcbfdc7f2fea13cf9986761da"
      },
      {
        "path": "packages/contracts/src/libraries/OrbitalMath.sol",
        "sha256": "6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb"
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
        "path": "packages/contracts/src/libraries/SignedWide.sol",
        "sha256": "8142108db5cc11ddf3a33e17855c7ca4a467f22687194967c28588aef6cb4426"
      },
      {
        "path": "packages/contracts/src/libraries/IntervalMath.sol",
        "sha256": "e7ea7cd4aa5bb7a63f52b665f1311667bb52715f8a4a5ad32a4dde30bd820898"
      },
      {
        "path": "packages/reference/fixtures_frontier_turn.py",
        "sha256": "543eb49564639b281f0d4829c809d6de7347e30355a809bb922a65ccc527f2d9"
      },
      {
        "path": "packages/reference/tests/test_frontier_turn.py",
        "sha256": "48c2d3889839ad4e9c11bb66b52e3d70da056964f7d1b65c2d26903772fecbf7"
      },
      {
        "path": "packages/reference/orbital.py",
        "sha256": "4d13eb4a96ff96dcfc32e3a73ec722cf6d3a8694bcb53365e44e887f54dd6352"
      },
      {
        "path": "docs/audits/FRONTIER_SEGMENT.md",
        "sha256": "5bb43409ef3c1ddac4a6af80228e87aa8c698b88036571bcff4cbbec01ccdfbb"
      }
    ],
    "bounds": {
      "focused_solidity_tests": 29,
      "turn_tests": 12,
      "event_tests": 7,
      "evaluation_tests": 10,
      "turn_fuzz_entries": 1,
      "reported_turn_fuzz_cases": 257,
      "reference_tests": 5,
      "named_fixtures": 13,
      "solidity_ported_exact_limb_goldens": 3,
      "fixture_dimensions": [
        2,
        3,
        7,
        8
      ],
      "maximum_fixture_ticks": 3,
      "supported_maximum_ticks": 8,
      "supported_dimensions": [
        2,
        8
      ],
      "maximum_original_length_bits": 160,
      "maximum_lifted_length_bits": 192,
      "conservative_expanded_sum_bits": 394,
      "oracle_precisions": [
        110,
        160
      ],
      "support_witness_maximum_newton_steps": 30
    },
    "non_claims": [
      "Exact-frontier endpoint or root identity",
      "Standalone same-partition path acceptance",
      "Complete mixed traversal",
      "Global exclusion from an uncertain result",
      "Rounded-state release or raw-token history",
      "Full-swap gas acceptance",
      "Deployment or sponsor qualification"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Foundry seeded fuzz; reference fixtures deterministic",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T03:54:44.362787Z",
    "runtime_seconds": 0.43199,
    "timing_scope": "focused Solidity suites; compilation 12.69 seconds",
    "reference_started_at": "2026-09-08T03:55:15.520827+00:00",
    "reference_runtime_seconds": 0.297,
    "reference_process_runtime_seconds": 1.0652446,
    "exit_status": 0
  },
  "outputs": [],
  "fixture_stdout_sha256": "9d5eaa798e298bd9a0019099adc4e100c79a3dffca922cbe292da76e9f6dddba",
  "checks": [
    "10 compiling revert-stub Solidity failures before behavior",
    "4 independent reference stub failures before implementation",
    "29 focused Solidity tests passed, including257 seeded polynomial cases",
    "5 reference tests and13 fixtures stable at110/160 digits",
    "Exact rational identities for tangent and nearzero true signs",
    "Explicit per-tick seam moment enclosure, separate physical support witnesses",
    "Three signed512 golden endpoints agree with Solidity literals",
    "Largest boundary, fractional seam, original contribution rounding, default context and untrusted coefficient regression checks",
    "Independent read-only arithmetic/source audit passed under prepared-context hypotheses"
  ],
  "result": "Implementation and finite assertion verified in the recorded range; exact sign enclosure proved above under the source domain and prepared-context hypotheses",
  "residual_risks": [
    "Caller must preserve prepared-context provenance and bind the tick table to immutable strategy configuration",
    "Sign proof does not establish endpoint identities or connect a path",
    "Nearzero uncertainty requires conservative handling by eventual traversal",
    "Independent high-precision physical witnesses remain finite numerical evidence",
    "Helper-test gas is not complete engine gas acceptance"
  ]
}
```
