# Arc and Privy demonstration runbook

The Arc Testnet deployment is active on chain **5042002**: all twelve user-signed deployment transactions succeeded and passed receipt/runtime verification. The application runs at **http://127.0.0.1:3002**, with its API at **http://127.0.0.1:3003**. The indexer caught up and live readiness, strategy reads and the empty-route quote response were observed successfully; [current evidence](../test/evidence/arc-integration/live-public-reads.json). Recheck readiness when starting a new session.

The selected registry is **project-deployed upstream AquaRouter**, using unchanged pinned source. [ARC_DEPLOYMENT.md](ARC_DEPLOYMENT.md) lists the verified addresses and retained deployment evidence. No live Orbital strategy, swap or invoice has yet been demonstrated on this deployment, and Privy embedded-wallet creation remains unverified. A login screen or deployment receipt does not establish a completed Privy financial flow.

## Start the profile

From the repository root, with Node 22 and dependencies installed:

```powershell
pnpm dev:arc
```

The underlying command is `node scripts/dev-arc.mjs`. Open **http://127.0.0.1:3002**; the API uses **http://127.0.0.1:3003**. Local development remains on 3000/3001. The runner starts no Docker services, stops no existing server, and never deploys or signs. An occupied 3002 or 3003 produces an actionable error; close the old process yourself rather than expecting automatic replacement. Ctrl+C stops only application processes created by this runner.

The public Privy app ID comes from `NEXT_PUBLIC_PRIVY_APP_ID` in the process environment, falling back to the same variable in ignored `apps/web/.env.local`. No Privy secret is required. Only the public ID is imported from that file. Fixture wallets are forcibly disabled, the wallet chain is Arc, and `ORBITAL_PROFILE=arc` selects a separate `.next-arc` build directory. Do not share keys, recovery phrases or authentication codes in repository files or chat.

The historical deployment manifest records `https://rpc.testnet.arc.io`. That endpoint returned HTTP 429 during log ingestion, so the current application profile uses Blockdaemon's public Arc Testnet endpoint, which is listed in the [official RPC reference](https://docs.arc.io/arc/references/rpc-endpoints). Keep these public settings in ignored repository-root `.env.arc.local`:

```dotenv
ARC_RPC_URL=https://rpc.blockdaemon.testnet.arc.io
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.blockdaemon.testnet.arc.io
# Optional: defaults to ARC_RPC_URL when omitted.
INDEXER_RPC_URL=https://rpc.blockdaemon.testnet.arc.io
```

Process environment values take precedence over this profile file. Set the server and browser RPC together; browser-visible URLs must contain no secrets. The optional indexer endpoint may differ, but must pass chain/system-USDC preflight and agree with the selected application RPC on the deployment start-block hash. Startup checks six-decimal system USDC at `0x3600000000000000000000000000000000000000` using a canonical block hash, then performs the full deployment check described below. A provider change does not require redeployment or editing the historical manifest.

## Privy dashboard setup

In the dashboard for the configured public app ID:

1. Allow `http://127.0.0.1:3002` and `http://localhost:3002` as application origins. Origins include the port and have no path. Add the final HTTPS application origin when it exists.
2. Enable email authentication and embedded Ethereum wallets, and retain existing-wallet connection. Complete any dashboard-required setup for the chosen login methods.
3. Open the profile, select **Connect wallet**, and sign in using an email account you control. Enter any verification code directly in the Privy UI. Confirm the embedded EVM wallet appears in the shared wallet control and that its active address is the intended demonstrator.
4. Reload to check reconnection, then disconnect and reconnect an existing wallet to check the alternative connection path. Keep these observations separate from successful onchain execution.

Provider details and official Privy sources remain in [PRIVY_RESEARCH.md](PRIVY_RESEARCH.md). The public ID being configured does not establish that allowed origins, wallet creation or signing have been verified.

## Deployment-dependent behavior

If `deployments/5042002/manifest.json` is absent, the API runs without a deployment or database connection. `/health` describes the service; `/deployment`, `/ready` and financial endpoints truthfully report unavailable deployment state. The indexer does not start. Browsing and Privy login still work, while Orbital swaps, liquidity publication and invoices require a verified deployment. Restart the profile after the deployment workflow produces its active manifest.

