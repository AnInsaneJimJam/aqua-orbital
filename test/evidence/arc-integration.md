# Arc/Privy integration checkpoint — September 9, 2026

This increment connects live-profile startup and user-signed deployment preparation, improves Privy onboarding, and fixes a database disconnect. Per the owner's instruction, verification was limited to types, syntax, public browser/HTTP checks, one deployment simulation and one database recovery test. It is not a release campaign or a successful target deployment.

## Observed checks

| Check | Result and scope |
| --- | --- |
| Web types | `pnpm --filter @orbital/web typecheck` passed, including final modal-logo styling |
| Database/API/indexer types | Passed for the affected packages; [commands and failure history](../../apps/api/test/database-recovery.md) |
| Database recovery | One real PostgreSQL private-proxy test passed; no shared service stopped and no readiness fabricated |
| Arc runner | Started web on 3002 and API on 3003 with fixture wallets disabled; verified chain and canonical system USDC observations |
| App HTTP | Landing and health returned 200; `/ready` returned `503 DEPLOYMENT_UNAVAILABLE` without a manifest; no indexer/database connection started in this profile |
| Public Privy modal | Fresh Chromium context displayed email and external-wallet entry without browser/Privy response failures; final logo contrast verified. [Observation](arc-integration/privy-login.json) |
| Node syntax | `node --check` passed for the deployment module/CLI, wallet server, Arc runner and network verifier; helper's embedded browser JavaScript also passed |
| Prepared deployment | Authenticated artifacts produced eleven unsigned steps; plan ID `f4d8844142e754179f1af65b0cd743d676581f0af1dd355cc344b9d80a05ce3e` |
| Final status | `blocked`, 0/11 confirmed; no Aqua code at the published address and no reviewed official Arc identity evidence; no transaction offered for signing |
| Wallet utility HTTP | Page/status 200 with correct wallet/blockers; foreign Origin and missing CSRF 403, invalid hash 400, oversized JSON 413. No hash recorded or activation performed |
| First library simulation | Arc `eth_estimateGas`/`eth_call` for FrontierEndpoint passed: estimate 5,029,740 gas, reviewed limit 6,045,688, maximum budget 0.242730779933245824 USDC. Returned 22,826-byte runtime matches its compiler template. No immutable slots exist in this library. Nonce remained 0; no contract created. [Pinned observation](arc-integration/first-deployment-simulation.json) |

Plans/state are machine-local files under ignored `deployments/5042002/plans/`. Regenerate them from authenticated artifacts using [the deployment runbook](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/ARC_DEPLOYMENT.md). Earlier receipt/math checkpoints retain their original source boundaries.

## Corrections and limits

A bounded independent code review prompted fixes for polling replacing an outstanding fee review, a read-only verifier advancing pending state, missing comparison of retained/current USDC runtime, and discarding recomputed contract-runtime evidence. The final implementation retains offered reviews, has a strictly read-only active-verification path, and checks those recorded identities. Successful live transaction paths remain unexercised without an authenticated Aqua deployment.

The first modal screenshot exposed a dark logo on a dark background. Privy's installed implementation overwrites inline logo styles; a preserved CSS-module class fixes contrast. The final typecheck and screenshot follow that correction.

The deployer held **20 testnet USDC**, nonce **0**, at pinned Arc block **61123941**; both checked published Aqua and stock SwapVM addresses had empty code. [Independent network observation](../../deployments/5042002/research-2026-09-09.json). This does not prove wallet control, total deployment-budget sufficiency, absence of other registries, or sponsor acceptance.

No email, authentication code, session, private key, seed phrase, signature, broadcast, wallet creation or live swap/payment receipt was produced. Successful Arc deployment/activation and Privy financial flows remain unverified. Deployment fee replacement, reverted-step recovery and plan rebasing remain manual. Mathematical liveness, supported-range gas, fuzz/invariant/mutation, security and full browser/performance release campaigns remain open.

[Final implementation source hashes](arc-integration/checkpoint.json) identify this increment. Hashing establishes provenance, not additional test coverage.
