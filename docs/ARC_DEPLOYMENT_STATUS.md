# Arc deployment prerequisites: fresh read-only review

Reviewed **2026-09-08, 04:58–05:11 UTC**. This focused update supplements [Arc research](ARC_RESEARCH.md), [Aqua research](AQUA_RESEARCH.md), and the deployment and gas gates in [MASTER_PROMPT.md](../MASTER_PROMPT.md). It is research evidence, not a verified deployment manifest. The existing [verification record](../deployments/5042002/verification.json) was left unchanged. No transaction was signed, funded, submitted, or deployed.

## Result

**An official Aqua deployment on Arc Testnet is still unresolved.** The current upstream deployment table omits Arc; both published deterministic addresses returned empty code at the newly observed Arc block below. Upstream does provide generic self-deployment instructions. Those instructions establish a technical deployment route, not that a new address is an official or sponsor-approved Arc registry. This is a bounded finding about the inspected sources and addresses, not proof that no deployment exists elsewhere. [Current pinned README](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/README.md)

The observed block budget is **30,000,000 gas**. A separate **16,777,216 transaction cap is a provisional inference** from Arc's documented Osaka baseline and EIP-7825; an Arc-specific authoritative cap has not been established by this review. Consequently, `24,000,000 = 80% × block gas limit` must not be used as a verified transaction benchmark ceiling.

## Upstream identity and deployment routes

GitHub's current-main commit endpoints were read at `2026-09-08T05:00:00.292Z`. They reported:

| Repository | Repository pin or inspected release | Current upstream HEAD |
| --- | --- | --- |
| Aqua | `81c26e4619ce21556ab02b3284ee2685de21fb18` (`v1.0.0`, vendored) | `9c5c42e5840e8741fba3597c48456c9510212b66` |
| SwapVM | `f09a41e689240adc645934f965c8061749397cd2` (vendored) | Same as the repository pin |
| SwapVM template | Inspected for deployment guidance; not Orbital's dependency | `e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b` |