The active `deployments/5042002/manifest.json` identifies chain 5042002 and genuine, allowlisted six-decimal system USDC. Before starting services, the runner calls `node scripts/arc-deployment.mjs verify-active --rpc-url SELECTED_PUBLIC_RPC`. That read-only command revalidates the source/build graph, saved deployment record, **all twelve deployment receipts**, exact live runtimes and immutable bindings through the selected application RPC. It includes the project-deployed unchanged AquaRouter, its retained deployer/rescue owner, and the custom Orbital router's renounced ownership. A manually set `verified` field is insufficient. Invalid, stale or mismatched records stop startup rather than falling back to another deployment.

Only after that check passes does the runner derive ignored `.cache/arc-runtime/manifest.json`, retaining the verified contract/token identities and selecting the application RPC. The API and indexer use this runtime manifest. The original deployment manifest and verification report remain unchanged, preserving their historical provider and evidence. The verifier itself writes no files.

Services use `DATABASE_URL`, defaulting to the existing local PostgreSQL database. Run `pnpm db:migrate` against the selected database before its first use. The schema separates chains and deployments; no database reset is needed to keep Anvil and Arc data. Database/RPC outages or indexer lag remain unavailable financial reads, not fixture data. Wait for the Arc API's `/ready` response before reviewing live transactions.

## Minimal live walkthrough

Use **wallet A**, the external maker/deployer `0x5eBA55e1b43c8714E4432250Dada7A518780C871`, and **wallet B**, any different user-controlled wallet, as trader/payer. Both may be external wallets for ordinary application use. To obtain Privy qualification evidence, use an actual Privy embedded wallet as B and link its identity to the swap/payment receipts. A may also be the merchant, so two signing wallets suffice for this minimal flow.

Use these small initial amounts once the API is ready. They are a practical starting configuration, not a live quote or a guarantee that an earlier wallet balance covers current fees.

| Role / action | Starting amount |
| --- | --- |
| Maker strategy | **10 USDC + 10 oUSD6 + 10 oUSD18**, Balanced profile, 0.05% fee |
| Wallet B swap | **1 USDC → oUSD6**, using the currently quoted minimum output |
| Merchant invoice | **0.5 USDC**, initially one recipient at 100% |
| Wallet B invoice input | **oUSD18**, maximum input **1**; spend only the reviewed amount |

The maker form accepts at least 10 whole units per asset. Its default Balanced profile has three tokens and three ticks; the publication review displays the exact rounded amounts and curve configuration. The **40-unit Aqua approval target per asset is an allowance cap**, not a requirement to own or transfer 40 units. Publication needs the actual displayed initial allocation in the maker wallet. Keep additional USDC for gas because that gas spend reduces the same balance backing the strategy.

1. Open the active Arc profile. The twelve deployment transactions are complete; do not rerun them. If the application is stopped or still using the old login-only process, start/restart `pnpm dev:arc` with PostgreSQL available and migrated. Wait for `http://127.0.0.1:3003/ready` to report `READ_DEPENDENCIES_READY` before financial reviews.
2. Connect wallet **A** as maker. Recheck its current USDC balance after deployment: the earlier 20-USDC observation is not a remaining-balance statement. Keep at least the 10-USDC strategy allocation **plus each reviewed gas budget**. At `/fund`, claim the two demo faucets; each supplies 1,000 units of its token, so one claim covers the proposed 10-unit allocation. Native gas and ERC-20 USDC are views of the same inventory. Demo tokens have no redemption value.
3. Open `/liquidity/new`, keep allocation **10**, select **Balanced** and **0.05%**, and prepare publication. For a fresh wallet, review three bounded approvals, the Aqua publication, then activation: five separate transactions. Existing insufficient allowances may require a separate reset. Record the strategy hash and receipts. Tokens remain in the maker wallet; do not spend down its backing to fund another account. Wait until the strategy appears active and available in indexed reads before requesting its first quote.
4. Connect wallet **B**, whose address must differ from A. It needs its own genuine testnet USDC for the 1-USDC swap and gas, plus `oUSD18` from `/fund` for the invoice. Use the Circle faucet link for this public address; A's funds do not appear in B automatically. A 2-USDC starting balance is convenient for this small flow, but the application's live gas review determines sufficiency. If funding B from A manually, recheck A's remaining allocation and gas afterward. The application rejects maker self-trades. Select a Privy embedded B for the sponsor demonstration, or any different external B to exercise ordinary integration first.
5. In wallet B, review and execute **1 USDC → oUSD6**. An exact router approval is followed by a separate, refreshed swap review. Save the wallet address, wallet kind, transaction hash and resulting balances. Refresh an expired quote or gas review; a displayed output is not a completed transfer.
6. Switch to A as merchant and create a fresh **0.5-USDC** invoice, with its own address as the sole 100% recipient. Open the public invoice link, wait for indexed terms, then select the same wallet B used for the swap. Choose **oUSD18** and enter **1** in **Maximum input**. Review the exact adapter approval, then obtain and sign the refreshed payment review. The default USDC input would produce a direct payment, so select oUSD18 to demonstrate swap-funded settlement.
7. Match the payment receipt to B, genuine USDC recipient transfers, any actual refund, and the paid invoice state. If B is Privy embedded, retain that wallet-to-receipt association as Privy evidence; external-wallet receipts establish the external flow. Reuse neither a paid invoice nor an old quote for a new payment. Recipient splits can be demonstrated later with a second known public address; they are optional for this first integrated flow.
8. If interrupted after submission, resume the saved receipt before another signature. Publication drafts also resume between shipping and activation. Reviews have short freshness windows; prepare them after wallet setup and refresh when prompted. Keep this run to the required financial actions and basic recovery; broader campaigns remain in the release plan.

