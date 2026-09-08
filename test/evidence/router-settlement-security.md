# Real router settlement security checks

Observed 2026-09-08, Solidity run at 04:07:42 UTC and receipt campaign completed at 04:11:55 UTC. This validates the current all-interior production router against official Aqua. No curve, router, Aqua, balance query or settlement double is used. Three allowlisted ERC-20 test tokens have switchable hostile behavior that is enabled after actual canonical activation.

## Independent settlement review

A bounded read-only review of `OrbitalSettlement.sol`, `Settlement.t.sol`, the router hooks and transfer ordering found no correctness defect in the examined alias, delta, cleanup, guard or unsigned-arithmetic logic. This is not an independent security audit or a proof of arbitrary-token compatibility.

- Maker, router and Aqua aliases are excluded; taker/recipient aliasing gets the same combined input-debit/output-credit expectation on both observations. Distinct roles get exactly the intended two-token deltas, including zero change to nonreceiving roles and existing router donations.
- Delta comparisons order unsigned values before subtraction. Aqua uint248 allocations are widened before differences. Overflow cannot turn an invalid observed sum into an accepted exact delta through these comparisons.
- Both token approval cleanups occur while the snapshot and global guard are active, followed by both zero-allowance checks and final metadata/balance/Aqua/backing reads. A later cleanup restoring the earlier token's approval is detected.
- The snapshot namespace differs from strategy storage. `finish` deletes the active snapshot only after final checks and leaves the global guard for the router. The router then emits its canonical event and releases the guard; only the pinned VM's internal order unlock and stock event follow, with no intervening external call.
- This reasoning depends on authenticated immutable strategy metadata, the pinned linked libraries and allowed tokens exposing truthful ERC-20 observations. `begin`/`finish` do not independently certify a curve or authenticate a caller-supplied strategy pointer. See [settlement evidence](settlement.md) for the separate library obligations.

## Solidity integration tests

Command from `packages/contracts`:

```powershell
forge test --match-contract RouterSettlementSecurityTest -vv
```

**7 passed, 0 failed, 0 skipped.** Compilation took 36.49 seconds; the suite took 24.71 ms (49.44 ms aggregate CPU). Existing behavior was under test, so there was no implementation stub/red stage or production change in this increment. Source is `test/RouterSettlementSecurity.t.sol`.

The actual fixture ships and activates two separate three-token/three-tick orders through official Aqua. Tokens have 6/18/6 decimals before address sorting. All principal starts from the certified default equal-point initialization. Fixture funding deliberately reuses production coefficients; this is behavioral and rollback verification, not an independent mathematical oracle.

| Test | Observed behavior |
|---|---|
| Transfer and approval callbacks | Input transfers, output transfer, positive approval and sticky-allowance cleanup all trigger callbacks during a successful real swap. Every callback attempts ten router entries: same/cross-order swap, activation, same/cross-order retirement, same/cross-order coherent state, availability, and same/cross-order quote. Each rejects with the exact global `Reentrancy` selector. Immutable configuration remains readable and identical. One canonical execution event, one version increment and unchanged second-order state remain. |
| Taxed input with donation | A preexisting router donation cannot subsidize a short transfer and pass settlement. Failure restores full curve state, fees, version, token balances/supply/allowances, both orders' Aqua allocations and nonce. |
| Taxed output | Undercrediting output fails and restores the same full snapshot. |
| Cleanup mint | Input cleanup mints an unexpected atom to the maker; final balance checks reject and the mint and real curve update revert together. |
| Lying zero approval | A token returns success without clearing its sticky router allowance; settlement rejects and leaves no persistent snapshot/global guard/order lock. |
| Cross-token cleanup | Output cleanup restores the previously cleared input allowance; the final dual allowance checks reject and roll back. |
| Invoice recipient failure | The actual six-whole-unit input trade funds a five-dollar invoice. Failure at the second recipient rolls back the completed nested curve, earlier 90% split, fee/version state, invoice and transfers. Disabling the fault permits a successful 90/10 split with version advancing exactly once. |

Every failed-swap case retries successfully after only the hostile token mode is disabled, verifying recovery rather than just inspecting a revert. The invoice test also retries the original unpaid invoice after failure.

## Actual reverted receipts

Foundry's `recordLogs` is an execution inspector: the pinned implementation appends logs when a LOG opcode executes, including a nested call that an outer call later reverts. Therefore the Solidity invoice test intentionally observes the nested canonical event as evidence that the real curve and settlement ran; it does **not** call that a transaction receipt. The implementation was checked in the [Foundry v1.5.1 inspector source](https://github.com/foundry-rs/foundry/blob/v1.5.1/crates/cheatcodes/src/inspector.rs#L1109-L1120).

