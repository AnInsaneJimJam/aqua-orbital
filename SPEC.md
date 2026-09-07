# Orbital Solidity implementation specification

**Build routing:** the active Aqua/Arc application is governed by [MASTER_PROMPT.md](MASTER_PROMPT.md). This file preserves the original standalone custodial baseline. Its pool custody, locked anchor, LP share lifecycle and fee escrow are superseded for the Aqua app by the master's explicit migration table. Retained mathematical requirements remain linked below.

Status: implementation contract; no implementation exists yet. Version: 1.0, 2026-09-06.

## 1. Start here

Build a multi-asset stablecoin AMM with Orbital's nested spherical-cap liquidity positions. A position supplies liquidity to one cap, identified by its normalized plane boundary. Positions remain economically relevant when their caps reach the boundary. A swap combines the interior caps and boundary caps, follows the resulting trade surface, and updates that combination at every crossing.

This specification fixes the missing implementation choices in the supplied Orbital paper. It is not a claim that the paper, these choices, or a future implementation have been audited. **Write the extensive acceptance tests before the production implementation of each milestone.** A passing implementation must satisfy the mathematical, numerical, accounting, and operational contracts together.

For the historical standalone build, read this file first. For the active Aqua/Arc build, start with MASTER_PROMPT.md and its overrides. Then load the reference required by the work:

| Work | Authoritative reference |
| --- | --- |
| Geometry, pricing, root selection, crossings, reference model | [Mathematical contract](docs/MATH.md) |
| Representation, arithmetic bounds, rounding, solver certification | [Numerical contract](docs/NUMERICS.md) |
| Test cases, fixtures, fuzzing, security, release criteria | [Test specification](docs/TESTS.md) |
| Implementation order, dependencies, handoff and evidence | [Implementation plan](docs/PLAN.md) |

Authority for this historical baseline: explicit user instructions, then this specification and its linked normative contracts, then implementation. The active Aqua/Arc master prompt overrides this baseline as described above. The research papers supply motivation and provenance; where a paper is ambiguous, use the resolved rule here. If two applicable normative requirements conflict, produce a minimal counterexample and resolve the documents before implementing the disputed behavior. Passing tests alone does not authorize changing the intended mechanism.

Requirement identifiers such as `SWAP-3` are stable handles for tests, code comments, review, and issue reports. A requirement's definition lives in one place. Other documents reference its ID rather than copying its wording.

## 2. Scope and decisions

### 2.1 Required release profile

`SCOPE-1` Implement Solidity contracts for immutable pools containing 2–32 distinct ERC-20 tokens. All tokens represent the same nominal unit of account. The mathematical model and reference tests must also cover larger dimensions, including 10,000; deployment support for 10,000 tokens is **not** part of this release. Token registration, custody, calldata, and LP basket transfers have dimension-dependent costs even when invariant evaluation does not.

`SCOPE-2` A pool supports at most 64 initialized tick records, including its full-range tick. Multiple LPs can supply the same tick. Users may hold multiple nontransferable positions. Supported actions are atomic pool bootstrap, exact-input pair swaps, proportional basket mint/burn for a chosen tick, and fee collection. All tokens in a basket use pool index order.

`SCOPE-3` The pool permanently retains a funded full-range anchor. This is a deliberate implementation restriction, not a requirement of Orbital: it guarantees strictly positive interior radius and gives the pricing and reconstruction formulas an unambiguous continuation. The locked anchor initially supplies at least one whole unit of **each** token, excluding surplus. Its position cannot be burned, transferred, approved, or collected. Its fees remain locked and backed. Other full-range liquidity is withdrawable.

`SCOPE-4` Non-goals: exact-output swaps, partial fills, flash loans, callbacks, routers, transferable LP NFTs, single-token deposits/withdrawals, token addition/removal, rebasing/rate-bearing assets, dynamic exchange rates, hooks, governance, protocol fee extraction, upgradeability, pause authority, external price oracles, polar/trigonometric ticks, and asymmetric/superelliptical curves. These require a separate specification revision. Failed operations revert atomically.

### 2.2 Explicit choices the paper does not make

