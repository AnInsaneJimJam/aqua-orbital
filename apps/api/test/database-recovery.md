# Transient PostgreSQL connection recovery

Observed 2026-09-09. The indexer's shared `database()` pool previously had no `error` listener. PostgreSQL connection errors on an idle pooled socket are emitted outside the awaited indexing operation, so the existing indexing loop's `try/catch` could not prevent Node's unhandled EventEmitter error from terminating the process.

The shared pool now handles idle errors and checked-out client errors between awaited queries, with a three-second default connection-acquisition limit. Installed `pg` 8.23.0 marks a failed client unqueryable; `pg-pool` 3.14.0 removes failed idle clients and discards unqueryable clients on release. A subsequent operation acquires a new connection. No transaction is retried inside the database factory and no cursor, freshness or readiness state is synthesized. The indexer retries by rerunning its existing canonical synchronization loop, and logs only a fixed `DATABASE_CONNECTION_LOST` code plus chain ID for idle errors.

The API runtime uses that shared factory while preserving its existing four-client pool and three-second connection, query and statement timeouts. Its existing readiness database reads still fail closed. The redundant uncaught pre-loop RPC identity request was removed from the indexer entry point: `syncDeploymentOnce` already performs identity validation on every attempt, inside the retry boundary. Wrong identity remains an error, and durable `resync_required` still exits for intervention.

One focused test, `database-recovery.test.ts`, uses a newly created isolated schema and a private TCP proxy. It drops only sockets it created; it does not stop a database backend, Docker container, Anvil process, API, web server or other service. It establishes real PostgreSQL indexer/runtime reads and readiness first, drops both an idle and a checked-out connection, observes handled errors, verifies failed indexer reads and `DATABASE_UNAVAILABLE` without any RPC read, then restores the proxy and verifies new backend connections and recovered canonical reads. Financial execution stays disabled. RPC block identity is an explicit deterministic fixture; this is not a live network or full dev-stack restart test.

Final validation:

- `pnpm --filter @orbital/db typecheck`: passed.
- `pnpm --filter @orbital/indexer typecheck`: passed.
- `pnpm --filter @orbital/api typecheck`: passed after correcting an overloaded `Pool.connect` return-type inference in the new test to explicit `PoolClient`.
- With the authorized local `TEST_DATABASE_URL`, `pnpm --filter @orbital/api exec tsx --test test/database-recovery.test.ts`: **1/1 passed**, test body 1,357.511 ms, process 12,780.541 ms. All test-owned sockets, pools and schema were cleaned up.

The first attempt at this same focused test hit its 20-second fixture timeout while simultaneous typechecks substantially delayed process startup. This was not a claimed behavioral RED for the pool fix. The overall fixture ceiling was raised to 60 seconds and the same test rerun after the typechecks; production timeouts were not increased. No broad test campaign or service restart was performed.