The separate `test/router-settlement-receipts.mts` campaign uses `eth_sendTransaction` with disposable unlocked accounts on a new loopback-only Anvil at port 18545, verifies chain 31337 and an Anvil client identity, deploys and links current compiled artifacts, and reads actual mined receipts. No private key, backend signing path, Arc signer or shared-chain reset is used. It records each deployment's transaction/address/runtime code hash and rejects any deployed runtime above EIP-170. Standard Cancun and gas/size limits remain enabled.

Reproduce from the repository root after compiling the Solidity fixture:

```powershell
docker run --name orbital-security-receipts-local --rm -d -p 127.0.0.1:18545:8545 --entrypoint anvil ghcr.io/foundry-rs/foundry:v1.5.1 --host 0.0.0.0 --chain-id 31337 --hardfork cancun --silent
pnpm --filter @orbital/sdk exec tsx ../contracts/test/router-settlement-receipts.mts
docker stop orbital-security-receipts-local
```

The campaign artifact is [router-settlement-security-receipts.json](router-settlement-security-receipts.json), generated from actual RPC responses. **All six failed transactions have `status=0x0` and `logs=[]`**. Before/after digests match across complete router state, nonce, all three token supplies, relevant role balances and approvals, Aqua allocations and invoice state where applicable. The final repaired invoice has `status=0x1`, exactly one `OrbitalSwapExecuted` and one `InvoicePaid`, the expected 4.5/0.5-dollar split, and router version 2.

| Case | Transaction hash |
|---|---|
| Taxed input plus router donation | `0xa9eb51fb4ba7562e64d0a010383052fc85ac75aede733f0b5d67f337392368b4` |
| Taxed output | `0xe661fbf09ed33cb46db98b8a735183d458a5a4192ded90ee369f3298629bfee3` |
| Cleanup balance mutation | `0x4efcff3411f74ca6a81e9b90ba1c37024fdc545caf7307140547d0831d4a86e8` |
| Lying zero approval | `0x5e4ce88ec0e1c603289d26c99d39b749f40a72b1f80b0cd815177a1d110a715a` |
| Cross-token approval restoration | `0x9996b913da8d7c2c0500e859416850c08fee4e238b8f8ec3bc5dc582a3da3426` |
| Second invoice recipient failure | `0x90721329b8126a425a3dd96f7d6b4c0f3444a1622ef6424b8975b0c3dadaf2a6` |
| Recovered invoice | `0x576403ee421cd120a0ae53ddfc9076e8c4aa983d97087f1757b8b377b205b0a6` |

These hashes identify the recorded disposable local chain only; they have no public explorer claim. The no-volume test container was stopped after artifact capture. The user's shared port-8545 chain and PostgreSQL service were not reset or replaced. The script's initial `.ts` invocation failed at transpilation because the contracts package uses CJS defaults; changing only the script extension to `.mts` resolved that harness issue before its first transaction campaign.

## Provenance and limits

Pinned execution: Foundry/Anvil 1.5.1, Solidity 0.8.30, optimizer 700, via IR, Cancun, Node 22.18.0 and pnpm 10.34.5. Real deployed runtime sizes in the receipt artifact: router 21,919 bytes; storage library 18,269; settlement library 6,658; official Aqua 2,678; payments 12,097. These are local size measurements, not release gas qualification or verified Arc addresses.

Source SHA-256 values and all deployment runtime hashes are included in the JSON artifact. Key snapshot hashes:

| Source | SHA-256 |
|---|---|
| `RouterSettlementSecurity.t.sol` | `43b6669f623dcc935b5a21266489f48372ec32e707d25ec953b116922dd2a1e2` |
| `router-settlement-receipts.mts` | `87c3a85bf42307f3c538c3f0e7c9c4e800d60458c2292af846e8e4a7b478250a` |
| `OrbitalSwapVMRouter.sol` | `36bbb10a4696b8097f33e61803129830fad2bab7ec312c27c014b6fa500b688d` |
| `OrbitalStorage.sol` | `f1dd8395f9587070e6506ac8410b7bfde5295d4d88c602deff601fc564a48308` |
| `OrbitalSettlement.sol` | `ec74cc5714beb38330f02d61bec16791cb9b9f97853a21cd43d091df0811673a` |
| Receipt JSON | `6d20ab0705b7744f160d18eedc0665b823b0d2536ad79e87a9dcf70b97c3a87f` |

No production source, SDK, frontend or financial API was changed. These deterministic adversarial cases do not close the full fuzz/invariant/mutation campaign, prove safety against dishonest allowed-token getters, implement mixed/equality traversal, qualify Privy, verify Arc or constitute an independent audit. They validate the current real all-interior router/settlement/payment integration and its tested rollback boundaries.
