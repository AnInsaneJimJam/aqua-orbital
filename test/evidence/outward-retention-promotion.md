# Outward retention: main-source promotion

Date: 2026-09-08. This promotion brings the independently reviewed
[isolated retention implementation](outward-retention.md) into the linked pure
math libraries. It does not enable mixed execution in Storage or the router.
Existing M/B/P certificate, immutable configuration and authenticated library-link
hypotheses remain mandatory. Only the outer `FrontierPathCertified` result can
authorize its proposed raw output.

`FrontierEndpoint` preserves the ideal root prefix and now returns the separately
certified actual prefix and retention count. A differing actual prefix requires
the original final-state membership check and a successful reverse GRID release
from the actual fixed-input point to the certified root high, with exactly the
canonical prefix difference. The single final raw floor, combined one-quantum
shortfall, and all same-prefix checks remain intact. `FrontierComposition` keeps
the original initial-release, ideal-event/arc and 160-step refinement checks,
then appends ascending outward retention keys with an explicit `finalRetention`
flag and charges the caller's same crossing allowance. The radial defect proof
is the fixed-prefix Lipschitz and nonpositive outward-jump argument in the
[proposal](../../docs/audits/OUTWARD_RETENTION_PROPOSAL.md); it applies to the final
actual prefix, without an additional allowance per seam.

The promoted source bytes are identical to the two isolated bodies reviewed by
the root and backend agents. New [OutwardRetention tests](../../packages/contracts/test/OutwardRetention.t.sol)
cover the exact-seam and seven-seam paths, ordinary/targeted roots, distinct
transition phases, insufficient combined allowance, final-frame authentication,
invalid reused bounds/high, unchanged arrays, zero-budget finalization, invalid
metadata and retained hidden-domain rejection. Only the two prior tests
specifically demanding the old repartition deferral are replaced, with stronger
same-case assertions for actual prefix, raw output, membership, phase and budget.

The new sixth [reference test](../../packages/reference/tests/test_outward_retention.py)
binds all six main Solidity root/shortfall/radial-slack literals to the independent
110/160-digit explicit-basket corpus. Its focused run passed 6/6 in 5.539 seconds.
The reference data remains bounded numerical evidence; the complete segment
argument comes from the named proofs, not its finite samples.

Tests-first main RED retained **15 expected failures and 35 passes across three
suites**, with only result shape and tests changed. The promoted behavioral
bodies then passed **148/148 tests across 12 suites**, with no failures or skips.
No legacy tests are filtered from the main GREEN run. Solidity 0.8.30 compiled
the ten affected files in 146.66 seconds; the suites completed in 3.97 seconds.
The seeded primitive fuzz campaigns remain green.

The actual main linked quote reproduces the isolated measurements: 1,302,534
gas for the exact-seam retention and 4,127,684 for seven seams. Both use zero
midpoints and preserve 160 remaining. The existing n8/three-tick quote uses
11,585,758 gas, an increase of 4,090 over the byte-copied original baseline.
Composition runtime is 22,635 bytes and Endpoint is 22,458, leaving 1,941 and
2,118 bytes respectively below EIP-170. The dedicated retention consumer is
3,195 bytes; the rebuilt general linked consumer is 3,223. These are measured
helper calls, not full transaction gas acceptance.

The changed return shapes require linked consumers to rebuild. Repository
inspection finds these helpers referenced by their Solidity test consumers and
each other; they are not yet imported by Storage, router, Payments, or the
TypeScript SDK. The relevant Solidity suites rebuild all current linked math
consumers. No new TypeScript API or deployment manifest is introduced.

Reproduction:

```text
python test/evidence/outward-retention/promote_main.py red
python test/evidence/outward-retention/measure_main.py red
python test/evidence/outward-retention/promote_main.py green
python test/evidence/outward-retention/measure_main.py green
python -m unittest discover -s packages/reference/tests -p test_outward_retention.py -v
```

The promotion script requires the exact previously captured original bodies for
RED, then the exact shape-only state and reviewed body hashes for GREEN. It
refuses unrelated source changes. Main RED retains only artifacts actually
compiled by its three selected suites; unrelated historical consumer artifacts
are excluded. Every run stores source hashes, exact command, timestamps, compiler
output, runtime sizes and fixed link dependencies in
[main RED](outward-retention/runs/main-red.json) and
[main GREEN](outward-retention/runs/main-green.json). Main GREEN began at
`2026-09-08T07:25:38.622717+00:00` and completed in 157.653 seconds including
compiler and process overhead.

This component still does not establish supported-range liveness, reachable
raw-state history for its synthetic oracle fixtures, worst-case n8/eight-tick
swap gas, or settlement safety. Actual prefix metadata and retention phases must
be bound by a future authenticated storage/settlement integration. Measured
library gas excludes transaction intrinsic cost, state writes, fees, tokens and
minimum top-level EIP-150 forwarding requirements.
