# Deployment-scoped lifecycle and invoice materialization

Verified locally on 2026-09-08: **20/20 indexer tests, 6/6 database tests, and both package typechecks pass**. The additive migration was applied to the existing local PostgreSQL database without recreating its volume. This is a bounded G5 increment. Financial APIs, live financial-state reads, swap metrics and deployment qualification remain unavailable.

## Architecture and implemented scope

`0003_materialization.sql` retains the shared canonical chain/block/raw-log ledger and adds deployment registrations, per-deployment processed blocks/cursors, and append-only strategy/invoice snapshots. Raw logs retain their original topics/data; recognized events additionally retain versioned decoded projection payloads, including successfully hydrated immutable strategy configuration. Canonical block-wide log-index uniqueness is enforced in addition to the existing block/transaction/log identity.

The deployment ID commits to chain ID and Aqua/router/payments addresses. Registration also binds USDC, token addresses/decimals/mock flags and the deployment start block. Attempting to reuse that ID with changed configuration fails. The public identity stored in PostgreSQL excludes RPC URLs, credentials and user sign-in information. The current manifest only carries a verification flag; missing source/code identity fields remain null rather than invented. The indexer relies on a server-controlled manifest already verified by the separate network/deployment process.

Strategies and invoices are exposed as latest-snapshot SQL views. Recipient and successful-payment views normalize invoice terms and canonical payment records. Drizzle models are available through `@orbital/db`'s `materializedSchema` namespace. Raw/internal monetary values use decimal strings and PostgreSQL `numeric(78,0)`; no floating-point monetary conversions are introduced.

| Event | Projection |
| --- | --- |
| `StrategyActivated` | Immutable configuration/hash, maker, nonce, tokens, app lifecycle active, contract version 1 |
| `StrategyRetired` | Same immutable configuration, terminal retired lifecycle, actual emitted contract version |
| `InvoiceCreated` | Merchant, exact amount, expiry, recipients/basis points, memo hash, unpaid status |
| `InvoicePaid` | Payer/input asset, exact input/received/refund amounts, route hash and canonical event identity |
| `InvoiceCancelled` | Terminal cancelled status with immutable terms retained |

Invoice projection versions 1 and 2 are indexer revision numbers, not an invented onchain invoice version. Strategy versions come from lifecycle semantics/events; retirement may skip versions used by future swaps. Unknown events remain raw. Aqua allocation events, stock SwapVM events and generic ERC-20 transfers do not create swaps or payment fulfillment.

`strategies.financial_state_available` is explicitly false. An active app lifecycle does not imply live Aqua entries, sufficient wallet allowance/balance, or swap eligibility. No principal, fee, availability or tick-state observations are fabricated. No `swaps` table/metrics are populated before canonical `OrbitalSwapExecuted` integration. `invoice_recipients.amount_raw` is the exact scheduled split of the invoice amount (floored preceding recipients, remainder to the final recipient); it is not a claim of payment while the invoice is unpaid/cancelled. Successful fulfillment is represented by the canonical `invoice_payments` row.

## Chain/RPC boundary

Events decode from the generated shared SDK `lifecycleEventsAbi` and `paymentsEventsAbi`, with [separate source/compiler/topic/data provenance](sdk-events.md). The indexer verifies emitter role, canonical ABI topics/data by decoding and re-encoding, block number/hash, transaction membership/index in the observed block, and globally unique log index. Identical duplicate logs collapse; conflicting copies fail. Logs are processed by block-wide log index, so creation/payment and activation/retirement in one block are ordered correctly.

Activation needs immutable configuration absent from its event. `getStrategyConfig(orderHash)` uses the compiled SDK function ABI and an `eth_call` block selector `{blockHash, requireCanonical:true}`. This is the canonical-block requirement specified by [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898). No newer block or `latest` fallback is used. SDK validation independently binds returned configHash/orderHash, maker, chain/router, token allowlist and decimals. Logs use exact block-hash queries; the numbered block's canonical hash is rechecked after hydration and before commit. Invoice terms and transitions require no hydration because their events carry the needed data.

The production RPC adapter exposes only read methods. Limits are explicit:

- Eight seconds total per request, including retries and response reading; at most eight concurrent reads.
- Only transport failures/HTTP 429 or 5xx retry, with at most two retries after 250/750 ms. JSON-RPC application errors do not retry and their provider messages are redacted.
- Two MiB maximum RPC response, 2,000 logs per ingested block, 16 KiB maximum individual log data, at most 32 activation hydrations per block and four concurrent hydrations.
- Shutdown aborts pending requests. Missing historic state, unsupported hash-pinned calls, response/capacity limits or inconsistent responses fail closed without advancing either cursor.

These are supported ingestion bounds, not proof that every future busy-chain block fits. A block exceeding them requires an explicit capacity/design change; it is never partially indexed. The worker currently advances one block at a time and polls idle state every two seconds. The specified adaptive 500-block batching campaign remains separate.

## Transaction, rollback and replay behavior

Each deployment block executes in one PostgreSQL transaction under the existing chain advisory lock: canonical raw logs, decoded payloads, snapshots, deployment block marker, deployment cursor, compatible legacy chain cursor and notifications commit together. Invalid transitions or SQL failures undo all of these writes. The raw shared chain cursor tracks the canonical ledger tip; the independent deployment cursor permits another verified deployment to backfill earlier canonical blocks without borrowing the first deployment's progress.

