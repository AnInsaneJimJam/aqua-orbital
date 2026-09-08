# Arc deployment status and retained network research

## Current decision: authorized project deployment

**The owner authorizes unchanged upstream AquaRouter self-deployment on Arc Testnet.** Use mode `self-deployed-upstream`, the pinned Aqua revision `81c26e4619ce21556ab02b3284ee2685de21fb18`, and signer `0x5eBA55e1b43c8714E4432250Dada7A518780C871`. The new plan is `deployments/5042002/plans/self-deployment.json`, prepared with `prepare --self-deploy-aqua` and the deployer/path options in [ARC_DEPLOYMENT.md](ARC_DEPLOYMENT.md). Preserve the earlier blocked `plans/deployment.json` and all read-only research as history. No live deployment receipts were present when this decision was recorded.

The twelve-transaction graph adds the unchanged upstream AquaRouter wrapper to the six libraries, two demo tokens, custom Orbital router, payments adapter and custom-router renunciation. AquaRouter retains the authorized deployer as its rescue owner; the custom OrbitalSwapVMRouter must renounce its owner before application activation. Follow the generated dependency/nonce order and verify every creation, runtime, constructor and binding.

The resulting address is **project-deployed upstream AquaRouter**, not the official canonical registry address. Canonical deployment availability and sponsor acceptance are no longer prerequisites for the authorized functional integration. Source/runtime verification remains mandatory; sponsor qualification, live Privy financial flows and release acceptance remain separate and unverified. The historical canonical-address absence and owner-restricted CREATE3 findings below explain why the new plan uses an ordinary project deployment instead.

## Retained read-only research scope

Funding/source review: **2026-09-08, 19:48–20:05 UTC** (**September 9** in the workspace timezone), followed by the canonical CREATE3 investigation below. This update supplements [Arc research](ARC_RESEARCH.md), [Aqua research](AQUA_RESEARCH.md), and the deployment and gas gates in [MASTER_PROMPT.md](../MASTER_PROMPT.md). The compact [research observation](../deployments/5042002/research-2026-09-09.json) is separate from the [verification record](../deployments/5042002/verification.json), which this review did not modify. No transaction was signed, funded, submitted, or deployed. The detailed prerequisite analysis below retains the earlier September 8, 04:58–05:11 UTC review with its original observations.

## Recorded funding observation and requested deployer

