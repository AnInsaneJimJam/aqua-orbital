# Arc log-query provider recovery

The subsequent [range throughput check](range-throughput.md) successfully indexed a real sixty-four-block Arc window using the explicit Blockdaemon transport and an isolated database schema. It records measured throughput separately from the running worker's eventual catch-up.

Observed 2026-09-09 after activation of the real Arc manifest. The active worker reported `RPC_TRANSPORT_UNAVAILABLE` without indexing its first block. A wrapped-fetch probe of the actual transport reproduced successful chain/head/header reads, followed by three HTTP 429 responses to the first block's `eth_getLogs`. An additional bounded query exposed JSON-RPC code `-32005`, `rate limit exceeded`, with no Retry-After header. An equivalent one-block numeric range and `eth_getBlockReceipts` were also throttled. No unsupported-filter conclusion or exact quota was inferred.

[Arc's official endpoint reference](https://docs.arc.io/arc/references/rpc-endpoints) lists Blockdaemon, dRPC and QuickNode alongside the primary endpoint. Read-only probes of each verified chain ID 5042002 and the same deployment-start block hash. Blockdaemon and dRPC returned the matching one-log result with HTTP 200; QuickNode returned HTTP 429 for logs. The [diagnostic observations](arc-rpc-diagnostic.json) retain the public addresses, canonical block, method/status/error and measured latencies. These are bounded observations, not guarantees about future provider capacity.

The indexer now accepts an explicit `INDEXER_RPC_URL` operator setting. An absent setting keeps the manifest RPC unchanged. An override requires HTTPS without URL credentials, query parameters or fragments; invalid input fails startup with `INVALID_INDEXER_RPC_URL`. There is no automatic fallback. The indexer still checks the manifest's chain identity on every attempt, validates every log against its requested block hash/header transaction identity, and rechecks the canonical tip before ordered commits. Deployment addresses, verified source/runtime evidence and the primary manifest are unchanged.

The Arc runner's deliberate selection and cross-provider startup verification are owned by the runner integration. The verified public candidate is `https://rpc.blockdaemon.testnet.arc.io`; this note does not claim the worker has caught up after restart.

Focused configuration test was added before the export existed; its initial run failed at module import as expected. After implementation, the new configuration case and four unchanged transport cases passed **5/5**, no skips/cancellations, test process 2,626.876 ms. Indexer typecheck also passed. They cover default preservation, public override validation, exact hash-pinned log/getter requests, bounded transport retries, deadline/payload bounds, eight-request capacity and shutdown. No broad database or release campaign was rerun.

```powershell
pnpm --filter @orbital/indexer exec tsx --test test/rpc-config.test.ts test/rpc.test.ts
```
