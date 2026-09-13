<p align="center">
  <img src="apps/web/public/brand/favicon.svg" alt="Orbital" width="72" height="72">
</p>

<h1 align="center">Orbital</h1>

<p align="center"><strong>Stablecoin swaps. Liquidity that stays in your wallet.</strong></p>

<p align="center">
  <a href="https://orbital-olive-omega.vercel.app">Launch app</a> ·
  <a href="https://orbital-olive-omega.vercel.app/docs">Protocol docs</a> ·
  <a href="docs/LOCAL_DEMO.md">Local development</a> ·
  <a href="docs/HOSTING.md">Deployment</a>
</p>

Orbital is a multi-asset stablecoin AMM on **Arc Testnet**. It combines concentrated liquidity with [1inch Aqua](https://github.com/1inch/aqua), custom SwapVM instructions, and wallet-controlled execution. Liquidity providers publish strategies backed by tokens in their own wallets; traders swap against those strategies, and merchants receive USDC through direct or swap-funded invoices.

## What you can do

- **Swap stablecoins** with live quotes, slippage controls, exact approval reviews, and receipt-based confirmation.
- **Provide liquidity** for any pair or all three currently supported assets. Choose a Wide, Balanced, or Focused strategy and manage its lifecycle from your wallet.
- **Accept payments** through USDC invoices with optional recipient splits, expiry, and a shareable payment page. Payers can pay directly in USDC or fund settlement through a supported swap.
- **Connect a wallet** through Privy using an existing browser wallet or the configured email and embedded-wallet flow.
- **Inspect the protocol** through public documentation, indexed strategy history, onchain receipts, and retained technical evidence.

## How it works

1. **Configure.** A provider selects at least two supported tokens, an initial allocation, a concentration profile, and a fee. The SDK derives and validates the strategy's curve configuration.
2. **Publish.** The provider approves Aqua, publishes an allocation, and activates the strategy. These are distinct wallet-reviewed steps. Tokens remain in the provider's wallet.
3. **Quote.** The API discovers indexed strategies and checks their configuration, current backing, and curve output against canonical Arc state.
4. **Execute.** The trader reviews and signs. Custom SwapVM instructions apply the maker fee and Orbital curve calculation; Aqua handles settlement. Invoice payments additionally distribute the required USDC to their recipients atomically.

A strategy's available liquidity depends on both its Aqua allocation and the provider's current balances and allowances. Spending from the same wallet can reduce its backing. A provider cannot trade against their own strategy.

## Arc Testnet deployment

| Resource | Location |
| --- | --- |
| Application | [orbital-olive-omega.vercel.app](https://orbital-olive-omega.vercel.app) |
| Documentation | [How Orbital works](https://orbital-olive-omega.vercel.app/docs) |
| Public API | [api-production-2182.up.railway.app](https://api-production-2182.up.railway.app) |
| Chain | Arc Testnet · `5042002` |
| Contract addresses and token allowlist | [Hosted manifest](deployments/5042002/hosted-manifest.json) |
| Deployment receipts and verification | [Verification record](deployments/5042002/verification.json) |

| Asset | Decimals | Purpose |
| --- | --- | --- |
| USDC | 6 through the ERC-20 interface | Arc Testnet settlement asset; also pays network gas |
| oUSD6 | 6 | Faucet-minted demo token |
| oUSD18 | 18 | Faucet-minted demo token for mixed-decimal strategies |

**oUSD6 and oUSD18 are test assets, not LP receipt tokens.** They have no redemption value. The current deployment uses a project-deployed copy of the pinned upstream AquaRouter; it is not the canonical 1inch Aqua deployment. The hosted index starts at the documented test-view block, so it does not represent all activity since original contract deployment.

## Run locally

Install **Node.js 22**, **pnpm 10.34.5**, **Python 3.12**, **Foundry 1.5.1**, and Docker with Compose. Solidity and JavaScript dependencies are pinned in the repository.

```bash
git clone https://github.com/AnInsaneJimJam/aqua-orbital.git
cd aqua-orbital
pnpm install --frozen-lockfile
python -m pip install -r packages/reference/requirements.txt
pnpm local:setup
pnpm dev:local
```

Open **http://127.0.0.1:3000**. The API runs on **http://127.0.0.1:3001**.

`local:setup` starts PostgreSQL and a persistent Anvil chain, builds and verifies the local contracts, applies migrations, and seeds demo makers and an invoice. The local profile provides unlocked test accounts and needs no Privy credentials. Use `pnpm demo:judge` to inspect demo links and indexed records. See the [local runbook](docs/LOCAL_DEMO.md) for accounts, recovery, and prerequisites.

To develop against the existing Arc deployment, use `pnpm dev:arc` after completing the [Arc profile setup](docs/ARC_DEMO.md). It runs separately on ports **3002/3003**, verifies the saved deployment, and uses real wallet connections.

## Repository map

| Path | Responsibility |
| --- | --- |
| [`apps/web`](apps/web) | Next.js application, Privy integration, transaction reviews, and public docs |
| [`apps/api`](apps/api) | Canonical quotes, strategy and invoice reads, metrics, readiness, and event streams |
| [`apps/indexer`](apps/indexer) | Arc event ingestion, projection updates, and bounded reorg recovery |
| [`packages/contracts`](packages/contracts) | Orbital router, custom instructions, math libraries, payments, and vendored dependencies |
| [`packages/sdk`](packages/sdk) | Strategy configuration, encoding, quotes, transaction plans, and receipt recovery |
| [`packages/db`](packages/db) | PostgreSQL schema, migrations, and indexed projections |
| [`packages/shared`](packages/shared) | Validated request/response schemas and shared types |
| [`packages/reference`](packages/reference) | Independent high-precision mathematical model and fixtures |
| [`docs`](docs) | Protocol contracts, decisions, implementation notes, and operating guides |
| [`test/evidence`](test/evidence/INDEX.md) | Dated verification results, source pins, receipts, and numerical evidence |

## Development checks

```bash
pnpm typecheck
pnpm test:reference
pnpm test:contracts
pnpm test:shared
pnpm test:sdk
pnpm build
```

Database, API, and indexer integration tests need a running PostgreSQL instance and `TEST_DATABASE_URL`. Browser tests need Playwright's browser installed:

```bash
export TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm test:database
pnpm test:indexer
pnpm test:backend
pnpm --filter @orbital/web exec playwright install chromium
pnpm test:e2e
```

Browser tests use isolated wallet/RPC fixtures on port 3100. They do not establish live wallet-provider or onchain execution results. The [evidence index](test/evidence/INDEX.md) records what was actually run; [progress](PROGRESS.md) tracks open acceptance work. Three existing SDK tests still contain stale Aqua ABI-count assertions, recorded with the [selected-token checks](test/evidence/selected-token-profiles/README.md).

## Hosting and operating status

The frontend runs on **Vercel**. **Railway** hosts the API, one continuously running indexer, and PostgreSQL. The [hosting runbook](docs/HOSTING.md) contains the build settings, environment variables, URLs, and trial-budget constraints.

`GET /health` checks the API process. `GET /ready` also requires a fresh, canonical index matching the deployment. A new database needs an initial history sync before liquidity and quotes become available. API observations never authorize signatures; the wallet remains the execution boundary.

This is an **experimental testnet application**. Strategy publication, swaps, and swap-funded invoices have recorded Arc receipts, but the full mathematical, worst-case gas, security, and release campaigns remain open. It is not presented as audited or ready for mainnet funds. Current requirements live in [MASTER_PROMPT.md](MASTER_PROMPT.md), [MATH.md](docs/MATH.md), [NUMERICS.md](docs/NUMERICS.md), and [TESTS.md](docs/TESTS.md).

## Research and attribution

Orbital adapts the [Orbital research](https://www.paradigm.xyz/writing/orbital) by Dan Robinson, Ciamac Moallemi, and Dave White. The implementation uses [Aqua](https://github.com/1inch/aqua) and a pinned, minimal [SwapVM](https://github.com/1inch/swap-vm) fork. See the [implementation ledger](docs/PAPER_IMPLEMENTATION.md) and [asset provenance](docs/ASSETS.md).

Powered by SwapVM — © Degensoft Ltd 2025. Vendored code and fonts retain their upstream licenses and notices. This application does not imply endorsement by Paradigm or the upstream projects.
