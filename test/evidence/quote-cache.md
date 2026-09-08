# Canonical quote batch cache

2026-09-08, increment over `dd331b8`. The production read runtime now shares a
bounded in-memory quote cache between swap and invoice quote preparation. The
cache changes repeated static quote work, not financial eligibility or wallet
execution. The current frontend template and production Solidity are unchanged.

## Retention and identity

Only internally regenerated router quote batches are eligible. Each key is a
SHA-256 digest of the verified manifest (including chain, router and RPC URL),
canonical block height/hash, timestamp, full intent, exact call descriptors,
order versions and the inspected configuration/state/availability bytes for
that batch. The intent includes the payer and slippage even where those fields
do not change router calldata. Pair, gross amount, actual caller/recipient,
minimum, deadline and crossing limit are bound by the exact encoded call.
This relies on the usual digest collision-resistance assumption.

A cache entry contains only copied raw return strings for a complete batch.
Every member must have canonical quote ABI bytes, matching order hash, full
input consumption and positive output. Reverts, missing/protocol-invalid
responses, malformed ABI, partial fills and zero-output returns do not populate
the cache. A canonical return below the current minimum may be retained; it
still fails the existing route selection predicate on reuse. Minimum output,
funding ceiling and all financial/configuration checks run on every hit.

TTL begins immediately before the original RPC group, not at completion.
Entries are reusable only while that age is strictly below 5,000 ms. A slow
fill may therefore have little or no remaining cache lifetime. Hits and
duplicate completion never extend an entry. Expired entries are removed lazily
on the next cache operation and cannot be returned. Limits are 256 batches and
1 MiB of UTF-16 key/result payload; this excludes separately bounded object/Map
metadata and is not a claim about exact JavaScript heap allocation.

Arrays are copied on insertion and retrieval; raw strings are immutable.
In-flight fills have one-use stamps belonging to that cache. Clearing or a
backwards/nonfinite clock invalidates earlier stamps and retained entries.
Identical concurrent misses use separate native work and cancellation. There
is no shared in-flight promise, and one caller cannot abort another's request.
Runtime shutdown clears retention and aborts work before later insertion.

## Canonical and financial boundaries

Identity, head, configuration/state/availability inspection, invoice terms,
payer balance/allowance and all database reads are uncached. Both quote services
keep their existing initial/final source, canonicality, freshness and expiry
checks. The payment HTTP deadline still covers both manifest reads. A cached
return cannot establish that a deleted/orphaned block is canonical, that an
invoice is unpaid, or that funds/approval are still available.

The public payment `work` object now separates planned and saved work:

- `quoteMembers` and `logicalMembers` retain their planned-work meanings and
  the original 128/246 ceilings, including cache hits.
- `cacheHitMembers` and `cacheHitBatches` identify complete reused quote groups.
- `nativeBatches` counts groups sent to RPC. Adding `cacheHitBatches` recovers
  the planned batch count, which remains at most 44. Subtracting hit members
  from logical members gives members submitted in those groups.

These are group counts, not transport retry attempts. A sent group can still
make up to three attempts under the existing shared eight-second deadline and
250/750-ms retry policy. Cache hits consume no RPC reservation but retain the
same two-service admission, IP limiter and bounded search budget. Duplicate
hit reports fail closed. Direct USDC has zero quote/cache work.

The strict SDK decoder independently validates the counts. For `E` eligible
orders, each complete stage has `floor(E/8)` full batches and, when nonzero,
one tail of size `E mod 8`. The SDK checks that hit members and batches can
arise from a subset of exactly those groups. Its independent test constructs
the physical batch list and enumerates reachable subsets for every supported
`E` and stage count, then compares all member counts 0..128 and batch counts
0..28: **1,081,149 comparisons**. This is a finite work-accounting check, not a numerical-engine proof.

The [earlier isolated payment service review](../../docs/audits/PAYMENT_SERVICE_REVIEW.md)
belongs to its pre-cache source pins. It is not silently extended to this
change. This increment's source review and regressions check cache-key
completeness, retention isolation and continued execution of the existing
validators. Authentic database/RPC observations remain a required assumption;
neither an internal cache nor TypeScript DTOs authenticate a dishonest provider.

## Retained tests and diagnostics

