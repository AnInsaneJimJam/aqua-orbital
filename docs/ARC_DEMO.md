# Arc and Privy demonstration runbook

This profile connects the actual Privy client to Arc Testnet, chain **5042002**, on separate application ports. Wallet login can be exercised before an Orbital deployment exists. A login screen is not evidence of a completed Privy financial flow, and the Anvil demo is not Arc settlement.

The owner has authorized **project-deployed upstream AquaRouter**, using unchanged pinned source and the user-controlled deployment wallet. Complete the twelve-transaction `self-deployed-upstream` plan in [ARC_DEPLOYMENT.md](ARC_DEPLOYMENT.md), then restart this profile after receipt/runtime verification creates the active manifest. Canonical Aqua availability and sponsor acceptance do not block this functional route. No live deployment or Privy financial-flow receipts were present when this update was written.

## Start the profile

From the repository root, with Node 22 and dependencies installed:

```powershell
pnpm dev:arc
```

The underlying command is `node scripts/dev-arc.mjs`. Open **http://127.0.0.1:3002**; the API uses **http://127.0.0.1:3003**. Local development remains on 3000/3001. The runner starts no Docker services, stops no existing server, and never deploys or signs. An occupied 3002 or 3003 produces an actionable error; close the old process yourself rather than expecting automatic replacement. Ctrl+C stops only application processes created by this runner.

The public Privy app ID comes from `NEXT_PUBLIC_PRIVY_APP_ID` in the process environment, falling back to the same variable in ignored `apps/web/.env.local`. No Privy secret is required. Only the public ID is imported from that file. Fixture wallets are forcibly disabled, the wallet chain is Arc, and `ORBITAL_PROFILE=arc` selects a separate `.next-arc` build directory. Do not share keys, recovery phrases or authentication codes in repository files or chat.

The default RPC is `https://rpc.testnet.arc.io`. For a different public endpoint, explicitly set both `ARC_RPC_URL` and `NEXT_PUBLIC_ARC_RPC_URL` to that endpoint; it must agree with the active manifest. RPC URLs are browser-visible in this architecture, so use no private credential. Startup checks the chain and reads code and six-decimal `decimals()` at the system USDC address, `0x3600000000000000000000000000000000000000`, using a canonical block hash. This observation alone does not authenticate Orbital contracts.

## Privy dashboard setup

In the dashboard for the configured public app ID:

1. Allow `http://127.0.0.1:3002` and `http://localhost:3002` as application origins. Origins include the port and have no path. Add the final HTTPS application origin when it exists.
2. Enable email authentication and embedded Ethereum wallets, and retain existing-wallet connection. Complete any dashboard-required setup for the chosen login methods.
3. Open the profile, select **Connect wallet**, and sign in using an email account you control. Enter any verification code directly in the Privy UI. Confirm the embedded EVM wallet appears in the shared wallet control and that its active address is the intended demonstrator.
4. Reload to check reconnection, then disconnect and reconnect an existing wallet to check the alternative connection path. Keep these observations separate from successful onchain execution.

Provider details and official Privy sources remain in [PRIVY_RESEARCH.md](PRIVY_RESEARCH.md). The public ID being configured does not establish that allowed origins, wallet creation or signing have been verified.

## Deployment-dependent behavior

If `deployments/5042002/manifest.json` is absent, the API runs without a deployment or database connection. `/health` describes the service; `/manifest`, `/ready` and financial endpoints truthfully report unavailable deployment state. The indexer does not start. Browsing and Privy login still work, while Orbital swaps, liquidity publication and invoices require a verified deployment. Restart the profile after the deployment workflow produces its active manifest.

If a manifest is present, it must identify chain 5042002 and genuine, allowlisted six-decimal system USDC. The runner calls `node scripts/arc-deployment.mjs verify-active` before starting services. That read-only gate must authenticate the source/build graph, saved deployment record, exact live runtimes, creation receipts and immutable bindings. For the selected mode, this includes the project-deployed unchanged AquaRouter, its retained deployer/rescue owner, and the custom Orbital router's renounced ownership. A manually set `verified` field is insufficient. Invalid, stale or mismatched records stop startup rather than falling back to another deployment.

