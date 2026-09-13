# Vercel and Railway

The public Arc Testnet app uses Vercel for `apps/web` and Railway for the API,
one continuously running indexer, and PostgreSQL. Wallets remain the signers.

The Vercel project is `orbital` in `12anand34s-projects`, with the supplied URL
`https://orbital-olive-omega.vercel.app`. The Railway project is `orbital`.
The public API is `https://api-production-2182.up.railway.app`.
Both platforms are connected to `AnInsaneJimJam/aqua-orbital`, branch `main`.
Pushing to `main` deploys the frontend, API and indexer automatically.

## Deployment identity

[`hosted-manifest.json`](../deployments/5042002/hosted-manifest.json) preserves
the current local Arc test view: the existing contracts and token allowlist,
the public Blockdaemon RPC, and indexing from block **61860436**. The original
deployment began at **61131616**; earlier activity remains excluded from this
test view. The canonical manifest and deployment receipts are unchanged.

The API, indexer and frontend RPC route must use this same hosted manifest.
Next.js includes it in the `/api/chain` function's file trace so Vercel can load
it at runtime. Do not copy a machine-specific absolute path into Vercel.

## Railway

Use the repository root as the source directory for both application services.
Both use [`Dockerfile.backend`](../Dockerfile.backend), which installs only the
backend workspaces, copies the public deployment/proof manifests, and runs as
the non-root Node user. The existing Dockerfile/Compose development workflow
is separate.

| Service | Start command | Environment |
| --- | --- | --- |
| `api` | `node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/index.ts` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PUBLIC_APP_URL=https://orbital-olive-omega.vercel.app` |
| `indexer` | `node --import ./apps/indexer/node_modules/tsx/dist/loader.mjs apps/indexer/src/index.ts` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `INDEXER_POLL_MS=1000` |
| `Postgres` | Railway PostgreSQL service | Private networking and a persistent volume |

Configure these settings directly on the Railway services: Dockerfile path
`Dockerfile.backend`, repository root `/`, one replica, sleeping disabled,
restart on failure with at most 10 retries. The API pre-deploy command is
`node --import ./packages/db/node_modules/tsx/dist/loader.mjs packages/db/src/migrate.ts`;
its healthcheck is `/health` with a 120-second timeout. New Railway services
reject the deprecated `railway.json` format, so this deployment uses native
service settings rather than an additional infrastructure dependency.

The image sets `HOST=0.0.0.0`, `DEPLOYMENT_MANIFEST` and `PROOF_MANIFEST`.
Railway supplies `PORT`. Run one indexer replica with sleeping disabled.
The API's pre-deploy command applies the existing migrations. Give only the
API a public HTTPS domain; the database and indexer need no public endpoint.

`/health` confirms process availability for Railway's deployment check.
`/ready` is the application readiness check and remains unavailable until
canonical indexing catches up. A healthy process alone does not establish
available liquidity or a successful quote.
A fresh database must replay the configured history; this initial sync can
take tens of minutes. The indexer resumes from its persisted cursor after
deployments. Keep the original starting block when redeploying.

The owner selected the **$5 free-trial credit**, with no paid upgrade. On
2026-09-13 the account reported 30 trial days remaining and no paid usage
subscription. Railway rejected a $5 manual hard limit because its minimum is
$10; no higher limit was substituted. Trial credit is one-time, not a $5
monthly subscription. [Railway trial terms](https://docs.railway.com/pricing/free-trial).

## Vercel

Set the project root to `apps/web`, framework to Next.js, and Node to `22.x`.
Include source files outside the root directory for the shared workspaces and
manifest. Install with `pnpm install --frozen-lockfile` and build with `pnpm build`.

Set these project environment variables for the production deployment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api-production-2182.up.railway.app` |
| `NEXT_PUBLIC_CHAIN_ID` | `5042002` |
| `NEXT_PUBLIC_ARC_RPC_URL` | `https://rpc.blockdaemon.testnet.arc.io` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | The existing public Privy app ID |
| `NEXT_PUBLIC_LOCAL_DEMO_WALLET` | `false` |
| `DEPLOYMENT_MANIFEST` | `../../deployments/5042002/hosted-manifest.json` |

Leave `ORBITAL_E2E` and `ORBITAL_PROFILE` unset on Vercel. Public environment
values are built into the frontend, so changing them requires another build.
If Privy's allowed origins are enabled, add the exact Vercel HTTPS origin in
its dashboard; the frontend uses no Privy secret.

## Verification

The production backend image was built locally and checked against a temporary
PostgreSQL database: migrations, API health/deployment/proof routes, CORS,
unavailable readiness before indexing, and one real read-only Arc indexing
step at the configured starting block all passed. Temporary test resources
were removed. The production frontend build passed and its RPC trace includes
the hosted manifest.

After hosting, verify the public `/deployment` manifest, `/ready`, strategy
listing, a read-only quote from a non-maker address, and the frontend's
`/api/chain` response. Check Privy initialization and wallet restoration on the
public origin. A test quote is not a signed swap.
