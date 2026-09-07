# Numerical and accounting contract

For the Aqua/Arc build, [MASTER_PROMPT.md](../MASTER_PROMPT.md) defines which requirements are retained and replaces pool-custody/share/fee-growth accounting with maker-strategy accounting. Read its migration table before implementing this reference.

Normative reference for [SPEC.md](../SPEC.md). This contract makes mathematical approximations observable. It deliberately requires evidence for integer solvency before a production implementation can be accepted. A simulator using floating-point numbers is not that evidence.

## 1. Units, scales, and representable domain

`NUM-1` A normalized atom is `10^-18` of a nominal whole token. For token decimals `d_i`, let `c_i = 10^(18-d_i)`. Raw amount `a_i` normalizes to exactly `a_i c_i` atoms. Internal geometric lengths have `U=2^64` subunits per normalized atom. Therefore raw-to-geometric conversion is exactly `a_i c_i U`. Reject decimals above 18; there is no lossy input normalization.

| Quantity | Representation / unit | Required bound |
| --- | --- | --- |
| Raw transfer | Unsigned integer, token-specific raw units | Conversion and final ledger must fit the bounds below |
| `X_i`, tick radius, `R`, `L`, `V` | Unsigned integer internal length; divide by `U` for atoms | Each and total radius strictly less than `2^160` |
| `A` | Exact unsigned sum of internal lengths | Less than `2^165` for `n<=32` |
| `B` | Exact unsigned 512-bit sum of squared internal lengths | Less than `2^325` |
| Tick key `j` | Unsigned integer; boundary `b=j/2^32` | Validated by `MATH-2`, not cast-based truncation |
| `K` | Exact rational numerator `sum(r_t j_t)` divided by `2^32` | Numerator fits 256 bits under the radius bound |
| `sigma`, virtual coefficient | Certified intervals with 128 fractional bits | Directed endpoints; same coefficient generation for every caller |
| `S` | Sums of lower and upper per-tick internal-length contributions | Store both endpoints; no accumulation by repeated approximate rescaling |
| Fee growth | Normalized atoms per internal radius unit, scaled by `2^128` | Checked 256-bit accumulator; wide intermediate products |
| Accrued position fees | Normalized atoms scaled by `2^128` | Retain fractional remainder; checked bounded total |

`NUM-2` Every non-anchor position creation and increase uses at least `10^12 U` radius units. A partial burn leaves either zero radius or at least this minimum. The same minimum applies to nonzero ordinary tick records. This rejects numerically insignificant live positions while permitting full closure. Zero-radius fee-only positions are not live ticks. There is no minimum raw trade beyond positive net input/output and certification.

`NUM-3` Constrain funded custody and fee escrow to less than `2^96` normalized atoms per token, including surplus. Check the post-operation bounds, not just individual input arguments. This is a technical capacity, not a token-supply assumption. External unsolicited balances exceeding supported reconciliation capacity cause a typed capacity failure; do not truncate them. Document this donation-based liveness limit in release notes.

`NUM-4` Use unsigned storage and explicit signed intermediates for differences. Prove the sign before converting or squaring. Production expressions must not assume a squared length fits 256 bits merely because the length does. Exact `nB-A²` is nonnegative by Cauchy-Schwarz; a negative value indicates a corrupted state or arithmetic bug, not a radicand to clamp.

## 2. Arithmetic primitives and range evidence

`NUM-5` Before implementing the AMM solver, test and implement: checked wide add/subtract/comparison; 256-by-256 multiplication; directed multiply/divide with full intermediate precision; signed variants with defined rounding; floor/ceil square root of bounded 512-bit radicands; rational comparisons without losing the sign; and interval addition, subtraction, product, division, and root. Specify denominators as positive or reject them explicitly.

A primitive's interface states input limits, output units, rounding direction, and failure conditions. Evidence includes the largest intermediate for every call site. `(a*b)/c` is not a safe replacement for wide `mulDiv`. Likewise a 512-bit radicand is not accepted by a utility that only takes `uint256`.

`NUM-6` Coefficients are derived from the exact rational tick key and `n`, using directed roots. Persist immutable coefficient bounds for a key. Compute a tick's virtual contribution as

`v_t(r_t) = floor(r_t * mLower / 2^128)`

in internal units, where `mLower` is nonnegative and proved no greater than true `m(b)`. Full-range `v_t=0`. Compute `S` endpoints from the actual tick radius and coefficient bounds, rounding the lower contribution down and the upper up. Store those contributions so crossing subtracts exactly what was previously added. Liquidity changes recompute them from the new total radius. Never repeatedly multiply an old rounded contribution by a radius ratio.

