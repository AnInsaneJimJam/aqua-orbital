# API readiness and committed invalidation evidence

Observed 2026-09-08. This increment implements dependency readiness and raw indexer invalidations. It does not enable financial quotes, materialized strategy/payment routes, receipt-derived metrics, or transaction submission.

## Behavior

`GET /ready` returns 503 unless the server has a valid verified deployment manifest, configured/reachable database, an indexed cursor, a non-resync status, and a successful matching-chain RPC check. The indexed block hash must still match the RPC's canonical block at that height. Its database update must be at most 10 seconds old, and the cursor must equal the current observed RPC head minus the two-block display delay. A recently updated but far-behind backfill is `INDEXER_CATCHING_UP`, not ready. A cursor/resync change during the RPC check fails closed. The successful response includes chain, block/hash, observation age and `financialExecutionEnabled: false`.

Database connections and queries have three-second timeouts. Each RPC request has an eight-second timeout with at most two transport retries within an eight-second abort deadline; readiness permits two concurrent three-read groups, below the repository's eight-request concurrency bound. Checks use the server manifest RPC only. Errors return fixed codes without connection strings, provider text, secrets, or authentication identifiers. `/health` remains a liveness endpoint; it does not substitute for `/ready`.

`GET /events` requires readiness and a PostgreSQL notification source. The server keeps one shared `LISTEN orbital_blocks` connection. PostgreSQL delivers only committed notifications; the consumer validates and selects allowed payload fields before sending `event: invalidate`. Raw block/reorg/resync events contain chain, block and hash. They omit nonexistent entity/version data. The parser accepts explicit entity kind/ID/version only when all fields are supplied and valid; current raw indexing does not generate materialized entity updates.

The initial connection sends a full `refresh` invalidation with the current cursor. LISTEN/NOTIFY is not a durable replay queue: reconnects refresh all relevant queries, and no `Last-Event-ID` replay guarantee is made. A notification connection failure closes subscribers so clients reconnect and refresh. Connection setup retries at most three attempts, with 250/750 ms delays and bounded connection/query timeouts. The stream gives a three-second reconnect hint and 15-second comment heartbeats. It caps active/pending subscriptions at 100, queues no application messages, and disconnects slow clients when Node's response buffer fills. Client disconnect and server shutdown remove subscriptions/timers and close streams. PostgreSQL notifications never carry authoritative balances or a backend instruction to mark an invoice paid.

## Tests first and verification

Five readiness/parser tests first failed against compiling named stubs. The existing three API tests remained green. Five additional PostgreSQL/HTTP tests then failed against the notification stub and missing readiness/SSE routes. The final suite adds concurrent-rewind, connection-loss and backpressure regressions.

| Check | Observed result |
| --- | --- |
| `pnpm --filter @orbital/api test` with `NODE_ENV=test` and `TEST_DATABASE_URL` | 16 passed, 0 failed, 0 skipped |
| `pnpm --filter @orbital/api typecheck` | Passed |

The suite covers absent/unverified configuration, missing/unavailable DB, RPC chain mismatch/unavailability, stale/future timestamps, a freshly updated but lagging indexer, orphaned/unconfirmed blocks, resync state, cursor changes during checking, timeout/error redaction, malformed payloads, entity-field requirements, other-chain filtering, connection retry/loss, real HTTP disconnect/shutdown/backpressure, CORS, unchanged proof fallback, request/body validation, and continued financial-route rejection even when dependencies are ready.

The PostgreSQL test uses actual `BEGIN`, `ROLLBACK`, `COMMIT`, `LISTEN` and `NOTIFY`, with a test-only random chain ID and no table writes. It proves uncommitted and rolled-back notifications are not delivered. RPC behavior in readiness/HTTP tests is provided by explicit test transports; these tests do not claim a live verified Orbital deployment or Arc qualification.

During verification Docker Desktop's engine stopped while its port proxy remained open. One earlier database test hung and was terminated; it was not counted as passing. API test/database timeouts were made explicit. Docker Desktop was restarted through its supported CLI, preserving the existing volume and containers; the existing PostgreSQL and Anvil containers were started, PostgreSQL health checked, and the final suite passed afterward. Anvil's temporary in-memory chain restarted; no live-network state was involved.

## Operation and remaining work

The API entrypoint now reads `DATABASE_URL` in addition to the existing `DEPLOYMENT_MANIFEST` and proof configuration. No new secret or signing credential is needed. Missing environment/deployment state produces honest 503 responses. Use `/ready` for dependent service checks and `/health` for process liveness.

Actual strategy/payment materialization, decoded entity invalidations, frontend query-invalidation wiring, canonical quote routing, and receipt-derived metrics remain outstanding. The raw database is still one configured deployment set per chain. A `resync_required` state requires the separately outstanding reviewed recovery flow; the API cannot clear it or silently advertise fresh financial data.
