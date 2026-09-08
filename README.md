# Orbital

Orbital is being built for multi-token concentrated stablecoin liquidity, held in maker wallets through 1inch Aqua. The target architecture combines custom SwapVM curve execution, Arc USDC settlement and user-controlled Privy wallets.

**Orbital's contracts are deployed and verified on Arc Testnet.** The frontend loads their actual addresses, the indexer has caught up, and live strategy/quote reads pass. Publish the first maker strategy to supply liquidity; live swaps, invoice payments and Privy wallet verification remain unfinished. The persistent local application retains its recorded working flows. See [PROGRESS](PROGRESS.md) for current results and separate mathematical/release obligations.

Current delivery priority: finish live application integration around the owner-authorized project deployment of unchanged upstream AquaRouter. All twelve user-signed deployment transactions succeeded and passed activation checks. [Deployment receipts and bindings](deployments/5042002/verification.json). Broad mathematical and release campaigns are deferred at the user's request. Earlier local browser receipts remain the [integration checkpoint](test/evidence/local-integration.md), not evidence of a live Privy or Arc financial flow.

## Start here

- [Master specification](MASTER_PROMPT.md): active architecture and G0–G8 acceptance gates.
- [Mathematics](docs/MATH.md), [numerics](docs/NUMERICS.md), [tests](docs/TESTS.md).
- [Paper implementation ledger](docs/PAPER_IMPLEMENTATION.md).
- [Frontend](docs/FRONTEND.md), [Privy](docs/PRIVY_RESEARCH.md), [decisions](docs/DECISIONS.md).
- [Aqua research](docs/AQUA_RESEARCH.md), [Arc research](docs/ARC_RESEARCH.md), [fresh Arc deployment observations](docs/ARC_DEPLOYMENT_STATUS.md).
- [Arc/Privy demo profile](docs/ARC_DEMO.md), [Arc deployment preparation](docs/ARC_DEPLOYMENT.md).
- [Evidence index](test/evidence/INDEX.md).
- [Payment quote implementation](test/evidence/payment-endpoint.md) and [payment workflow](test/evidence/payment-flow.md): canonical direct/swap observations, live preflight, separate approval/payment reviews and public receipt recovery. Live Privy/Arc execution remains unverified.

The original [SPEC](SPEC.md) and [PLAN](docs/PLAN.md) describe a superseded custodial architecture. Do not implement them as a second product.

## Run locally

Requirements: Node 22, Python 3.12, Foundry 1.5.1 and Docker Desktop for PostgreSQL/Anvil. The project pins pnpm 10.34.5, Solidity 0.8.30, Cancun, optimizer 700 and via-IR. Exact application dependencies are in pnpm-lock.yaml and [the toolchain manifest](test/evidence/toolchain.json).

```powershell
pnpm install --frozen-lockfile
python -m pip install -r packages/reference/requirements.txt
pnpm local:setup
pnpm dev:local
```

Open http://127.0.0.1:3000. API: http://127.0.0.1:3001. `local:setup` starts PostgreSQL and persistent Cancun Anvil, compiles the authenticated contract graph, applies migrations, verifies/reuses the local deployment and seeds two makers plus a split invoice. `dev:local` starts the API, indexer and frontend together. No Privy credentials or application private keys are needed for this explicit local fixture profile.

Use the wallet control to choose an unlocked local test account. The default taker is funded; `/fund` exposes reviewed demo-token claims. Swaps, invoice creation/payment/cancellation, publication, retirement and docking use the ordinary SDK transaction controls. `pnpm demo:judge` prints current demo links and checks the API's indexed records. See [LOCAL_DEMO](docs/LOCAL_DEMO.md) for roles, recovery and limitations.

## Prepare Arc and Privy

