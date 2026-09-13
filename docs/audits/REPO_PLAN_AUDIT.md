# Repository implementation and plan audit

Audit date: 2026-09-13. Working-tree base: `57729d4a36ce5041f70d4a70927d299e85cd3105`.

**Verdict: Orbital has a working protocol and application demo, including recorded Arc settlement. It is not yet a completed G0–G8 release candidate.** The main unfinished work is acceptance coverage and solver liveness, the exact qualification demonstration and authenticated Privy flow, and several concrete SDK/API/operational gaps. A substantial part of the older “remaining work” prose is already implemented.

This audit records the existing working tree; it does not change the product plan or implement fixes.

## Scope and authority

- `FRONTEND-specs/` was excluded completely from content reads. This is the actual folder corresponding to the user's `FRONTED-spec` exclusion. No conclusions here depend on its contents.
- The repository inventory contains **159 Markdown files outside that exclusion**, including historical audits, vendor READMEs and retained browser failure contexts. All were included in the full-file content scan; their inventory is appended below. Active requirements, decisions, implementation and contrary historical status claims were cross-checked in detail.
- The wider text scan covered **1,689 files / 27,018,413 bytes**: application and protocol source, tests, scripts, manifests, configuration, vendor baselines and retained evidence. Dependency installations, Git internals and ignored build/runtime caches are outside this repository-document inventory. Reading/scanning an artifact does not independently validate every assertion in it.
- The active authority is [MASTER_PROMPT.md](../../MASTER_PROMPT.md), especially sections 2, 16–18, together with [DECISIONS.md](../DECISIONS.md). [SPEC.md](../../SPEC.md) and [PLAN.md](../PLAN.md) preserve the superseded custodial design. Their P0–P8 status is **not** the current backlog.
- The owner's integration-first sequence is retained: broad campaigns were deferred, not waived. This is an implementation/plan audit, not a new mathematical proof or an independent security audit.
- Existing modifications to `apps/web/next-env.d.ts`, `deployments/5042002/verification.json`, `scripts/dev-arc.mjs`, and the untracked Arc test-profile files were preserved. No deployment, wallet action, database reset, commit or push was performed.

## What we are building

Orbital combines **multi-token concentrated stablecoin liquidity with USDC invoice payments**. Each maker owns an independent strategy containing nested spherical-cap ticks. Assets remain in the maker's wallet; Aqua records allocations and facilitates transfers when a trade settles. There are no pooled LP shares, escrowed LP deposits or separate fee-withdrawal claims.

A custom SwapVM router executes a canonical 68-byte program: `0x72` charges the maker's input fee once, and terminal `0x52` runs Orbital's certified curve. One three-token order supports all six directed pairs against the same mutable geometric state. Fees, principal, Aqua allocations, actual wallet funding and donations are accounted for separately.

The payment adapter lets a payer either transfer USDC directly or swap an allowed input token into USDC, pay an invoice's exact recipient splits and receive the excess refund atomically. The default assets are Arc testnet USDC, six-decimal oUSD6 and eighteen-decimal oUSD18. The two demo dollars have no redemption value.

The application uses a Next.js/React frontend, a bigint TypeScript SDK and shared schemas, Fastify reads/quotes, PostgreSQL projections and a chain indexer. Wallets own signing. The backend discovers and validates observations; it does not custody funds or sign transactions. Privy integration is implemented, but its authenticated financial demonstration is still missing.

| Area | Main implementation | Observed role |
| --- | --- | --- |
| Contract entry points | [Router](../../packages/contracts/src/OrbitalSwapVMRouter.sol), [payments](../../packages/contracts/src/OrbitalPayments.sol), [demo dollars](../../packages/contracts/src/OrbitalDemoDollar.sol) | Maker lifecycle, actual SwapVM execution, controlled settlement, invoice accounting and faucets |
| Mathematical engine | [Contract libraries](../../packages/contracts/src/libraries), [reference model](../../packages/reference/orbital.py) | Wide directed arithmetic, geometry, root/event/path certificates, retained counterexamples and independent explicit-tick expectations |
| SDK and shared contract | [SDK](../../packages/sdk/src), [shared schemas](../../packages/shared/src/index.ts) | Encodings, generated ABIs, amount handling, canonical observations, explicit reviews and receipt recovery |
| Backend | [API](../../apps/api/src), [indexer](../../apps/indexer/src), [database](../../packages/db/src) | Discovery, bounded routing, pinned reads, projections, metrics, invoice history and invalidations |
| Application | [Routes](../../apps/web/src/app), [features](../../apps/web/src/features), [wallet boundary](../../apps/web/src/wallet) | Swap, funding, publication/management, invoice creation/payment/cancellation and proof views |
| Operations | [Scripts](../../scripts), [deployment manifests](../../deployments), [local runbook](../LOCAL_DEMO.md), [Arc runbook](../ARC_DEMO.md) | Local setup, user-signed deployment preparation, activation verification and startup profiles |

## Gate-by-gate status

“Implemented” below means the capability exists. Gate closure additionally requires the master's exit evidence; passing component tests is not blanket acceptance.

