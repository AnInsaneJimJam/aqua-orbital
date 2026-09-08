# User-signed Arc deployment

The owner authorizes deploying **unchanged upstream AquaRouter** and Orbital on Arc Testnet, chain **5042002**, with wallet `0x5eBA55e1b43c8714E4432250Dada7A518780C871`. The selected mode is `self-deployed-upstream`. Its registry must be labeled **project-deployed upstream AquaRouter**, with its actual address, source pin and receipt evidence. Sponsor acceptance and official canonical deployment status are separate from the ability to deploy and run this application.

The deployment tool prepares exact transactions and verifies transactions submitted by the authorized browser wallet. It holds no private key and has no RPC broadcast method. It uses real Arc system USDC and authenticates the unchanged pinned Aqua source; no local USDC fixture or substitute Aqua implementation is used.

No live deployment receipts were present when this update was written. The old eleven-step plan at `deployments/5042002/plans/deployment.json` remains a historical blocked attempt to use an existing canonical registry. The new twelve-step graph uses `deployments/5042002/plans/self-deployment.json`; do not overwrite or continue the old plan. Retain the [dated canonical-address research](ARC_DEPLOYMENT_STATUS.md) as provenance, not a prerequisite for the authorized self-deployment.

## Prepare and sign the new plan

Run from the repository root with installed dependencies and current Foundry artifacts. If artifacts are absent or stale, compile the application with `forge build --root packages/contracts --skip test --skip script`, then explicitly compile the upstream wrapper with `forge build --root packages/contracts vendor/aqua/src/AquaRouter.sol`. The wrapper is a separate deployment root and is not imported by the custom router. These are builds, not a release test campaign.

```powershell
pnpm deploy:arc prepare --self-deploy-aqua --deployer 0x5eBA55e1b43c8714E4432250Dada7A518780C871 --plan deployments/5042002/plans/self-deployment.json
pnpm deploy:arc status --plan deployments/5042002/plans/self-deployment.json
pnpm deploy:arc:wallet --plan deployments/5042002/plans/self-deployment.json
```

Preparation refuses to overwrite an existing plan. If this new plan already exists, begin with `status` and the wallet utility. Use a new file name if verified inputs or the starting nonce change. Plan/state files contain public deployment data and are ignored by Git; retain them for recovery. Blocked status uses exit code 2; malformed configuration or verification errors use code 1. `pnpm verify:network` is read-only and cannot erase activation evidence.

Open **http://127.0.0.1:3100** in the browser containing the authorized deployment wallet. The operator utility displays the deployment mode, deployer, any technical blockers, progress, planned addresses, exact calldata, nonce and maximum USDC gas budget. Connect that wallet, select Arc Testnet, then review each transaction and approve it in the wallet. The owner has already authorized this deployment route; no sponsor confirmation is required to proceed. Source, chain, nonce, simulation and funding checks still apply to each transaction.

The generated plan contains **twelve transactions**:

| Transactions | Purpose |
| --- | --- |
| 1 AquaRouter creation | Unchanged `vendor/aqua/src/AquaRouter.sol:AquaRouter`, pinned Aqua revision `81c26e4619ce21556ab02b3284ee2685de21fb18`, constructor owner equal to the authorized deployer |
| 6 library creations | Immutable mathematical/lifecycle/settlement dependencies for the custom Orbital router |
| 2 demo-token creations | `oUSD6` and `oUSD18`, labeled test-only tokens with no redemption value |
| 1 Orbital router creation | Custom SwapVM instructions, bound to the new AquaRouter and authenticated libraries |
| 1 payments adapter creation | Bound to the custom router, real Arc USDC and the deployment token allowlist |
| 1 custom-router ownership renunciation | Removes OrbitalSwapVMRouter's upstream rescue owner before activation |

Follow the exact dependency and nonce order in the generated plan: AquaRouter first, then the linked application graph. The **AquaRouter wrapper retains the authorized deployer as its rescue owner** for accidentally sent funds. This existing upstream helper is unchanged. The **custom OrbitalSwapVMRouter must have `owner()==0`** before application activation. These are different contracts and different ownership requirements. Aqua maker assets remain in maker wallets.

USDC is the existing six-decimal system ERC-20 at `0x3600000000000000000000000000000000000000`. Gas uses its 18-decimal native representation of the same inventory. Every deployment transaction sends zero native value. Predicted CREATE addresses depend on the deployer's nonce and become verified deployed addresses only after successful receipt checks. Do not independently run an upstream deployment command from this wallet between planned steps, because it would consume a nonce reserved by this graph.

## Source identity and canonical-address distinction