After verification, the API and indexer use that unchanged manifest and `DATABASE_URL`, defaulting to the existing local PostgreSQL database. Run `pnpm db:migrate` against the selected database before its first use. The schema separates chains and deployments; no database reset is needed to keep Anvil and Arc data. Database/RPC outages or indexer lag remain unavailable financial reads, not fixture data. Wait for the Arc API's `/ready` response before reviewing live transactions.

## Minimal live walkthrough

Use these small initial amounts once the deployment gate passes. They are a practical starting configuration, not a live quote or a guarantee that the wallet's earlier balance covers current fees.

| Role / action | Starting amount |
| --- | --- |
| Maker strategy | **10 USDC + 10 oUSD6 + 10 oUSD18**, Balanced profile, 0.05% fee |
| Privy-wallet swap | **1 USDC → oUSD6**, using the currently quoted minimum output |
| Merchant invoice | **0.5 USDC**, initially one recipient at 100% |
| Privy-wallet invoice input | **oUSD18**, maximum input **1**; spend only the reviewed amount |

The maker form accepts at least 10 whole units per asset. Its default Balanced profile has three tokens and three ticks; the publication review displays the exact rounded amounts and curve configuration. The **40-unit Aqua approval target per asset is an allowance cap**, not a requirement to own or transfer 40 units. Publication needs the actual displayed initial allocation in the maker wallet. Keep additional USDC for gas because that gas spend reduces the same balance backing the strategy.

1. Finish all twelve deployment transactions and activate the verified manifest. Stop the previous login-only `dev:arc` runner and run `pnpm dev:arc` again. The old process does not acquire an indexer automatically when the manifest appears. With PostgreSQL available and migrated, wait for `http://127.0.0.1:3003/ready` to report `READ_DEPENDENCIES_READY`.
2. Connect the external deployment wallet as **maker**. Recheck its current USDC balance after deployment: the earlier 20-USDC observation is not a remaining-balance statement. Keep at least the 10-USDC strategy allocation **plus each reviewed gas budget**. At `/fund`, claim the two demo faucets; each supplies 1,000 units of its token, so one claim covers the proposed 10-unit allocation. Native gas and ERC-20 USDC are views of the same inventory. Demo tokens have no redemption value.
3. Open `/liquidity/new`, keep allocation **10**, select **Balanced** and **0.05%**, and prepare publication. For a fresh wallet, review three bounded approvals, the Aqua publication, then activation: five separate transactions. Existing insufficient allowances may require a separate reset. Record the strategy hash and receipts. Tokens remain in the maker wallet; do not spend down its backing to fund another account. Wait until the strategy appears active and available in indexed reads before requesting its first quote.
4. Connect a **different Privy embedded wallet** as trader/payer. It needs its own genuine testnet USDC for the 1-USDC swap and gas, plus `oUSD18` from `/fund` for the invoice. Use the Circle faucet link for this public address; the deployer's funds do not appear in the embedded wallet automatically. A 2-USDC starting balance is convenient for this small flow, but the application's live gas review determines sufficiency. If funding it from the maker manually, recheck the maker's remaining allocation and gas afterward. The application rejects maker self-trades.
5. In that Privy wallet, review and execute **1 USDC → oUSD6**. An exact router approval is followed by a separate, refreshed swap review. Save the wallet address, transaction hash and resulting balances. Refresh an expired quote or gas review; a displayed output is not a completed transfer.
6. Switch to the merchant wallet and create a fresh **0.5-USDC** invoice. The maker wallet may also be the merchant, so a third signing wallet is unnecessary for the minimal flow; leave its own address as the sole 100% recipient. Open the public invoice link, wait for indexed terms, then select the same Privy payer used for the swap. Choose **oUSD18** and enter **1** in **Maximum input**. Review the exact adapter approval, then obtain and sign the refreshed payment review. The default USDC input would produce a direct payment, so select oUSD18 to demonstrate swap-funded settlement.
7. Match the payment receipt to that Privy payer, genuine USDC recipient transfers, any actual refund, and the paid invoice state. Reuse neither a paid invoice nor an old quote for a new payment. Recipient splits can be demonstrated later with a second known public address; they are optional for this first integrated flow.
8. If interrupted after submission, resume the saved receipt before another signature. Publication drafts also resume between shipping and activation. Reviews have short freshness windows; prepare them after wallet setup and refresh when prompted. Keep this run to the required financial actions and basic recovery; broader campaigns remain in the release plan.