| Gate | What is done | What remains | Audit status |
| --- | --- | --- | --- |
| **G0 — Scaffold** | Workspace, lockfile, Solidity settings, vendor pins/licenses, schemas, local setup, database migrations and deployment tooling exist. Arc project deployment has a retained verified identity. | Repair portable/pinned verification in the present environment; complete the operational items listed below. | Substantially complete; original scaffold demonstrated |
| **G1 — Mathematics** | Independent reference, directed wide arithmetic, sphere/cap geometry, both-root events, mixed composition, initial slack release, final retention and conservative raw payout are implemented. Fresh reference and contract suites pass. | Ordinary valid-state liveness, ideal-event equality/tangency/departure handling, initial-bracket refinement, broad mixed/economic distributions and complete supported-range acceptance. | Implemented for certified paths; gate open |
| **G2 — SwapVM extension** | Minimal fork, pair selection before accounting, actual `0x72`/`0x52`, one order/all six pairs, static quotes and interior/mixed execution exist. Retained upstream comparison reports 807 tests passing on stock and fork. | G1 obligations, current release campaigns and worst supported complete-transaction gas. Upstream campaign was not rerun for this audit. | Functional; acceptance open |
| **G3 — Aqua lifecycle/settlement** | Approve/ship/activate/retire/dock; maker nonce and domain checks; exact transfer deltas; all-token backing; donation isolation; shared-inventory and rollback tests. | Mixed stateful histories combining multiple makers, funding changes and invoices; complete adversarial/security and mutation campaigns. | Functional; acceptance open |
| **G4 — Payments** | Direct USDC and swap-funded invoices, 1–3 recipients, remainder rounding, refunds, cancellation, expiry and replay prevention. Local mixed rollback/recovery and an actual Arc swap-funded payment are recorded. | Full payment release matrix, three-recipient/refund gas case and the exact planned live 5-USDC/oUSD18/90–10 demonstration. | Functional locally and in a recorded Arc case |
| **G5 — SDK/backend** | Canonical bigint plans and decoding; fresh wallet reviews; projections and bounded reorg recovery; strategy/invoice/shipment reads; swaps, metrics, quotes, cache and SSE. | Three fresh SDK assertion failures; full archival rebuild/recovery; public API naming/alias contract; current complete backend regression and release validation. | Broadly implemented; specific gaps remain |
| **G6 — Application** | All specified routes plus `/fund`; wallet integration; exact approval and separate transaction reviews; hash recovery; liquidity publication/retirement/docking/replacement; invoice administration; automatic payment input; responsive media/controls. | Authenticated embedded-wallet execution/reconnection; broader replacement/cross-tab recovery; remaining route/activity detail; complete browser/accessibility/performance matrix. | Working application; acceptance incomplete |
| **G7 — Qualification demo** | Persistent local setup and real local browser receipts; recorded Arc deployment, first strategy, swap and invoice. | A single reproducible run demonstrating the full section-18 scenario, plus Privy wallet-to-receipt association and judge-accessible evidence. | Functional demonstration achieved; exact qualification scenario incomplete |
| **G8 — Release candidate** | Many prerequisites already exist: source provenance, bounded tests, bytecode measurements, actual testnet deployment and scoped gas evidence. | Complete fuzz/invariant/mutation campaigns, coverage/static/dependency review, gas/headroom acceptance, production browser measurements and operational packaging. | Not accepted; release campaign remains open |

## Confirmed completed work that should not be rebuilt

### Protocol and live settlement

The active manifest records chain **5042002** and a **project-deployed, unchanged upstream AquaRouter**, distinct from 1inch's canonical address. The [verification record](../../deployments/5042002/verification.json) contains the twelve deployment/renunciation receipts and explicitly retains `releaseAccepted: false`, `privyVerified: false` and `sponsorQualificationVerified: false`.

| Contract | Recorded address |
| --- | --- |
| AquaRouter | `0xE60f79571E7EDba477ff98BAdeE618b5605DF7aE` |
| Orbital router | `0x449420E9042c48Eac6E695020613678aD5A55D41` |
| Payments | `0xf64e4664D534AeA5d240e1E29DAE9E80D2e393d6` |

The [first strategy](../../test/evidence/arc-integration/first-strategy.md) records 10 units of each of the three assets at a 500-ppm fee. The [first swap](../../test/evidence/arc-integration/first-swap.json) records **1 USDC → 0.998491 oUSD6**, a **0.0005-USDC** maker fee and **780,112 receipt gas**. The [first payment](../../test/evidence/arc-integration/first-payment.json) records **0.5 oUSD6 → 0.500507 USDC**, **0.5 USDC** to the merchant, **0.000507 USDC** refunded and **984,804 receipt gas**. Both recorded financial actions have no crossings.

These are retained September 9 financial observations, inspected offline during this audit. Their current canonicality, balances and live services were not freshly checked. The first swap is a useful actual sub-2M-gas observation; it does not establish worst-case traversal or payment gas acceptance.

### Application and backend integration

The following are implemented despite older “next work” statements: public swap/payment quoting, bounded quote caching, invoice reads/history, invoice creation and cancellation, automatic payment input calculation, standalone swap approval/review/receipt recovery, strategy publication and reload resumption, registered and incomplete shipment history, retirement/docking/replacement controls, demo-token funding, and a persistent local stack.

