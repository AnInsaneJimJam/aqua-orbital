# User-signed Arc deployment

The deployment tool prepares exact transactions and verifies transactions submitted by the authorized browser wallet. It holds no private key and has no RPC broadcast method. The initial plan uses an **existing, authenticated Aqua registry** and real Arc system USDC; it does not substitute a local USDC fixture or deploy a registry and label it official.

Current state: public deployer `0x5eBA55e1b43c8714E4432250Dada7A518780C871` has a prepared **blocked** plan at `deployments/5042002/plans/deployment.json`. It contains eleven unsigned steps. The published Aqua address has no code on Arc and official deployment provenance is missing. No transaction has been signed or sent. See [the dated network review](ARC_DEPLOYMENT_STATUS.md).

## Commands

Run from the repository root with installed dependencies and current Foundry artifacts. If artifacts are absent or stale, compile with `forge build --root packages/contracts --skip test --skip script`. This is a build, not a release test campaign.

```powershell
pnpm deploy:arc inspect --deployer 0x5eBA55e1b43c8714E4432250Dada7A518780C871
pnpm deploy:arc prepare --deployer 0x5eBA55e1b43c8714E4432250Dada7A518780C871 --plan deployments/5042002/plans/deployment.json
pnpm deploy:arc status --plan deployments/5042002/plans/deployment.json
pnpm deploy:arc:wallet --plan deployments/5042002/plans/deployment.json
```

The prepared file already exists on this machine, so start with `status` or the wallet utility. Preparation refuses to overwrite any existing plan. Use a new file name when inputs change. Plan/state files contain public deployment data and are ignored by Git; retain them for recovery. Inspection and blocked status use exit code 2; malformed configuration or verification errors use code 1. `pnpm verify:network` is now read-only and cannot erase activation evidence.

Open **http://127.0.0.1:3100** in the browser containing the deployment wallet. This separate operator utility displays the public deployer, blockers, progress, planned addresses, exact calldata, nonce and maximum USDC gas budget. Connect the authorized wallet, select Arc Testnet, then review each transaction and approve it in the wallet. Signing stays disabled while Aqua identity or another prerequisite is missing.

The eleven steps are six linked mathematical libraries, `oUSD6`, `oUSD18`, the custom SwapVM router, the payments adapter, and router ownership renunciation. USDC is the existing six-decimal system ERC-20 at `0x3600000000000000000000000000000000000000`. Gas uses its 18-decimal native representation of the same inventory. Every transaction sends zero native value. Predicted CREATE addresses depend on the deployer's nonce and become deployed addresses only after receipt verification.

## Resolve Aqua identity before signing

The missing input is an official Arc Aqua address with primary-source provenance, or explicit maintainer acceptance of an unmodified deployment for this use. This requirement comes from [MASTER_PROMPT.md §4.2](../MASTER_PROMPT.md) and the event's [1inch criteria](https://ethglobal.com/events/ethonline2026/prizes/1inch). The latter accept local forks; they do not establish an Arc registry at the published address.

Scope correction: the sponsor requires official contracts and expressly permits modified SwapVM deployments and local-fork demos. Requiring an official deployment **on Arc** is the current project's combined-network requirement, not a condition stated by the 1inch track. The blocked Arc plan does not block a 1inch demonstration using official Aqua on a supported-network fork. Keep the fresh Anvil development profile, canonical local-fork evidence and Arc deployment distinct.

The owner's linked [upstream deployment guide](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/DEPLOY.md) uses an ordinary `new AquaRouter(owner)` call. It does not recreate the canonical address from this deployer. The canonical registry used a separate owner-restricted CREATE3 factory, currently absent on Arc; its salt is public, but deployment authority is still needed. [Factory/source/transaction evidence](ARC_DEPLOYMENT_STATUS.md). Do not run the Makefile expecting the configured registry address to appear.

After reviewing actual source evidence, retain a JSON record and pass it with `prepare --aqua-evidence PATH`:

