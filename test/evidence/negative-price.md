# Strict negative-price event exclusion

The initialized three-token sequence now certifies both reference outputs:
164721797 raw token 2 for net 349825000 raw token 0, followed from that actual
rounded endpoint by 513016094 raw token 0 for net 499750000 raw token 2. The
second schedule preserves its inward and outward key-1.5 crossings while
excluding only a strictly proved negative-price key-1.75 algebraic root.

The [proof](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/NEGATIVE_PRICE_EXCLUSION.md) requires original
`atKey` provenance, directed coefficient bounds, the full-range anchor and the
existing event/arc certificates. The new internal predicate uses lower absolute
coordinate bounds and strict wide comparison. A failed physical check alone
still provides no exclusion. Candidate ABI, both-root generation, event order,
canonical prefix checks, caller crossing allowance and shared 160 refinement
budget are unchanged.

The exact n6 regression has a zero untouched price at both separated roots and
a positive output price. Its in-window event remains uncertain. Independent
Python `Fraction` baskets and `isqrt` certify that fixture exactly, without a
floating-point tolerance or production arithmetic. Wide n2 positive and n3
negative cases, both branch signs, and the reversed cumulative-output bound are
also tested. Two old key-1.8 deferral assertions now require the strict exclusion
and complete same-case success; zero-price uncertainty remains separately tested.

Tests were written before behavior: the false predicate stub/unchanged schedule
produced 5 expected failures and 6 passes. The first implementation run produced
44 passes and only the 2 anticipated historical-deferral assertion failures.
After replacing those assertions with stronger certificate checks and replacing
the diagnostic-only test with an actual crossing-budget check, the final focused
run passed 167 tests across 15 suites, 0 failures/skips, seed`0x20260908`. Existing
fuzz tests each reported 256 cases. The reference module passed 7/7; its initial
stub had 6 expected failures before the literal-binding test was added.

Commands, hashes and raw logs are in [manifest](negative-price/manifest.json).
Solidity uses 0.8.30, optimizer 700, viaIR, Cancun. The final compile took 84.78s;
the test runner reported 3.61s. These are bounded regressions, not the full
supported-range, mutation, invariant or release campaign.

| Actual cold-linked helper call | Gas including call ABI | Helper body | Refinements |
|---|---:|---:|---:|
| Initialized first outward trade | 4,125,599 | 4,111,162 | 30 |
| Reverse from actual first payout | 4,884,444 | 4,869,178 | 29 |

Fixture setup and assertions are excluded from those measurements. Each call
cools the composition and endpoint library addresses. Runtime sizes are
composition 23,138 bytes (1,438 bytes below EIP170) and endpoint 22,458 (2,118
below). Existing named n8 linked helper remains 11,585,740 gas. These figures
exclude Router state, fees, token/Aqua settlement, transaction intrinsic cost
and minimum EIP150 forwarding headroom. They do not establish complete swap gas
or target-network deployment acceptance.

Root reviewed the proof; backend independently reviewed both proof and V/F
source without finding a concrete defect under their stated hypotheses. Real
Router integration is the next task and is not claimed by these pure results.