Same-action repricing is also implemented in [transactionPort.ts](../../apps/web/src/wallet/transactionPort.ts). It binds original sender/nonce and exact target/calldata/value. Recovery when the original transaction cannot be authenticated and broader cancellation/replacement/cross-tab scenarios remain limitations; “replacement support is wholly absent” would be inaccurate.

## Concrete findings and remaining work

### 1. The current SDK regression suite is not green

Fresh isolated execution of every SDK test file produced **136 tests: 133 pass, 3 fail**. All failures are stale ABI-size expectations:

| Failing assertion | Evidence |
| --- | --- |
| [events.test.ts](../../packages/sdk/test/events.test.ts), line 28 | Expected Aqua ABI length 2; actual length 3 |
| [payment-read-abi.test.ts](../../packages/sdk/test/payment-read-abi.test.ts), line 14 | Expected `[2,6,2,4]`; actual `[2,6,3,4]` |
| [swap-events.test.ts](../../packages/sdk/test/swap-events.test.ts), line 28 | Same function-group length mismatch |

[Generated ABI provenance](../../packages/sdk/src/generated/provenance.json) selects `dock`, `rawBalances` and `ship` for Aqua. The failures do not demonstrate wrong swap math or corrupted event decoding; the expected interface contract in these three tests is behind the current generated export. Confirm the intended three-function surface, reconcile these assertions and rerun the SDK suite. Do not remove the live read getter merely to recover the historical count. No test was edited by this audit.

### 2. The mathematical engine still has known acceptance gaps

The [release-gap review](RELEASE_GAP_REVIEW.md) remains useful, but must be read alongside the later [128/128 mixed pilot](../../test/evidence/mixed-pilot.md): that proposed pilot and its named lower-sheet reversal repair are already done.

Current [FrontierComposition](../../packages/contracts/src/libraries/FrontierComposition.sol) still performs initial root discovery with zero midpoint refinement, requires strictly ordered arc boxes and only resumes the final root. Consequently, the documented coarse-initial-bracket case is still a real liveness task. [FrontierSchedule](../../packages/contracts/src/libraries/FrontierSchedule.sol) and the retained tests also preserve conservative ideal-event equality/touch/overlap deferrals.

Remaining work is to implement and prove the necessary one-sided equality/departure rules and authenticated initial refinement, then measure acceptance across independently valid configurations. A safe rejection is not proof that a valid trade cannot exist. The all-interior solver already handles its named zero-output-normal sphere departure; that successful special case must not be reported as missing.

The larger acceptance gap is coverage: mixed valid-action histories across dimensions/ticks, independently constructed state propagation, repeated economic cycles accounting for existing funded slack, depeg/repeg distributions, and the required successful inward/outward crossing totals. Neither 404 passing contract tests nor the 128-action pilot closes those distributions.

### 3. Gas and release campaigns remain incomplete

Current compiled runtime lengths are below 24,576 bytes: router **22,221**, storage **23,240**, composition **23,138**, endpoint **22,826**, settlement **6,658**, payments **12,097**. Storage has only **1,336 bytes** of headroom; future engine changes need a complete graph size check.

The retained n8/eight-tick diagnostic calls use **18,368,590** and **17,623,174 gas before full settlement**. The repository's proposed 16,777,216 transaction cap is explicitly provisional, not verified target acceptance. Measure the actual target transaction budget, then satisfy the master's 20% headroom requirement for a worst supported complete traversal. Also finish the default double-crossing and three-recipient invoice/refund measurements. Existing ordinary Arc receipts do not replace these cases.

The configured CI/release Foundry profiles are not completed campaigns. Still required are current-source mixed stateful coverage, the complete relevant 2,048-case/256×128 CI distribution, three-seed 10,000-case/1,024×256 release distribution, the ten named semantic mutants, retained applicable numerical mutants, and coverage/static/dependency/compiler/storage review. There is no complete independent security audit in the evidence reviewed.

### 4. Privy and the exact judging scenario are unfinished

The provider integration includes login, wallet creation hooks, connector selection, error recovery and user-controlled signing through common ports. Recorded public login UI and offline sender matching are useful but do not prove an authenticated embedded wallet. [The association check](../../test/evidence/privy-association-basic/README.md) correctly leaves provider association unverified; the chain receipt alone cannot determine wallet kind.

Finish creation/selection, reconnect, signature rejection and successful embedded-wallet swap/payment observations with a public wallet-to-receipt association. The automatic-input payment UI also needs a fresh live demonstration; the existing live payment predates that UI change.

The exact master demonstration additionally requires two makers with Balanced/Wide strategies, all six pairs, a real inward/outward crossing, custody and fee evidence, donation/limited-inventory recovery, retirement/docking isolation, and a **5-USDC invoice paid from oUSD18 with a 4.5/0.5-USDC split**, refund and replay rejection.

[judge-demo.ts](../../packages/sdk/scripts/judge-demo.ts) currently validates seeded local records and writes links/manual steps. It does not execute or assert that full nine-step scenario. Individual contract tests cover many pieces, but they are not a single completed qualification run. Assemble that run and its evidence without repeating already-completed deployment transactions. Before submission, verify judge access to repository/evidence links; the previous frontend evidence records a logged-out GitHub 404, not confirmed public access.

