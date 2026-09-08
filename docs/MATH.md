# Mathematical contract

For the Aqua/Arc build, read [MASTER_PROMPT.md](../MASTER_PROMPT.md) first. Its maker-owned strategy lifecycle overrides pooled custody and permanent anchor ownership; the Orbital geometry and corrected crossing equations below are retained.

Normative reference for [SPEC.md](../SPEC.md). All equations in this file use real, normalized amounts unless explicitly described as integer representation. Implement their certified fixed-point counterpart from [NUMERICS](NUMERICS.md); do not round each displayed equation independently.

## 1. Per-tick geometry and canonical coordinates

For `n` tokens, let `1` be the all-ones vector and `v = 1/sqrt(n)`. A radius-`r` sphere has center `r 1` and trading frontier

`||x - r 1||² = r²`.

Its equal-price point is `x_i = r q0`, where `q0 = 1 - 1/sqrt(n)`. The convex reserve set behind a cap is

`C(r,b) = {x : ||x-r1||² <= r², sum(x_i) <= r b}`.

For a full-range tick use the ball without a binding cap on the nonnegative-price branch. Convex-set membership matters for safe rounding; the ideal economic trade frontier is its supporting surface, not the entire ball interior.

`MATH-1` Use normalized **reserve-sum** boundary `b = sqrt(n) k/r`, not the paper's normalized projection `k/r`, as the canonical key. Then

`n - sqrt(n) < b <= n - 1`,

`sigma(b) = sqrt(1 - (b-n)²/n)`,

`k = r b/sqrt(n)`, and `s = r sigma(b)`.

The full-range sentinel corresponds to `b=n-1` but is always classified interior in this release. At the mathematical extremity where only one price is positive it can lie on that plane geometrically; the implementation must still not remove its radius from `R`.

`MATH-2` Ordinary tick keys are unsigned integers `j`, with `b = j/2^32`, strictly below `n-1`. Reject `b <= n-sqrt(n)` and require `sigma² >= 2^-32`. Perform these tests by exact rational squared comparisons where possible, with the correct sign before squaring. Tick-key validation is independent of supplied radius. Zero-radius live ticks and point caps are invalid. The sentinel is distinct from ordinary keys and cannot be duplicated through a second encoding.

For a plane slice, write `x = (r b/n) 1 + w`, where `sum(w_i)=0` and `||w||=r sigma`. Extremizing one coordinate in this hyperplane gives

`m(b) = b/n - sigma(b) sqrt((n-1)/n)`,

`x_min = r m(b)`,

`x_max_on_slice = r [b/n + sigma(b) sqrt((n-1)/n)]`.

`MATH-3` The virtual offset per token is a certified **lower bound** on `r m(b)`. For full-range liquidity it is zero. This lower bound is independent of market prices and cannot increase merely because a coin depegs. The live positive-price states additionally satisfy `x_i <= r`; the full slice contains points that are not on that economically admissible branch. The paper's clipped maximum is a bound, not a substitute for a supporting-price test.

At equal prices, funded principal per token is `r(q0-m)`. The capital-efficiency ratio is `q0/(q0-m)`. For a one-token depeg price `p` against `n-1` identical healthy prices,

`b_depeg(p) = n - (p+n-1)/sqrt(p²+n-1)`.

This is the paper's `k_depeg` expressed in this file's coordinates. It is an interpretation for that price scenario, not a guarantee that all price vectors with individual prices above `p` stay interior. Display helpers must return the actual quantized key and realized threshold, not silently claim an exact requested price limit.

## 2. Consolidation and supporting prices

Let `I` be the interior set and `D` the boundary set. Define

`R = sum_{t in I} r_t`,

`K = sum_{t in D} r_t b_t`,

`S = sum_{t in D} r_t sigma(b_t)`.

`MATH-4` `S` is the **sum of individual transverse radii**. Generally it is not `sqrt((sum r_t)² - (sum k_t - sqrt(n) sum r_t)²)`. Consolidated boundary ticks with different normalized boundaries are not one original sphere cut by one plane. Store/use the additive `K,S` sufficient statistics directly.

Given total geometric reserves `X`, define

