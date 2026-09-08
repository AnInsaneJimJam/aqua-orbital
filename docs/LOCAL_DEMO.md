# Local Orbital runbook

The local application uses actual contracts, balances, quotes and receipts on chain **31337**. It is a development integration, not Arc deployment, numerical release acceptance or Privy qualification.

The [1inch track](https://ethglobal.com/events/ethonline2026/prizes/1inch) expressly permits custom SwapVM instructions, modified SwapVM deployments and local-fork execution demonstrations. Orbital's architecture fits those provisions. The profile below uses a **fresh Anvil chain with deployed upstream Aqua source**, not a fork of an existing public-network deployment. Its real transfer receipts demonstrate local functionality; do not relabel them as fork evidence. A demonstration against official Aqua on a pinned local fork can be completed independently of canonical Aqua becoming available on Arc. Arc and live Privy receipt requirements remain separate.

## Start

Install Node 22, pnpm 10.34.5, Python 3.12 and Foundry 1.5.1; start Docker Desktop. From the repository root:

```powershell
pnpm install --frozen-lockfile
python -m pip install -r packages/reference/requirements.txt
pnpm local:setup
pnpm dev:local
```

Open **http://127.0.0.1:3000**. The API is at port 3001 and Anvil at port 8545. The runner starts the API, indexer and web process together. Keep that terminal running; stop it with Ctrl+C. PostgreSQL and Anvil use named Docker volumes. `docker compose stop postgres anvil-state anvil` stops those services while retaining their data.

`local:setup` starts infrastructure, compiles the pinned graph, applies additive schema migrations, deploys or verifies the existing graph, then seeds demo accounts. `deploy:local` never silently replaces existing addresses or ignores a changed genesis/runtime. The active `deployments/31337/manifest.json` and `verification.json` are generated and ignored by Git. The recorded deployment report remains in the evidence directory.

The Anvil volume initializer grants the image's `foundry` user write access. A separate `anvil-state` service saves a validated snapshot every thirty seconds using a temporary file, file sync and atomic rename. It briefly pauses local block mining while copying the bounded historical state; submitted user transactions stay queued, and three-second mining resumes in `finally`. It also removes duplicate noncanonical headers from the pinned Anvil serializer, preserving the original genesis via block 1’s parent. Stop it together with Anvil so its final checkpoint runs first. Anvil loads that file on startup. Snapshots retain accounts, blocks, transactions and the bounded cache of 128 recent historical EVM states. Allow two new blocks after restart for fresh confirmed reads. Start `dev:local` promptly after seeding so activation events are indexed within this state window. Financial reads outside that state window can be unavailable; a full archival replay campaign requires an archival node. The first persistence check exposed an interrupted native Anvil dump; it was replaced by this atomic writer. The original complete account/block/transaction fields were recovered and their contract and receipt identities rechecked. Three-second block mining avoids the pinned Anvil version's enlarged state cache at intervals of two seconds or less. Restart both services together with `docker compose stop anvil-state anvil` followed by `docker compose up -d anvil-state --wait`. An abrupt engine crash can lose changes since the last checkpoint; never remove the named volumes as routine recovery.

## Wallets and funding

The local runner explicitly enables an Anvil fixture wallet and disables the Privy client for that process only. It does not change `apps/web/.env.local`. It is restricted to loopback development builds and checks the local chain identity. Every transaction displays a separate confirmation. No private key enters Orbital's API or database.

The wallet control lists the public Anvil accounts. The useful seeded roles are:

| Role | Address |
| --- | --- |
| Maker, Balanced profile | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` |
| Second maker, Wide profile | `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc` |
| Default taker | `0x90f79bf6eb2c4f870365e785982e1f101e93b906` |
| Merchant | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` |
| Second recipient | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` |

The first four roles receive demo assets. All default Anvil accounts have test ETH for gas. `/fund` provides reviewed 1,000-token claims, one per token every 24 hours. USDC on this profile is explicitly a local fixture. On Arc, the funding page instead links to Circle for real testnet USDC and exposes only the deployed Orbital demo-token faucets.

## Walk through the product

1. Connect the default taker. Swap `1 USDC` to `oUSD6`; review exact router approval and then the fresh swap separately.
2. Select the merchant. Create a `5 USDC` invoice, optionally with two recipients at 90/10. Open its public invoice link.
3. Select the taker. Use `oUSD6` as input and a maximum of `10`; review adapter approval and then the refreshed payment. Actual excess USDC is refunded. The indexed invoice updates after confirmation.
4. Open `/liquidity/new`. Choose equal allocations and Wide, Balanced or Focused concentration. Review the actual quantized keys, radii, amounts and approval targets.
5. Approve each asset, publish to Aqua, then reload before activation. The saved unsigned draft resumes; the incomplete allocation is visible in the liquidity screen after indexing. Review activation separately.
6. Manage the active strategy. Retirement is terminal and moves no funds. Review docking separately. A replacement uses a fresh maker nonce and independent configuration.

`pnpm demo:judge` checks the connected API records and writes `.cache/local-demo/judge.json` with current strategy/invoice links. A previously paid seed invoice remains paid; create another invoice in the UI for the next demonstration. `pnpm demo:seed` preserves existing strategy and payment history.

## Recovery and scope

Submitted transaction hashes and unsigned publication drafts are stored per wallet/network in this browser. Resume receipts before another signature. Editing an unshipped draft checks its Aqua entries first. Already shipped allocations must be activated or resolved onchain; a config hash alone cannot recover unknown tick parameters. Incomplete shipment history and registered financial state are separate paginated views over canonical data.

Same-action fee replacements are followed during receipt tracking only after binding the original sender/nonce and exact destination/calldata/value. If the original transaction is unavailable, the app retains the pending record instead of guessing. Broader replacement and cross-tab recovery cases remain deferred testing work.

The usual `pnpm dev` profile uses the supplied public Privy app ID from `apps/web/.env.local`. Privy origins and authentication must be configured in its dashboard. It needs the matching verified deployment, an actual user login and funded wallet for a live financial flow. The Anvil fixture profile cannot establish Privy sponsor eligibility. Arc identity/deployment, target gas limits and the outstanding mathematical/security campaigns remain separate requirements in [PROGRESS](../PROGRESS.md).
