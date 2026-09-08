# Arc and Privy demonstration runbook

This profile connects the actual Privy client to Arc Testnet, chain **5042002**, on separate application ports. Wallet login can be exercised before an Orbital deployment exists. A login screen is not evidence of a completed Privy financial flow, and the Anvil demo is not Arc settlement.

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

If a manifest is present, it must identify chain 5042002 and genuine, allowlisted six-decimal system USDC. The runner calls `node scripts/arc-deployment.mjs verify-active` before starting services. That read-only gate must authenticate the source/build graph, saved deployment record, exact live runtimes, creation receipts and immutable bindings. A manually set `verified` field is insufficient. Invalid, stale or mismatched records stop startup rather than falling back to another deployment.

After verification, the API and indexer use that unchanged manifest and `DATABASE_URL`, defaulting to the existing local PostgreSQL database. Run `pnpm db:migrate` against the selected database before its first use. The schema separates chains and deployments; no database reset is needed to keep Anvil and Arc data. Database/RPC outages or indexer lag remain unavailable financial reads, not fixture data. Wait for the Arc API's `/ready` response before reviewing live transactions.

## Minimal live walkthrough

Once the deployment gate passes and wallets have genuine **testnet** USDC:

1. In a maker-controlled wallet, obtain USDC from the official Circle faucet and use `/fund` for the two Orbital demo tokens. Native gas and ERC-20 USDC are views of the same balance; reserve USDC for fees. Demo tokens have no redemption value.
2. Publish the three-token, three-tick strategy through `/liquidity/new`: review bounded Aqua approvals, publish the allocation, then activate it. Record the strategy hash and receipts. Tokens remain in the maker wallet until settlement.
3. In a different, actual Privy embedded wallet, fund gas and the selected input asset. Review and execute an Orbital swap. Save the transaction hash, active wallet address and resulting balances. The maker and taker must be distinct.
4. Use a merchant-controlled wallet to create a fresh `5 USDC` invoice with a 90/10 merchant/treasury split. Open its public invoice link in the Privy wallet and pay from `oUSD18`; review its input cap, approval, gas, recipient splits and expected refund before signing.
5. Match the successful payment receipt to the same Privy wallet, the genuine USDC recipient transfers, refund and indexed invoice state. A previously paid invoice must not be reused as a fresh payment demonstration.
6. Reload after a submitted transaction and use the retained receipt record before requesting another signature. Reload between publication and activation to exercise draft resumption. Run only a small number of bounded review/recovery checks at this stage; broader campaigns remain in the release plan.

No runner creates maker identities, funds accounts or automates user signatures. Wallet owners complete these steps in their wallets. Link the actual receipt evidence and public source repository from the judging walkthrough. Contract interaction on an unconfigured screen, a faucet transfer alone, or Anvil fixture signatures do not demonstrate a Privy-wallet Orbital swap and invoice.

## Current external prerequisites and sponsor scope

The [Arc deployment review](ARC_DEPLOYMENT_STATUS.md) records the unresolved official Aqua identity. A fresh September 9 local-date review still found no code at the published Aqua/stock-router addresses on Arc. Complete the prepared deployment path only after an authenticated official Arc Aqua address is available, or the sponsor/maintainer explicitly accepts an unmodified project deployment. The requested public deployer `0x5eBA55e1b43c8714E4432250Dada7A518780C871` held **20 testnet USDC**, with nonce 0 and empty code at block 61123941; see the [read-only observation](../deployments/5042002/research-2026-09-09.json). Wallet control and sufficient budget for the actual deployment plan still require verification. A generic self-deployment guide does not establish sponsor acceptance, and the app must not describe an unverified registry as official.

The screenshot's complete sponsor matrix and supplied Privy wording match **ETHOnline 2026**. Keep the three sponsor outcomes separate:

- [1inch Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch): official Aqua/SwapVM contracts, custom SwapVM permitted, demonstrated token transfers, and meaningful Git history. The published criteria accept local forks. An Arc project deployment still needs the evidence required by the master specification.
- [Arc Best DeFi/Onchain Finance Application](https://ethglobal.com/events/ethonline2026/prizes/arc): meaningful Arc/USDC liquidity and programmable settlement, a functional frontend/backend, architecture diagram, source and demonstration. The separate Launch track adds mainnet deployment/readiness by September 30; it is not implied by this testnet runbook.
- [Privy Best financial flow](https://ethglobal.com/events/ethonline2026/prizes/privy): at least one actual Privy wallet and a working financial flow using a generally available feature. Orbital's swap and swap-funded invoice are the intended evidence; email login is setup.

The documented 30-million Arc block gas limit is not a verified individual transaction cap. Keep the Osaka-derived 16,777,216 transaction limit provisional until target evidence resolves it. This integration walkthrough does not close mathematical proof obligations, gas acceptance, broader security testing or production readiness; see [PROGRESS.md](../PROGRESS.md).