| Question | Release decision | Reason / consequence |
| --- | --- | --- |
| How are ticks identified? | Canonical normalized reserve-sum boundary on a fixed binary grid; one full-range sentinel | Independent of LP size; exact keys; no trigonometry |
| What if all ticks are on their boundaries? | Prevent this state with the funded, locked anchor | Avoid undefined interior normalization; capital cannot fully exit |
| Who owns principal? | Radius shares in a tick, with current basket reconstructed from common geometry | No per-LP swap loop; virtual reserves are never withdrawable |
| Who earns fees? | All radius shares, across interior and boundary ticks, pro rata by radius | Simple, explicit policy; not a claim of proportional trade contribution |
| Are fees reinvested? | No; fee escrow and growth are separate from principal geometry | Fees do not silently change radii or move boundaries |
| What is the price feed? | None | A peg is a denomination assumption, not guaranteed by the contract |
| How is numerical uncertainty handled? | Directed intervals, bounded refinement, typed reverts | Never guess a root, crossing, or solvent payout |
| What is optimized? | Cached invariant sums, aggregate ticks, lazy position accounting | Correctness precedes optimization; no hidden all-LP loop |

The radius-based fee rule intentionally rewards boundary ticks, including a two-asset boundary tick whose local trading direction may be exhausted. Narrow ticks can acquire more radius per deposited token and therefore a larger fee weight. This is an economic policy to test and disclose, not a theorem of fair volume attribution. Do not substitute Uniswap's active-liquidity fee rule.

## 3. Vocabulary and abstraction tower

| Term | Meaning |
| --- | --- |
| Raw amount | Integer ERC-20 transfer amount, before decimal normalization |
| Principal | Funded token entitlement participating in the curve |
| Virtual reserve | Unfunded offset justified by a cap's minimum reserve |
| Geometric reserve `X` | Principal plus virtual reserves, excluding fee escrow and custody surplus |
| Radius share | Claim to one unit of a tick's radius; not one token or one dollar |
| Tick | A nested spherical cap, not an interval between two prices |
| Interior / boundary | Whether the cap's plane constraint is nonbinding / binding |
| Segment | Part of a swap with a fixed interior/boundary partition |
| Crossing | Continuous reclassification of a tick; not a token transfer |
| Anchor | Full-range liquidity whose positive radius cannot be removed |
| Surplus | Custodied tokens that are neither principal nor fee claims |

The system has one path from mathematical meaning to custody:

```text
Tick geometry and admissible prices
                |
                v
Certified segment solver -> crossing state machine
                |                    |
                +---------+----------+
                          v
                  Pool state transition
                          |
             +------------+------------+
             v                         v
      Principal / positions       Fee entitlement
             +------------+------------+
                          v
                  ERC-20 settlement
```

Test at these seams. The independent reference model observes the same external outcomes through a different mathematical formulation. Internal arithmetic harnesses are justified verification seams, not production interfaces for callers to assemble swaps themselves.

## 4. Solidity modules and ownership

The paths below are planned deliverables, not files already present. Libraries use internal calls unless deployment-size evidence requires linking. Keep one owner for each authoritative state variable.

| Planned module | Owns / hides | Interface contract |
| --- | --- | --- |
| `src/OrbitalFactory.sol` | Unique pool configuration and atomic bootstrap | Create funded pool; look up canonical configuration |
| `src/OrbitalPool.sol` | Custody, principal vector, positions, global fee growth; the only mutating public entry point after creation | Swap, mint, burn, collect, bounded views |
| `src/libraries/TickGeometry.sol` | Canonical keys, sphere/cap coefficients, virtual offset, basket reconstruction | Validate tick; derive certified geometry; reconstruct a radius share |
| `src/libraries/OrbitalMath.sol` | Aggregate invariant, branch tests, certified within-segment solve | Quote segment and return bounds/certificate or a typed failure |
| `src/libraries/TickBook.sol` | Sorted live tick keys, partition, additive aggregate contributions | Adjacent crossings; insert/remove; reclassify atomically |
| `src/libraries/SwapEngine.sol` | Event ordering and complete exact-input traversal | Pure/view simulation and commit-ready transition using one algorithm |
| `src/libraries/PositionAccounting.sol` | Radius balances, snapshots, accrued fees, mint/burn allocation | Settle entitlement before changing ownership |
| `src/libraries/ReserveAccounting.sol` | Normalization, principal/surplus separation, exact cached sums and maximum reserve index | Checked reserve changes and custody reconciliation |
| `src/libraries/WideMath.sol` | Bounded full-width arithmetic, signed intermediates, interval primitives | Directed arithmetic with documented domains |
| `src/interfaces/IOrbitalPool.sol` | Public request/result types, errors, events | Stable integration and black-box test surface |