Reorg recovery preserves the existing 64-stored-block window and durable `resync_required` stop. Deleting an orphan block cascades to raw events, decoded payloads, processed-deployment blocks and event-backed snapshots. Latest-snapshot views immediately expose the surviving predecessor state. The same transaction moves affected deployment cursors to their last surviving processed block, or removes a cursor if its first indexed block was orphaned. Restart then begins at that deployment's registered start block. No unbounded scan/replay of every historical entity is needed to restore state during a bounded reorg; the ordinary worker then ingests the new canonical suffix.

PostgreSQL delivers notifications only on commit. Entity notifications carry chain/deployment/block/hash/entity/version identifiers and invalidate client queries. Reorg notifications deliberately invalidate the chain without fabricated per-entity versions. PostgreSQL channels are database-wide, even across isolated schemas: the notification regression filters its deployment ID to avoid mistaking concurrent raw-test notifications for a failed transaction's output.

**The legacy `/ready` chain cursor does not establish materialized readiness for a particular deployment.** It is retained for compatibility while financial execution remains disabled. Future entity/quote/metric APIs must verify the relevant deployment cursor, canonical block, freshness, projection version and verification provenance. No API or frontend source was changed in this task.

## Tests and reproduction

Set the documented local `TEST_DATABASE_URL`, then run:

```text
pnpm --filter @orbital/indexer test
pnpm --filter @orbital/db test
pnpm --filter @orbital/indexer typecheck
pnpm --filter @orbital/db typecheck
```

Apply the additive schema with `DATABASE_URL` configured using `pnpm --filter @orbital/db migrate`. Existing deployed data is not reset. Fresh test schemas are uniquely named and dropped after each integration test; no Docker volume is recreated. No signing key or chain mutation is used.

Tests were written before implementation: all six initial materialization tests failed with the explicit unavailable placeholder, and all three initial RPC tests failed with its transport placeholder. The final indexer suite comprises 10 materialization tests, four transport tests and six existing raw reorg regressions. The separate DB suite retains six atomicity/reorg tests.

Meaningful cases include:

- Same-block ordering, duplicate logs, exact amount `9,007,199,254,740,993` (above JavaScript's safe integer limit), split conservation, decoded raw persistence and idempotent restart.
- Activation/retirement and invoice creation/payment/cancellation; rollback from retired/paid to active/unpaid; alternate cancellation replay.
- A second deployment independently backfilling, changed manifest identity rejection, and removing/restarting a deployment whose first block was orphaned.
- A deliberately invalid invoice transition rolling back all raw/snapshot/cursor writes; a PostgreSQL delete trigger failure preserving the entire previous reorg state.
- Hash-pinned config mismatch, missing historic state, branch changes, wrong chain/unverified manifest, malformed ABI, invalid transaction/block identity and conflicting duplicates.
- No notifications from rolled-back transactions; committed invalidations with exact identifiers; unknown events retained without fake swap rows.
- Hydration cap/four-call concurrency, request timeout/size limits, transport-only retries, eight-request capacity and shutdown cleanup.

Final indexer suite: 20 passed, zero failed/skipped, 13.381 seconds. Latest database suite: six passed, zero failed/skipped, 16.346 seconds. Both typechecks passed. Environment: Node 22.18.0, pnpm 10.34.5, PostgreSQL 16.15, Windows, existing healthy local Docker PostgreSQL. Repository HEAD `2ecc6ce2f180fde239c13feee7dd09247c0d1b07`, with uncommitted implementation work.

These tests use real isolated PostgreSQL and synthetic read-only RPC responses encoding the actual compiled event ABIs. They do not claim live chain receipts, an Arc deployment, successful Privy integration or a real Orbital swap. Full destructive rebuild/resync tooling remains explicitly unavailable via `--replay`; bounded canonical rollback and suffix replay are implemented. Ship-only/docked records, financial strategy-token observations, receipt-derived swap metrics, public entity APIs, deployment source/code provenance enrichment, batching/performance campaigns and G5 release completion remain separate work.

## Source snapshot

| File | SHA-256 |
| --- | --- |
| `packages/db/migrations/0003_materialization.sql` | `1dcdb0b45bf9ac98b3685762018a5a0b17c2982cd0bb47c3eccb10743130f20b` |
| `packages/db/src/materialization.ts` | `c6f98073e3a9ae3f41e9ba6951764f75c3942e5a2bde2bd3bf8ad566b464c5e6` |
| `packages/db/src/materializationSchema.ts` | `2c7766d0df74131db21a886ebeca8632ae30b017019e1f626d5a95c08957d530` |
| `packages/db/src/reorg.ts` | `ef1a49a45de9c60ba8ef11d82821ae2aee10517c512add3bbc4ad3f35b99e838` |
| `apps/indexer/src/materializer.ts` | `a59b6f04cb91f8d8c6389d17052cf39112e2321abf6fd1e254737d40fd7cee6d` |
| `apps/indexer/src/rpc.ts` | `edcb98b553c71fc176d11717895310c757137937859717dacd51fa3e6385a61e` |
| `apps/indexer/src/index.ts` | `dea03caf0ed688b1078911b740afd21ee705314369b4914fd8863b7d62b9d047` |
| `apps/indexer/test/materialization.test.ts` | `dda9262384a1d9a23c1c34e99328432828557eca9ad586b7fceebedbff80bd0e` |
| `apps/indexer/test/rpc.test.ts` | `7875f2b7a0dc4c1fc194cc7604fdcca1ed4c8fb45db104415d04853d289e48a2` |