For mint/burn, virtual delta is **new contribution minus old contribution**, not an independently rounded `radiusDelta*m`. Otherwise splitting operations can inflate virtual credit. `V` is the exact sum of the represented virtual contributions. The small difference between these virtual credits and ideal minimum reserves remains real funded principal.

`NUM-7` Compare tick membership using the rational `K` numerator and tick key directly. Derive boundary intervals from that exact comparison; `sqrt(n)` need not be a rounded state variable. Evaluate variance by `rho = sqrt((nB-A²)/n)` using exact numerator and directed division/root, never by subtracting two independently rounded nearly equal floating-point numbers.

The parameter range gives useful starting bounds, not an automatic proof: multiplying a length below `2^160` by one coefficient ulp `2^-128` gives less than `2^32` internal subunits, or `2^-32` normalized atoms. Summing 64 such coefficient errors is still below one atom. The actual range report must include cancellation, derivatives, all intermediate divisions, and near-extreme roots; coefficient precision alone does not bound output error.

## 3. Certification rather than residual guessing

`NUM-8` A numerical result is an enclosure plus a certificate of the relevant inequalities. The independent real model must lie within the enclosure. Required certificates cover: radical domains, connected branch, supporting prices, cap membership, tick-event ordering, principal floors, and safe payout. When a sign cannot be resolved, refine the enclosure within the work budget. If it still cannot be resolved, return a typed uncertifiable-result failure before settlement. Do not treat an interval containing zero as positive or negative by convenience.

`NUM-9` Retain an output bracket in internal units. Bisection terminates when the implementation can certify the desired raw-output floor conservatively, not just when a residual is small. Up to 160 bisections cover the full allowed internal-length output span down to one internal unit. A bounded number of safeguarded Newton steps can accelerate this but cannot enlarge the work cap or change the accepted bracket.

If the ideal output's enclosure straddles a raw unit and further refinement is exhausted, returning one raw unit less is permitted **only if** the lower payout itself is certified feasible, satisfies the caller's minimum, and the shortfall from the real optimum is at most one raw output unit. Otherwise revert. Never return an uncertified higher floor. Root and classification uncertainty are different: reducing payout does not automatically certify a crossing or a price branch.

`NUM-10` Solve crossing quadratics with a cancellation-resistant method, handle a zero/linear coefficient in the generic primitive, and retain both candidate intervals. Substitute candidates into the original invariant, not only the quadratic. Distinguish: no real root; root behind the start; touching root; true crossing; root after the remaining input; and overlap that needs refinement. Coincident canonical tick keys are combined liquidity, not several approximate crossings.

`NUM-11` Maintain rational/fixed-point fractional progress inside the swap engine. Error from all segment computations must fit one combined output enclosure. Internal crossing amounts must not each consume an extra raw input/output unit. The total net raw input is fixed by `SWAP-2`. Any implementation that transfers or rounds raw input separately at each crossing fails this contract.

## 4. Conservative reserve slack

Real roots and token transfer units generally cannot both be represented exactly. The state therefore needs a precise meaning for small deviations from the ideal frontier.

`NUM-12` Authoritative `X` contains exact internal-length integers. After a pair swap, apply the exact normalized net input and exact normalized **actual raw output** to those two coordinates. Do not pretend that a higher ideal output was paid and leave the difference in an unowned account. The smaller actual output leaves conservatively retained principal inside the convex reserve set. All fee tokens remain outside `X`.

`NUM-13` For each accepted state, certify membership in the sum of the tick reserve sets, on the branch admitting the reconstruction in `MATH-7`. The aggregate inequality `F<=R²`, correct partition, `rho>=S`, and supporting-price signs are necessary checks; also certify the individual reconstructed cap constraints and principal lower bounds with the aggregate/local bounds established by the proof. The production check may use a proved aggregate reduction, while the reference test recomputes every tick. A globally small residual cannot excuse a locally negative LP principal.

An output rounded down can cross a nearby normalized-sum boundary in the *other* direction compared with the ideal output. Recompute/certify the actual endpoint partition; if that would leave the true aggregate feasible set or cannot be resolved within the work cap, revert. Do not snap principal balances or add fictitious input to force an equality.

