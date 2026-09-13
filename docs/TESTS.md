# Tests-first acceptance specification

For the Aqua/Arc build, the suites and G0–G8 gates in [MASTER_PROMPT.md](../MASTER_PROMPT.md) control acceptance. Retain this file's mathematical/numerical fixtures and test methods; pooled-share, withdrawal and fee-escrow cases are explicitly superseded by the master's migration table and Aqua lifecycle tests.

Originally the acceptance contract for historical [SPEC.md](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ff7bd940a1e6b961523b34364163f4599a232e9/SPEC.md). Executable tests now live in the workspace packages; [the evidence index](../test/evidence/INDEX.md) records actual results and source boundaries. Requirements superseded by the master remain historical, while applicable numerical and campaign obligations still control acceptance.

## 1. Workflow and evidence

`TEST-1` Before production code for a milestone, write its full acceptance tests, fixture inputs, expected outcomes, and failure assertions. Compile against minimal interface stubs where necessary. Record that the behavior tests fail because the specified behavior is absent or wrong. A missing import or compiler error is not sufficient red-phase evidence. Implement the smallest complete milestone, then make all its tests pass. Extend tests before any subsequent behavior change.

The user's explicit request for extensive tests first takes priority over a generic preference for one-test-at-a-time feature development. Keep milestones small enough that their complete test suite is reviewable; avoid speculative tests for features outside `SCOPE-4`.

`TEST-2` Each acceptance test identifies the requirement IDs it covers and its independent expected-value source. Use public factory/pool interfaces for economic and custody behavior; use narrow pure harness interfaces for numeric primitives, geometry, and segment certification. Test implementation internals only through these declared verification seams. Do not assert private array layout or incidental call count as an economic requirement.

`TEST-3` Expected values come from exact hand-worked cases, the independent explicit-tick model, or externally checked integer arithmetic. A second copy of the production torus solver is not a reference. Generate fixtures offline; check their values into versioned, deterministic files. Runtime CI must not query an RPC endpoint, fetch current token prices, or regenerate expected outputs from the implementation under test.

`TEST-4` Every regression records its complete starting state, operation sequence, seed, dimensional units, expected outcome, reference precision, and requirement ID. Retain minimized counterexamples. Explain discrepancies as implementation defects, reference defects, specification defects, or environment failures. Repair the correct layer; never widen tolerances just to make a case pass.

Planned evidence locations: `test/fixtures/`, `test/reference/`, `test/evidence/`, and `test/regressions/`. Their schemas and index must be created in P0/P1. Fixtures contain strings for large integers/decimal values and distinguish raw, normalized, and internal units.

## 2. Mandatory deterministic suites

### A. Geometry and source corrections

| Case ID | Given / operation | Required observation |
| --- | --- | --- |
| `GEO-01` | Sphere, `n=4`, `r=2` whole units | Equal reserves `(1,1,1,1)`; squared distance to `(2,2,2,2)` is 4 |
| `GEO-02` | `n=4`, `b=9/4`, `r=2` | `sigma=sqrt(15)/8`; `k=9/4`; minimum reserve `(9-3sqrt(5))/8`; zero sum of transverse coordinates |
| `GEO-03` | Previous cap at equal prices | Principal per token `(3sqrt(5)-1)/8`; virtual credit strictly no greater than analytic minimum |
| `GEO-04` | Full-range `b=n-1` | Minimum reserve zero; virtual offset zero; valid full-range anchor classification at the extreme |
| `GEO-05` | Point cap, below-minimum key, key at/above sentinel, invalid small `sigma` | Typed invalid-tick failure; no overflow or silent coercion |
| `GEO-06` | Same normalized boundary, several radii | Same normalized geometry and common state; radii and transverse contributions scale |
| `GEO-07` | Two different boundary keys | Transverse radii add; demonstrate disagreement with the invalid square-root-of-summed-parameters formula |
| `GEO-08` | Permute every token/reserve/price index consistently | Identical economic result after inverse permutation |
| `GEO-09` | Positive supporting prices and a cap forced to boundary | Direct minimizer and aggregate reconstruction agree; boundary multiplier has correct sign |
| `GEO-10` | `n=2`, ordinary cap pinned to boundary | Two possible isolated boundary points, no assumed continuous boundary-only exchange |
| `GEO-11` | `n=5`, depeg interpretation at `p=.90,.99` | Independently computed efficiency values, with a loose sanity range around the paper's approximate 15x/150x; exact formula fixtures use tight bounds |
| `GEO-12` | Same minimum individual price but different multidimensional price vectors | Do not treat a one-token depeg threshold as a universal per-coin range guarantee |
| `GEO-13` | All-equal positive prices | All ordinary valid ticks interior; reconstruction avoids `0/0` |