Indexing waits for two blocks and then must catch up to the current confirmed head. The exact delay depends on RPC and database throughput; a fixed two-second sleep does not establish readiness. A receipt may appear in the wallet before its strategy or invoice is available through the API. If `/ready` continues to report `INDEXER_CATCHING_UP`, inspect indexer progress before retrying quotes; decreasing the polling interval alone cannot accelerate an already-running backlog scan.

No runner creates maker identities, funds accounts or automates user signatures. Wallet owners complete these steps in their wallets. Link the actual receipt evidence and public source repository from the judging walkthrough. Contract interaction on an unconfigured screen, a faucet transfer alone, or Anvil fixture signatures do not demonstrate a Privy-wallet Orbital swap and invoice.

## Current external prerequisites and sponsor scope

The [Arc deployment review](ARC_DEPLOYMENT_STATUS.md) retains the historical finding that the published canonical Aqua/stock-router addresses had no code on Arc. The authorized self-deployment route has now completed: the registry is `0xE60f79571E7EDba477ff98BAdeE618b5605DF7aE`, labeled **project-deployed upstream AquaRouter**. Preserve the old blocked plan and the completed self-deployment plan as separate history. Canonical deployment status remains distinct from this verified project deployment.

The original **20 testnet USDC / nonce 0** [deployer observation](../deployments/5042002/research-2026-09-09.json) predates all twelve deployment transactions. Current balances and nonces come from live wallet/RPC reads. Deployment runtime identity is verified; API/indexer readiness, initial strategy publication, swaps, invoices and actual Privy creation/reconnection/financial receipts are the remaining integration checks. No sponsor approval is implied by successful deployment.

The screenshot's complete sponsor matrix and supplied Privy wording match **ETHOnline 2026**. Keep the three sponsor outcomes separate:

- [1inch Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch): official Aqua/SwapVM contracts, custom SwapVM permitted, demonstrated token transfers, and meaningful Git history. The published criteria accept local forks. Retain unchanged-source provenance and actual receipt evidence for the project Arc deployment, clearly distinguish it from the canonical deployment and fresh Anvil profile, and leave qualification unverified.
- [Arc Best DeFi/Onchain Finance Application](https://ethglobal.com/events/ethonline2026/prizes/arc): meaningful Arc/USDC liquidity and programmable settlement, a functional frontend/backend, architecture diagram, source and demonstration. The separate Launch track adds mainnet deployment/readiness by September 30; it is not implied by this testnet runbook.
- [Privy Best financial flow](https://ethglobal.com/events/ethonline2026/prizes/privy): at least one actual Privy wallet and a working financial flow using a generally available feature. Orbital's swap and swap-funded invoice are the intended evidence; email login is setup.

The documented 30-million Arc block gas limit is not a verified individual transaction cap. Keep the Osaka-derived 16,777,216 transaction limit provisional until target evidence resolves it. This integration walkthrough does not close mathematical proof obligations, gas acceptance, broader security testing or production readiness; see [PROGRESS.md](../PROGRESS.md).