`A = sum X_i`, `B = sum X_i²`, `w = X - (A/n)1`, `rho = sqrt(B-A²/n)`.

Then the combined interior basket has reserve sum `A-K` and transverse magnitude `rho-S`. Its invariant is

`F(X; R,K,S) = (A-K-nR)²/n + (rho-S)² = R²`.        `(M1)`

For the accepted rounded reserve set, `F <= R²` is necessary but not sufficient; retain the branch, partition, reconstruction, and bounded-slack conditions below. A negative residual alone is not a certificate of a valid torus branch.

`MATH-5` On the physical frontier require `R>0`, `rho>=S`, `A-K<=nR`, and nonnegative supporting prices. When `rho>0`, let `f = (rho-S)/rho`. A convenient price-normal vector is

`g_i = R - (A-K)/n - f (X_i-A/n)`.                 `(M2)`

The invariant's derivative is `dF/dX_i = -2 g_i`. Therefore an input `d` of token `i` yields marginal output of token `j` at `dy/dd = g_i/g_j`. Require output marginal denominator `g_j>0`; zero-price cases are handled as one-sided endpoints, not division by zero. All `g_l` must be nonnegative. A positive-input trade for zero output is rejected by the public interface.

Since `f>=0`, `g_i` is nonincreasing in `X_i`. Checking the largest reserve checks the smallest supporting price across all tokens. For a pair trade, the maximum of the untouched coordinates and the two candidate coordinates suffices. This is why an untouched token's inadmissible price can be detected without scanning all tokens.

When `S=0`, simplify **before evaluating**: `F = sum(R-X_i)²`, and `g_i=R-X_i`. This avoids the `0/0` at the equal point. A state with `S>0` and `rho=0` is inadmissible. A state with no interior radius is outside the release profile (`SCOPE-3`). The boundary in two dimensions is a zero-dimensional sphere (two points); it is not a continuously tradable circle.

## 3. Tick partition

`MATH-6` The common interior normalized reserve sum is `h=(A-K)/R`. An ordinary tick is interior when `h<b_t` and boundary when `h>b_t`. At exact equality the two MATH-7 reconstructions have the same aggregate basket. Their individual tick baskets coincide on the exact frontier. With conservative slack they can differ: a reclassification must certify both one-sided reconstructions, preserving aggregate reserves, virtual contributions and the single maker's principal. The [inward slack seam audit](audits/SLACK_SEAM.md) derives this distinction and the conditional inward feasibility implication; it does not permit the reverse implication without its additional checks. This release uses boundary ownership for the canonical persisted equality state, with a direction-aware departure rule in section 6 to permit inward travel immediately. The anchor always remains interior.

Use exact cross multiplication to compare `A-K` with `R b_t`; do not divide to a low-precision display value. All ordinary boundary keys are below or at `h`, and all ordinary interior keys above `h`, subject only to the certified crossing enclosure. An equality enclosure is not permission to classify arbitrary nearby ticks as equal.

For supporting price vector `p>=0`, not identically zero, the independent per-tick minimizer is especially useful:

1. Compute `x_free = r1 - r p/||p||`.
2. If full-range, or `sum(x_free)<=r b`, take `x_t=x_free`.
3. Otherwise compute `p_perp = p - mean(p)1` and
   `x_t = (r b/n)1 - r sigma(b) p_perp/||p_perp||`.

The boundary branch cannot occur for an all-equal positive price vector and a valid nondegenerate cap. These formulas minimize `p dot x` over each convex cap. They independently establish the common transverse direction and partition without treating token baskets with negative coordinates as ordinary external assets.

## 4. Reconstructing liquidity

`MATH-7` If `rho>0`, let `u=w/rho`. Reconstruct an existing tick as

Interior: `x_t = (r_t/R) [((A-K)/n)1 + (rho-S)u]`.

Boundary: `x_t = (r_t b_t/n)1 + r_t sigma(b_t) u`.

At `rho=0`, there are no ordinary boundary ticks and every tick is interior; take `x_t=(r_t/R)X` without constructing `u`. These formulas sum to `X`. They also define the basket for a new tick at the current common state, classified by its key. For valid small conservative interior slack, reconstruction allocates that slack proportionally to interior radius; it is not assigned to an arbitrary withdrawing LP.