`GEO-02/03` are analytic real fixtures; key `9/4` is exactly representable. Token-decimal and internal-unit versions must also be generated and checked independently.

### B. Arithmetic and numerical certification

Cover each primitive with zero, one, maximum accepted values, adjacent out-of-domain values, exact division, nonzero remainder, signed negative cases, and floor/ceil duality. Test square roots immediately below, at, and above perfect squares in the full supported width. Check `sqrtFloor(z)^2<=z<(sqrtFloor(z)+1)^2` with an independent big-integer oracle.

Required cases: `nB-A²` near zero with very large equal reserves; valid discriminants close to zero; spurious quartic roots; cancellation-prone quadratic roots; derivative zero; Newton proposal outside the bracket; explicit bisection fallback; exhausted work budget; true root straddling one raw unit; coefficient enclosures at minimum tick spacing; virtual delta differences under many split mints; wide fee-growth products; accumulator overflow rejected before mutation.

Every accepted result's enclosure contains the higher-precision oracle value. Every payout is conservative within `NUM-9/14/16`; every rejected ordinary corpus case is investigated for avoidable non-liveness. Adversarial rejected-domain tests are a separate suite, so rejection does not count as successful valid-state coverage.

### C. Swaps within a partition

| Case ID | Scenario | Required observation |
| --- | --- | --- |
| `SW-01` | Full sphere, `n=4,r=2,X=(1,1,1,1)`, input 1/2 in token 0 for token 1 | Ideal output `sqrt(7)/2 - 1`; actual output is certified raw floor; no boundary crossing |
| `SW-02` | Several all-interior ticks | Output equals the single sphere with summed radii, at matched aggregate state |
| `SW-03` | Mixed interior/boundary ticks | Explicit-tick optimizer and consolidated solve agree; only two aggregate principal coordinates change |
| `SW-04` | Same input with 0 ppm, 1 ppm, and 10,000 ppm | One gross-input fee, exact escrow increment, correct net principal input |
| `SW-05` | Tiny amount that becomes zero net input or zero output | Typed failure; no transfer, fees, or state change |
| `SW-06` | Several algebraic roots | Connected admissible lower-reserve output selected; reject negative prices and inner-sheet solution |
| `SW-07` | A third, untouched token has the smallest price | Full branch feasibility uses its reserve maximum; checking only the traded pair is insufficient |
| `SW-08` | Quote followed by execution on identical state | Bit-identical output, fees, crossings, and post-state summary |
| `SW-09` | Change pool state between quote and swap | Current state is used; slippage protects the user, quote version is not a reservation |
| `SW-10` | Input would exhaust funded output or leave the price branch | Full revert; no partial fill or retained fee |
| `SW-11` | Interior conservative rounding slack already exists | Reference starts from that actual state; solver may release funded slack within certified limits |
| `SW-12` | Mixed token decimals `0,6,8,18` | Exact normalization; output/fee amounts expressed in each token's raw units |

### D. Tick crossings and event ordering

Construct crossing fixtures from exact supporting-price states or `(M4)`, then perturb the input by one internal subunit and one raw unit. Include at least:

1. First outward crossing and first inward crossing with continuity of reserves and supporting prices.
2. Multiple different ordinary keys crossed in one swap; compare one traversal with reference segments.
3. A trade that releases a boundary tick and later traps the same tick, ending in its original partition. An endpoint-only implementation must fail this test.
4. A quadratic with two admissible nonnegative roots; select the first actual event, not the larger root by convention.
5. Exact start at a boundary moving inward, moving outward, and tangent; no zero-distance infinite loop.
6. Exact end at a boundary; canonical partition and correct next swap behavior.
7. Two LPs in the same key crossed once as one aggregate record; unequal keys never merged by an epsilon.
8. Nearest boundary absent or nearest ordinary interior key absent; anchor remains available.
9. A branch/zero-price/physical limit earlier than an apparent later root; reject the entire swap.
10. A cap crossing infinitesimally before the ideal final output, removed or altered by raw-output flooring; persist the actual endpoint partition.
11. Tiny segments, minimum ordinary radius, maximum radius ratio, and adjacent quantized keys.
12. Crossing limits 0, 1, exact required count, and one below required count; all failures atomic.
13. Visit the hard transition bound; count zero-distance departures and demonstrate deterministic termination.
14. Round-trip crossings leave cached additive tick contributions exactly equal to recomputation; no `S` interval drift from repeated add/subtract.
15. Two-asset trades through the equal point, where the transverse direction reverses; `S=0` simplification avoids division by zero.

An explicit regression for item 3 uses `n=2`, a full-range radius of 1, and an ordinary radius of 1 at `b=5/8`. Start from supporting prices `(2,1)`. Total geometric reserves are

`X_0 = 1 - 2/sqrt(5) + (5-sqrt(7))/16`,

`X_1 = 1 - 1/sqrt(5) + (5+sqrt(7))/16`.

Swap token 0 for token 1, with ideal net input `d = 1/sqrt(5) + sqrt(7)/8`. The ending reserves exchange coordinates and ideal output equals `d`. The ordinary tick starts and ends boundary, but releases and then traps again. At the crossings, `A_c=5/4` and the two aggregate reserve coordinates are `5/8 - sqrt(7)/8` and `5/8 + sqrt(7)/8`, in opposite orders. This fixture also verifies that a two-dimensional boundary tick can move between its two boundary points by first becoming interior. Scale **both** radii and every amount by 4 for a public-pool fixture with sufficient anchor funding, then generate the conservative raw-unit cases from the independent model.

Record each segment's input/output enclosure, start/end `A,B,R,K,S`, event key and direction, root candidates, and supporting-price minimum in fixtures. This is test evidence, not a requirement to emit enormous onchain event payloads.

### E. Bootstrap, LP lifecycle, and fee ownership

