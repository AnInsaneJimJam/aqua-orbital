# Canonical strategy RPC transport

2026-09-08. Bounded transport increment, separate from strategy snapshot/domain
validation, API route acceptance and financial execution. The transport reads
only; it does not quote, sign, send transactions or certify curve mathematics.

`apps/api/src/strategy-rpc.ts` reserves three logical requests for a list/known
absence and six for a detail before issuing any network request. Its caller
provides the shared reservation callback and shutdown signal. Reservation failure
performs no fetch; every acquired reservation is released once in `finally`.
The runtime owner separately verifies shared capacity with other API readers.

The validated, verified server manifest supplies the sole RPC URL and router.
The three base reads are chain ID, head and the exact numbered header. All three
detail `eth_call` requests use compiled SDK lifecycle getter ABIs and the same
`{blockHash, requireCanonical: true}` selector. Header height/hash, chain identity
and at least two confirmations must match. Getter decoding must re-encode to the
identical bytes, rejecting trailing bytes, noncanonical encoding and truncation.
BigInts remain BigInts. The controller must still validate configuration hashes,
state versions, quantities and availability against canonical DB observations,
and recheck the DB after RPC; successful transport alone establishes none of those
domain obligations or current-head freshness for historical pins.

One eight-second group deadline covers fetch, streamed bodies and retry waits.
It can be shortened by internal tests but cannot be raised above eight seconds.
Connection/fetch transport failures and HTTP 408/429/5xx have at most two retries,
at 250/750 ms; RPC errors, malformed data and ABI failures are not retried.
Each decoded response is capped at 256 KiB. Errors cancel siblings; shutdown
and timeout cancel active fetches/readers and waits. JSON parsing and ABI decoding
are bounded by this payload cap and are checked against elapsed time before any
result is returned. Error messages contain no RPC body, identity data or URL.

## Tests-first evidence

Command: `pnpm --filter @orbital/api exec tsx --test test/strategy-rpc.test.ts`.

- Initial explicit unavailable stub: 10 failures and one negative-input pass
  across 11 tests. The pass did not establish validation behavior on its own.
- First implementation: 11/11 passed, including an actual disposable localhost
  HTTP server, exact six/three call plans, hash pins, wide values, malformed
  identity/ABI responses, transient retries, capacity cleanup, stalled body
  cancellation, response size limit and shutdown during retry delay.
- Additional retained RED: 50,000 immediately ready empty stream chunks could
  prevent timer callbacks from running. A requested 5 ms deadline did not interrupt
  the loop; the failing test took 1,634.2185 ms. The reader now checks monotonic
  elapsed time inside the loop and does not retain empty chunks.
- Final run: **12/12 passed**, TAP duration 9,042.523 ms, collected before
  `2026-09-08T06:24:39.3373834Z`. The empty-stream test passed in 24.8346 ms
  (includes the test harness and setup), with early reader interruption asserted.
- `pnpm --filter @orbital/api typecheck`: passed on the final transport source.

No Forge, shared Anvil, live RPC deployment, PostgreSQL mutation or browser was
used in these focused tests. The strategy runtime/DB/controller integration is
owned and verified separately; this note makes no claim about that full campaign.

## Source hashes

SHA-256:

- `apps/api/src/strategy-rpc.ts`:
  `f2b7cf5c35e6030f409c31936c06bf50f075442dd53356555838cb52003e095e`
- `apps/api/test/strategy-rpc.test.ts`:
  `25981184f1217e03b8dac41b42be4582be5f70d88af53303ee9fbddd640b3e7c`
