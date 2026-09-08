# Orbital

Orbital is being built for multi-token concentrated stablecoin liquidity, held in maker wallets through 1inch Aqua. The target architecture combines custom SwapVM curve execution, Arc USDC settlement and user-controlled Privy wallets.

**Implementation in progress. No deployment or sponsor qualification has been verified.** See [PROGRESS](PROGRESS.md) for actual results. The mathematical engine and complete application must both pass their gates.

## Start here

- [Master specification](MASTER_PROMPT.md): active architecture and G0–G8 acceptance gates.
- [Mathematics](docs/MATH.md), [numerics](docs/NUMERICS.md), [tests](docs/TESTS.md).
- [Paper implementation ledger](docs/PAPER_IMPLEMENTATION.md).
- [Frontend](docs/FRONTEND.md), [Privy](docs/PRIVY_RESEARCH.md), [decisions](docs/DECISIONS.md).
- [Aqua research](docs/AQUA_RESEARCH.md), [Arc research](docs/ARC_RESEARCH.md).
- [Evidence index](test/evidence/INDEX.md).

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
pnpm typecheck
pnpm test:reference
pnpm test:contracts
pnpm test:sdk
pnpm test:backend
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
pnpm --filter @orbital/db test
pnpm --filter @orbital/web exec playwright install chromium
pnpm test:e2e
pnpm build
python scripts/fork-diff.py
pnpm evidence:build
```

Browser tests start an isolated development build on port 3100 with Privy disabled and clearly defined injected-wallet fixtures. To exercise live Privy, use the normal preview and your own sign-in. The public login dialog has been verified; embedded-wallet creation and live transactions have not.

The optional app container profile is `docker compose up --build` (stop host services on ports 3000/3001 first). It includes source bind mounts for web/API iteration. Its first dependency/image build can be slow on Docker Desktop. The indexer is started separately with `pnpm dev:indexer` only after a verified deployment manifest and database are configured.

`pnpm verify:network` records observations and exits nonzero while target identity is unresolved. `deploy:local`, `deploy:arc`, `demo:seed` and `demo:judge` currently fail explicitly: the production curve/router and deployment tools are unfinished. The invariant/mutation/release campaigns have not been implemented or passed. Do not treat a successful unit test run as release approval.

## Implemented scope

The repository contains a high-precision explicit-tick oracle, retained counterexamples, 512-bit arithmetic, tick coefficient intervals, an endpoint geometry certificate, a minimal SwapVM resolver/hooks fork, an atomic invoice adapter, an encoding/recovery SDK, raw PostgreSQL ingestion, guarded API scaffolds and all frontend routes. The UI separates swap orchestration from presentation and isolates Privy in the wallet module.

The complete certified swap engine, production custom instructions, maker lifecycle, event materialization, live quotes, full financial UI, integrated demo and release campaigns remain unfinished. See [progress](PROGRESS.md) and [numerical obligations](test/evidence/numerics.md) for the exact acceptance blockers. No live contract deployment exists.

The retained source pins are SwapVM `f09a41e689240adc645934f965c8061749397cd2` and Aqua `81c26e4619ce21556ab02b3284ee2685de21fb18`. The intended program is `0x7220 || configHash || 0x5220 || configHash` (68 bytes), for a once-per-swap maker fee then terminal Orbital curve instruction. Encoder fixtures verify these bytes; production opcode execution is not yet implemented. [Fork diff](test/evidence/fork.patch).

Testnet assets include demo tokens with no redemption value. Concentrated liquidity can lose value. This project adapts research by Dan Robinson, Ciamac Moallemi, and Dave White; it is not a Paradigm or sponsor-endorsed deployment.

Powered by SwapVM — © Degensoft Ltd 2025. Vendored portions retain their upstream licenses.
