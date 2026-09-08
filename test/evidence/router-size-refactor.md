# Router activation/validation size refactor

Snapshot: 2026-09-08 03:47:26 UTC. This records a behavior-preserving extraction before the separate interior execution and settlement integration. Subsequent router/storage edits require refreshed integrated measurements.

`OrbitalSwapVMRouter.activateStrategy` retains its reentrancy guard, runtime chain-domain check and owner-renunciation check, then delegates the complete remaining activation body to the linked `OrbitalStorage.activate`. That helper retains maker/domain validation, existing-strategy rejection, exact nonce/exhaustion handling, canonical shape/order/program checks, allowlist and onchain metadata checks, certified initialization, all-token Aqua live/backing/physical funding checks, wide initial-surplus storage, nonce advancement and the activation event in the same order. Storage layout, event/error signatures, public router ABI and constructor allowlist behavior remain unchanged.

Trade validation also delegates to `OrbitalStorage.validateTrade`, preserving runtime/config domain, known/active order, maker/positive input, canonical taker envelope and all-token backing checks. The router retains its quote/swap guards, `_known`, read guards and ownership logic. The fee opcode wrapper and `feeIn`/`accrueFee` were not changed. The helpers execute in the router's storage/address/caller context through compiler-linked library delegation, with no new mutable delegate target.

## Verification

Existing behavior tests preceded this refactor; no new behavior was introduced. To avoid concurrent Foundry writes, the cooperating frontier agent ran one combined compilation:

```powershell
forge test --match-contract '^(FrontierTurnTest|RouterLifecycleTest|FeeInstructionTest)$' -vv
```

Run from `packages/contracts`, Solidity 0.8.30, optimizer 700 runs, via IR, Cancun; existing Foundry 1.5.1 toolchain. Compilation took 53.35 seconds; the combined suites took 47.57 ms. Results reported and reviewed for this snapshot:

- `RouterLifecycleTest`: **22/22 passed**, including official Aqua custody/backing, maker nonce/domain/canonical order, metadata changes, donation up to uint248, read guards, retirement/docking, unavailable engine and the production EIP-170 assertion.
- `FeeInstructionTest`: **7/7 passed**, including the 256-run wide ceiling fuzz test, six-pair net-curve/gross-input behavior, principal/fee separation, malformed curve results and atomic rollback through the unavailable production settlement seam.
- The unrelated `FrontierTurnTest` was deliberately included for its test-first stub campaign: **10 expected failures** with `InvalidContext`. The combined command therefore was not globally green. Those failures are owned by the separate frontier implementation task and are not claimed as passing here.

The extraction regression can be reproduced alone with `forge test --match-contract '^(RouterLifecycleTest|FeeInstructionTest)$' -vv`. `git diff --check` on the two modified production files passed.

## Measured bytecode

Lengths are read from the compiled artifact's runtime and creation bytecode objects, with no unlimited-size EVM setting or compiler-pin change. The baseline artifacts were inspected immediately before the extraction build.

| Artifact | Before runtime bytes | After runtime bytes | After creation bytes |
|---|---:|---:|---:|
| `OrbitalSwapVMRouter` | 23,654 | 20,376 | 22,730 |
| `OrbitalStorage` | 6,394 | 10,787 | 10,819 |
| `StrategyInitializer` | 7,049 | 7,049 | 7,079 |
| `OrbitalOrderCodec` | 8,153 | 8,153 | 8,183 |

The router saves **3,278 runtime bytes**, leaving **4,200 bytes** below EIP-170's 24,576-byte limit at this snapshot. Every linked library also remains below the limit. All linked addresses/code hashes still need to be pinned in deployment evidence. These are local compiler measurements, not Arc deployment or integrated gas qualification.

## Source fingerprints

SHA-256 for the refactor handoff:

| Source | SHA-256 |
|---|---|
| `packages/contracts/src/OrbitalSwapVMRouter.sol` | `da8bb5f1e41fe0ed007857876f750f244831d0ffc019b2e807974d3c73d53d5b` |
| `packages/contracts/src/libraries/OrbitalStorage.sol` | `8baa1dcff7b1ce5ff3d0a89f0d0b375ce41b650071841b3a1e58dc50366066e6` |

Only these two production files and this evidence document belong to this increment. Real interior swaps, transfer-delta settlement, crossings, complete G2/G3 campaigns and target verification remain separate work.
