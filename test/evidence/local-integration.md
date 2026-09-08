# Connected local application checkpoint

Recorded 2026-09-08 UTC / 2026-09-09 IST. This increment follows the owner's request to connect the application with light checks. It does not close G1–G8 release acceptance or Privy qualification.

## Working integration

`pnpm local:setup` starts persistent PostgreSQL/Anvil, builds application contract artifacts, migrates the database, verifies or deploys the graph and seeds two three-token/three-tick strategies. It completed successfully against the existing deployment without replacing addresses or reseeding paid invoices. `pnpm dev:local` starts the API, indexer and current frontend template with an explicit local wallet fixture. [Runbook](../../docs/LOCAL_DEMO.md).

The browser signed actual local transactions through that fixture wallet. Its confirmation dialog was accepted by the smoke driver only for the explicitly labeled local fixture. There were no mocked API/RPC responses in these flows:

| Flow | Observed result |
| --- | --- |
| Standalone swap | 1 USDC input settled through the actual Orbital router and Aqua |
| Swap-funded invoice | 5.019531 oUSD6 input produced 5.015490 USDC; the invoice paid 4.5/0.5 USDC to its two recipients and refunded 0.015490 USDC |
| Funding | The selected local wallet received 1,000 oUSD6 and 1,000 local USDC through reviewed faucet calls |
| Publication | Bounded token approvals, Aqua shipping, browser reload, saved configuration recovery, separate incomplete-shipment history, and activation succeeded |
| Owner lifecycle | The same newly activated strategy was retired and its Aqua allocation docked through separate reviews |
| Invoice administration | Merchant creation and cancellation of a separate 2 USDC invoice succeeded |

The [post-restart capture](local-integration/receipts-after-restart.json) binds fourteen browser transaction hashes to successful canonical receipts and transactions, verifies the twelve-contract graph, and retains six actual API observations. [Original deployment report](local-deployment/2026-09-08T17-13-26.243Z-63f17fa3-c41f-4fbb-874c-3325c6963d3d/report.json) authenticates the graph, sixteen deployment/setup receipts, constructor arguments and exact linked runtime identities. The active machine-local manifest is generated and ignored; the historical evidence is retained.

Browser records: [publication](local-integration/local-publication.json), [lifecycle](local-integration/integrated-lifecycle.json), [funding](local-integration/integrated-funding.json), [invoice administration](local-integration/integrated-invoice-admin.json). Screenshots: [swap](local-integration/integrated-swap.png), [incomplete allocation](local-integration/integrated-incomplete.png), [dock confirmation](local-integration/integrated-retired.png), [funding](local-integration/integrated-funding.png). A screen may still show its explicitly labeled earlier indexed observation immediately after a receipt; the final capture separately checks canonical API data.

## Light verification and retained failures

- Workspace TypeScript: [transcript](local-integration/typecheck.txt).
- Production frontend build: [transcript](local-integration/web-build.txt).
- The [six initializer comparisons](local-integration/profile-initializer.json) match exact X/P/V for allocations 10/100 across Wide/Balanced/Focused. The [independent Decimal calculation](local-integration/profile-independent.json) checks cap minima, principal ceilings and threshold branches at 110/160 digits. [Computation manifest](local-integration/profile-manifest.json). These bounded observations are not universal proofs.
- Initial publication/payment smoke drivers used outdated confirmation text or overly strict accessible-label matching. Some stopped after transactions had already succeeded. Their captured transaction hashes were subsequently checked against canonical receipts; those interrupted scripts are not reported as fully passing browser tests. The retained `browser-*.mjs` files document the specific historical driving attempts, not an idempotent general regression suite. The lifecycle, funding and invoice-administration drivers reached their completion assertions.
- The initializer smoke first used a regular ABI selector for a Solidity library method, then encountered the library ABI's enum type spelling. Both harness issues were corrected before the six comparisons passed; no protocol counterexample was inferred from them.
- A preliminary capture script checked the deployment helper's wrapper instead of its `report` field. The corrected read-only capture passed. No financial state was changed by that correction.
- The first setup command started compiling test artifacts. That owned compiler process was deliberately stopped; setup now skips test/script compilation and completed. No tests are claimed from that interrupted build.

## Persistence failure and recovery

The initial Docker volume was unwritable by Anvil's `foundry` user. After correcting ownership, native interval dumps included an unexpectedly large historical-state cache. A shutdown left a truncated file inside `historical_states`; the accounts, current block, block history and all 54 transaction records were complete. Those complete fields were retained without inventing missing historical state. [Failure/recovery hashes and scope](local-integration/persistence-recovery.json).

Anvil now loads a snapshot written by a separate local service using validation, file sync and atomic rename. Serialization briefly pauses interval mining. A subsequent strict reuse check also caught duplicate startup genesis headers in Anvil’s hash-keyed serialization; the writer now retains canonical headers per duplicate height, including the original genesis bound through block 1’s parent. It does not relax deployment identity checks. Thirty-second snapshots retain current accounts, blocks, transactions and the bounded 128-state EVM cache. A graceful stop/start of both services passed, preserving runtime identities and the fourteen retained browser receipts. The API recovered its canonical projection and still showed the paid seed invoice, active seed strategies and retired/docked lifecycle strategy. No database reset was used.

The pinned upstream implementation explains the snapshot fields and the enlarged short-interval cache: [Anvil API](https://raw.githubusercontent.com/foundry-rs/foundry/v1.5.1/crates/anvil/src/eth/api.rs), [backend state serialization](https://raw.githubusercontent.com/foundry-rs/foundry/v1.5.1/crates/anvil/src/eth/backend/mem/mod.rs), [state cache](https://raw.githubusercontent.com/foundry-rs/foundry/v1.5.1/crates/anvil/src/eth/backend/mem/storage.rs). An abrupt crash can still lose transactions since the last complete snapshot. This is development persistence, not an archival or production durability claim.

## Remaining scope

Privy email/external-wallet provider integration and active-wallet selection are implemented. The supplied public app ID previously rendered the login interface. Actual authentication, embedded-wallet creation/reconnection and Privy-signed financial receipts remain unverified. These Anvil fixture receipts do not satisfy sponsor qualification.

Arc deployment identity, an authorized funded signer and target gas acceptance remain prerequisites. Full mathematical/differential/economic, fuzz/invariant/mutation, security, accessibility, performance, cross-tab/repricing and external-wallet regression campaigns were deferred. Earlier test totals elsewhere retain their original source checkpoints and are not current-increment reruns. Full archival index rebuild remains an explicit unsupported command; bounded canonical rollback/replay is implemented.