Sources: [Aqua HEAD](https://api.github.com/repos/1inch/aqua/commits/main), [SwapVM HEAD](https://api.github.com/repos/1inch/swap-vm/commits/main), [template HEAD](https://api.github.com/repos/1inch/swap-vm-template/commits/main). HEAD endpoints are mutable; the hashes above identify this review.

The Aqua README identifies registry `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and stock SwapVM router `0x111111338c5091e8440b67b168bae16a668ac0de` across its supported networks. Arc is absent from that list. An address's deterministic construction does not establish deployment on an omitted network. The stock router would not supply Orbital's custom instructions even if present. [Deployment table](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/README.md#deployment-addresses)

Two official source examples exist:

- Aqua's [deployment guide](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/DEPLOY.md) exposes generic network configuration and `make deploy-aqua-router`. Its [script](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/script/DeployAquaRouter.s.sol) constructs **AquaRouter**, which inherits Aqua plus simulator, multicall and owner-controlled rescue functionality. This is a registry wrapper, not the SwapVM instruction router. [Wrapper source](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/src/AquaRouter.sol)
- The [SwapVM template script](https://github.com/1inch/swap-vm-template/blob/e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b/deploy/deploy-aqua.ts) constructs bare Aqua and then a stock AquaSwapVMRouter, along with example infrastructure. It requires chain-appropriate WETH configuration outside its recognized networks. Arc's native USDC model makes blindly copying that WETH-oriented workflow inappropriate.

Neither example is an Arc-specific ready configuration. Aqua's [configuration file](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/config/constants.json) has no `5042002` owner; its only owner entry is a zero placeholder. The template's [network/build configuration](https://github.com/1inch/swap-vm-template/blob/e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b/hardhat.config.ts) and [dependencies](https://github.com/1inch/swap-vm-template/blob/e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b/package.json) differ from Orbital: it uses older Aqua/SwapVM commits and different optimizer/dependency settings. These examples were inspected only, never executed.

### Source and ABI compatibility observation

Fresh exact-byte comparisons of local vendored files with raw GitHub source found the following files identical across Aqua's vendored release, current HEAD, and the template's Aqua commit `6f05aa1ac2dcf701b0e086ad5e7606515f1fa454`:

| File | SHA-256 of exact source bytes |
| --- | --- |
| `src/Aqua.sol` | `de94a67c58f7b8b9e95c03f6a9c2acbacf525b5f43f8255111a83a0f5156b68c` |
| `src/interfaces/IAqua.sol` | `915cbe38c77b46c3927143693a1a1b8ca0f32f75dc34cd5c18526a8103e94fd9` |
| `src/libs/Balance.sol` | `b0a33ae9b8864f874b2fac31d8197c2edd5fbb8022b77491c3243fc7949225ce` |

This establishes no change to the inspected core registry implementation/interface, including the existing ship/dock/pull/push/balance boundary. It does **not** establish deployed bytecode identity, identical wrapper bytecode, or compatibility of every template dependency. Compile/source metadata and dependency pins still need to match the actual selected deployment. [Pinned IAqua](https://github.com/1inch/aqua/blob/81c26e4619ce21556ab02b3284ee2685de21fb18/src/interfaces/IAqua.sol), [pinned Aqua](https://github.com/1inch/aqua/blob/81c26e4619ce21556ab02b3284ee2685de21fb18/src/Aqua.sol)

## Fresh Arc RPC observations

RPC: `https://rpc.testnet.arc.io`, as listed in the [official RPC reference](https://docs.arc.io/arc/references/rpc-endpoints). Observation window: **`2026-09-08T05:08:29.748Z`–`2026-09-08T05:08:32.808Z`**. Requests had 15-second timeouts and at most four concurrent reads.

| Observation | Result |
| --- | --- |
| `eth_chainId` | `0x4cef52` = `5042002` |
| Block | `0x3a32806` = `61024262` |
| Block hash | `0x385b3207c3000a7245e88014101c4666aa0c47993751eea07de1b48196b486a7` |
| Block timestamp | `0x6a9f984b` = `2026-09-08T05:08:27.000Z` |
| Block `gasLimit` | `30,000,000` |
| Block `baseFeePerGas` | `20,000,000,000` native atomic units = 20 Gwei |
| Published Aqua registry `eth_getCode` | `0x` |
| Published stock SwapVM router `eth_getCode` | `0x` |
| USDC `eth_getCode` | Nonempty, 1,798 bytes |
| USDC runtime bytes SHA-256 | `d06405421b354a12b2f03fcc8aac4b324f274aed5b8ecc5fd62d8fa119067154` |
| USDC `decimals()` (`0x313ce567`) | ABI-encoded `6` |
| Repeat block read | Same hash |

Code and decimals calls used the EIP-1898 block selector `{blockHash, requireCanonical: true}`. Its acceptance is useful for the indexer's block-pinned hydration; it is not a proof of the provider's behavior under a future reorg. The USDC hash above is **SHA-256 of returned bytecode**, not an EVM `EXTCODEHASH` or a verified proxy implementation/source identity.

A read-only state override placed `0x604260005d60005c60005260206000f3` at unused simulation address `0x000000000000000000000000000000000000abcd` and called it at the same canonical block hash with 100,000 gas. This stores and loads `0x42` through `TSTORE`/`TLOAD`; the returned word was `0x42`. Thus the target RPC executed transient storage in this simulation. The override was ephemeral and did not deploy code. It does not verify the entire custom router, Aqua callback lifecycle, or native-USDC settlement behavior.

Arc documents an Osaka EVM baseline, with Arc-specific exceptions. Its warning that ordinary Anvil EVM simulation cannot reproduce every native-USDC/system-contract behavior remains relevant to final target validation. [EVM differences](https://docs.arc.io/arc/references/evm-differences), [machine-readable source](https://docs.arc.io/arc/references/evm-differences.md)

## Amount units and benchmark budget

Arc's documented USDC ERC-20 address is `0x3600000000000000000000000000000000000000`, with **6 decimals**; native gas accounting uses **18 decimals**, backed by the same balance. ERC-20 settlement/approvals use six-decimal raw units, while gas cost uses native 18-decimal units. Do not add both balances or create an assumed WUSDC wrapper. [Contract reference](https://docs.arc.io/arc/references/contract-addresses), [stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)

The current [gas reference](https://docs.arc.io/arc/references/gas-and-fees) states 30 million gas per block, corroborated above. Its native-send example currently uses `parseUnits("1", 6)` despite the page's stated 18-decimal native accounting; do not copy that example as a one-USDC native transfer. The implementation must follow the interface's correct unit.

[EIP-7825](https://eips.ethereum.org/EIPS/eip-7825), included in the [Fusaka/Osaka specification](https://eips.ethereum.org/EIPS/eip-7607), caps an individual transaction's declared gas limit at `2^24 = 16,777,216`, separately from block capacity. Arc's Osaka description makes this a reasonable **provisional planning constraint**, but this review did not find an Arc-specific published transaction-cap setting or confirmation of this particular rule.

Read-only attempts did not resolve that last point: `eth_config` returned `-32601`, `method not supported`. `eth_estimateGas` for cheap USDC `decimals()` returned `0x791c` (31,004 gas) with each supplied gas limit `0xffffff`, `0x1000000`, `0x1000001`, and `0x1c9c380`. These requests used the recorded block number, whose hash was rechecked. Successful cheap estimation with an excessive gas field does not demonstrate transaction-pool acceptance or that a transaction may consume that budget.

For local optimization, provisionally target worst-case gas at or below **13,421,772** (`floor(0.8 × 16,777,216)`). This preserves the master prompt's 20% headroom **if** that cap is confirmed; it does not close the verified target-budget gate. Retain the separate default no-crossing target of **2,000,000 gas** and all required maximum-config, double-crossing and invoice benchmarks. Obtain authoritative Arc transaction-cap evidence and measure the final build's accepted paths before claiming G8 gas compliance.

## Exact remaining prerequisites

1. Obtain chain-specific official Aqua identity: either an authenticated official Arc deployment with address and source/build provenance, or explicit sponsor/maintainer evidence accepting an unmodified project deployment for this network. Generic deployment instructions alone do not satisfy the current master specification's official-registry requirement.
2. Recheck code, source/build identity and registry ABI at the selected canonical target block. Complete a reviewed custom Orbital router deployment plan that binds its immutable `AQUA()` to that verified registry; retain the custom fork and linked-library identities separately from upstream stock SwapVM.
3. Verify actual Arc USDC behavior and router/payment settlement on the target runtime, including native gas reducing the same asset balance. The decimals and transient-storage probes above are necessary observations, not a completed integration demonstration.
4. Establish the actual transaction cap independently of the observed block limit, then capture gas measurements with the required headroom. A funded, explicitly authorized signer remains necessary for later target deployment and live receipt evidence; none was requested or used in this review.

Search scope was current official Aqua/SwapVM/template source, Arc's official reference pages, the relevant EIP specifications, and read-only calls to the official Arc endpoint. Search snippets and third-party deployment examples were not accepted as deployment identity. These findings leave Arc writes and live qualification unverified while local implementation can continue.