### 5. Operational and API deliverables are partial

| Item | Current behavior | Remaining deliverable |
| --- | --- | --- |
| Full index rebuild | [Indexer entry point](../../apps/indexer/src/index.ts), line 9, explicitly throws on `--replay`. Automatic bounded rollback/replay exists. | Reviewed archival rebuild/resync recovery with reproducible coverage and restart validation |
| Lint | `node scripts/gate.mjs lint` exits 1 because configuration is absent. | A real configured check, or an explicit accepted plan revision |
| Invariant command | `node scripts/gate.mjs test:invariants` exits 1 and describes the incomplete release matrix. Scoped real invariants exist. | Expose/run the required campaign without substituting a smaller passing scope |
| Public API names | Business endpoints have `/api/v1` aliases. Health, readiness, proof and events do not. `/manifest` is absent; clients use `/deployment`. | Reconcile the master's public API contract and implementation |
| Deployment manifest shape | Current shared manifest primarily contains verification boolean, chain/addresses/provider, start block and tokens. Rich source/opcode/release metadata lives in separate evidence. | Reconcile the promised public manifest metadata with the served contract |
| Production packaging | [Dockerfile](../../Dockerfile) is explicitly a development image running `tsx`/watch workflows. Compose starts API/web/Postgres/Anvil; host runners provide the indexer. | Reproducible production web/API/indexer packaging and deployment configuration; a public hosting deployment was not established by this audit |
| Automated acceptance | No repository CI workflow was found. `test:all` does not run types, build, lint or the full invariant/mutation release gate. | Wire an honest automated check set; a successful `test:all` alone must not be called G8 acceptance |

A fresh Fastify injection check returned **404** for `/api/v1/health`, `/api/v1/ready`, `/manifest`, `/api/v1/manifest`, `/api/v1/proof` and `/api/v1/events`. Unversioned health/proof returned 200; existing dependency-sensitive routes returned their expected unconfigured 503. This confirms contract drift, not a failure of the client's currently used routes.

### 6. Application acceptance still exceeds existing smoke coverage

The current route code has real financial controllers and receipt handling. Remaining plan details include fuller swap route classification/availability, strategy recent-swap activity, and the planned balance/allowance summary at the initial LP asset step. The LP form currently lists asset names/precision there; checked transaction reviews exist later. Exact quantized configuration is shown during publication. Layout or illustration choices alone should not create a new protocol backlog.

Complete the release checks at the five specified viewport sizes, 200% zoom/mobile keyboard, keyboard and screen-reader flows, reduced motion, and Chromium/Firefox/WebKit. Current Playwright configuration does not define a three-browser matrix; retained complete browser counts are Chromium fixture checkpoints, followed by narrower later smoke runs. Measure production LCP, CLS, interaction long tasks and gzip route budgets instead of reusing development screenshots as performance evidence.

### 7. Preserve the distinction introduced by the current uncommitted Arc test mode

The existing working-tree changes add `ORBITAL_SKIP_DEPLOYMENT_VERIFICATION` and `ORBITAL_TEST_START_BLOCK`. The former can skip fresh artifact verification; the latter deliberately excludes earlier indexed history and requires the opt-out. Defaults retain the original start block and verification path. The focused helper check passes **1/1**.

These changes were not made by this audit. A runtime derived from the opt-out still inherits the saved manifest's `verified` boolean, while the warning is in startup output. Treat this as a test-profile/labeling limitation: do not present opt-out startup as a fresh deployment verification or a cutoff index as complete historical activity. Reconcile the profile's public status with the normal manifest and coverage promises before relying on it for qualification evidence. No environment file was opened to determine whether either flag is currently enabled.

## Documentation reconciliation

The documentation contains both deliberately retained history and unqualified stale summaries. Preserve historical evidence and its source hashes; update current status entry points rather than rewriting old results.

| Location | Stale or confusing statement | Current interpretation |
| --- | --- | --- |
| [README](../../README.md), implemented-scope sections | “Arc remains unconfigured” and later “Arc deployment … remain unverified” coexist with the opening successful Arc receipts. | Recorded project Arc deployment and financial actions are complete; Privy/release remain open. |
| [ARC_DEPLOYMENT](../ARC_DEPLOYMENT.md), opening summary | Says no live strategy, swap or invoice is demonstrated yet. | Superseded by first-strategy, first-swap and first-payment evidence. |
| [FRONTEND](../FRONTEND.md), current implementation map | Calls strategy publication a guarded preview and replacements unfinished, before newer connected-workflow sections. | Publication/resumption and constrained same-action replacement handling exist. Wider acceptance remains open. |
| [PROGRESS](../../PROGRESS.md) / [evidence index](../../test/evidence/INDEX.md) | New 404-contract/129-reference checkpoint coexists with “latest” 398-test rows and predeployment next actions. | Treat old counts as source-bound history. Current SDK result in this audit is 133/136, not the old 129-pass checkpoint. |
| [RELEASE_GAP_REVIEW](RELEASE_GAP_REVIEW.md) | Recommends creating the mixed pilot and repairing documentation that was subsequently updated. | Pilot/lower-sheet recovery is done; equality, discovery, mixed histories and campaigns are still open. |
| [PAYMENT_QUOTE_PLAN](PAYMENT_QUOTE_PLAN.md) and older evidence notes | Retained proposal/early checkpoint says endpoint or financial integrations are absent. | Its historical proposal is explicitly superseded. Current endpoint, cache and wallet flow are implemented. |
| Original SPEC/PLAN | Documentation-only P0–P8, pooled custody, LP shares and locked anchor. | Explicit historical architecture, not incomplete work for the Aqua product. |