| Field | Meaning |
| --- | --- |
| `chainId` | `5042002` |
| `address` | Authenticated, already deployed Aqua registry |
| `runtimeKeccak256` | Expected deployed code hash from the reviewed identity evidence |
| `aquaRevision` | Compatible pinned source `81c26e4619ce21556ab02b3284ee2685de21fb18` |
| `kind` | `official-deployment` or `maintainer-accepted-deployment` |
| `sources` | Primary-source records with HTTPS `url`, retained source `contentSha256`, and relevant `excerpt` |
| `reviewedBy`, `reviewedAt`, `reviewNotes` | Who reviewed the source, when, and how it establishes the address/source/network relationship |

This is a **human-reviewed trust input**, not automated proof of sponsor endorsement. Filling fields or observing nonempty code does not establish provenance. The runtime hash and ABI observation are checked against the chain; URLs, excerpts and their interpretation require source review. Keep the matching source snapshots with judging evidence. No accepted record has been fabricated for the absent registry. If a maintainer instead authorizes a new registry deployment, implement and review that precise step after the accepted source/address requirements are known; the current eleven-step path consumes an existing registry.

## Verification

Preparation authenticates compiler metadata, source closures, upstream pins, method identifiers, library links and bytecode size. Later operations recheck source/artifact bytes. Calldata and nonce-derived addresses are reconstructed from authenticated artifacts, rather than trusting edited plan fields.

Before offering a step, the tool checks Arc identity, system USDC, the reviewed Aqua runtime and an empty-maker `rawBalances` ABI probe, account nonce, gas balance, gas estimate, and constructor/call simulation. The deployment-only ceiling is 8,000,000 gas per step, with an estimate margin of 20% plus 10,000 gas. It is not a supported swap-gas claim. Once shown, a step's review is retained so another tab's polling cannot replace its fee limits while a wallet is signing.

Confirmation requires the authorized sender, chain, nonce, calldata, recipient, zero value and bounded gas/fees to match. Successful receipts must belong to their canonical block. Creation addresses must match the planned nonce; deployed code must exactly match the constructor simulation and compiler runtime outside declared immutable slots. Library self-addresses, previous receipts and current runtimes are rechecked. USDC runtime changes invalidate retained identity observations.

Activation checks the router's Aqua/WETH/chain/owner bindings, EIP-712 domain and order hash, token allowlists/decimals, demo faucet constants, and payment adapter bindings. Only then does it write `deployments/5042002/verification.json`, followed by the enabling `manifest.json`. `pnpm deploy:arc verify-active` repeats identity verification without advancing pending state or writing files. `pnpm dev:arc` requires this check whenever an active manifest exists.

The active `verified` flag establishes checked testnet runtime identity. Release acceptance, sponsor qualification and real Privy financial-flow evidence remain separate and false until demonstrated.

## Recovery and current limits

The browser saves an unfinished request before asking for a signature and its public hash before posting it to the utility. Reloading resumes receipt tracking; concurrent tabs use a browser lock and shared request journal. If submission occurred while its response was interrupted, copy the public hash from wallet activity into the recovery form. A standard rejected signature clears the unsubmitted request.

CLI recovery uses `pnpm deploy:arc record --plan PATH --hash HASH`; activation also has `pnpm deploy:arc activate --plan PATH`. Only public hashes are accepted. Unknown outcomes stay blocked and must be reconciled before another signing attempt. Do not manually clear a pending hash to request a duplicate transaction.

Fee replacements, mined deployment failures and rebasing a partially executed plan are not automated in this first integration. A changed nonce halts the plan because subsequent addresses would differ. Inspect actual receipts first; if a new deployment is needed, preserve the old plan and prepare a new one at the current nonce. Already deployed contracts remain at their original addresses. A crashed command may leave a `.lock` file; stop all tools using that plan before removing only that exact lock file.

The utility has had syntax, blocked-plan and bounded HTTP checks. Successful live signing/receipt/activation remains unverified because official Arc Aqua identity is unresolved. Broader mathematical, security and release campaigns remain deferred, as requested. After activation, use the [Arc and Privy walkthrough](ARC_DEMO.md) to publish liquidity and obtain real swap/invoice receipts.