- Five cache tests cover strict expiry, slow completion, copying, entry/byte
  limits, FIFO eviction, duplicate completion, invalid clocks/clear and invalid
  inputs/stamps. [RED](quote-cache-red.txt), [initial GREEN](quote-cache-green.txt).
- Five transport tests cover key dimensions (including chain/router/version,
  payer, minimum and expiry), cold/hot reservations, uncached inspection,
  cancellation, bad replies, independent concurrent misses and invalidated
  in-flight fills. [RED](quote-cache-rpc-red.txt),
  [combined ten-test GREEN](quote-cache-rpc-green.txt).
- Three native HTTP/PostgreSQL runtime tests compare cold/warm swap and payment
  results, verify actual sent-batch counts, re-read allowance/balance, reject a
  final canonical-header mismatch, and reject resync-required source coverage.
  [RED](quote-cache-runtime-red.txt), [diagnostic rerun](quote-cache-runtime-diagnostic.txt).
- A service test validates accounting of injected complete cache hits and
  rejection of duplicate reports. The existing 44-batch case remains a cold
  test and now explicitly expects zero hit counters.
- One public SDK decoder test covers changed hit/native counters; two count
  helper tests cover independent subset enumeration and unsupported inputs.
  [Decoder RED](quote-cache-sdk-red.txt),
  [thirteen-test SDK GREEN](quote-cache-sdk-green.txt).

The [first combined run](quote-cache-runtime-initial.txt) failed only because
the old 44-batch assertion omitted the two new zero counters. The
[next combined run](quote-cache-runtime-unavailable.txt) rejected a fixture's
initial quote before the cache assertions. That assertion did not retain the
service code, so the original cause is **unresolved**. Its message now includes
the complete safe service result. A separate three-test runtime rerun passed;
no production freshness/canonical checks were weakened and no retry was added
to hide that failure. The current complete regression checkpoint is separate.

The first attempted full run then stalled in the payment HTTP test child and
reached its 600-second runner limit. [The timeout record](quote-cache-runner-timeout.json)
states exactly what was observed: the old runner lost buffered partial output,
so neither the originating response nor a passed full suite is claimed. The
identity-checked child was stopped and its exact isolated schema cleaned up.
HTTP test barriers now reject early responses with bounded status/body evidence
and a fixed timeout; runtime test barriers also race service completion. An
additional payment HTTP test reproduces an early 503 and verifies the failure
message, rather than hanging. [RED](quote-cache-barrier-red.txt),
[eleven-test HTTP GREEN](quote-cache-barrier-green.txt).

The runner now streams logs immediately and records timeout status while
terminating only its owned process tree. Two isolated runner tests verify
success/failure transcript retention and actual timeout cleanup of a spawned
child and grandchild. [Runner output](quote-cache-runner.txt). A later
[read-only clock check](quote-cache-clock-observation.json) measured PostgreSQL
779..807 ms ahead of the host; this does not establish the earlier rejection's
cause. Production clock tolerance is unchanged.

Reproduce the complete source-frozen API/SDK/shared/type-check run with:

```powershell
$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'
python scripts/audit-payment-endpoint.py quote-cache
```

Results and exact before/after input identities are in
[the cache checkpoint](quote-cache/checkpoint.json). The optional runner label
preserves the earlier endpoint checkpoint. Installed dependency contents,
compiler caches, Docker images and external database state are not included in
the source hash freeze. No browser, reference or Solidity campaign is rerun for
this backend/SDK increment.

The final complete run passed **210 API**, **92 SDK**, **7 shared** tests and
workspace type checking, with zero failures, cancellations or skips. TAP
durations were 198.615 seconds for API and 12.972 seconds for SDK. Every
enumerated input stayed byte-identical throughout all four commands. Current
`api.txt` and `sdk-green.txt` are exact copies of the accepted run; the preceding
[195-test API](api-checkpoint-195.txt) and [89-test SDK](sdk-checkpoint-89.txt)
transcripts remain archived with their earlier endpoint checkpoint.

## Remaining work

Payment observations remain review-only. Fresh wallet observations/simulation,
post-approval re-quoting, explicit transaction controllers and receipt-backed
recovery are still required. Persistent local demo, live Privy/Arc receipts,
numerical liveness and gas/release campaigns remain separate acceptance work.