The supplied public Privy app ID is already configured in ignored `apps/web/.env.local`; no secret is needed. For a fresh checkout set:

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=cmtrvczqp00qh0cjv4b16j1ag
```

Run `pnpm dev:arc` for web http://127.0.0.1:3002 and API http://127.0.0.1:3003. This separate profile selects Arc chain 5042002, real Privy and fixture wallets off. It imports only the public app ID from the frontend environment file. Allow the actual browser origin in the Privy dashboard if origin restrictions are enabled. The page and public Privy email/wallet modal have loaded successfully; no authentication or signature was performed. Without a verified Arc deployment, readiness returns `503 DEPLOYMENT_UNAVAILABLE` and the indexer stays off. See [the profile runbook](docs/ARC_DEMO.md) and [public-modal observation](test/evidence/arc-integration/privy-login.json).

The wallet control supports explicit embedded-wallet creation, selection once the corresponding connector is ready, and recoverable onboarding errors. Live creation, reconnection and signing still require verification; no new Privy-wallet Orbital swap or invoice receipt has been recorded. An empty app ID retains the external injected-wallet profile. Backend environment variables are process variables; copying root `.env.example` does not automatically load them into Node.

`pnpm deploy:arc` implements inspection, unsigned preparation, status, receipt verification and verified-manifest activation. The owner-authorized project mode deploys the unchanged pinned AquaRouter, six libraries, two demo tokens, Orbital router and payments, then renounces the custom router: twelve wallet-signed transactions. AquaRouter retains the deployment wallet as owner of its upstream fund-recovery helper. This is a project address, not the canonical 1inch deployment; sponsor acceptance remains unverified and does not block this testnet integration.

```powershell
forge build --root packages/contracts vendor/aqua/src/AquaRouter.sol
pnpm deploy:arc prepare --self-deploy-aqua --deployer 0x5eBA55e1b43c8714E4432250Dada7A518780C871 --plan deployments/5042002/plans/self-deployment.json
pnpm deploy:arc:wallet --plan deployments/5042002/plans/self-deployment.json
```

Preparation refuses to overwrite an existing plan. **This workspace has completed and activated all twelve steps; use `pnpm dev:arc` to start the deployed application.** For another deployment, use a new plan and its wallet utility at http://127.0.0.1:3100. Each receipt is verified before the next step, and activation checks all runtimes and bindings. The original eleven-transaction existing-registry plan and initial zero-receipt preparation checkpoint remain historical. See [deployment and recovery](docs/ARC_DEPLOYMENT.md), [preparation evidence](test/evidence/self-arc-integration.md) and [completed deployment](deployments/5042002/verification.json).

A hash-pinned read at Arc block 61,123,941 observed 20 testnet USDC and nonce 0 for the supplied public address `0x5eBA55e1b43c8714E4432250Dada7A518780C871`. This does not establish wallet control or sufficient deployment gas budget. [Read-only observation](deployments/5042002/research-2026-09-09.json).

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

Browser tests start an isolated development build on port 3100 with Privy disabled and clearly defined injected-wallet fixtures; do not run them concurrently with the deployment wallet utility on that port. Use the Arc profile on port 3002 for live Privy checks. The public login dialog has previously been verified; embedded-wallet creation and live transactions have not.

`pnpm test:all` includes shared schemas, real PostgreSQL ingestion/reorg checks and the indexer in addition to contract, reference, SDK, API and browser tests. It requires the running local database, `TEST_DATABASE_URL` and installed Chromium; database tests fail instead of silently skipping when configuration is absent.

The optional app container profile is `docker compose up --build` (stop host services on ports 3000/3001 first). It includes source bind mounts for web/API iteration. Its first dependency/image build can be slow on Docker Desktop. The indexer is started separately with `pnpm dev:indexer` only after a verified deployment manifest and database are configured.

`pnpm verify:network` prints read-only observations and exits nonzero while target identity is unresolved; it never overwrites activation evidence. `deploy:local`, `demo:seed` and `demo:judge` support the persistent local application. Arc preparation does not satisfy deployment identity, release requirements or authorized-wallet verification. Bounded stateful campaigns are recorded separately; the full differential, invariant, mutation and release matrix has not passed. The commands above remain the verification map and were not all rerun for this increment.

## Implemented scope

The repository contains a high-precision explicit-tick oracle, retained counterexamples, signed wide intervals, endpoint/slack certificates, scalar and both-root event enclosures, a global support-gap certificate, a minimal SwapVM fork, maker lifecycle on official Aqua, an atomic invoice adapter, resumable SDK transaction plans, bounded PostgreSQL reorg recovery, API readiness/SSE invalidations and all frontend routes. The UI separates swap orchestration from presentation and isolates Privy in the wallet module. The frontend is built around the supplied Orbital visualization and SVG logo, with a shared dark palette and local typography. Technical detail remains available through disclosures. See [frontend design](docs/FRONTEND.md) and [asset provenance](docs/ASSETS.md).

`GET /ready` checks the verified deployment identity, canonical RPC block and fresh confirmed raw and deployment projection cursors. Lifecycle/invoice projections support canonical rollback; a raw cursor alone cannot satisfy readiness. The local setup generates a verified chain-31337 deployment; Arc remains unconfigured. Public API observations do not grant signing authority; payment reviews separately check wallet identity, live state, funding and simulation. `GET /events` emits committed invalidations when these dependencies are ready; clients must refresh canonical reads and cannot treat notifications as balances or payment receipts.

Transient PostgreSQL connection loss no longer crashes the API/indexer through an unhandled pool error. Connection acquisition is bounded, the indexer retries through its synchronization loop, and failed dependencies keep readiness unavailable. Recovery uses new connections. [Focused database fault-injection evidence](apps/api/test/database-recovery.md).

`GET /metrics` (also `/api/v1/metrics`) reads canonical custom swap receipts with complete historical projection coverage and checked block dates. Totals preserve separate token units and distinguish demo assets; stale data is labeled and missing coverage returns unavailable. Active strategy count describes lifecycle status, not current funding. [Metrics evidence](test/evidence/metrics.md).

`GET /invoices/:id` and `/makers/:address/invoices` (also under `/api/v1`) return canonical invoice terms, exact recipient amounts and status/payment receipts. Paginated lists retain their original canonical block through normal new blocks; reorged pins require restarting the list. Indexed unpaid status does not authorize payment. [Invoice read evidence](test/evidence/invoice-reads.md).

`POST /quotes/payment` (also under `/api/v1`) returns canonical direct-USDC or sufficient-input swap observations, exact invoice splits/refund, and validated unsigned payment/approval plans. It authenticates payer funding and invoice terms at one hash, repeats final checks, and shares swap admission/rate limits. Static quote batches use a bounded five-second cache with exact context keys; invoice, funding, state and canonical checks stay fresh. Plans remain review-only; separate frontend reviews validate live state and simulation before user-controlled wallet signing. [Payment endpoint](test/evidence/payment-endpoint.md), [cache evidence](test/evidence/quote-cache.md).

`GET /strategies`, `/makers/:address/strategies` and `/strategies/:hash` (also under `/api/v1`) cover registered strategies with bounded, canonical pagination. Detail reads bind immutable configuration and receipt versions to contract getters at the same block, checking exact principal, fees and all-token Aqua availability. They are public observations with explicit stale/error states; fresh transaction reviews determine trade eligibility. `/makers/:address/shipments` separately exposes canonical unregistered Aqua allocations and dock receipts without inventing missing configuration parameters. [Strategy read evidence](test/evidence/strategy-reads.md).

Local contract tests now execute the certified **all-interior, no-crossing** path through both custom instructions and official Aqua, including all six pairs on one three-token/three-tick strategy and a swap-funded 5 USDC invoice with a 90/10 split. Exact transfer checks preserve donations, separate fees from principal, and emit the canonical event only after successful settlement. [Integration evidence](test/evidence/interior-execution.md).

Six mined failure receipts from a disposable local deployment contain no logs and leave financial state unchanged; the repaired swap-funded invoice succeeds. [Receipt and security evidence](test/evidence/router-settlement-security.md). The demo token contract enforces 1,000 units per connected address every 24 hours, and the SDK builds its reviewed self-mint call. [Faucet evidence](test/evidence/demo-dollar.md).

A [composed frontier certificate](test/evidence/frontier-composition.md) joins initial slack release, ordered inward/outward crossings and one final raw payout, including [authenticated continuation](test/evidence/payout-refinement.md) and [final-retention repartition](test/evidence/outward-retention-promotion.md). It now [executes through the real Router and Aqua](test/evidence/mixed-execution.md); the full local checkpoint passes 398 contract tests. The Router uses six immutable libraries and has 22,221 runtime bytes; Storage/Composition/Endpoint are 23,240/23,138/22,826. All fit EIP170, but worst-range transaction gas, equality/discovery liveness and release campaigns remain open.

An [independent initialized mixed pilot](test/evidence/mixed-pilot.md) now matches all 128 net-input actions across 32 configurations, following recovery of a retained eight-tick reversal. All 129 reference regressions pass. Two large concentrated diagnostic calls exceed the provisional Arc transaction cap before full settlement; the finite pilot does not establish release or target gas acceptance.

[Public canonical swap observations](test/evidence/swap-quote-http.md) pass their database/RPC/HTTP checks and [render in the existing swap screen](test/evidence/swap-observation-ui.md) with expiry and context invalidation. The invoice screen supports direct-USDC and swap-funded payment review, exact approval and receipt recovery through the shared wallet module. Standalone swaps also support exact approval, a fresh reviewed transaction and actual settlement-event receipts through this boundary. [Swap workflow](test/evidence/swap-flow.md). Documented swap settings, debounced refresh, canonical balances and gas-aware Max are implemented. [Controls](test/evidence/swap-controls.md). Invoice creation and merchant cancellation now use explicit reviews, canonical nonce/state reads and receipt-backed recovery. [Invoice administration](test/evidence/invoice-admin.md). Strategy publication, owner administration, replacement/recovery controls and the persistent local demo are connected. Live Privy execution, Arc deployment and full release campaigns remain unverified. See [progress](PROGRESS.md) and [numerical obligations](test/evidence/numerics.md).

`node scripts/local-deployment.mjs plan` validates the compiled local dependency graph. `node scripts/local-deployment.mjs test-run` deploys it only to a fresh, owned disposable Anvil chain, verifies linked runtimes and mined receipts, then closes that chain. The recorded run verified 12 contracts and 16 receipts; that disposable mode does not configure the application. The separate `persistent` mode now generates an ignored machine-local verified manifest; it does not establish Arc identity or release acceptance. [Commands, prerequisites and evidence](test/evidence/local-deployment.md).

The retained source pins are SwapVM `f09a41e689240adc645934f965c8061749397cd2` and Aqua `81c26e4619ce21556ab02b3284ee2685de21fb18`. All 807 retained upstream tests pass on both stock and minimal fork under the pinned build. [Regression evidence](test/evidence/upstream-regression.md). The program is `0x7220 || configHash || 0x5220 || configHash` (68 bytes), for a once-per-swap maker fee then terminal Orbital curve instruction. Execution accepts certified interior or mixed paths and explicitly rejects unresolved certificates. [Fork diff](test/evidence/fork.patch).

Testnet assets include demo tokens with no redemption value. Concentrated liquidity can lose value. This project adapts research by Dan Robinson, Ciamac Moallemi, and Dave White; it is not a Paradigm or sponsor-endorsed deployment.

Powered by SwapVM — © Degensoft Ltd 2025. Vendored portions retain their upstream licenses.