The selected source is the repository's pinned Aqua v1.0.0 dependency, compiled with the project's authenticated Solidity 0.8.30, via-IR, 700-run, Cancun build. It is unchanged upstream source, but its project build and address must not be described as the canonical published deployment's bytecode or address. The wrapper includes upstream Aqua, simulation, multicall and rescue functionality; it is distinct from the SwapVM instruction router.

The linked [upstream deployment guide](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/DEPLOY.md) uses an ordinary `new AquaRouter(owner)` call. It does not recreate `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` from this deployer. The canonical deployment used a separate owner-restricted CREATE3 factory that was absent in the recorded Arc probe. [Factory/source/transaction evidence](ARC_DEPLOYMENT_STATUS.md). The self-deployment plan computes and verifies a new address instead.

An alternative existing-registry mode may consume an authenticated registry using `prepare --aqua-evidence PATH`. Its record contains chain/address/runtime hash, compatible source revision, official-deployment or maintainer-accepted-deployment provenance, primary-source snapshots, and named review notes. Those human-reviewed inputs support claims about that existing registry; they are **not required for `--self-deploy-aqua`**. No sponsor acceptance record has been invented for the selected project deployment.

## Verification and application activation

Preparation authenticates compiler metadata, source closures, upstream pins, method identifiers, library links and bytecode size. Later operations recheck source/artifact bytes. Calldata and nonce-derived addresses are reconstructed from authenticated artifacts rather than trusting edited plan fields.

Before offering each step, the tool checks Arc identity, system USDC, account nonce, gas balance, gas estimate and constructor/call simulation. Once the project AquaRouter has been created, its receipt, exact constructor/runtime and registry ABI must verify before dependent contracts rely on it; activation additionally reads its current owner. The deployment-only ceiling is 8,000,000 gas per step, with an estimate margin of 20% plus 10,000 gas. This is not a supported swap-gas claim. Once shown, a step's review is retained so another tab's polling cannot replace its fee limits while a wallet is signing.

Confirmation requires the authorized sender, chain, nonce, calldata, recipient, zero value and bounded gas/fees to match. Successful receipts must belong to their canonical block. Creation addresses must match the planned nonce; deployed code must exactly match the constructor simulation and compiler runtime outside declared immutable slots. Library self-addresses, previous receipts and current runtimes are rechecked. USDC runtime changes invalidate retained identity observations.

Activation checks the AquaRouter's unchanged-source identity and retained deployer ownership; the custom router's Aqua/WETH/chain/renounced-owner bindings, EIP-712 domain and order hash; token allowlists/decimals; demo faucet constants; and payment adapter bindings. Only then does it write `deployments/5042002/verification.json`, followed by the enabling `manifest.json`. `pnpm deploy:arc verify-active` repeats identity verification without advancing pending state or writing files. `pnpm dev:arc` requires this check whenever an active manifest exists.

After activation, start or restart `pnpm dev:arc` and follow [ARC_DEMO.md](ARC_DEMO.md): fund maker/taker wallets, publish real liquidity, execute the Privy-wallet swap, and settle a swap-funded USDC invoice. Deployment receipts alone do not demonstrate those financial flows. The active `verified` flag establishes checked testnet runtime identity; release acceptance, sponsor qualification and Privy financial-flow evidence remain separate.

## Recovery and current limits

The browser saves an unfinished request before asking for a signature and its public hash before posting it to the utility. Reloading resumes receipt tracking; concurrent tabs use a browser lock and shared request journal. If submission occurred while its response was interrupted, copy the public hash from wallet activity into the recovery form. A standard rejected signature clears the unsubmitted request.

CLI recovery uses `pnpm deploy:arc record --plan PATH --hash HASH`; activation also has `pnpm deploy:arc activate --plan PATH`. Only public hashes are accepted. Unknown outcomes stay blocked and must be reconciled before another signing attempt. Do not manually clear a pending hash to request a duplicate transaction.

Fee replacements, mined deployment failures and rebasing a partially executed plan are not automated in this first integration. A changed nonce halts the plan because subsequent addresses would differ. Inspect actual receipts first; if a new deployment is needed, preserve the old plan and prepare a new one at the current nonce. Already deployed contracts remain at their original addresses. A crashed command may leave a `.lock` file; stop all tools using that plan before removing only that exact lock file.

Earlier syntax, blocked-plan and bounded HTTP checks concern the original existing-registry workflow. The retained first-library Arc simulation is read-only historical evidence, not a receipt or verification of the new complete graph. Current self-deployment checks and any later live receipts must be recorded separately. Broader mathematical, security and release campaigns remain deferred in the owner's integration-first order.