One concise current gate table with dated links should become the handoff entry point. Keep the detailed numerical and historical evidence as supporting material; do not infer completion by adding together test counts from different source versions.

## Fresh verification performed for this audit

| Check | Actual result | Scope/qualification |
| --- | --- | --- |
| Workspace TypeScript | **Pass: six packages** | `pnpm --manage-package-manager-versions=false -r --if-present typecheck` |
| Contract suite | **404 pass, 0 fail, 0 skip; 47 suites** | `forge test --root packages/contracts`; 119.19 seconds; existing default fuzz/invariant settings |
| Reference suite | **129 pass** | `PYTHONPATH=/tmp/aqua-audit-python python -m unittest discover -s packages/reference/tests -v`; 21.682 seconds |
| Shared schemas | **7 pass, 0 fail** | All three test files executed separately using `node --import tsx test/<file>.test.ts` |
| SDK | **133 pass, 3 fail; 136 total** | All nineteen test files executed separately with the same direct Node/tsx loader; failures listed above |
| API route contract | **Missing aliases reproduced** | Thirteen read-only Fastify `inject` requests; no database or chain mutation |
| Current Arc test-profile helper | **1 pass** | `node scripts/test/arc-test-profile.test.mjs` |
| Lint / full invariant gate commands | **Both exit 1** | Explicit unavailable/incomplete gates, not failed financial assertions |
| Compiled bytecode sizes | **Named production artifacts below EIP-170** | Existing compiler artifact lengths; not a fresh live runtime check |

Environment: Node **22.22.1**, global pnpm **10.24.0**, Forge **1.5.0-stable**, Python **3.13.12**. The documented target uses pnpm **10.34.5**, Foundry **1.5.1** and Python **3.12**. Thus these are useful fresh working-tree checks, not the pinned release qualification run.

Initial `pnpm typecheck` failed during package-manager bootstrap into a non-writable user directory. Typechecking succeeded with automatic package-manager management disabled. The `tsx` CLI test commands hit a sandbox IPC permission error; direct per-file Node loader execution exposed the real assertions and full counts. Initial reference execution lacked mpmath; the repository-pinned **mpmath 1.3.0** was installed only into `/tmp/aqua-audit-python`, after which the full suite passed. Repository dependencies and lockfile were not changed.

Full API/PostgreSQL/indexer regression, a production build, browser E2E, upstream stock/fork regression, full CI/release campaigns and live Arc/Privy observations were **not rerun**. Their historical evidence was reviewed, and none is promoted to a fresh pass here.

## Recommended completion order

1. **Restore a trustworthy current check baseline:** resolve the three stale SDK assertions, run under the pinned environment, and reconcile current status summaries/API naming. Preserve historical artifacts.
2. **Close the application/qualification demonstration:** verify the actual Privy embedded wallet and updated payment flow; complete and record the exact two-maker/all-pairs/crossing/5-USDC split scenario; make its evidence accessible to judges.
3. **Finish genuine operational gaps:** archival index rebuild/resync, explicit test-profile labeling, production packaging and automated checks. Complete remaining useful route/activity data and wallet recovery acceptance.
4. **Close protocol acceptance deliberately:** initial-root/equality liveness, broad mixed differential and economic histories, complete security/mutation campaigns and worst-supported gas/headroom. Preserve the existing certified-path behavior and retained counterexamples.
5. **Run the full frozen release matrix:** correct toolchain, current source identity, complete browser/accessibility/performance measurements and an updated evidence manifest. Close G8 only when each required criterion has evidence or an explicitly accepted scope change.

Do not add a custodial pool, pooled shares, fee collection escrow, mainnet support, exact-output swaps, route splitting, arbitrary assets, cross-chain products or backend signing to satisfy this backlog: those are outside the active scope.

## Markdown inventory

The following inventory was captured before this audit file was created. It excludes `FRONTEND-specs/` and dependency/build caches.

<details>
<summary>159 repository Markdown files</summary>