Indexing waits for two blocks and then must catch up to the current confirmed head. The exact delay depends on RPC and database throughput; a fixed two-second sleep does not establish readiness. A receipt may appear in the wallet before its strategy or invoice is available through the API. If `/ready` continues to report `INDEXER_CATCHING_UP`, inspect indexer progress before retrying quotes; decreasing the polling interval alone cannot accelerate an already-running backlog scan.

No runner creates maker identities, funds accounts or automates user signatures. Wallet owners complete these steps in their wallets. Link the actual receipt evidence and public source repository from the judging walkthrough. Contract interaction on an unconfigured screen, a faucet transfer alone, or Anvil fixture signatures do not demonstrate a Privy-wallet Orbital swap and invoice.

## Current external prerequisites and sponsor scope

The [Arc deployment review](ARC_DEPLOYMENT_STATUS.md) retains the historical finding that the published canonical Aqua/stock-router addresses had no code on Arc. The authorized route now deploys unchanged upstream AquaRouter at a new project address, using `prepare --self-deploy-aqua --plan deployments/5042002/plans/self-deployment.json` and the deployer option shown in the [deployment commands](ARC_DEPLOYMENT.md#prepare-and-sign-the-new-plan). This supersedes the earlier canonical-registry prerequisite. Keep the old blocked plan as history and label the new registry **project-deployed upstream AquaRouter**.

The authorized public deployer `0x5eBA55e1b43c8714E4432250Dada7A518780C871` held **20 testnet USDC**, with nonce 0 and empty code at block 61123941; see the [dated read-only observation](../deployments/5042002/research-2026-09-09.json). Fresh per-step nonce, funding, gas, source and simulation checks determine whether the current plan can proceed. Wallet signatures happen in the user's wallet. No sponsor approval record is required for this mode, and no sponsor approval is implied by successful deployment.

The screenshot's complete sponsor matrix and supplied Privy wording match **ETHOnline 2026**. Keep the three sponsor outcomes separate:

- [1inch Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch): official Aqua/SwapVM contracts, custom SwapVM permitted, demonstrated token transfers, and meaningful Git history. The published criteria accept local forks. Retain unchanged-source provenance and actual receipt evidence for the project Arc deployment, clearly distinguish it from the canonical deployment and fresh Anvil profile, and leave qualification unverified.
- [Arc Best DeFi/Onchain Finance Application](https://ethglobal.com/events/ethonline2026/prizes/arc): meaningful Arc/USDC liquidity and programmable settlement, a functional frontend/backend, architecture diagram, source and demonstration. The separate Launch track adds mainnet deployment/readiness by September 30; it is not implied by this testnet runbook.
- [Privy Best financial flow](https://ethglobal.com/events/ethonline2026/prizes/privy): at least one actual Privy wallet and a working financial flow using a generally available feature. Orbital's swap and swap-funded invoice are the intended evidence; email login is setup.

The documented 30-million Arc block gas limit is not a verified individual transaction cap. Keep the Osaka-derived 16,777,216 transaction limit provisional until target evidence resolves it. This integration walkthrough does not close mathematical proof obligations, gas acceptance, broader security testing or production readiness; see [PROGRESS.md](../PROGRESS.md).