| Case ID | Scenario | Required observation |
| --- | --- | --- |
| `LP-01` | Bootstrap with mixed decimals | At least one whole principal token per asset permanently anchors the pool; creator receives only unlocked shares |
| `LP-02` | Invalid config or failing final bootstrap transfer | No registered partially initialized pool or surviving partial effects |
| `LP-03` | Multiple LPs at one key | Radius ownership adds; virtual offset uses total-radius contribution delta |
| `LP-04` | Add a new narrow key during imbalance | Current boundary/interior basket supplied, with continuous common price direction |
| `LP-05` | Increase then burn without intervening trades | No positive net extraction beyond clearly funded preexisting slack; correct raw rounding and surplus |
| `LP-06` | Burn after a depeg and after tick crossings | Current inventory returned; virtual reserves never paid |
| `LP-07` | Remove a boundary position | `K,S,V,X` and owner claims change consistently; `R` remains anchored |
| `LP-08` | Burn all unlocked positions | Funded anchor, coherent statistics, no zero interior radius |
| `LP-09` | Remove/recreate an empty tick key | Capacity reclaimed; no inherited position authority or historical fee claims |
| `LP-10` | Attempt anchor withdrawal/collection, arbitrary owner operations, or zero-radius underflow | Revert without effects |
| `LP-11` | Fee arrives before another LP joins | New radius receives none of that historical fee |
| `LP-12` | Boundary tick earns fees during a swap | Exact radius-based policy, including the documented two-token case |
| `LP-13` | Swap crosses several ticks | Same total fee allocation as one fee update with fixed total radius; no double fee |
| `LP-14` | Collect frequently versus once, interleaved with radius changes | Fractions retained; no duplication, loss to new owners, or capture of old unallocated growth dust |
| `LP-15` | Zero-radius position collects older earnings | Fees paid from escrow; no principal or curve change |
| `LP-16` | Fee paid in token 0, then token 1 | Distinct entitlements; no conversion or cross-currency claim |
| `LP-17` | Maximum positions held by many owners | Swaps do not loop over position count |
| `LP-18` | Mint/burn at a singular endpoint | Certified allocation or the specified typed failure; never a negative principal or unexplained transfer |
| `LP-19` | Repeated tiny partial changes and final closure | Virtual credit and fee carries reconcile; no state reset that creates fresh credit |

### F. Token and transaction adversaries

Use test token contracts for standard returns, successful no-return transfers, false returns, malformed returns, revert, fee-on-transfer, rebasing, mutable decimals, callback/reentrancy, and deliberately inconsistent balances. Assert supported behavior succeeds and unsupported **observed** behavior reverts where specified. Token admission cannot certify a malicious token's future behavior.

Exercise every external-call site during bootstrap, mint, swap input, swap output, burn, and collect. Attempt cross-function reentrancy and access to coherent-state views. After a revert compare balances, allowances where the token conforms, all relevant storage, fee claims, state version, and logs with the prior state.

Also test: preexisting donation; donation before first deposit; donation between quote and execution; unsolicited third-token balance changes; inflation attempts using pool `balanceOf`; false fee collection authority; identical input/output index; invalid/duplicate basket or collection indices; wrong array lengths; max/min amounts differing by one raw unit; deadline just before/at/after timestamp; invalid recipients; fee/crossing/radius limits; duplicate factory configuration; integer downcasts; and all typed numerical failure paths.

No test should claim protection from a malicious ERC-20 that can arbitrarily falsify balances or confiscate funds. State the conforming-token assumption in that suite.

## 3. Stateful invariants and differential campaigns

`TEST-5` Use Foundry handler-driven invariant testing over valid state transitions. Bound the valid-action handler inputs deliberately and fail on unexpected reverts. Maintain separate invalid-input/revert suites. Foundry's [invariant-testing guide](https://getfoundry.sh/forge/invariant-testing) describes action sequences, handlers, run/depth controls, and the risk of campaigns dominated by reverts.

Handler actions: bootstrap fixtures, mint/increase/burn positions, quote/swap pairs in either direction, collect subsets, donate, and attempt unauthorized operations in the negative suite. Target multiple actors and ticks. Ghost ledgers track external deposits, principal payouts, fees paid/collected, locked claims, and surplus by token. Assert `INV-1` through `INV-10` together on each successful transition.

Every invariant campaign includes an unwind: collect all collectible fees and burn every unlocked position through the public interface. Remaining balances must reconcile to anchor principal, its fees, unallocated fee dust, recorded fractional fee claims, and surplus. A contract can satisfy a reserve equation while trapping user funds; unwind tests detect that distinct failure.

`TEST-6` Differential distributions cover `n=2,3,4,5,8,16,32`; tick counts 1, 2, 8, 32, 64; wide and near-minimum caps; balanced and independently generated skewed prices; radii over many orders of magnitude; and decimal combinations. The offline mathematical model additionally exercises `n=100,1_000,10_000` without pretending those are deployed production pools.

Properties beyond equations:

- Conservation of every token and decomposition of fees/principal/surplus.
- Permutation symmetry and homogeneity under scaling, with stated integer-rounding effects.
- Smaller gross input cannot yield a larger valid output than a larger gross input on the same connected state, apart from equal integer outputs; reject unreachable inputs explicitly.
- Gross-input fees nondecreasing with input, and never charged on a reverted operation.
- One large swap versus the same net input split into segments: equal ideal geometry, with explicitly bounded raw rounding and the known difference from charging fees once versus per public call.
- A self-financed closed swap/mint/burn cycle cannot repeatedly create assets from rounding. Compare the same final ownership and external price state; account for consumed preexisting funded slack.
- Small perturbations around crossings are continuous in ideal amounts and have bounded raw discontinuities.
- Principal withdrawal plus every other outstanding principal claim remains backed after any user's operation sequence.

Depeg scenarios include one price tending to zero, several prices tending to zero, all but one tending to zero, then re-peg; rotated healthy/depegged tokens; trades between healthy tokens with an unrelated depegged token; and extreme output endpoints. Check retained healthy-token trading where the geometry admits it. Do not assert that LP wealth is preserved or that every possible pair trade remains available.

## 4. Coverage, mutation, and resource acceptance

`TEST-7` Minimum campaign sizes after the deterministic suites pass:

| Profile | Fuzz cases per relevant property | Valid-action invariant runs / depth |
| --- | --- | --- |
| Local targeted | 256 | 32 / 64 |
| Pull-request CI | 2,048 | 256 / 128 |
| Release | 10,000 | 1,024 / 256, with at least three recorded seeds |

Record actual successful action and crossing counts, unique states, unexpected reverts, and handler coverage. Minimum release corpus includes 100 successful inward and 100 outward crossings for each of `n=3,5,32`, and 20 endpoint-returns-to-original-partition regressions. Fixed deterministic fixtures can satisfy difficult event coverage; random luck is not the acceptance criterion. Large-dimensional offline tests have separate resource budgets.

`TEST-8` Mutation checks must demonstrate that tests detect: flipped price ratio; wrong root sign; summed-sphere boundary radius; missing virtual-offset subtraction; total versus interior reserve-sum confusion; omitted crossing; endpoint-only crossing detection; boundary fees excluded; fee applied per segment; floor-rounded deposit; ceil-rounded withdrawal; historical fees awarded on mint; omitted transfer-delta validation; and disabled reentrancy guard. Apply mutations in an isolated temporary copy and record results; never leave production code intentionally broken.

`TEST-9` Gas and storage access measurements compare dimension, tick count, position count, and actual crossing count independently. Verify no swap loop or storage access grows with LP count; no token-wide swap scan; correct bounded reserve-index and tick-book work; and O(n) basket operations. Record both solver evaluation count and EVM gas. Constant-time invariant arithmetic does not imply constant-gas whole transactions.

Before release, record an explicit target-chain gas budget. At minimum: unchanged-state quote and no-crossing swap at `n=32,T=64`; worst supported executable crossing path; and maximum-token mint/burn. If the configured maximum valid transaction exceeds the target budget, lower the advertised deployment limits through a documented spec revision or improve the implementation with unchanged behavior. Do not ship a nominal capacity that tests cannot exercise within the target chain's limits.

## 5. Definition of passing

`TEST-10` All mandatory deterministic suites pass; required mutation defects are detected; numeric enclosures and solvency evidence are reviewed; reference fixtures have independently stable precision; valid-state fuzz campaigns have no unexplained reverts; release invariant/unwind campaigns pass; coverage includes every specified branch and failure mode; and measured work fits the documented deployment profile.

Run build, tests, formatting, static analysis, storage-layout review, dependency/compiler-bug review, and deployment-bytecode-size checks with pinned tool versions. Coverage percentage alone is not the gate. External audit and deployment approval are separate from implementation test completion; nothing in these documents authorizes a deployment.