**The requested deployer held 20 testnet USDC at the recorded block. Official canonical Aqua identity on Arc remained unresolved in this review.** The inspected [1inch contract matrix](https://business.1inch.com/portal/documentation/aqua/reference/contract-addresses) and [verification notes](https://business.1inch.com/portal/documentation/aqua/reference/verified-contract-addresses) independently omitted Arc, while the published registry and stock router both returned empty code at the canonical Arc block below. Aqua upstream HEAD was `9c5c42e5840e8741fba3597c48456c9510212b66`. A bounded absence finding at two published addresses does not prove that no other deployment exists.

Read-only calls used `https://rpc.testnet.arc.io` during `2026-09-08T20:05:24.922Z`–`2026-09-08T20:05:27.565Z`. Account/code/token reads used `{blockHash, requireCanonical: true}`; a repeat block-number lookup returned the same hash.

| Observation | Result |
| --- | --- |
| Chain ID | `5042002` |
| Block number | `61123941` |
| Block hash | `0xd4b8d5a8ada072b1de758adca803817db4899f057db573204f5239c496099f5a` |
| Block timestamp | `2026-09-08T20:05:23.000Z` |
| Block gas limit / base fee | `30,000,000` / `20,000,000,000` native atomic units per gas |
| Aqua `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | `eth_getCode = 0x` |
| Stock SwapVM `0x111111338c5091e8440b67b168bae16a668ac0de` | `eth_getCode = 0x` |
| System USDC | `0x3600000000000000000000000000000000000000`, 1,798 runtime bytes, 6 ERC-20 decimals |
| Requested public deployer | `0x5eBA55e1b43c8714E4432250Dada7A518780C871` |
| Deployer native balance | `20000000000000000000` raw, **20 USDC** at 18 decimals |
| Deployer ERC-20 USDC balance | `20000000` raw, **20 USDC** at 6 decimals |
| Deployer transaction nonce / runtime code | `0` / empty |

The native and ERC-20 observations describe the same USDC inventory; they must not be added into a 40-USDC total. The observed runtime SHA-256 for system USDC remains `d06405421b354a12b2f03fcc8aac4b324f274aed5b8ecc5fd62d8fa119067154`. Its interpretation remains limited to the returned runtime bytes, not a complete proxy/system implementation attestation.

Funds were present for gas, but this read does not prove control of the requested address or sufficient funding for the final deployment graph and subsequent demo. Those depend on user-controlled signing and the actual reviewed gas estimates. No key, signature, balance mutation or faucet request was used to inspect the public address. The owner has since authorized unchanged upstream self-deployment; fresh nonce/gas/source checks and verified receipts govern the new plan. Funding alone does not activate application writes.

## Matching sponsor requirements

The owner separates the sponsor scopes: modified SwapVM and local-fork execution are explicitly permitted for 1inch, so the missing canonical Arc registry is not a requirement to resolve before demonstrating that track. The canonical Arc investigation below records the earlier route investigated for the combined project. The owner now authorizes the unchanged-source project deployment described above. Existing fresh Anvil receipts remain development-chain evidence and have not been relabeled as a public-network fork.

The user's screenshot and pasted Privy requirements match the complete [ETHOnline 2026 sponsor matrix](https://ethglobal.com/events/ethonline2026/prizes). Source requirements must come from this event rather than another ETHGlobal event with a similarly named track:

- [1inch Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch) requires official Aqua/SwapVM contracts, permits modified SwapVM redeployments, accepts local forks for the transfer demonstration, and requires meaningful Git history. Its wording supplies no explicit Arc-specific Aqua redeployment exception.
- [Arc Best DeFi/Onchain Finance Application](https://ethglobal.com/events/ethonline2026/prizes/arc) fits Orbital's liquidity and programmable USDC settlement. It calls for a working frontend/backend, architecture diagram, source and demonstration. The separate Launch track adds mainnet deployment/readiness by September 30; a testnet walkthrough alone does not establish that extra requirement.
- [Privy Best financial flow](https://ethglobal.com/events/ethonline2026/prizes/privy) requires an actual Privy wallet and a working financial flow using a generally available feature. The intended Orbital evidence remains a Privy-wallet swap and swap-funded USDC invoice. Configured login alone is incomplete.

No explicit sponsor or maintainer acceptance of a project-deployed Aqua registry on Arc was located in the inspected official sources. This limits claims of sponsor approval; it no longer blocks the owner-authorized deployment. The generic upstream guide provides a technical route, while authenticated source/build and live receipt/runtime evidence establish the resulting project contract's identity. The [Arc/Privy runbook](ARC_DEMO.md) separates login-only startup from verified deployment operation and actual Privy financial-flow evidence.

## Can the upstream deployment guide reproduce the canonical address?

**The guide deploys an unchanged AquaRouter, but its normal command does not reproduce the canonical registry address. The canonical deployment uses a separate, owner-controlled CREATE3 factory.** This follow-up inspected the public Ethereum creation transactions and verified source, then checked the exact factory on Arc. The compact [canonical deployment-route record](../deployments/5042002/canonical-aqua-route-2026-09-09.json) retains the public parameters and independent address calculations. No deployment or code override was performed.

### What the guide actually runs

[`DeployAquaRouter.s.sol`](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/script/DeployAquaRouter.s.sol) broadcasts a plain `new AquaRouter(owner)`. It specifies neither a factory nor a salt. The resulting CREATE address depends on the signing account and nonce. For the requested wallet at nonce zero, that address is `0xE60f79571E7EDba477ff98BAdeE618b5605DF7aE`, not the canonical Aqua registry. The historical eleven-step plan reserved that address for its first library. The new self-deployment plan recomputes the complete graph, including AquaRouter; follow that plan's actual ordering rather than assuming the registry uses nonce zero or reusing the old address list.

The [configuration reader](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/script/utils/Config.sol) requires a nonzero owner at `.owner.5042002`, which the [published configuration](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/config/constants.json) does not supply. AquaRouter's owner controls rescue functionality; the [constructor](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/src/AquaRouter.sol) accepts an explicit owner rather than requiring that owner to equal `msg.sender`. The [upstream build settings](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/foundry.toml) use Solidity 0.8.30, via-IR and 10,000,000 optimizer runs, and do not explicitly pin the EVM target. Orbital's 700-run Cancun build settings cannot be treated as the canonical wrapper's build.

### How the canonical address was produced

The [Ethereum registry creation transaction](https://eth.blockscout.com/tx/0xe37e4dd7e73302a57cbf8ef6cff2424a787df9bf462d69f2de6d149dca43fb1a) calls the factory identified in [1inch's deployment reference](https://business.1inch.com/portal/documentation/aqua/reference/contract-addresses). The explorer's [verified factory source](https://eth.blockscout.com/api/v2/smart-contracts/0x71481C3B9C6FBa3066AE84961EA22378A80cabe7) exposes `deploy(bytes32 salt, bytes code)` under an `onlyOwner` check.

| Parameter | Public value |
| --- | --- |
| CREATE3 factory | `0x71481C3B9C6FBa3066AE84961EA22378A80cabe7` |
| Registry deployment caller | `0x0BD61d605C64A857C3D94779aEf7cA295702b3A2` |
| Salt | `0x1aaabc7bf2f7000329f7f5000000000000000000000000000000000000000000` |
| Intermediate CREATE2 proxy | `0x6C51dEc3597cf764906306686b8aebbCc83a188B` |
| Proxy initcode | `0x67363d3d37363d34f03d5260086018f3` |
| Proxy's first CREATE result | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` |
| AquaRouter constructor owner | `0x4134e66d52efc4c77dd8ccc952d87b9e92e0c352` |
| Registry initcode | 5,859 bytes; keccak256 `0xd3488f3a8e4211b34cf9f85777bc239da5f2dc21168b71b6e0c4b34747a827e6` |
| Verified registry compiler/build | Solidity `0.8.30+commit.73712a01`, 10,000,000 optimizer runs, Prague EVM |

The salt and complete registry initcode are public in the [transaction data](https://eth.blockscout.com/api/v2/transactions/0xe37e4dd7e73302a57cbf8ef6cff2424a787df9bf462d69f2de6d149dca43fb1a). Independent CREATE2-then-CREATE calculations reproduced both the intermediate proxy and canonical registry addresses exactly. CREATE3 decouples the final address from the registry initcode, so recovering this address formula alone does not authenticate the contract deployed there; the exact source, runtime and owner still matter. The [verified AquaRouter record](https://eth.blockscout.com/api/v2/smart-contracts/0x1111113ccf1426a8e30e2bff5e005d929bf6a90a) supplies the build identity above.

The [factory creation transaction](https://eth.blockscout.com/api/v2/transactions/0xb6d1baae2042327077defddd67949a55fa0cb91d8ae5f2ce04ce8ff80583e9c5) was an ordinary CREATE from `0xef3c29bc05a77B266A76f2cEa11d8b8886342e8a` at nonce 0. Its factory constructor initially assigns ownership to `msg.sender`; deployment calls subsequently require the factory owner. The original factory address was independently reproduced from that creator/nonce. Our requested deployment wallet is a different address.

### Concrete Arc route and remaining authority

At Arc block `61126613` (`0x3a4b7d5`), hash `0xc6339c74cd3790567f24980159c1bf3bbd7106c8d35ea393b2e18245338b80e5`, the canonical factory returned **empty code**. The original factory deployer and deployment-hub account each returned nonce 0 using the same canonical block-hash selector. The inspected source does not expose a permissionless route for our wallet to recreate that factory at its required address or bypass `onlyOwner`.

The technically reproducible canonical route is for the original factory deployment account to create the same factory on Arc at nonce 0, then for its owner to call the public salt/initcode deployment, followed by independent registry source/runtime/owner verification. The upstream team may have another authorized bootstrap mechanism, but none was established by this review. The available salt and bytecode solve the address-reproduction question; authority over the required factory deployment account and owner remains the practical missing part.

An ordinary unchanged AquaRouter self-deployment is a different technical route at a new address. It is now authorized by the owner and uses the authenticated pinned source/build in a new twelve-step plan. It needs no additional sponsor permission to proceed, and must be labeled project-deployed upstream AquaRouter. Its receipt/runtime/owner evidence cannot be replaced by the canonical address calculations above.

Historical suggested maintainer request, **not sent and not a deployment prerequisite**. A future answer could inform judging evidence or a canonical deployment, but the functional self-deployment does not wait for it:

> We are building Orbital with custom SwapVM instructions and USDC settlement on Arc Testnet (chain 5042002). The canonical Aqua registry and CREATE3 factory currently return no code there. Could 1inch deploy the canonical factory/registry on Arc, or provide its authorized bootstrap instructions? If that is unavailable, can you explicitly confirm whether an unchanged Aqua/AquaRouter project deployment on Arc is accepted for the ETHOnline 2026 Aqua track, and specify the expected source revision and ownership configuration?

## Historical canonical-route result

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

The Aqua README identifies registry `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and stock SwapVM router `0x111111338c5091e8440b67b168bae16a668ac0de` across its supported networks. Arc is absent from that list. An address's deterministic construction does not establish deployment on an omitted network. The stock router would not supply Orbital's custom instructions even if present. [Deployment table](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/README.md#deployments)

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

## Current execution and remaining evidence

1. Prepare the new `self-deployed-upstream` plan with the authorized deployer, unchanged pinned AquaRouter and authenticated artifacts. Preserve the historical canonical-only plan. Check current chain, nonce, USDC inventory and per-step gas estimates; do not treat the dated balance as a current budget guarantee.
2. Use the browser wallet to sign the twelve planned transactions, verifying canonical receipts, exact runtimes, constructor ownership and ABI. The custom Orbital router's immutable `AQUA()` must point to the new verified registry; AquaRouter retains the deployer/rescue owner and the custom router's owner is renounced. Activate the manifest only after all identity and binding checks succeed.
3. Start the Arc API/indexer/frontend against that verified manifest. Publish maker liquidity and obtain actual Privy-wallet swap and swap-funded USDC invoice receipts, including recipient splits, refund and gas reducing the same USDC inventory. The earlier decimals and transient-storage probes are observations, not this financial-flow evidence.
4. Retain the independent remaining release obligations: authoritative transaction-cap evidence, measured gas headroom, mathematical/security campaigns and sponsor qualification assessment. These must not be marked passed because functional deployment succeeds; missing canonical status or sponsor acceptance must not reintroduce a deployment block.

The original search scope was official Aqua/SwapVM/template source, Arc's official reference pages, relevant EIP specifications, and read-only calls to the official Arc endpoint. Search snippets and third-party deployment examples were not accepted as deployment identity. No transaction was sent by that research. The current owner-authorized route proceeds using project deployment provenance, with live receipts and financial-flow verification still pending.
