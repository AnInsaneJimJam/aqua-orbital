# Orbital

Orbital is being built for multi-token concentrated stablecoin liquidity, held in maker wallets through 1inch Aqua. The target architecture combines custom SwapVM curve execution, Arc USDC settlement and user-controlled Privy wallets.

**Implementation in progress. No Arc deployment or sponsor qualification has been verified.** Disposable local deployments are used for receipt tests. See [PROGRESS](PROGRESS.md) for actual results. The mathematical engine and complete application must both pass their gates.

## Start here

- [Master specification](MASTER_PROMPT.md): active architecture and G0–G8 acceptance gates.
- [Mathematics](docs/MATH.md), [numerics](docs/NUMERICS.md), [tests](docs/TESTS.md).
- [Paper implementation ledger](docs/PAPER_IMPLEMENTATION.md).
- [Frontend](docs/FRONTEND.md), [Privy](docs/PRIVY_RESEARCH.md), [decisions](docs/DECISIONS.md).
- [Aqua research](docs/AQUA_RESEARCH.md), [Arc research](docs/ARC_RESEARCH.md), [fresh Arc deployment observations](docs/ARC_DEPLOYMENT_STATUS.md).
- [Evidence index](test/evidence/INDEX.md).
- [Payment quote implementation](test/evidence/payment-foundation.md): bounded search and invoice/funding checks; the public payment quote endpoint is still unfinished.

The original [SPEC](SPEC.md) and [PLAN](docs/PLAN.md) describe a superseded custodial architecture. Do not implement them as a second product.

## Run locally

Requirements: Node 22, Python 3.12, Foundry 1.5.1 and Docker Desktop for PostgreSQL/Anvil. The project pins pnpm 10.34.5, Solidity 0.8.30, Cancun, optimizer 700 and via-IR. Exact application dependencies are in pnpm-lock.yaml and [the toolchain manifest](test/evidence/toolchain.json).

```powershell
pnpm install --frozen-lockfile
python -m pip install -r packages/reference/requirements.txt
docker compose up -d postgres anvil
$env:DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm db:migrate
pnpm dev
```

Default web URL: http://localhost:3000. API: http://localhost:3001. The current work session also has a development preview at http://127.0.0.1:3002. Browsing and parameter previews work without a deployment. Financial actions remain unavailable until the protocol gates are complete; displayed demo token names are not fabricated balances or quotes.

Set browser configuration in `apps/web/.env.local` (Next loads environment files from the app directory). The supplied public Privy app ID is already configured locally; no secret is needed. For a fresh checkout use:

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=cmtrvczqp00qh0cjv4b16j1ag
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Allow the actual origin in the Privy dashboard. An empty app ID selects the external injected-wallet profile. Set chain ID 31337 for local Anvil. These profiles do not constitute a verified Privy financial flow. Backend environment variables are process variables; copying root `.env.example` does not automatically load them into Node. Set `PUBLIC_APP_URL` to the exact browser origin for API CORS.

