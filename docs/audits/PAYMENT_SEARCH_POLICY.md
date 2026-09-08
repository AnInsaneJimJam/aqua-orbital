# Payment search implementation policy

2026-09-08. Implements the sufficient-result contract in
[the original payment quote proposal](PAYMENT_QUOTE_PLAN.md). This is an
implementation decision within the user's existing authorization. It does not
add exact-output swaps, minimum-input certification, signing, or a backend account.

## Work bound

Inspect the existing first 32 canonical candidates, once, from a scan capped at
200. Keep the same eligible order set for every amount stage at the same pin.
Each completed stage quotes every eligible order, in batches of at most eight.
Never retain a partially completed stage.

Use at most eight expansion stages and eight midpoint stages, with at most 16
stages and 128 aggregate router quote members. For `E>0` eligible orders the
effective stage cap is `min(16,floor(128/E))`. Expansion uses at most the smaller
of eight and that cap; if earlier expansion probes fail to find a sufficient
result, reserve its last stage for the exact user/funding cap B. Earlier probes
double with saturation. Skip duplicate amounts. No amount outside `[2,B]` is
probed. Seed and B are computed with bigint by the context service.

After a sufficient complete stage, retain a copy of its result. Optional
midpoints can replace it only with another complete sufficient stage. An
uncertifiable midpoint moves a heuristic search cursor, never an infeasibility
bound. Stop at adjacent integers, eight midpoint stages, the aggregate budget,
or a service decision to reserve time for final verification. Transport,
protocol, cancellation, source or deadline failures abort the whole request;
they cannot return an earlier sufficient result as if final checks passed.

| Swap work | Maximum logical members | Maximum native batches |
| --- | ---: | ---: |
| Initial/final identity | 6 | 2 |
| Initial/final invoice/funding context | 16 | 2 |
| One-time strategy getters | 96 | 12 |
| Search | 128 | 28 |
| Combined upper bound | 246 | 44 |

The search batch bound follows by checking `E=1..32`:
`min(16,floor(128/E))*ceil(E/8) <= 28`; the largest value is at E=9.
The independent member and batch maxima need not occur on the same request.
With two read-transport retries the aggregate ceilings are 738 transmitted
members and 132 HTTP attempts. Direct USDC remains at most 20 logical members,
four batches, 60 transmitted members and 12 attempts, without strategy search.

The original 20-second shared service deadline, 8-second per-batch maximum,
10-second freshness check, eight weighted RPC capacity and two admitted quote
services remain required. These bounds are not a remote latency promise. The
service should stop optional refinement when less than two seconds of usable
freshness/deadline time remain, leaving final checks mandatory. Expiry or stale
results still fail if those checks cannot finish in time.

## Result and verification contract

The pure search exposes explicit expansion/refinement/stage/member/batch counts,
one bounded aggregate outcome record per eligible strategy and a stop reason.
It checks that every stage reports the exact unchanged eligible order set. Its
retained result is copied from a bounded inert data tree: plain records/arrays,
strings, booleans/null, safe integer numbers and bigints strictly between
`-2^256` and `2^256`. Reject shared buffers, typed arrays, accessors, other
prototypes and cycles. Bounds are depth 24, 8,192 visited nodes, 512 elements or
record keys per container and 1,048,576 total UTF-16 string units, including
property keys. These are
internal quote-data transport bounds, not new numerical engine limits. A
retained result shares no mutable payload object with later probes.
`minimumInputCertified` is always false. Empty/unsuccessful bounded search does
not prove insufficient liquidity. The context/route service must authenticate
invoice/funding data, validate actual quote bytes and all role/amount/availability
constraints, and perform canonical final checks before returning any observation.

The pure helper counts planned logical members/batches; the callback must
execute the complete internally prepared stage under those limits. Its
synchronous checkpoint must throw on cancellation, stale context or elapsed
budget, and the probe must settle or be aborted under the shared service
deadline. The pure search cannot terminate an indefinitely pending callback.
Copier limits bound accepted data; descriptor enumeration itself assumes the
service's bounded ordinary DTOs, not arbitrarily oversized objects or proxies.

Required pure-search checks include cap reservation, 256-bit amounts, complete
stage coverage, exact worst-case counters, sufficient-result retention, a partial
oracle countermodel where a lower sufficient input is missed, cancellation and
latency budget checks, and mutation of a previous callback result. This document
states the policy; completion is recorded in the evidence index only after tests.
