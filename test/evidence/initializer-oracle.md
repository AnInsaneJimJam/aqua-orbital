# Independent initialization oracle

On 2026-09-08, **4 reference tests and 6 Solidity tests passed across 12 independent fixtures**. No production initializer, geometry, arithmetic, lifecycle or SDK code changed. This closes the earlier absence of an independent initialization comparison for these finite cases; it is not exhaustive initialization certification, a swap-engine proof, or completion of G1/G2/G3.

## Source authentication and notation

The source is *Orbital*, Dan Robinson, Ciamac Moallemi and Dave White, published June 2, 2025, [official publication](https://www.paradigm.xyz/writing/orbital). The authorized cached HTML was rehashed during this task and matches `docs/sources/orbital.json`: SHA-256 `aa6549a5d178564e9cd87ed7f029be4ebe9709355049db4cf81c93eb6b15655d`, 284,897 bytes, acquired September 7, 2026. This task used the cache, not a new revision or secondary source. Intact extracted TeX was checked against the equal-price derivation (cached TeX lines 59–65) and one-coordinate minimum derivation (lines 199–207).

The paper gives the equal coordinate `r*(1-1/sqrt(n))`. Its plane coordinate `k` translates to repository reserve-sum key `b = k*sqrt(n)/r = tickKey/2^32`. If a single normalized coordinate is `m` and all remaining coordinates are `(b-m)/(n-1)`, sphere equality gives

`n*m^2 - 2*b*m + (b-n+1)^2 = 0`.

The smaller root is `m = [b - sqrt(b^2 - n*(b-n+1)^2)]/n`. This is the paper's direct minimum formula after the stated substitution. For ordinary caps, `n-sqrt(n) < b < n-1`, the unconstrained minimum coordinate zero is excluded by the cap; the minimizing slice has equal remaining coordinates. Equal remaining coordinates minimize their squared distance for a fixed sum, so the smaller feasible quadratic root is the coordinate minimum. The generator checks the resulting slice's sphere equality and its coordinate ordering/positive-price branch at both precisions. Full-range virtual minimum is zero.

Classification: the equal point and virtual minimum are **known after notation translation**. The directed Q128 coefficient and integer slack budgets below are repository numerical adaptations, not statements attributed to the paper. Source checking was restricted to the retained primary article and the repository's [math contract](../../docs/MATH.md); no novelty claim or broader literature survey was performed.

## Independence and assertion contract

`packages/reference/fixtures_initializer.py` imports only Python's integer utilities and mpmath. It does **not** import `orbital.py`, production geometry, the production coefficient generator, a Solidity solver, or generated production outputs. It computes virtual minima with the direct quadratic, rather than production's separate sigma/transverse coefficient path.

At 110 and 160 decimal digits it computes the paper's per-tick virtual minima, aggregate ideal virtual reserve `V*`, ideal equal coordinate `X*=R*q0`, and ideal principal `P*=X*-V*`. It independently derives the specified upper-directed equal coordinate

`X = ceil(R * ceil(2^128*q0) / 2^128)`.

The reference does **not** duplicate the sequence of production virtual-coefficient rounding choices to produce a matching expected `V`. Instead it encloses every permitted directed result around the independently evaluated ideal minimum. Each ordinary virtual coefficient has deficit less than `4/Q`, where `Q=2^128`:

- Flooring the plane center costs less than `1/Q`.
- Each upward square-root coefficient differs from its exact real value by less than `1/Q`. For admitted `n<=8`, the **exact real** sigma and transverse values are each at most `sqrt(7/8)`; their rounded coefficients may exceed that bound. The upward product error is less than `[2*sqrt(7/8)+1/Q]/Q < 2/Q`. Its final coefficient ceiling adds less than `1/Q`.
- Clamping a negative lower coefficient to zero improves the lower bound. Flooring the radius product adds less than one internal unit.

Thus with ordinary-radius sum `R_o` and ordinary-tick count `t_o`, the total virtual deficit is bounded by

`0 <= V* - V < 4*R_o/Q + t_o`,

with the exact zero case handled separately for all-full-range configurations. The fixture uses conservative integer bound `L = ceil(4*R_o/Q)+t_o`, giving

`max(0,ceil(V*)-L) <= V <= floor(V*)`,

`X-floor(V*) <= P=X-V <= X-max(0,ceil(V*)-L)`.

For **every retained case and token scale**, both ends of this principal enclosure have the same raw ceiling. That unique ceiling becomes the immutable raw funding passed to the real Solidity initializer. All 12 cases also have the same raw ceiling as the independently computed ideal paper basket. No fixture raw funding was obtained from production coefficients, changed after a failed initializer, or widened to make a mismatch pass. The generator raises an error if its principal enclosure straddles a raw ceiling; such an ambiguous case would require additional independent precision/bounding work, not an arbitrary choice.

The oracle independently evaluates the actual radial length slack as `R - sqrt(sum_i((R-X_i)^2))`, rather than checking only the initializer's bound formula. It also constructs each initial tick's proportional basket `x_t,i=r_t*X/R` and checks sphere feasibility, strict interior cap placement, minimum virtual reserve and the positive-price coordinate bound. These numerical witness checks use explicit tolerance `10^(-dps+12)` relative to the sphere scale. They are separate from Solidity's `OrbitalMath.certify` call. The exact `n=4` full-range benchmark has rational `q0=1/2` and zero virtual and radial errors.

The Solidity test compares actual initialized coordinates exactly, virtual/principal against independent integer enclosures, raw funding ceilings exactly, stored radial slack against the independent norm ceiling, principal-plus-virtual reconstruction, zero initial fees and all-interior classification. It also rejects a one-atom mutation of oracle-funded raw input. The test harness calls the actual linked `StrategyInitializer.initialize`; it does not emulate it or replace its certificate.

## Retained cases and results

| Family | Dimensions | Ticks | Purpose |
| --- | --- | --- | --- |
| Three-token demo | 3 | 3 | 6/18/6 decimals and ordinary 1.5/1.75 boundaries |
| Unequal radii | 3 | 3 | Minimum-scale ordinary radius, intermediate radius and larger anchor |
| Single full-range sphere | 2 | 1 | Analytic baseline |
| Exact rational sphere | 4 | 1 | Exact half-radius coordinate and zero-error benchmark |
| Minimum cap width | 3 | 3 | Smallest allowed quantized cap width near the equal point |
| Eight-tick families | 3, 5, 8 | 8 | Several radii and all four supported test decimal precisions |
| Near maximum radius | 2, 3, 5, 8 | 3 | Radius sum exactly `2^160-1`, with an ordinary tick dominating the anchor |

Decimal precisions across the corpus are 0/6/8/18. The near-limit samples are numeric-domain fixtures, not frontend allocation or live inventory claims.

| Example | Oracle radial slack ceiling | Stored radial bound | Virtual deficit bound |
| --- | ---: | ---: | ---: |
| Three-token demo | 2 | 4 | 4 |
| Eight ticks, n=8 | 6 | 9 | 14 |
| Near limit, n=2 | 698,393,137 | 8,589,934,594 | 17,179,869,186 |
| Near limit, n=3 | 366,574,862 | 8,589,934,594 | 17,179,869,186 |
| Near limit, n=5 | 4,089,260,767 | 12,884,901,891 | 17,179,869,186 |
| Near limit, n=8 | 6,772,394,138 | 12,884,901,891 | 17,179,869,186 |

All amounts in this table are internal length units. Every radial bound is below `U=2^64`. Virtual error is funded additional principal, not fee revenue or a replacement radial tolerance.

## Reproduction and provenance

Run from the repository root:

```text
python packages/reference/fixtures_initializer.py --write
python -m unittest discover -s packages/reference/tests -p test_initializer_oracle.py -v
forge test --root packages/contracts --match-contract InitializerOracleTest
```

The generator first requires complete corpus equality between 110 and 160 digits before writing JSON or Solidity. Reference tests also require retained JSON and normalized Solidity text to equal regeneration exactly. On the recorded run, Python tests took 0.209 seconds. Solidity compiled in 9.38 seconds; all six tests completed in 8.33 ms (19.52 ms aggregate CPU), with no compiler warnings. Forge's optional Etherscan-config warning does not affect this in-memory test. Environment: Windows, AMD Ryzen 5 7520U, Python 3.12.10, mpmath 1.3.0, Foundry 1.5.1, Solidity 0.8.30, optimizer 700, via IR, Cancun. HEAD was `2ecc6ce2f180fde239c13feee7dd09247c0d1b07`, with uncommitted work.

| File | SHA-256 |
| --- | --- |
| `packages/reference/fixtures_initializer.py` | `1254b59923724aaa222981afc681486833189be0e43a29181242e8c0a4f59e95` |
| `packages/reference/tests/test_initializer_oracle.py` | `9494ac28d12ebdc716ba4b475c0bf81627d75919befe5dbd3bc6f7bfce089923` |
| `packages/reference/fixtures/initializer-oracle.json` | `91604a9f57e06b2b6660ae74cf51d8a96dd3628c55e436f506035f81ee0ab061` |
| `packages/contracts/test/InitializerOracle.t.sol` | `37de1a64acf8c382cc032e6f21fbba937db929c108f6f120c23d166589487b12` |
| `packages/contracts/test/fixtures/InitializerOracleFixtures.sol` | `a7a8320f75fc740ccd9849444c9fee77a2b2fa474058c6e030f3cfed15a2e1e8` |
| `packages/contracts/src/libraries/StrategyInitializer.sol` | `8c6d4566ce4c7c1bcea85714afa1c33997fd72adc3a099a376bed2db266ed8b0` |
| `packages/contracts/src/libraries/TickGeometry.sol` | `930431a7bab7d38ad1fc5b173d91a4f5e9340ca5af04631a46c61fc1fd35204b` |
| `packages/contracts/src/libraries/WideMath.sol` | `61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d` |
| `packages/contracts/src/libraries/OrbitalMath.sol` | `6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb` |

Interpretation: **the implementation satisfies the independent finite oracle assertions in the recorded cases**, conditional on mpmath's high-precision evaluations and the documented coefficient-error argument. Precision stability is strong numerical evidence, not a formal interval proof about mpmath or an exhaustive proof for all radius/key combinations. The corpus neither certifies arbitrary user funding nor tests swapping, crossings, settlement, economic cycles, mutations across all production modules, or live deployment. No mathematical or correctness defect was found in these cases. Subsequent code changes require a rerun.

The embedded computation manifest was validated with the computation-audit skill's validator:

```json
{
  "schema_version": 1,
  "claim_id": "initializer-independent-paper-oracle",
  "repository": {"commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07", "dirty": true},
  "command": "python -m unittest discover -s packages/reference/tests -p test_initializer_oracle.py -v; forge test --root packages/contracts --match-contract InitializerOracleTest",
  "environment": {"software": ["Python 3.12.10", "mpmath 1.3.0", "Foundry 1.5.1", "Solidity 0.8.30", "optimizer 700 viaIR Cancun", "Windows"], "hardware": "AMD Ryzen 5 7520U"},
  "mathematics": {
    "assertion_tested": "Actual StrategyInitializer agrees with independent equal-point, virtual/principal enclosure, raw ceiling and radial length assertions over 12 retained cases",
    "coefficient_domain": "110/160 decimal digit mpmath oracle; exact Python integer rounding; actual Solidity uint256/512 Q128 implementation",
    "conventions": "q0=1-1/sqrt(n); b=key/2^32; virtual minimum from the direct slice quadratic; U=2^64; Q=2^128",
    "inputs": ["n2/3/4/5/8", "ticks1/3/8", "decimals0/6/8/18", "3-token 3-tick demo", "unequal radii", "minimum valid cap width", "R=2^160-1"],
    "bounds": {"cases": 12, "precision_digits": [110, 160], "normalized_witness_tolerance": "10^(-dps+12)", "radius_exclusive": "2^160"},
    "non_claims": ["Exhaustive initialization proof", "Formal mpmath interval certification", "Arbitrary raw funding certification", "Swap/settlement correctness", "Live deployment"]
  },
  "randomness": {"used": false, "generator": "none", "seed": null},
  "run": {"started_at": "2026-09-08T02:43:44Z", "runtime_seconds": 9.40221, "exit_status": 0},
  "outputs": [
    {"path": "packages/reference/fixtures/initializer-oracle.json", "sha256": "91604a9f57e06b2b6660ae74cf51d8a96dd3628c55e436f506035f81ee0ab061"},
    {"path": "packages/contracts/test/fixtures/InitializerOracleFixtures.sol", "sha256": "a7a8320f75fc740ccd9849444c9fee77a2b2fa474058c6e030f3cfed15a2e1e8"}
  ],
  "checks": ["110/160-digit corpus equality", "Exact regeneration", "Per-tick feasibility witnesses", "Exact rational zero-error benchmark", "4 reference tests passed", "6 Solidity tests passed"],
  "result": "Independent finite initialization assertions verified in all 12 retained cases; no production changes required",
  "residual_risks": ["Numerical oracle rather than formal intervals", "Finite case coverage", "Coefficient-error lemma remains a documented argument", "Complete engine and release campaigns separate"]
}
```
