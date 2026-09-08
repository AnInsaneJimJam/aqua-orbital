# Canonical quote transport

2026-09-08. Bounded read-only transport implementation. This does not enable a
financial route, execute a transaction, prove a complete quote-service snapshot,
or verify a deployed router. Only the new transport/test files were edited for
this task; service, runtime, database and pure route-selection work have separate
owners and verification.

## Boundary

`readQuoteIdentity` sends one native three-element JSON-RPC batch for chain ID,
head and the requested numbered header. It requires a verified HTTP(S)
deployment, canonical requested height/hash, height at or after deployment,
matching chain/header, two confirmations and a canonical integer timestamp.
Header absence, identity mismatch and malformed quantities fail the whole call.

`readQuoteBatch` accepts a routing input and a bounded inspection/quote batch
index. It regenerates `prepareRouting` or `prepareWholeSizeQuotes` internally.
It accepts no caller-selected request, target, sender, calldata or RPC method.
Each native batch has one to eight independently planned `eth_call` entries at
the exact EIP-1898 block hash with `requireCanonical:true`; payment quotes retain
the payment adapter as their planned caller. Returned observations carry the
original regenerated descriptor in its planned order, even if RPC replies arrive
in another order. Missing, duplicate, unknown or differently typed IDs reject
the entire batch. A result/error ambiguity or invalid protocol envelope does too.

Only explicit EVM reverts become a per-call `{status:'rejected',reason:'revert'}`:
code `3`, or code `-32000` with `execution reverted` (optionally followed by a
colon and a reason), plus canonical even-length hexadecimal error data, including
`0x`. Missing/object/odd-hex data, header-not-found and unsupported-method errors
fail the group. Remote error text and revert data are not returned or logged.
Successful data must be canonical even-length hex; exact ABI and financial
coherence remain the existing pure core/controller's responsibility.

The supplied shared capacity callback reserves the full logical batch size
before the first fetch and releases once in `finally`. A rejected reservation
does not fetch or release an unacquired slot. Every batch has one total deadline,
defaulting to eight seconds, including planning, retries, streamed body and
bounded parsing. Caller cancellation and shutdown abort native work and remove
listeners/timers. The overall service must forward its separate total-operation
deadline and perform initial/final database and RPC consistency checks.

Fetch failures and HTTP 408/429/5xx retry at most twice, after 250/750 ms, under
the same reservation/deadline. Other HTTP, stream, RPC, identity and protocol
failures are not retried. Response bytes are bounded by `batchLength*256KiB`,
at most 2 MiB, and each complete serialized JSON response member is additionally
limited to 256 KiB. One fixed byte buffer prevents memory amplification through
retained one-byte chunk objects. A monotonic check inside the read loop also
interrupts continuously ready or empty streams that could starve a timer.

## Observed verification

```powershell
pnpm --filter @orbital/api exec tsx --test test/quote-rpc.test.ts
pnpm --filter @orbital/api typecheck
```

Tests preceded behavior. The compiling unavailable stub produced **15 failures
and 1 negative-case pass** across sixteen tests (TAP 9,591.3841 ms). The first
implementation passed **16/16**, and API type checking passed. A final rerun after
replacing chunk-list buffering with fixed backing storage also passed **16/16**
(TAP 17,646.7111 ms, result and source hashes collected at
`2026-09-08T07:14:26.849281+00:00`). These are suite durations, not single-batch
deadlines; they include runner/module work and separate awaited requests.

Coverage includes exact inspection and payment quote descriptors, native batch
limits, reversed response ordering, malformed IDs/envelopes/quantities/UTF-8,
per-call reverts versus global failures, announced/actual/member size caps,
transport-only retries, unavailable fetches and stalled bodies, both cancellation
sources, listener cleanup, reservation rejection, and empty-chunk timer starvation.
An actual disposable localhost HTTP server additionally receives and returns
native three- and eight-element batches. It uses explicit ABI-shaped local
fixtures, not live deployment or database observations.

| Frozen source | SHA256 |
| --- | --- |
| `apps/api/src/quote-rpc.ts` | `f65463888dd7e1348e2887874691f62f93796e6718b006f0d3d2a8887b1ca65c` |
| `apps/api/test/quote-rpc.test.ts` | `040b46920c12fa9f4a3b61b10297f52e88fca745782da6456f4e2e41d48f674b` |
| Pure selection dependency `route-selection.ts` | `46a107b7c3314c8e15e57aed40ca0b10cb0000d2f4edb7f6b91eb1b4ed614abb` |
| Local ABI fixture `route-selection-fixture.ts` | `b8aa53bb8095a9b6ef9501f3fc53aa571bf128e82b66d9f91501186937b7f555` |

No fallback to `latest`, provider multicall, signing, private keys or public
financial endpoint was added. Canonical database completeness, whole-operation
expiry, authoritative final rechecks, real network compatibility and subsequent
transaction review remain separate integration obligations.
