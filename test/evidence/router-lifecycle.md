# Router lifecycle and directed initialization evidence

Status at 2026-09-08 02:27:42 UTC: **22 focused tests passed** on the pinned official Aqua implementation and custom SwapVM fork. This is the lifecycle handoff snapshot, not completion of G2/G3, a live deployment, or a successful Orbital swap. Subsequent engine edits require refreshed integrated evidence.

## Scope and reproduction

Run `forge test --match-contract RouterLifecycleTest` from `packages/contracts`. Foundry 1.5.1 (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`), Solidity 0.8.30, optimizer 700 runs, via IR, Cancun; Windows on AMD Ryzen 5 7520U. Repository HEAD was `2ecc6ce2f180fde239c13feee7dd09247c0d1b07` with uncommitted work. Final compilation took 82.32 seconds; the suite took 47.50 ms (136.89 ms aggregate CPU). No randomness was used.

The tests use `vendor/aqua/src/Aqua.sol`, not an Aqua mock. Its pinned v1.0.0 revision is `81c26e4619ce21556ab02b3284ee2685de21fb18`; SwapVM is based on `f09a41e689240adc645934f965c8061749397cd2` with the separately documented minimal dispatch hooks. See [upstream research](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/AQUA_RESEARCH.md), [mathematical definitions](../../docs/MATH.md), [numeric obligations](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/NUMERICS.md), and [paper traceability](../../docs/PAPER_IMPLEMENTATION.md). Token fixtures are ordinary ERC-20s; mutable metadata and router impersonation occur only in adversarial tests.

The first 14-test run against the fail-closed scaffold had 13 expected failures. Implementation then passed the behavioral suite. Adding a separate runtime-size assertion exposed an initially oversized router (35,008 runtime bytes). Linking the initializer alone and then the codec was insufficient; storage initialization and observation loops were also moved into a linked library. No compiler optimization pins or EVM limits were relaxed.

## Verified behavior

- Maker approves Aqua and directly ships `abi.encode(order)`; activation validates canonical configuration/order/program, maker/domain/nonce, owner renunciation, token decimals and all registered Aqua entries. Ship and activation leave token custody in the maker wallet and do not transfer tokens.
- Program bytes are exactly `0x7220 || configHash || 0x5220 || configHash`. MakerTraits comes from the pinned builder with the first two canonical tokens and Aqua mode. Successful activation alone consumes the maker nonce; retirement is maker-only and terminal. Docking is independently observed and does not silently mutate application status.
- Initial principal is the exact ceiling-funded equal-coordinate basket. Forging a raw initial amount by one atom fails. The test at a one-whole-token full-range anchor accepts certified directed rounding; an undersized anchor fails.
- Every token is checked for live count and wide principal-plus-fee backing, including the third token on an unrelated two-token trade. Missing/docked/underbacked entries reject activation or trade eligibility. Donations up to Aqua's `uint248` allocation maximum produce a nonzero high surplus limb without changing principal, radius or fees.
- Availability remains inspectable when docked or logically underbacked; one unhealthy logical entry zeroes every funding ceiling. Wallet spending reduces the affected physical ceiling without changing geometric principal. Initial allowance and wallet balance failures are exercised independently of logical Aqua backing.
- State and availability reads, activation and retirement reject the global entered state; immutable configuration remains readable. Unknown state and nonce exhaustion fail without wrapping. Fresh nonces remain independent after retirement/docking; Aqua rejects re-shipping the docked hash.
- Canonical trade-envelope validation precedes the unavailable engine: exact input, first input transfer, push mode, true `isAToB`, live deadline, 32-byte non-strict threshold, permitted recipient and exactly four instruction bytes. Static quote and swap both return `EngineUnavailable` on valid inputs, with no state mutation or leaked lock.
- Initialization cases cover `n=2,3,5,8`, one and eight ticks, the ordinary three-token/three-tick configuration, minimum admissible cap width, and radius sum `2^160-1` with a wide square sum. These are deterministic boundary examples, not exhaustive tests of every supported dimension/tick combination or the reference-only larger dimensions.

## Initialization derivation and proof obligations

This section records the repository-derived initialization argument, not a new assertion about the paper. Let `Q=2^128`, `U=2^64`, total radius `R<2^160`, and `q0=1-1/sqrt(n)`. Existing directed coefficients satisfy `equalLo/Q <= q0 <= equalHi/Q` and `equalHi-equalLo <= 1`. The initializer chooses

`Xeq = ceil(R*equalHi/Q)`, `L = floor(R*equalLo/Q)`,

and sets every coordinate to `Xeq`. Original per-tick virtual contributions remain `floor(r_t*virtualLo_t/Q)`; their sum is `V`. Principal is `P_i=Xeq-V`, fees start at zero, and each immutable raw amount must equal `ceil(P_i/scale_i)`, where `scale_i=10^(18-decimals_i)*U`. Aqua allocations may exceed those exact immutable amounts; the difference is explicitly observed as wide surplus.

At equal coordinates, putting `e=Xeq-R*q0 >= 0` yields the radial length slack

`R - ||R*1-X|| = sqrt(n)*e <= ceil(sqrt(n))*(Xeq-L)`.

Since `Xeq-L < R/Q+2 < 2^32+2`, the stored conservative bound is below `3*(2^32+2) < U` for all admitted `n<=8`. The implementation uses multiplier 2 for `n<=4` and 3 otherwise. It separately rejects a bound above `U`; this is a **length bound**, never a squared-residual tolerance.

All ticks are initially interior. The implementation checks the exact all-interior sum-cap inequality against the smallest ordinary key before storing that classification, and invokes `OrbitalMath.certify` on the full tick list and resulting vector. A candidate explicit decomposition is `x_t=(r_t/R)*X`; its sum equals `X`, its radial slack contracts from the aggregate slack, and its cap inequality follows from the checked aggregate inequality. Nonnegative principal follows from the existing directed virtual-reserve construction. This argument depends on the already audited coefficient enclosures and certificate, whose proofs/tests remain in their own evidence. A failing certificate aborts activation; it is not treated as acceptable numerical error.

`A=sum(X_i)` and the full 512-bit `B=sum(X_i^2)` are recomputed at initialization. Boundary numerator and sigma sums start at zero; radius, sigma contributions, virtual floors and tick coefficients are retained for later engine traversal. Full-range raw funding must remain at least one whole token per asset; its geometric shortfall may be at most one normalized atom, checked with directed anchor bounds. The near-maximum-radius example is a numeric-domain test, not a claim that the frontend permits a larger allocation than its documented limit.

These tests reuse production geometry for fixture construction. They therefore establish deterministic implementation/lifecycle behavior and orthogonal custody/backing/size properties, **not independent differential validation of the initialization formulas**. Independent high-precision reference fixtures, future swaps, principal/fee updates, crossings, settlement deltas, mutation campaigns and gas qualification remain separate requirements.

## ABI, linking and remaining integration

`IOrbitalLifecycle` extends the unchanged payment-facing `IOrbitalRouter`. It adds activation, retirement, nonce/state/availability getters and lifecycle events. State enum values are explicit: Unknown=0, Active=1, Retired=2. Wide values encode as `(uint256 hi,uint256 lo)`. The concrete router structurally implements this ABI; it does not inherit the interface because the pinned concrete SwapVM quote is non-view whereas its public interface declares view for static calls.

The lifecycle router requires three immutably linked libraries. Deploy/verify these before linking router bytecode; record their addresses and code hashes in deployment evidence. No proxy, owner-controlled relinking or arbitrary delegate target is introduced. Public library entry points are called through compiler-generated library dispatch; mutable storage calls use the router's storage context and are not standalone user-facing initialization methods.

| Artifact | Runtime bytes | Creation bytes |
| --- | ---: | ---: |
| OrbitalSwapVMRouter | 23,046 | 25,386 |
| StrategyInitializer | 7,049 | 7,079 |
| OrbitalOrderCodec | 8,153 | 8,183 |
| OrbitalStorage | 5,935 | 5,968 |

The test-only guard probe is 24,378 runtime bytes, also below EIP-170's 24,576 limit. The production router has only 1,530 bytes of headroom; subsequent execution integration must recheck runtime size and will need modular linked execution code. These are compiler artifact lengths, not verified Arc deployments.

`_dispatch` checks the registered hash and canonical program counters. The fee opcode, `_executeCurve`, and `_afterSwap` intentionally fail with `EngineUnavailable` at this snapshot. `_afterSwap` cannot be bypassed merely by supplying a curve subclass: actual transfer-delta assertions, all-token post-backing, canonical execution events and lock release must be implemented with the real engine. The compiler's unreachable-code warnings at the terminal seam and upstream unlock/event reflect this deliberate fail-closed snapshot. No successful swap, invoice-funded swap, G2 completion or G3 settlement claim is made.

## SDK lifecycle handoff

The follow-on SDK increment generates `lifecycleAbi` from the compiled `IOrbitalLifecycle` interface and checks every executable input/output entry against the concrete router artifact. Compiler settings, interface SHA-256 and method selectors are retained in `packages/sdk/src/generated/provenance.json`. Run `node packages/sdk/scripts/generate-abi.mjs` after a current Foundry build to regenerate it.

`buildActivateTx` and `buildRetireTx` now create maker-bound, zero-value reviewed transactions. `validateTransactionPlan` reconstructs these actions locally and rejects changed targets, accounts, value, order/configuration or trailing calldata. `buildMakerPlan` returns approval/reset steps, an uncompleted ship step and activation; explicit observed `shipped`, `docked` and lifecycle `status` prevent duplicate publication and reject retired/docked hashes. Revoked allowances are repaired even if ship already succeeded. Already-active strategies return no publication steps. `buildRetireAndDockPlan` independently skips either completed action, including the dock-before-retire recovery case.

The four new/updated lifecycle behavior tests failed before implementation (21 passed, four failed). After implementation, `pnpm --filter @orbital/sdk test` passed **25/25** tests (12.487 seconds), and `pnpm --filter @orbital/sdk typecheck` passed. Existing swap/payment/calldata, wallet identity, rejected signature and receipt-recovery regressions remain passing.

These are pure review builders with trusted block-pinned observations; they do not authenticate an RPC, certify a caller-supplied initial basket, execute automatically, enable financial APIs or provide a live frontend lifecycle integration. Controllers must re-read state/nonce/owner/Aqua after each confirmed receipt and simulate before requesting each signature. The SDK tests use encoding fixtures, not claims that those fixture radii and raw amounts form a certified initial basket. Successful activation remains enforced by the real contract. Swap and invoice builder behavior was not changed.

## Snapshot hashes

| Source | SHA-256 |
| --- | --- |
| `src/OrbitalSwapVMRouter.sol` | `b3060566ff6b4396ad3fe5221e4c5c60c7cd3c033a567943a4b004d4163c7dc6` |
| `src/interfaces/IOrbitalLifecycle.sol` | `2ba36c42a9b873bb71b222e24a0586a1f47e87d00ffa841ddfc9b6370fa3d74c` |
| `src/libraries/OrbitalStorage.sol` | `bbe2f40214384289d7e6e4c4d37c7644e343d1877a37faee33f61b7e64b713db` |
| `src/libraries/OrbitalOrderCodec.sol` | `f802e2cd7361c1353c0fa17e98a32454707ceb993274572bb35240b75509e717` |
| `src/libraries/StrategyInitializer.sol` | `8c6d4566ce4c7c1bcea85714afa1c33997fd72adc3a099a376bed2db266ed8b0` |
| `src/libraries/WideMath.sol` | `61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d` |
| `src/libraries/OrbitalMath.sol` | `6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb` |
| `src/libraries/TickGeometry.sol` | `930431a7bab7d38ad1fc5b173d91a4f5e9340ca5af04631a46c61fc1fd35204b` |
| `test/RouterLifecycle.t.sol` | `f77a3df29e48fedee034c2dc2609f12014629fe99b489bc121e4c2f776dbdaf8` |

Paths in this table are relative to `packages/contracts`. The embedded computation manifest was validated against the computation-audit skill schema:

```json
{
  "schema_version": 1,
  "claim_id": "G2-lifecycle-initialization-snapshot",
  "repository": {"commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07", "dirty": true},
  "command": "cd packages/contracts && forge test --match-contract RouterLifecycleTest",
  "environment": {"software": ["Foundry 1.5.1", "Solidity 0.8.30", "optimizer 700", "viaIR", "Cancun", "Windows"], "hardware": "AMD Ryzen 5 7520U"},
  "mathematics": {
    "assertion_tested": "Directed equal-point activation, custody/backing observations, terminal lifecycle and fail-closed curve seam in 22 deterministic tests",
    "coefficient_domain": "Exact uint256/uint512 arithmetic with Q128 directed coefficients",
    "conventions": "U=2^64; Q=2^128; tick grid 2^32; schemaVersion=1",
    "inputs": ["n=2,3,5,8", "ticks=1,3,8", "decimals=6,18", "minimum valid cap width", "R=2^160-1", "uint248 maximum donation"],
    "bounds": {"tokens": 8, "ticks": 8, "radius_exclusive": "2^160", "radial_slack_max": "U"},
    "non_claims": ["Independent differential initialization proof", "Successful financial execution", "Complete G2/G3", "Arc deployment", "Exhaustive domain or release campaign"]
  },
  "randomness": {"used": false, "generator": "none", "seed": null},
  "run": {"started_at": "2026-09-08T02:26:20Z", "runtime_seconds": 82.38159, "exit_status": 0},
  "outputs": [{"path": "packages/contracts/test/RouterLifecycle.t.sol", "sha256": "f77a3df29e48fedee034c2dc2609f12014629fe99b489bc121e4c2f776dbdaf8"}],
  "checks": ["22 focused tests passed", "Production runtime 23046 bytes", "Test probe runtime 24378 bytes", "All linked libraries below EIP-170"],
  "result": "Implementation and finite assertion verified in the stated deterministic examples; mathematical generalization depends on documented coefficient/certificate obligations",
  "residual_risks": ["Shared geometry in fixtures", "Execution seam intentionally unavailable", "Only 1530 bytes router runtime headroom", "Live deployment and engine release tests pending"]
}
```
