# Numerical evidence — partial implementation

This is an evidence ledger for implemented primitives and an endpoint certificate, **not a completed proof of a swap engine**. See [NUMERICS](../../docs/NUMERICS.md) for the normative numerical contract and [paper ledger](../../docs/PAPER_IMPLEMENTATION.md) for source translations and counterexamples.

## Implemented domains and bounds

| Code symbol | Unit / representation | Current argument |
| --- | --- | --- |
| WideMath.Uint512 | unsigned integer, hi/lo uint256 limbs | Exact checked add/subtract; 256×256 product from mul/mulmod; bounded long division and floor sqrt |
| TickGeometry.GRID | 2^32 key denominator | Validates signed domain before squaring n*GRID−key; ordinary key strictly below (n−1)GRID |
| TickGeometry coefficients | dimensionless Q128 lower/upper | Directed rational quotient and integer roots; sentinel virtual/sigma zero |
| OrbitalMath.x[i], radius sum | integer internal lengths, <2^160 | Onchain certificate n=2..8, ticks=1..8, positive radii, sorted keys and full-range sentinel |
| A, B | sum lengths <2^163; squared sum <2^323 | B and A² use wide products; no square of a length is assumed to fit uint256 |
| Knum | sum r*j, units length×2^32 | Ordinary j<7*2^32 and radius sum<2^160 give <2^195 |
| Slo/Shi, rhoLo/rhoHi | directed internal lengths | S sums directed per-radius contributions; rho uses exact nB−A² and directed n division/root |
| centered | (nR+K−A)×2^32 | Sign checked; magnitude <2^195; its square is wide |
| maximumDeviation | n*max(X)−A | Nonnegative by construction; <2^163 |
| virtual credit V | sum floor(r*mLower/2^128) | Principal lower bound x[i]>=V checked separately |

Native products inside the endpoint certificate stay below uint256: A*GRID and R*key <2^195, n*R*GRID <2^195, sigmaHi*GRID approximately <=2^160, and transverseHi*GRID <2^195. Products with maximumDeviation, centered and rho use WideMath. The exact nB−A² numerator is <2^326. Largest primitive product is <2^512. These bounds describe the current code only; future crossing/solver expressions need their own report.

## Endpoint acceptance argument and limits

All-interior states use the exact sphere reduction with each X_i<=R and squared distance<=R². Mixed states use exact key cross multiplication for the boundary prefix, rhoLo>=Shi, an upper bound on F, a lower bound on the smallest interior price, and a conservative check of the largest boundary key's reconstructed coordinate. False includes unresolved interval signs. Coefficients must be constructed by TickGeometry for the same n/key, never supplied as untrusted arbitrary tuples.

The reconstruction proof and boundary-price reduction are conditional on the stated hypotheses in the paper ledger. An independent read-only audit found no false-accept path by inspection under this coefficient provenance. It did not prove a complete solver, numerical output optimality, liveness or release readiness. The accepted mixed-boundary fixture is independently generated from per-tick minimizers; the rejected rounding fixture retains the discovered failure mode.

## Evidence actually run

- `pnpm test:reference`: analytic benchmarks, explicit primal/dual witnesses, all six flagship pairs, both crossing roots, actual slack constraints, and two retained counterexamples. Specified fixtures are stable at 110/160 decimal digits. Dimension sweep is 2,3,4,8,16,32 for per-tick feasibility only.
- `pnpm test:contracts`: wide arithmetic, Q128 coefficient intervals, endpoint certificates and contract integration unit tests. Local fuzz profile only. See contracts.txt for exact entry points/counts.
- The reference supports numerical diagnostics, not a universal proof. It does not import the production torus library.

## Still required before G1 acceptance

Signed/interval primitives; certified original-radical roots and both-root event ordering; connected-branch proof from rounded starts; the variance-minimum obligation exposed by the second counterexample; finite segment progress; reconstruction/allocation procedure; principal/fee separation through actual settlement; total output shortfall <=one raw unit; integer reachable adversarial fixtures; broad differential/cycle/fuzz/invariant/mutation campaigns; representative accepted-state liveness; final gas/work limits.

No implementation may enable deployment on the strength of this partial ledger. There is no completed deterministic basket allocator, no production swap traversal and no release error bound yet.