`MATH-8` Tick principal is `x_t` minus its per-token virtual offset. Radius-share principal is proportional to that basket, subject to the exact virtual-contribution delta on mint/burn in the numerical contract. Fees are additional claims and are not part of `x_t`. An LP withdrawing a depegged tick receives its current inventory, not its original stablecoin basket and not a redemption at one dollar.

Adding/removing a share changes the total geometric vector by that share's current geometric basket, the virtual offset by its deterministic contribution delta, and the relevant `R` or `K,S` contributions together. Reconstructing a new tick at equal reserves when the pool is imbalanced creates a discontinuity and fails `LP-2`.

## 5. Fixed-partition exact-input solve

For start coordinates `a=X_i`, `z=X_j`, candidate input `d>=0`, and output `y>=0`:

`X_i'=a+d`, `X_j'=z-y`,

`A'=A+d-y`,

`B'=B+2ad+d²-2zy+y²`.                              `(M3)`

Use `(M1)` with these sufficient statistics. Keep every untouched coordinate fixed. Root certification uses the original radical equation and `MATH-5`, not just a squared quartic.

`MATH-9` Bound output by funded output principal and the connected positive-price branch. Start a safeguarded solve from the current state. Locate branch/admissibility limits before treating an arbitrary interval as a root bracket. On a valid fixed-`d` branch with `g_j>0`, increasing `y` increases `F`, so the relevant feasible/infeasible bracket is ordered. If the input reaches a tick event first, stop there instead of solving with the wrong partition.

For `S=0` with a starting point on the sphere frontier, a useful independent fixture is the explicit lower-root sphere solve:

`X_j' = R - sqrt((R-X_j)² + (R-X_i)² - (R-X_i-d)²)`.

Check the radicand and physical domain. The expression is a test oracle for this special case; it does not extend to mixed boundary/interior liquidity by replacing `R` with total radius.

From an actual all-interior starting state with slack, use `X_j'=R-sqrt(R²-sum_{k!=j}(R-X_k')²)` instead. The omitted-output radicand retains all existing slack; the frontier-only two-coordinate expression would discard it. `SphereStep.sol` implements this special-case primitive with exact integer square-root bracketing and one final output-quantum floor. Its caller must still certify cap membership, no intervening crossing, principal floors and protocol output units.

Newton steps are an optional acceleration within a certified bracket. Nonfinite analogues (zero derivative, signed overflow, out-of-bracket iterate, invalid radical) select a bisection step or a typed domain failure, never an unchecked extrapolation. Stopping on a small squared residual without an amount bound is invalid near flat derivatives.

## 6. Complete swap traversal

`MATH-10` The normalized sum need not be monotonic over an entire pair swap. Away from degeneracies,

`dA/dd = 1-g_i/g_j = f (X_i-X_j)/g_j`.

Consequently the trade approaches its minimum reserve sum while the input reserve is smaller than the output reserve, and departs after those two reserves become equal. An endpoint may be back in the original partition after two actual crossings. This is an explicit correction to interpreting the paper's endpoint check as a complete path algorithm.

For a candidate adjacent boundary `b_c`, the crossover reserve sum is

`A_c = K + R b_c`.

At that sum, the connected outer-sheet transverse magnitude and square-sum target are

`rho_c = S + sqrt(R² - (A_c-K-nR)²/n)`,

`B_c = A_c²/n + rho_c²`.

Let `C=A-A_c`. Conservation of the reserve sum implies `y_c=d_c+C`. Substituting into `(M3)` gives

`2 d_c² + 2(a-z+C)d_c + C² - 2zC + B - B_c = 0`.   `(M4)`

`MATH-11` Inspect **both real roots**, retaining only candidates with input in the remaining trade interval, nonnegative output within funded principal, a valid original invariant/branch, and the required crossing direction. Select the earliest connected event. A stable quadratic algorithm and interval root enclosures are mandatory; a negative discriminant beyond its enclosure means no candidate, not a square root of zero.

The traversal contract is:

1. Validate the initial state; establish current partition and the maximum untouched reserve. Handle a persisted equality by selecting its immediate departure side using the input/output reserve comparison and, at tangency, the next nonzero derivative or certified one-sided evaluation.
2. Obtain the nearest ordinary interior key and nearest ordinary boundary key. Solve `(M4)` for each present key. Consider all valid candidate roots, including a boundary reached and later left within this input direction. A tangent touch without a side change is not a crossing.
3. Determine whether a branch/physical limit occurs before a selected crossing or the requested endpoint. Never jump across an inadmissible interval just because a later point solves the equation. If the full requested input cannot remain admissible, the public swap must revert atomically.
4. If a true crossing occurs first, calculate its fractional trade, reduce remaining input, and reclassify the tick at the same geometric reserve vector. Interior-to-boundary subtracts `r_t` from `R` and adds `r_t b_t` to `K` and `r_t sigma_t` to `S`. Reverse all three changes for boundary-to-interior. Keep `L,V,X`, positions, and fee growth unchanged.
5. Continue with the new adjacent keys and invariant. Ties at the same canonical key are one tick record. A crossing at the exact end must persist the canonical ending classification. A zero-distance departure transition is counted toward the hard transition cap and cannot repeat with the same partition and direction. Every iteration consumes positive input, advances a distinct event, or terminates with a typed error.
6. If the endpoint occurs first, solve the remainder on the current connected branch. Sum unrounded segment outputs; apply one final raw output floor. Revalidate the actual endpoint, its canonical partition, admissible prices, custody, and numerical slack before settlement. If flooring removes an otherwise infinitesimal final crossing, use the actual endpoint's classification and certify its invariant; never persist the ideal endpoint's stale partition.

Keep endpoint root solving and event discovery in one engine. A solver that merely loops until final `h` is between adjacent keys fails this contract.

## 7. Paper discrepancies resolved here

These are derivations from the user-supplied equations, not externally verified errata issued by the authors.

| Location in supplied paper | Resolution |
| --- | --- |
| Token-price derivative notation | Signed reserve slope is negative; received output per input is the positive ratio `(r-x_in)/(r-x_out)` |
| Maximum-tick gradient example | Gradient of `||r1-x||²` with respect to `x` is `2(x-r1)`; at `(0,r,...)` it is `(-2r,0,...)` |
| Consolidated interior reserve norm | Sphere constraint is `||r1-x||=r`, not `||x||=r`; radii add by similarity, without identifying reserve norm with radius |
| Boundary center | In original coordinates the plane-slice center is `k v`; in transverse coordinates its center is zero |
| Consolidated boundary radius | Use the sum of each tick's transverse radius (`MATH-4`) |
| Computation section first summation | Use total geometric reserves, not an interior-reserve sum followed by another boundary subtraction |
| Crossover expression | Add boundary projection/sum (`K` here); do not substitute an undefined boundary vector for a scalar |
| Tick-crossing endpoint check | Check the path, including inward then outward crossings (`MATH-10`) |

## 8. Independent reference model and proof obligations

`REF-1` Implement a high-precision offline model with explicit per-tick baskets. Use at least 100 decimal digits, increasing precision to establish fixture stability. It may be slow and may enumerate tokens and ticks. Production code must not import it.

`REF-2` Generate equilibrium baskets using the supporting-price minimizers in section 3. For swaps, independently maximize output over per-tick convex reserve sets, subject to total input and unchanged totals for untouched tokens. One method is a high-precision dual solve for supporting prices using those minimizers; a second is direct constrained per-tick optimization for small cases. Require primal feasibility, supporting-price consistency, and a bounded primal/dual gap. Do not accept optimizer status alone as proof. At zero-price endpoints use limits and primal checks.

`REF-3` For comparing a rounded production starting state with slack, use the actual rounded aggregate principal and virtual offsets as constraints. Do not silently replace it with a convenient equal-price or exact-frontier state. Cross-check known single-sphere roots and analytically constructed crossings before using generated fixtures to judge Solidity.

Before numerical implementation is accepted, document proofs or explicit constructive checks for: convex-set minimum reserve; consolidated frontier and branch; unique connected output on the admissible segment; price feasibility via maximum reserve; complete event ordering; reconstruction/allocation solvency under bounded slack; and conservative rounding. A counterexample to one of these is a failed specification assumption to resolve, not a test to delete.