## Verification commands

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm typecheck
pnpm test:reference
pnpm test:contracts
pnpm test:sdk
pnpm test:shared
pnpm test:backend
pnpm test:database
pnpm test:indexer
pnpm --filter @orbital/web exec playwright install chromium
pnpm test:e2e
pnpm build
python scripts/fork-diff.py
pnpm evidence:build
```

Browser tests start an isolated development build on port 3100 with Privy disabled and clearly defined injected-wallet fixtures. To exercise live Privy, use the normal preview and your own sign-in. The public login dialog has been verified; embedded-wallet creation and live transactions have not.

`pnpm test:all` includes shared schemas, real PostgreSQL ingestion/reorg checks and the indexer in addition to contract, reference, SDK, API and browser tests. It requires the running local database, `TEST_DATABASE_URL` and installed Chromium; database tests fail instead of silently skipping when configuration is absent.

The optional app container profile is `docker compose up --build` (stop host services on ports 3000/3001 first). It includes source bind mounts for web/API iteration. Its first dependency/image build can be slow on Docker Desktop. The indexer is started separately with `pnpm dev:indexer` only after a verified deployment manifest and database are configured.

`pnpm verify:network` records observations and exits nonzero while target identity is unresolved. The package commands `deploy:local`, `deploy:arc`, `demo:seed` and `demo:judge` still fail explicitly while their complete workflows are unfinished. Bounded stateful campaigns are recorded separately; the full differential, invariant, mutation and release matrix has not passed. Do not treat a successful local test run as release approval.

## Implemented scope

The repository contains a high-precision explicit-tick oracle, retained counterexamples, signed wide intervals, endpoint/slack certificates, scalar and both-root event enclosures, a global support-gap certificate, a minimal SwapVM fork, maker lifecycle on official Aqua, an atomic invoice adapter, resumable SDK transaction plans, bounded PostgreSQL reorg recovery, API readiness/SSE invalidations and all frontend routes. The UI separates swap orchestration from presentation and isolates Privy in the wallet module. The current frontend template is retained while protocol implementation continues.

`GET /ready` checks the verified deployment identity, canonical RPC block and fresh confirmed raw and deployment projection cursors. Lifecycle/invoice projections support canonical rollback; a raw cursor alone cannot satisfy readiness. Financial execution remains disabled while deployment eligibility, payment observations and transaction controllers are unfinished. `GET /events` emits committed invalidations when these dependencies are ready; clients must refresh canonical reads and cannot treat notifications as balances or payment receipts.

`GET /metrics` (also `/api/v1/metrics`) reads canonical custom swap receipts with complete historical projection coverage and checked block dates. Totals preserve separate token units and distinguish demo assets; stale data is labeled and missing coverage returns unavailable. Active strategy count describes lifecycle status, not current funding. [Metrics evidence](test/evidence/metrics.md).

`GET /invoices/:id` and `/makers/:address/invoices` (also under `/api/v1`) return canonical invoice terms, exact recipient amounts and status/payment receipts. Paginated lists retain their original canonical block through normal new blocks; reorged pins require restarting the list. Indexed unpaid status does not authorize payment. [Invoice read evidence](test/evidence/invoice-reads.md).

`GET /strategies`, `/makers/:address/strategies` and `/strategies/:hash` (also under `/api/v1`) cover registered strategies with bounded, canonical pagination. Detail reads bind immutable configuration and receipt versions to contract getters at the same block, checking exact principal, fees and all-token Aqua availability. They are public observations with explicit stale/error states; trade eligibility and incomplete shipments remain unfinished. [Strategy read evidence](test/evidence/strategy-reads.md).

Local contract tests now execute the certified **all-interior, no-crossing** path through both custom instructions and official Aqua, including all six pairs on one three-token/three-tick strategy and a swap-funded 5 USDC invoice with a 90/10 split. Exact transfer checks preserve donations, separate fees from principal, and emit the canonical event only after successful settlement. [Integration evidence](test/evidence/interior-execution.md).

Six mined failure receipts from a disposable local deployment contain no logs and leave financial state unchanged; the repaired swap-funded invoice succeeds. [Receipt and security evidence](test/evidence/router-settlement-security.md). The demo token contract enforces 1,000 units per connected address every 24 hours, and the SDK builds its reviewed self-mint call. [Faucet evidence](test/evidence/demo-dollar.md).

A [composed frontier certificate](test/evidence/frontier-composition.md) joins initial slack release, ordered inward/outward crossings and one final raw payout, including [authenticated continuation](test/evidence/payout-refinement.md) and [final-retention repartition](test/evidence/outward-retention-promotion.md). It now [executes through the real Router and Aqua](test/evidence/mixed-execution.md); the full local checkpoint passes 398 contract tests. The Router uses six immutable libraries and has 22,221 runtime bytes; Storage/Composition/Endpoint are 23,240/23,138/22,826. All fit EIP170, but worst-range transaction gas, equality/discovery liveness and release campaigns remain open.

An [independent initialized mixed pilot](test/evidence/mixed-pilot.md) now matches all 128 net-input actions across 32 configurations, following recovery of a retained eight-tick reversal. All 129 reference regressions pass. Two large concentrated diagnostic calls exceed the provisional Arc transaction cap before full settlement; the finite pilot does not establish release or target gas acceptance.

[Public canonical swap observations](test/evidence/swap-quote-http.md) pass their database/RPC/HTTP checks and [render in the existing swap screen](test/evidence/swap-observation-ui.md) with expiry and context invalidation. Payment quotes, financial transaction controllers, integrated demo and full release campaigns remain unfinished. See [progress](PROGRESS.md) and [numerical obligations](test/evidence/numerics.md). No persistent application or Arc contract deployment is configured.

`node scripts/local-deployment.mjs plan` validates the compiled local dependency graph. `node scripts/local-deployment.mjs test-run` deploys it only to a fresh, owned disposable Anvil chain, verifies linked runtimes and mined receipts, then closes that chain. The recorded run verified 12 contracts and 16 receipts; it does not configure the application or produce a verified target manifest. [Commands, prerequisites and evidence](test/evidence/local-deployment.md).

The retained source pins are SwapVM `f09a41e689240adc645934f965c8061749397cd2` and Aqua `81c26e4619ce21556ab02b3284ee2685de21fb18`. All 807 retained upstream tests pass on both stock and minimal fork under the pinned build. [Regression evidence](test/evidence/upstream-regression.md). The program is `0x7220 || configHash || 0x5220 || configHash` (68 bytes), for a once-per-swap maker fee then terminal Orbital curve instruction. Execution accepts certified interior or mixed paths and explicitly rejects unresolved certificates. [Fork diff](test/evidence/fork.patch).

Testnet assets include demo tokens with no redemption value. Concentrated liquidity can lose value. This project adapts research by Dan Robinson, Ciamac Moallemi, and Dave White; it is not a Paradigm or sponsor-endorsed deployment.

Powered by SwapVM — © Degensoft Ltd 2025. Vendored portions retain their upstream licenses.