`NUM-14` Record a conservative length-valued slack bound, with units and its update formula, as part of the numerical certificate. A fresh successful swap may retain at most one raw output unit relative to the exact optimum from its actual starting state, including solver underpayment. A liquidity change transports the previous interior slack proportionally with interior radius, adds its certified allocation rounding, and proves that reconstruction stays feasible. Derive this rule from the norm, not by adding an arbitrary tolerance to `F` in squared units.

Existing rounding slack can be released by a later trade. Differential and economic tests must account for this finite, funded benefit instead of calling every one-atom deviation an exploit. They must also prove that an attacker cannot create net profit repeatedly by cycling state and harvesting fresh tolerance. There is no reset of `R`, `K`, `S`, or an invariant constant to a measured residual to hide drift.

## 5. Basket rounding and custody

`NUM-15` Use interval basket reconstruction for liquidity changes. Select integer geometric changes within the proved allocation enclosure, recompute all affected contributions, and certify the resulting aggregate and per-tick feasible state. Mint must fund the upper bound of the required principal increase, and burn must pay no more than the certified principal decrease. In particular the mint/burn principal delta uses the old/new virtual contribution difference from `NUM-6`.

The implementation must derive a deterministic allocation procedure and its finite work bound in its numerical evidence before production basket code is accepted. Its degrees of freedom are rounding inside these enclosures, not price, share issuance, tick choice, or economic policy. If no candidate can be certified at a singular state, use the typed allocation failure. Ordinary interior and nonsingular boundary mints/burns in the reference corpus must remain executable; rejecting every difficult state is not a passing implementation.

For a certified internal principal delta `p_i`, raw funding is its upper-directed division by `c_i U`; a raw principal payout is its lower-directed division. Differences are custody surplus. Reconcile

`balanceRaw_i * c_i U = (X_i - V) + feeEscrowRaw_i * c_i U + surplusInternal_i`.

Every term is nonnegative. This identity is exact in integer units, even when principal includes sub-raw amounts. Aggregate liabilities and rounding carries must respect it; a fee claim is not allowed to consume principal or surplus.

`NUM-16` A single mint/burn may retain less than one raw unit per token from final transfer rounding, plus the separately certified internal allocation error. The internal allocation error budget is at most one normalized atom per affected token, in addition to transported existing slack; production evidence must establish a tighter bound if one atom could violate a tiny local principal or cap. A fully closed position has no principal shares; any remaining owned fee fractions stay recorded. No fee or principal rounding carry is silently reassigned to a later position.

For changes that cannot meet the budget, reject with an explicit error. Do not relax the budget or increase minimum reserves automatically in response to a failed test. Numerical improvements that preserve all economic behavior can be recorded as implementation refinements; changes to accepted economic scope require a specification revision.

## 6. Fee arithmetic

`NUM-17` Let `G=2^128`. A raw input fee normalizes to integer atoms `f`. Increment input-token growth by `floor(f G/L)` exactly as `FEE-2`. This does not involve `U` again: `L` is already in internal radius-share units and the resulting growth is defined per such unit. Document the dimensional cancellation at the call site.

For a position with shares `l`, settling growth adds `l*(growthNow-growthSnapshot)` to its accrued-fee numerator, whose denominator is `G` normalized atoms. Use a wide product and checked conversion. A raw fee collection pays

`floor(accruedNumerator / (G c_i))`

and subtracts exactly `paidRaw G c_i` from that numerator. Retain the rest. Fee escrow decreases by actual raw payouts only. The sum of all outstanding and collected entitlements can never exceed all escrowed fees; the inequality includes the inaccessible anchor and unallocated global-growth dust.

## 7. Required numerical evidence artifact

During implementation, create `test/evidence/numerics.md` containing:

1. A symbol-to-unit and storage-width table tied to actual code symbols.
2. Maximum intermediate values for each expression and wide primitive.
3. Directed error propagation for coefficients, roots, event ordering, reconstruction, and settlement.
4. Proof of accepted convex-set membership, per-tick solvency, and supported-price branch after rounding.
5. The deterministic allocation procedure and progress/termination bounds.
6. Output-error bounds in **raw token units**, including multi-crossing trades and mixed decimals.
7. Adversarial tiny-trade, extreme-radius, near-equality, and repeated-cycle counterexample searches with reproducible seeds.

This artifact does not exist yet. It is a required deliverable of the implementation, not a statement that the proofs are already done. An unresolved proof or failing counterexample blocks the relevant milestone and deployment; it must not be concealed by a broad `epsilon` or a mass of rejected fuzz inputs.