`ARCH-1` The swap engine calculates a complete candidate transition without calling tokens. Settlement applies that transition under one reentrancy lock. A quote uses the same engine and rounding policy without writes. No alternate approximate public quote implementation.

`ARCH-2` Geometry modules know nothing about ERC-20 calls, owners, deadlines, or fee recipients. Custody code does not implement an alternative invariant. Tick management owns the partition and its cached contributions. Fee accounting does not infer earnings from partition membership.

`ARCH-3` Reuse pinned, reviewed ERC-20 transfer/reentrancy and arithmetic utilities where their domains match this contract. A utility called `mulDiv` does not by itself solve arbitrary 512-bit expressions. The implementation must supply the missing wide operations and tests defined in [NUMERICS](docs/NUMERICS.md). [OpenZeppelin's utility reference](https://docs.openzeppelin.com/contracts/5.x/api/utils) documents the available primitives.

## 5. Authoritative state and invariants

### 5.1 Pool state

`STATE-1` Immutable configuration consists of sorted token addresses, fixed decimal scales, `n`, fee in parts per million, numerical profile/version, and tick-grid version. Fee is in `[0, 10_000]` ppm inclusive. Factory uniqueness includes all these economic/configuration values. The supplied token ordering is sorted by numerical address value; duplicate, zero, and non-contract addresses are rejected.

`STATE-2` Store the geometric reserve vector `X`, total virtual offset `V` per token (a single scalar because offsets are symmetric), exact `A = sum(X_i)`, exact wide `B = sum(X_i^2)`, and a maximum-reserve index. Principal of token `i` is `P_i = X_i - V`. See the numerical contract for units. The actual token balance is not a curve parameter.

`STATE-3` Store total radius `L`, positive interior radius `R`, boundary reserve-sum contribution `K`, and boundary transverse-radius sum `S` with certified lower/upper bounds. A tick record contains its key, radius, virtual contribution, transverse contribution bounds, and current classification. The maximum normalized boundary of boundary ticks and minimum normalized boundary of interior ticks delimit the current partition. Full-range sentinel liquidity remains interior.

`STATE-4` A position stores an owner, immutable tick key, radius shares, per-token fee-growth snapshots, and per-token accrued fee entitlements. IDs are monotonic and never reused. A zero-radius position can retain collectible fees. Position state cannot be deleted until all entitlements are either collected or explicitly retained as owned sub-raw dust. The anchor is a distinguished, inaccessible position.

`STATE-5` For each token store raw fee escrow, global fee growth, and all data needed to reconcile funded principal, unsettled fee liabilities, and surplus. Fee growth is monotonic; checked overflow reverts. Do not use wrapping counter semantics.

### 5.2 Invariants after every successful operation

| ID | Required property |
| --- | --- |
| `INV-1` | Radius ownership sums to each tick's radius; tick radii sum to `L`; locked anchor radius is positive and included |
| `INV-2` | `A`, `B`, maximum-reserve structure, `V`, and tick aggregate contributions equal their authoritative recomputation |
| `INV-3` | Geometric state is on, or conservatively inside within the specified numerical slack, the admissible aggregate reserve set; correct branch and tick partition hold |
| `INV-4` | Every reconstructed tick basket is feasible for its sphere/cap and virtual-offset floor; aggregate baskets recover `X` within certified allocation bounds |
| `INV-5` | Every principal and fee claim is nonnegative and funded; principal, fees, and surplus are disjoint |
| `INV-6` | For each supported token: normalized custody = principal + normalized fee escrow + surplus; fee liabilities do not exceed fee escrow |
| `INV-7` | Two-token swaps change principal of only those two tokens; other principal entries and `V` are unchanged |
| `INV-8` | Crossings change no token balances, radius ownership, fee snapshots, or virtual offsets |
| `INV-9` | Uninvolved owners' claims cannot be reduced by another user's zero-net mint/burn/collect sequence beyond proved rounding bounds |
| `INV-10` | Every successful swap consumes the full requested gross input, pays the certified output, respects limits, and terminates within the immutable work cap |

Donation increases surplus only. Fee collection decreases fee escrow only. Mint/burn can change all principal coordinates, `V`, radii, and aggregates. Swaps cannot fund themselves from fees or surplus. Geometric slack from output rounding is principal; it is not an unrecorded source of tokens.

## 6. Public behavior

Names and argument groupings below define the semantic interface; a future ABI may use structs with these fields. Finalize the ABI during milestone P0 before tests depend on it. Do not add externally callable mutation paths beyond this set.

### 6.1 Factory creation and bootstrap

`BOOT-1` `createPool(config, initialFullRangeRadius, maximumAmounts[], recipient, deadline)` atomically deploys and funds the pool at the equal-price point. It returns the pool address and the creator's unlocked position ID. The creator supplies both its redeemable radius and the permanent anchor radius. Require redeemable radius to be positive; disclose exact locked radius and raw funding before execution through a preview.

`BOOT-2` Compute the anchor radius as the smallest representable radius whose equal-point geometric reserve per token is at least `10^18` normalized atoms (one whole token). Round funding upward; integer transfer excess is surplus. Mint the anchor shares to an inaccessible internal owner, not to an externally controlled burn address with collectible privileges. Initialize all statistics and fee snapshots before exposing an active pool.

`BOOT-3` Deployment, token funding, registration, and initialization either all succeed or all revert. Reentrancy cannot initialize twice or register a partially funded pool. A deterministic address does not grant an unrelated sender authority over the creator's allowances. Payer is the actual caller unless an explicitly specified signature mechanism is added in a later revision.

### 6.2 Exact-input swap

`SWAP-1` `swapExactIn(tokenInIndex, tokenOutIndex, amountInRaw, minAmountOutRaw, recipient, deadline, maxCrossings)` returns `amountOutRaw` and emits one swap summary. Inputs must be distinct valid indices, positive amount, and a recipient other than zero or the pool. Deadline succeeds at equality and fails when `block.timestamp > deadline`. `maxCrossings` can only tighten the protocol work limit.

`SWAP-2` Compute the fee **once** on gross raw input: `feeRaw = ceil(amountInRaw * feePpm / 1_000_000)`. Net raw input is the difference. Reject zero net input or zero final output. Segmentation neither charges another fee nor repeatedly rounds that fee. Normalize net input exactly before geometric calculation.

`SWAP-3` Follow [MATH: swap traversal](docs/MATH.md#6-complete-swap-traversal). Find the earliest actual event on the connected admissible branch. Check both adjacent boundaries and both roots of a crossing quadratic where applicable. Endpoint-only classification is insufficient. A swap may first approach the equal-price point, release a tick, then move away and trap it again.

`SWAP-4` A root must satisfy the original unsquared equation, cap partition, physical reserve floors, nonnegative supporting prices for every token, and the connected trade direction. Squaring an equation or converging Newton iteration does not certify a root. Reject trades requiring negative prices or an output reserve below funded principal.

`SWAP-5` Execute atomically or revert. No silent input truncation when liquidity, numerical bounds, or crossing allowance is exhausted. Charge no fee and make no persistent writes on a failed swap. Internal fractional segments are not individually transferred. Quantize the final output downward once, then certify and classify the actual rounded endpoint.

`SWAP-6` Transfer the exact gross input from the caller and the exact output to the recipient. Observe expected pool balance deltas for both transfers, and recipient receipt for output. Any mismatch reverts. Gross input is split exactly between principal and fee escrow; no additional charge is hidden as rounding. The quote cannot promise executable token transfers or unchanged future state.

### 6.3 Liquidity positions

`LP-1` `mintPosition(tickKey, radiusDelta, maxAmountsRaw[], recipient, deadline)` creates a position and returns its ID and actual raw basket. `increasePosition(positionId, radiusDelta, maxAmountsRaw[], deadline)` adds to an existing position owned by the caller. Radius shares equal radius in the internal representation; do not derive shares from `balanceOf(pool)` or a dollar-valued NAV.

`LP-2` Reconstruct the tick's current basket per unit radius using [MATH: reconstruction](docs/MATH.md#4-reconstructing-liquidity). A new narrow tick may start on its boundary. Add liquidity in that current basket, never by resetting a tick to the equal point. Compute the new tick's exact virtual contribution and charge the corresponding principal difference. Pull each required token upward to its raw unit, with excess recorded as surplus. A caller's maxima are hard bounds.

`LP-3` Initialize a new position's fee snapshots to current growth. Settle an existing position's fees before increasing or reducing its radius. New radius cannot earn historical fees. Same-owner positions are not implicitly merged.

`LP-4` `burnPosition(positionId, radiusDelta, minAmountsRaw[], recipient, deadline)` removes the current proportional basket and returns its raw principal amounts. Radius must be positive and owned by the caller. It cannot include locked shares. Principal payouts round down. Burn does not automatically collect fees; zero-radius positions retain them. Burning all unlocked liquidity leaves a coherent funded anchor pool.

`LP-5` A zero-radius non-anchor tick is removed from the live tick book, freeing capacity. Its historical position IDs and fee entitlements remain meaningful. Recreating its key cannot inherit another position's shares, snapshots, or fee dust. The full-range record always exists.

`LP-6` Mint/burn must preserve the common price direction and tick classification in exact arithmetic. Rounding has a separately certified, conservative error budget. Reject an allocation that cannot be certified. Include the post-update `R`, `K`, `S`, `V`, `A`, `B`, and maximum reserve in the same atomic transition.

### 6.4 Fees

`FEE-1` All radius `L`, including boundary and locked shares, earns input-token fees in proportion to radius at swap time. As a swap never changes radii, use pre-swap `L` for the entire fee, independent of segmentation. The fee currency remains the input token; never redistribute it as equal-dollar baskets.

`FEE-2` Maintain global fee growth per token with at least 128 fractional bits in normalized-atom-per-radius units. On a fee of normalized amount `f`, growth increases by `floor(f * growthScale / L)`. The undistributed remainder stays in fee escrow as **unallocated fee dust**. It is not added to future growth after ownership changes. Persist enough fractional entitlement on positions that repeated collection cannot discard or duplicate their earned fractions. The numerical contract specifies bounds.

`FEE-3` `collectFees(positionId, tokenIndices[], recipient)` settles growth and transfers the raw-unit floor of accrued entitlement for the requested distinct token indices. The owner authorizes collection; recipients may differ. Retain sub-raw entitlement for later collection. Principal, tick geometry, and price remain unchanged. Collection of a zero claim succeeds with zero transfer; invalid indices and duplicates revert.

`FEE-4` Unallocated dust and anchor fees remain locked. There is no fee administrator, sweep function, or redistribution on last withdrawal. A future dust policy must specify ownership and pass the same adversarial accounting tests.

### 6.5 Queries and diagnostic interface

`VIEW-1` Provide bounded/paginated views for configuration, token indices/scales, global aggregates, geometric/principal/fee/surplus reserve breakdown, tick records, position shares and accrued fees, and the current partition. Avoid an obligatory return of every position or every tick for ordinary quoting.

`VIEW-2` `quoteExactIn` takes the same trade controls as the swap excluding payer transfers and returns output, raw fee, crossed tick keys/directions, segment count, resulting aggregate summary, and a state version. Mint/burn previews return the exact raw baskets and bounds their mutating counterparts will use at unchanged state. A successful quote must match execution bit-for-bit when state, time validity, and supported-token behavior are unchanged.

`VIEW-3` Increment the state version on each successful mutation affecting quotes or entitlements. Quotes are informational, not reservations. Views reading mutable accounting must reject access during an in-progress settlement so a token callback cannot expose partially updated state as a usable price.

## 7. Settlement, tokens, and failure semantics

`SEC-1` Supported tokens have fixed decimals in `[0,18]`, exact transfer amounts, stable balances outside transfers, and ERC-20-compatible calls. Support successful no-return transfers through an appropriate wrapper; reject false return, malformed return, failed transfer, and measured amount mismatches. Token introspection cannot prove future behavior. Pools using tokens that later rebase, blacklist, pause, upgrade incompatibly, or lie about balances can lose liveness; do not describe them as covered by solvency guarantees for conforming tokens.

`SEC-2` Use one reentrancy lock for all pool mutations and coherent-state views. The caller cannot reenter swap, mint, burn, collect, or initialization through any token or recipient path. Check authority and limits; compute the candidate; commit coherent effects under the lock; execute/check token interactions; emit final summary. A failure anywhere rolls back everything. External calls can reenter even when no Ether is involved. [Solidity security guidance](https://docs.soliditylang.org/en/latest/security-considerations.html) explains the threat and checks-effects-interactions pattern.

`SEC-3` Account unsolicited deposits as unallocated surplus, outside pricing and share issuance. Reconcile touched-token balances before and after settlement. There is no `sync`, reserve-skimming, token rescue, or implicit donation-to-liquidity path. Preexisting unobserved donations must not be confused with the current caller's transfer.

`SEC-4` Slippage and deadlines protect the specific call. There is no guarantee against MEV, permanent depegs, issuer insolvency, or economically unwise tick selection. External prices may be used in simulations, never as hidden production dependencies.

The error interface must distinguish at least: invalid configuration/token/index/tick, unsupported decimals/transfer, expired deadline, unauthorized position, zero net input/output, slippage, insufficient principal, capacity/work limit, arithmetic domain/overflow, uncertifiable root/rounding/allocation, inadmissible price branch, and reentrancy. Each error carries the relevant indices/limits or stage where useful; no secret data exists in error payloads. Preconditions shared by preview and execution have identical outcomes, excluding balances/allowances and transfer behavior.

Required events: pool creation/bootstrap (including anchor funding); position mint/increase/burn; fees collected; tick initialized/removed; tick crossing with direction and segment ordinal; swap with gross input, fee, output, recipient, and state version. Events must reconcile with actual effects. Do not emit a successful fill for an internal estimate.

## 8. Work bounds and implementation discipline

`PERF-1` The production swap path must not enumerate owners, positions, or all tokens. Invariant evaluation uses cached sums in constant arithmetic work in `n`. Maximum-reserve maintenance may cost `O(log n)`; locating/advancing live ticks may cost `O(log T)` per crossing. Initialization and basket LP operations are allowed `O(n + T)` work. Use an ordered array with binary search for the bounded tick book; insertion/removal may shift up to 64 records. Do not introduce a general tree for ticks without measured need.

`PERF-2` Maintain an index-based maximum-reserve tree, not a heap of duplicate updates that can grow indefinitely. The maximum untouched reserve for a token pair can be queried once for traversal; hypothetical states compare that value with the two changing coordinates. Rebuild/update the tree on liquidity operations. The mathematical reason this suffices is in MATH.

`PERF-3` Hard limits: 64 live tick records; 128 crossing transitions per swap; 160 bisection steps per root solve after a finite bracket is established. Any acceleration must retain the bisection certificate and work bounds. User `maxCrossings` is at most 128. Define and test zero-distance tie handling separately from positive-distance progress. Exceeding a bound reverts before settlement.

`PERF-4` Pin a released Solidity 0.8.x compiler, EVM target, optimizer/via-IR settings, Foundry, forge-std, and any OpenZeppelin/math dependency by exact version/revision during P0. Check compiler known bugs for the chosen build settings. This specification does not assert that an unpinned `latest` build is safe. CI runs offline after dependencies and fixture artifacts have been fetched explicitly.

## 9. Completion contract

An implementation is complete only after all mandatory milestones and requirements in [TESTS](docs/TESTS.md) and [PLAN](docs/PLAN.md) pass. A sphere-only AMM, a fee-free toy, a cap implementation without crossings, an unchecked Newton solver, or a passing suite built from the same equations as the implementation is not completion.

The current task creates documentation only. No Solidity implementation, executable test suite, deployment, benchmark result, audit, or numerical proof is supplied by these files. Future agents must record the actual evidence rather than promote a plan into a pass claim.

## 10. Sources and scope of attribution

The controlling research source is the Orbital text supplied by the user, titled *Orbital*, Dan Robinson, Ciamac Moallemi, Dave White, published June 2, 2025; supplied metadata reports modification July 22, 2026. Canonical reference: [Paradigm Orbital](https://www.paradigm.xyz/writing/orbital). Corrections and implementation policies in these documents are derived here and must be checked through the specified tests; they are not attributed to an existing audited implementation.

The user also supplied [*Concentrated N-dimensional AMM with Polar Coordinates in Rust*, arXiv:2510.05428v1](https://arxiv.org/html/2510.05428v1), Tolstikov et al., October 6, 2025. That paper describes Orbswap, polar discretization, skewed liquidity, and Rust/Stylus examples. It is comparative context, not a replacement specification for Orbital's spherical caps and consolidated torus. Its floating-point example is not a Solidity arithmetic oracle. Importing its angle mapping or asymmetric invariant would change this mechanism.
