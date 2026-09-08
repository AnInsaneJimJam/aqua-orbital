# Exact Aqua settlement observations

2026-09-08. The linked `OrbitalSettlement` library now checks the physical and
logical effects of the pinned Aqua transfer path. **12 focused tests pass.**
These tests use official Aqua and real ERC-20 transfers through a deliberately
small settlement harness. Its principal update charges one synthetic raw atom;
it is not a mathematical curve, production router, or sponsor demonstration.

## Contract between the router and library

The router enters its global guard before calling
`begin(strategy, orderHash, aqua, taker, recipient, inputIndex, outputIndex, gross)`.
The strategy reference, Aqua deployment, immutable metadata, and pair must come
from authenticated router state and canonical taker validation. The library
also rejects inactive state, invalid pair/roles, missing pair Aqua entries,
changed decimals, absent guard, or an already active snapshot.

`begin` saves both touched token balances for router, maker, taker and recipient,
plus the pair's Aqua allocations, identities and gross amount. The namespace is
`keccak256("orbital.router.settlement.snapshot.v1") - 1`; it does not change the
shared strategy storage layout. Only taker and recipient may be the same role.

After the router updates certified principal and fees, and the existing VM has
performed both token transfers, it calls
`finish(strategy, orderHash, aqua, gross, output)`. Matching snapshot identity,
gross amount, active strategy and positive output are required. The resulting
net token changes must be exactly:

| Role | Input token | Output token |
| --- | --- | --- |
| Router | 0 | 0 |
| Maker | +gross | -output |
| Taker, distinct recipient | -gross | 0 |
| Distinct recipient | 0 | +output |
| Combined taker/recipient | -gross | +output |

Repeated reads of the combined role use those same combined expectations.
Pre-existing router donations are saved balances, so they cannot subsidize
either transfer. Comparisons first order the unsigned values and then subtract;
there is no overflowing `before + expected` intermediate. Aqua input allocation
must increase by exactly gross and output allocation decrease by exactly output.
Both entries retain the immutable token count. Every strategy token then passes
the existing 512-bit principal-plus-fees backing check.

Any remaining router-to-Aqua approval on either touched token is cleared before
the final token, decimals and Aqua reads. Both allowances are verified zero
**after both cleanup calls**: a second token's cleanup cannot restore the first
token's allowance unnoticed. The guard and active snapshot remain in place
through all token calls. Success deletes the snapshot but leaves the global
guard active for the router's final event and unlock. Failure reverts the token
transfers, Aqua allocations, simulated principal and fee counters together.

## Test scope and results

Command: `forge test --root packages/contracts --match-contract SettlementTest -vv`.

- The compiling interface-only stub produced **0 passed / 11 failed** with
  `SettlementNotImplemented`, before the behavioral implementation.
- The final run at **2026-09-08 03:48:23 UTC** produced **12 passed / 0 failed**;
  Solc compilation took 7.46 seconds, the suite 6.45 milliseconds.
- Success cases execute all six ordered pairs on one three-token Aqua strategy,
  including distinct recipients, a combined taker/recipient, exact logical
  allocations, fee/principal separation and pre-existing router donations.
- Adversarial cases reject taxed output, overcredited output, extra sender
  debit, input tax subsidized by a router donation, cross-token changes to a
  nonreceiving taker/recipient, and unexpected router balance changes.
- Cleanup cases cover nondecrementing allowances, a lying successful zero
  approval, balance mutation during cleanup, a blocked callback under the guard,
  and reintroducing input approval during output cleanup.
- Aqua cases detect wrong pair allocation deltas despite unchanged physical
  self-transfers, and insufficient backing on an untouched third token.
- Metadata, absent/duplicate snapshot, absent guard, zero amounts, invalid pair,
  forbidden recipient roles, wrong hash and changed gross are tested explicitly.

The source library's unlinked runtime at this checkpoint is **6,658 bytes**.
Harness gas includes fixture accounting and adversarial setup and is not a
production router gas benchmark.

An independent read-only review by the `backend_reorg` agent found no scoped
correctness defect in alias handling, unsigned delta comparisons, both-token
cleanup ordering, separate storage namespace, guard lifetime or final router
event/unlock placement. It retained the authenticated metadata and truthful
allowed-token interface hypotheses below. The review is separate from the
root's later real-router callback and rollback integration tests.

## Reproducibility and limits

Pinned build: Forge 1.5.1, Solc 0.8.30, Cancun, via-IR, optimizer enabled with
700 runs; Windows PowerShell. The source state is a dirty development checkout.
These hashes identify the standalone run **before subsequent router/interior
integration**; later changes to shared storage require a new integrated run.

| File under `packages/contracts/` | SHA-256 |
| --- | --- |
| `src/libraries/OrbitalSettlement.sol` | `ec74cc5714beb38330f02d61bec16791cb9b9f97853a21cd43d091df0811673a` |
| `test/Settlement.t.sol` | `5d29e794e46970fa280cd73c8a49851a7b1170f8dbbbab1fa4e34cf94609b07a` |
| `src/libraries/OrbitalStorage.sol` | `8baa1dcff7b1ce5ff3d0a89f0d0b375ce41b650071841b3a1e58dc50366066e6` |
| `vendor/aqua/src/Aqua.sol` | `de94a67c58f7b8b9e95c03f6a9c2acbacf525b5f43f8255111a83a0f5156b68c` |
| `src/libraries/StrategyInitializer.sol` | `8c6d4566ce4c7c1bcea85714afa1c33997fd72adc3a099a376bed2db266ed8b0` |
| `src/libraries/WideMath.sol` | `61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d` |

The library does not certify the root, path, fee rate, principal transition,
canonical event or caller-supplied order. Those remain separate router and math
obligations. Its observations rely on the verified allowed tokens' truthful
ERC-20 balance/allowance/decimals interfaces; observed exact deltas are not a
proof about arbitrary malicious token internals. Full router reentrancy,
threshold/transfer rollback, quote/swap parity, gas and receipt-backed event
checks belong to integrated evidence. This isolated result does not close
G2/G3, establish mixed-tick traversal, or verify Privy or Arc deployment.