- [MASTER_PROMPT.md](../../MASTER_PROMPT.md)
- [PROGRESS.md](../../PROGRESS.md)
- [README.md](../../README.md)
- [SPEC.md](../../SPEC.md)
- [apps/api/test/database-recovery.md](../../apps/api/test/database-recovery.md)
- [apps/indexer/test/arc-rpc-recovery.md](../../apps/indexer/test/arc-rpc-recovery.md)
- [apps/indexer/test/batch-throughput.md](../../apps/indexer/test/batch-throughput.md)
- [apps/indexer/test/range-throughput.md](../../apps/indexer/test/range-throughput.md)
- [apps/web/AGENTS.md](../../apps/web/AGENTS.md)
- [apps/web/CLAUDE.md](../../apps/web/CLAUDE.md)
- [deployments/31337/README.md](../../deployments/31337/README.md)
- [docs/AQUA_RESEARCH.md](../AQUA_RESEARCH.md)
- [docs/ARC_DEMO.md](../ARC_DEMO.md)
- [docs/ARC_DEPLOYMENT.md](../ARC_DEPLOYMENT.md)
- [docs/ARC_DEPLOYMENT_STATUS.md](../ARC_DEPLOYMENT_STATUS.md)
- [docs/ARC_RESEARCH.md](../ARC_RESEARCH.md)
- [docs/ASSETS.md](../ASSETS.md)
- [docs/DECISIONS.md](../DECISIONS.md)
- [docs/FRONTEND.md](../FRONTEND.md)
- [docs/LOCAL_DEMO.md](../LOCAL_DEMO.md)
- [docs/MATH.md](../MATH.md)
- [docs/NUMERICS.md](../NUMERICS.md)
- [docs/PAPER_IMPLEMENTATION.md](../PAPER_IMPLEMENTATION.md)
- [docs/PLAN.md](../PLAN.md)
- [docs/PRIVY_RESEARCH.md](../PRIVY_RESEARCH.md)
- [docs/TESTS.md](../TESTS.md)
- [docs/audits/COMPOSITION_GAS.md](COMPOSITION_GAS.md)
- [docs/audits/CURVE_EVALUATION.md](CURVE_EVALUATION.md)
- [docs/audits/ENDPOINT_IDENTIFICATION.md](ENDPOINT_IDENTIFICATION.md)
- [docs/audits/FRONTIER_COMPOSITION.md](FRONTIER_COMPOSITION.md)
- [docs/audits/FRONTIER_EVENTS.md](FRONTIER_EVENTS.md)
- [docs/audits/FRONTIER_SCHEDULE.md](FRONTIER_SCHEDULE.md)
- [docs/audits/FRONTIER_SEGMENT.md](FRONTIER_SEGMENT.md)
- [docs/audits/GRID_RELEASE.md](GRID_RELEASE.md)
- [docs/audits/LINKED_MATH.md](LINKED_MATH.md)
- [docs/audits/LOWER_SHEET_PROPOSAL.md](LOWER_SHEET_PROPOSAL.md)
- [docs/audits/LOWER_SHEET_REVIEW.md](LOWER_SHEET_REVIEW.md)
- [docs/audits/MIXED_ROUTER_INTEGRATION.md](MIXED_ROUTER_INTEGRATION.md)
- [docs/audits/NEGATIVE_PRICE_EXCLUSION.md](NEGATIVE_PRICE_EXCLUSION.md)
- [docs/audits/OUTWARD_RETENTION_PROPOSAL.md](OUTWARD_RETENTION_PROPOSAL.md)
- [docs/audits/PAYMENT_QUOTE_PLAN.md](PAYMENT_QUOTE_PLAN.md)
- [docs/audits/PAYMENT_SEARCH_POLICY.md](PAYMENT_SEARCH_POLICY.md)
- [docs/audits/PAYMENT_SEARCH_REVIEW.md](PAYMENT_SEARCH_REVIEW.md)
- [docs/audits/PAYMENT_SERVICE_REVIEW.md](PAYMENT_SERVICE_REVIEW.md)
- [docs/audits/PAYOUT_REFINEMENT.md](PAYOUT_REFINEMENT.md)
- [docs/audits/RELEASE_GAP_REVIEW.md](RELEASE_GAP_REVIEW.md)
- [docs/audits/ROOT_CERTIFICATE.md](ROOT_CERTIFICATE.md)
- [docs/audits/SLACK_SEAM.md](SLACK_SEAM.md)
- [docs/audits/SLACK_SEGMENT.md](SLACK_SEGMENT.md)
- [docs/audits/archive/PAYMENT_QUOTE_PLAN-preimplementation.md](archive/PAYMENT_QUOTE_PLAN-preimplementation.md)
- [packages/contracts/vendor/aqua/README.md](../../packages/contracts/vendor/aqua/README.md)
- [packages/contracts/vendor/forge-std/README.md](../../packages/contracts/vendor/forge-std/README.md)
- [packages/contracts/vendor/swap-vm-orbital/README.md](../../packages/contracts/vendor/swap-vm-orbital/README.md)
- [packages/contracts/vendor/swap-vm/README.md](../../packages/contracts/vendor/swap-vm/README.md)
- [test/evidence/INDEX.md](../../test/evidence/INDEX.md)
- [test/evidence/arc-integration.md](../../test/evidence/arc-integration.md)
- [test/evidence/arc-integration/deployment-and-rpc.md](../../test/evidence/arc-integration/deployment-and-rpc.md)
- [test/evidence/arc-integration/first-strategy.md](../../test/evidence/arc-integration/first-strategy.md)
- [test/evidence/arc-integration/index-freshness.md](../../test/evidence/arc-integration/index-freshness.md)
- [test/evidence/arc-integration/provider-recovery.md](../../test/evidence/arc-integration/provider-recovery.md)
- [test/evidence/artifact-integrity.md](../../test/evidence/artifact-integrity.md)
- [test/evidence/backend-api.md](../../test/evidence/backend-api.md)
- [test/evidence/backend-reorg.md](../../test/evidence/backend-reorg.md)
- [test/evidence/browser-rpc/README.md](../../test/evidence/browser-rpc/README.md)
- [test/evidence/curve-primitives.md](../../test/evidence/curve-primitives.md)
- [test/evidence/demo-dollar.md](../../test/evidence/demo-dollar.md)
- [test/evidence/dual-certificate.md](../../test/evidence/dual-certificate.md)
- [test/evidence/engine-basic/README.md](../../test/evidence/engine-basic/README.md)
- [test/evidence/engine-suite/README.md](../../test/evidence/engine-suite/README.md)
- [test/evidence/fee-instruction.md](../../test/evidence/fee-instruction.md)
- [test/evidence/frontend-design.md](../../test/evidence/frontend-design.md)
- [test/evidence/frontend-polish/README.md](../../test/evidence/frontend-polish/README.md)
- [test/evidence/frontier-composition.md](../../test/evidence/frontier-composition.md)
- [test/evidence/frontier-endpoint.md](../../test/evidence/frontier-endpoint.md)
- [test/evidence/frontier-schedule.md](../../test/evidence/frontier-schedule.md)
- [test/evidence/frontier-turn.md](../../test/evidence/frontier-turn.md)
- [test/evidence/initializer-oracle.md](../../test/evidence/initializer-oracle.md)
- [test/evidence/interior-execution.md](../../test/evidence/interior-execution.md)
- [test/evidence/interior-stateful.md](../../test/evidence/interior-stateful.md)
- [test/evidence/interior-swap.md](../../test/evidence/interior-swap.md)
- [test/evidence/interval-math.md](../../test/evidence/interval-math.md)
- [test/evidence/invoice-admin.md](../../test/evidence/invoice-admin.md)
- [test/evidence/invoice-admin/initial-disposition.md](../../test/evidence/invoice-admin/initial-disposition.md)
- [test/evidence/invoice-detail-ui.md](../../test/evidence/invoice-detail-ui.md)
- [test/evidence/invoice-reads.md](../../test/evidence/invoice-reads.md)
- [test/evidence/linked-math-promotion.md](../../test/evidence/linked-math-promotion.md)
- [test/evidence/linked-math.md](../../test/evidence/linked-math.md)
- [test/evidence/local-deployment.md](../../test/evidence/local-deployment.md)
- [test/evidence/local-integration.md](../../test/evidence/local-integration.md)
- [test/evidence/logo-motion/README.md](../../test/evidence/logo-motion/README.md)
- [test/evidence/materialization-readiness.md](../../test/evidence/materialization-readiness.md)
- [test/evidence/materialization.md](../../test/evidence/materialization.md)
- [test/evidence/math-proofreading.md](../../test/evidence/math-proofreading.md)
- [test/evidence/metrics.md](../../test/evidence/metrics.md)
- [test/evidence/mixed-execution.md](../../test/evidence/mixed-execution.md)
- [test/evidence/mixed-invoice.md](../../test/evidence/mixed-invoice.md)
- [test/evidence/mixed-pilot.md](../../test/evidence/mixed-pilot.md)
- [test/evidence/negative-price.md](../../test/evidence/negative-price.md)
- [test/evidence/numerics.md](../../test/evidence/numerics.md)
- [test/evidence/outward-retention-promotion.md](../../test/evidence/outward-retention-promotion.md)
- [test/evidence/outward-retention.md](../../test/evidence/outward-retention.md)
- [test/evidence/payment-automatic/README.md](../../test/evidence/payment-automatic/README.md)
- [test/evidence/payment-endpoint.md](../../test/evidence/payment-endpoint.md)
- [test/evidence/payment-flow.md](../../test/evidence/payment-flow.md)
- [test/evidence/payment-flow/edge-red-receipt-context.md](../../test/evidence/payment-flow/edge-red-receipt-context.md)
- [test/evidence/payment-flow/preliminary-notes.md](../../test/evidence/payment-flow/preliminary-notes.md)
- [test/evidence/payment-flow/preliminary-reload-context.md](../../test/evidence/payment-flow/preliminary-reload-context.md)
- [test/evidence/payment-foundation.md](../../test/evidence/payment-foundation.md)
- [test/evidence/payout-refinement.md](../../test/evidence/payout-refinement.md)
- [test/evidence/pilot-gas.md](../../test/evidence/pilot-gas.md)
- [test/evidence/pilot-gas/contract.md](../../test/evidence/pilot-gas/contract.md)
- [test/evidence/privy-association-basic/README.md](../../test/evidence/privy-association-basic/README.md)
- [test/evidence/quote-cache.md](../../test/evidence/quote-cache.md)
- [test/evidence/quote-read-sdk.md](../../test/evidence/quote-read-sdk.md)
- [test/evidence/quote-refresh/README.md](../../test/evidence/quote-refresh/README.md)
- [test/evidence/quote-rpc.md](../../test/evidence/quote-rpc.md)
- [test/evidence/quote-service.md](../../test/evidence/quote-service.md)
- [test/evidence/reachable-traversal.md](../../test/evidence/reachable-traversal.md)
- [test/evidence/root-bracket.md](../../test/evidence/root-bracket.md)
- [test/evidence/route-selection.md](../../test/evidence/route-selection.md)
- [test/evidence/router-lifecycle.md](../../test/evidence/router-lifecycle.md)
- [test/evidence/router-settlement-security.md](../../test/evidence/router-settlement-security.md)
- [test/evidence/router-size-refactor.md](../../test/evidence/router-size-refactor.md)
- [test/evidence/sdk-events.md](../../test/evidence/sdk-events.md)
- [test/evidence/sdk-plans.md](../../test/evidence/sdk-plans.md)
- [test/evidence/seed-proposal.md](../../test/evidence/seed-proposal.md)
- [test/evidence/self-arc-integration.md](../../test/evidence/self-arc-integration.md)
- [test/evidence/settlement.md](../../test/evidence/settlement.md)
- [test/evidence/shared-inventory-mixed.md](../../test/evidence/shared-inventory-mixed.md)
- [test/evidence/shared-inventory.md](../../test/evidence/shared-inventory.md)
- [test/evidence/slack-grid-release.md](../../test/evidence/slack-grid-release.md)
- [test/evidence/slack-segment-differential.md](../../test/evidence/slack-segment-differential.md)
- [test/evidence/sphere-step.md](../../test/evidence/sphere-step.md)
- [test/evidence/strategy-admin.md](../../test/evidence/strategy-admin.md)
- [test/evidence/strategy-read.md](../../test/evidence/strategy-read.md)
- [test/evidence/strategy-read/interruption.md](../../test/evidence/strategy-read/interruption.md)
- [test/evidence/strategy-read/type-failure.md](../../test/evidence/strategy-read/type-failure.md)
- [test/evidence/strategy-reads.md](../../test/evidence/strategy-reads.md)
- [test/evidence/strategy-rpc.md](../../test/evidence/strategy-rpc.md)
- [test/evidence/swap-controls.md](../../test/evidence/swap-controls.md)
- [test/evidence/swap-controls/deadline-label-context.md](../../test/evidence/swap-controls/deadline-label-context.md)
- [test/evidence/swap-controls/initial-contexts/swap-controls-saved-slippa-04281-review-and-reset-explicitly.md](../../test/evidence/swap-controls/initial-contexts/swap-controls-saved-slippa-04281-review-and-reset-explicitly.md)
- [test/evidence/swap-controls/initial-contexts/swap-controls-swap-starts--9d744--documented-device-defaults.md](../../test/evidence/swap-controls/initial-contexts/swap-controls-swap-starts--9d744--documented-device-defaults.md)
- [test/evidence/swap-controls/initial-contexts/swap-edits-clear-the-previ-a55c3-responses-expose-no-amounts.md](../../test/evidence/swap-controls/initial-contexts/swap-edits-clear-the-previ-a55c3-responses-expose-no-amounts.md)
- [test/evidence/swap-controls/initial-contexts/swap-quote-freshness-expir-68f36-s-a-new-checked-observation.md](../../test/evidence/swap-controls/initial-contexts/swap-quote-freshness-expir-68f36-s-a-new-checked-observation.md)
- [test/evidence/swap-controls/preliminary-notes.md](../../test/evidence/swap-controls/preliminary-notes.md)
- [test/evidence/swap-flow.md](../../test/evidence/swap-flow.md)
- [test/evidence/swap-flow/preliminary-notes.md](../../test/evidence/swap-flow/preliminary-notes.md)
- [test/evidence/swap-flow/swap-execution-docked-or-c-eb27d-es-cannot-enter-swap-review.md](../../test/evidence/swap-flow/swap-execution-docked-or-c-eb27d-es-cannot-enter-swap-review.md)
- [test/evidence/swap-flow/swap-execution-standalone--5891d-eload-without-signing-again.md](../../test/evidence/swap-flow/swap-execution-standalone--5891d-eload-without-signing-again.md)
- [test/evidence/swap-flow/swap-execution-standalone--b7390-ceipt-amounts-and-crossings.md](../../test/evidence/swap-flow/swap-execution-standalone--b7390-ceipt-amounts-and-crossings.md)
- [test/evidence/swap-flow/swap-execution-standalone--c0879-amount-without-a-saved-hash.md](../../test/evidence/swap-flow/swap-execution-standalone--c0879-amount-without-a-saved-hash.md)
- [test/evidence/swap-flow/swap-execution-standalone--f9461-re-requesting-any-signature.md](../../test/evidence/swap-flow/swap-execution-standalone--f9461-re-requesting-any-signature.md)
- [test/evidence/swap-flow/swap-execution-success-wit-5793d-ment-event-stays-unresolved.md](../../test/evidence/swap-flow/swap-execution-success-wit-5793d-ment-event-stays-unresolved.md)
- [test/evidence/swap-materialization.md](../../test/evidence/swap-materialization.md)
- [test/evidence/swap-observation-ui.md](../../test/evidence/swap-observation-ui.md)
- [test/evidence/swap-quote-http.md](../../test/evidence/swap-quote-http.md)
- [test/evidence/upstream-regression.md](../../test/evidence/upstream-regression.md)
- [test/evidence/wide-performance.md](../../test/evidence/wide-performance.md)

</details>
