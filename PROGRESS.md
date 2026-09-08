# Orbital progress

Updated 2026-09-08. Status records observed implementation, never planned success.

| Gate | Status | Next evidence |
| --- | --- | --- |
| Documentation | Implemented; maintained during build | Master reconciled; focused guides and evidence map created |
| G0 scaffold | Complete locally | Frozen toolchain, pinned/licensed sources, interfaces, meaningful red/green tests, Docker API/web startup, PostgreSQL and Cancun Anvil verified; Arc identity explicitly unresolved |
| G1 mathematics | In progress; acceptance blocked | 15 independent reference regressions; wide arithmetic, cap coefficients and endpoint certificates. Connected rounded-state solver and complete numerical proofs outstanding |
| G2 SwapVM extension | In progress; depends on G1 | Minimal resolver/hooks fork and six-pair seam tests. Production router, state lifecycle and actual 0x72/0x52 curve execution outstanding |
| G3 Aqua settlement | In progress; depends on G2 | Unmodified official Aqua used in fork settlement tests; complete Orbital lifecycle/delta/reentrancy suites outstanding |
| G4 Arc payments | In progress | Direct USDC adapter and swap-funded adapter unit tests; swap test uses a router double. Real Orbital/Arc integration outstanding |
| G5 SDK/backend | In progress | Encoding, transaction recovery, API guards and atomic PostgreSQL raw ingestion; materialization, reorg replay, quoting and metrics outstanding |
| G6 application | In progress | All routes scaffolded, editable presentation/controller split, Privy login UI verified, external fixture browser tests. Full transaction workflows and live embedded-wallet execution outstanding |
| G7 demo | Not started | Receipts and source-linked requirement matrix |
| G8 release | Not started | Full campaigns, limits, gas, accessibility/performance |

## Environment and external dependencies

- Initial inspection: Node 22.18.0, Python 3.12, Foundry 1.5.1 available.
- Initial global pnpm shim attempted unavailable pnpm 12.3.4. Repaired by pinning project-local pnpm 10.34.5 and retaining the exact lockfile.
- Docker engine was initially unavailable. Docker Desktop was started; PostgreSQL and Cancun Anvil now run. The isolated PostgreSQL integration test and Docker API/web startup checks pass. Temporary app test containers were stopped; the main production preview and host API remain available.
- Arc RPC/chain ID/USDC decimals were observed. The candidate Aqua address had **empty runtime code** at the recorded block; official Arc deployment identity remains unresolved. See deployments/5042002/verification.json.
- Owner supplied public Privy app ID `cmtrvczqp00qh0cjv4b16j1ag`; configured in ignored apps/web/.env.local. Email/external-wallet login UI opens at http://127.0.0.1:3002. No authenticated embedded wallet, signing or reconnection has been verified.
- No live deployment or funding has been performed.

## Working log

- Started the accepted docs-then-build plan. Existing repository contained only specifications and research notes; Git working tree was clean.
- Retained authenticated paper HTML locally with source hashes and mathematical extraction metadata. Added explicit support minimizers, numerical dual/primal witness checks, precision-stable fixtures, and both-root crossing diagnostics.
- Preserved two counterexamples: flooring can violate reconstructed boundary prices; a proposed vertical slack-release path can leave/reenter the reconstruction sheet between otherwise valid checks. These block acceptance of that proposed solver path, not evidence of a deployed exploit.
- Implemented 512-bit primitives, directed tick coefficients, endpoint certificates, and the invoice adapter. The endpoint library is explicitly not a complete swap solver.
- Modified only SwapVM.sol in the retained fork; default pair resolution and settlement code remain intact. Tests use official Aqua and a named fixed-output probe, not an Orbital execution claim.
- Built the responsive Next frontend; corrected a 320px wizard overflow. Privy follows its documented wagmi provider integration with explicit active-wallet selection. Presentation does not build swap calldata.

## Latest verification

- Solidity: 27 tests passed, including four fuzz entry points at the local profile (not the required release campaign).
- Reference: 15 tests passed; 110/160-digit stability where recorded; explicit basket checks at n=2,3,4,8,16,32. n>8 is reference-only.
- SDK: 10 tests passed, including rejected signatures, wrong network, gas, account changes and receipt recovery with fixture ports.
- API: 3 tests passed, including exact-origin CORS checks. PostgreSQL: 1 isolated real-database integration test passed.
- Browser: 4 tests passed on the unconfigured-Privy development profile: navigation, guarded preview, 320px overflow and external injected-wallet fixture/keyboard dialog.
- Public Privy login rendered successfully with the supplied app ID; no authentication or financial-flow qualification is claimed.
- Production frontend build and workspace TypeScript checks passed with the wallet/controller refinements. The final isolated browser rerun passed all 4 checks; earlier cold-compilation timeouts are retained separately and do not count as a production performance check.
- Docker image build and API/web startup checks passed; see test/evidence/docker-build.txt and docker-runtime.json. This is a development scaffold check, not an integrated protocol deployment.

## Next concrete work

Resolve connected-branch/slack semantics with a proved finite certification procedure, then implement the integer swap engine and independent differential campaign. Complete custom instruction/state lifecycle integration before enabling any financial UI. Backend and frontend scaffolds intentionally report unavailable state where this evidence is absent. Deployment/demo commands currently fail explicitly; they are not completed release tools.

Detailed commands and outcomes belong in [the evidence index](test/evidence/INDEX.md).
