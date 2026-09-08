# Evidence index

Updated 2026-09-08. Initially all checks were not started. The table below records actual partial implementation; **no G1–G8 acceptance is claimed**. A gate is verified only when all its required evidence exists.

| Requirement | Status | Implementation / evidence | Blocker |
| --- | --- | --- | --- |
| G0 tools/sources | Local scaffold pass | [toolchain](toolchain.json), [upstream hashes](upstream.json), [frozen offline install](install.txt), [container build](docker-build.txt), [container startup](docker-runtime.json), docs/sources/orbital.json | Original pnpm/Docker failures repaired; Arc identity remains explicitly unverified |
| Reference geometry/duality/crossings | 15 tests pass | `python scripts/audit-reference.py`; [run manifest](reference-audit/manifest.json), [raw results](reference-audit/tests.txt); red: reference-red.txt/events-red.txt | Bounded numerical evidence, not complete production certification |
| Wide math / coefficients / endpoint | Unit/local fuzz pass | `pnpm test:contracts`; [contracts](contracts.txt); red: widemath-red.txt/geometry-red.txt/certificate-red.txt; [partial numerical report](numerics.md) | Signed intervals, full engine, path/slack and output error bound |
| Minimal fork / pair seam / Aqua rollback | 3 probe tests pass | [diff](fork.patch), [hashes](fork.json), contracts.txt; red: fork-red.txt | Probe has fixed test output; does not prove Orbital curve/custom opcode execution or full upstream regression compatibility |
| Invoice direct / swap-funded adapter | 7 tests pass | contracts.txt; Payments.t.sol/PaymentSwap.t.sol; red: payments-red.txt | Swap-funded tests use test-only router; full PAY campaign and real Orbital settlement outstanding |
| SDK encoding / wallet execution boundary | 10 tests pass | `pnpm test:sdk`; [results](sdk-green.txt); red: sdk-red.txt/execution-red.txt | Fixture ports test gas/rejections/account changes/recovery; full transaction builder/DTO/ABI goldens outstanding |
| API request guards | 3 tests pass | `pnpm test:backend`; [results](backend.txt) | Financial APIs explicitly unavailable; no quoting/metrics/materialization claim |
| PostgreSQL raw ingestion | 1 real DB test passes | `TEST_DATABASE_URL=… pnpm --filter @orbital/db test`; [results](database.txt) | Reorg/replay/materialization/receipt metrics outstanding |
| Frontend build/types | Pass | `pnpm --filter @orbital/web build`, `pnpm typecheck`; [build](web-build.txt), [types](typecheck.txt) | Full financial controllers, publication resume and performance/a11y campaigns outstanding |
| Responsive/external fixture browser tests | 4 tests passed on isolated profile | `pnpm test:e2e`; [results](browser.txt), [desktop](landing-desktop.png); cold timeout retained in browser-cold-timeout.txt | Chromium only; fixture identity is not Privy or live-chain evidence; no production latency claim |
| Privy public login UI | Observed pass | [observation](privy-login.json), [screenshot](privy-login.png) | Real wallet creation/reconnection, rejected hosted signature, swap and invoice receipts outstanding |
| Arc identity / deployment | Unverified; no transaction submitted | [network observation](../../deployments/5042002/verification.json) | Candidate Aqua runtime empty at recorded block; official source identity and authorized target signer unresolved |
| G7 demo / G8 release | Not run | MASTER_PROMPT.md requirement matrix | Full contracts/application, campaigns, traces, receipts and deployment artifacts outstanding |

The local fuzz profile is not the specified 2,048-case CI or three-seed 10,000-case release campaign. No invariant or mutation suite has passed. A red log may record an expected pre-implementation compile failure; green claims refer to the later explicit results above. Source hashing via `pnpm evidence:build` establishes file identity only, not successful execution.

Private keys, identity credentials and authentication responses never belong in evidence.
