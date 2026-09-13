# Real interior execution through official Aqua

2026-09-08. The **actual production router**, both canonical custom instructions,
certified all-interior geometry and pinned official Aqua now execute together in
local tests. These tests use test-only dollar tokens. They are not Arc or Privy
receipts, and do not establish complete mixed tick traversal or release readiness.

## Executed checks

`forge test --root packages/contracts --match-contract
'InteriorExecutionTest|FeeInstructionTest|RouterLifecycleTest|OrbitalSettlementTest'
--fuzz-seed 0x20260908 -vv` passed **36 tests**: 7 real execution, 7 fee and 22
lifecycle tests. The final regex term does not match the separate `SettlementTest`
harness; its 12 standalone tests are documented in [settlement.md](settlement.md),
and included in subsequent full runs. [Actual output](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/interior-execution-green.txt).

Before integration, the compiling production unavailable-engine boundary caused
all five initial execution cases to fail. [Red output](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/interior-execution-red.txt).
Canonical event and economic-cycle checks were then added before the successful
integration run; they are not described as part of that five-case red checkpoint.

- Static quotes for every directed pair of one three-token, three-tick strategy
  match independent initial-state Python integer-root goldens. Quotes neither
  log nor alter principal, fees, version or the nonce.
- Sequential real swaps all use that same order and evolving state. They compare
  quote to actual output, gross/net/fee, maker and taker deltas, Aqua allocation,
  all-token backing, unchanged untouched principal, exact A/B and resulting mask.
- Exact wide square inequalities show each resulting payout is feasible and one
  additional raw output unit is outside the aggregate sphere. Stored radial slack
  is at most the actual output token's quantum. The wrapper separately proves caps,
  supporting prices and the connected actual path.
- The canonical execution event appears exactly once, with matching maker,
  order, taker, recipient, pair, gross/net/fee/output/version and empty crossing
  arrays. Empty arrays reflect the strictly interior path actually executed.
- Pre-existing router/adapter donations and a direct third-token Aqua push are
  preserved. A distinct output recipient receives exactly the reported amount.
- Failed minimum output and insufficient maker Aqua allowance roll back state
  and tokens; restoring allowance permits the reviewed trade with no leaked guard.
- A real curve swap settles **5 test USDC units (5,000,000 raw units)** to a 90/10 split:
  4,500,000 and 500,000, with excess output refunded to the payer. The invoice,
  route hash, adapter balances and cleared allowance are checked together.
- **256 seeded two-leg cycle cases** all execute within the initial cap, reverse
  their exact received asset and cannot increase the starting asset. The tests
  do not discard rejected cases. This finite two-leg family is not a general
  economic-cycle proof or the required release campaign.

## Independent mathematics and unit binding

`fixtures_execution.py` uses Python exact integers and `math.isqrt` for the
specified directed initial point. It then uses high-precision roots and explicit
per-tick supporting baskets for twelve one- and six-whole-input cases covering
all six pairs. Every basket satisfies its sphere, cap, nonnegative principal and
price bounds; exact integer arithmetic verifies maximal rounded output. All
integer results agree at 110/160 digits. Its three reference tests pass and bind
the production-test literals to those values.

For the 700-whole-unit total radius and fee 500 ppm, actual initial internal X is
`5457557991956845750465862405150345463304`. One whole gross input produces
`997034` raw six-decimal output or `997034206127854582` raw eighteen-decimal
output. These are fixture results, not advertised live prices.

The complete no-crossing path and one-quantum bound are proved in
[interior-swap.md](interior-swap.md). Router storage supplies the validated
immutable tick table and token decimals; live decimals are rechecked. The helper
loads actual X, never Aqua raw balances as a price state, and commits only for a
nonstatic swap. All aggregate fields are recomputed from the accepted actual X.

Let q_i be the token's internal quantum. The exact changes are
`P_in += (gross-fee)*q_in`, `P_out -= output*q_out`, and `E_in += fee`.
Official Aqua changes Q_in by gross and Q_out by minus output. Therefore each
token's `Q*q-P-E*q` surplus is unchanged by the trade, including existing
donations. The [settlement helper](settlement.md) additionally verifies exact
physical balances, logical allocations and full backing after both transfers
and approval cleanup. Any failure reverts the entire transaction.

## Deployable artifact limits

Pinned compiler: Solidity 0.8.30, Cancun, optimizer 700, via-IR.

| Artifact | Runtime bytes | Creation bytes |
| --- | --- | --- |
| OrbitalSwapVMRouter | 21,919 | 24,294 |
| OrbitalStorage | 18,269 | 18,301 |
| OrbitalSettlement | 6,658 | 6,690 |
| StrategyInitializer | 7,049 | 7,079 |
| OrbitalOrderCodec | 8,153 | 8,183 |

The graph has four immutable libraries, all individually under EIP-170. The
router's production runtime is tested directly; extra test-harness methods are
not deployment code. Deployment must verify all linked addresses and bytecode.
Later source changes require fresh size measurements and integrated evidence.

## Remaining work

Subsequent complete local run: **235 tests across 24 suites passed**, including
the separate settlement harness and seven real-router security regressions.
The standard reference run passed 56 tests, including the three initial-execution
oracle checks. [Full contract output](contracts.txt),
[reference manifest](reference-audit/manifest.json).

Mixed/one-sided key states still return `RequiresTraversal`. Both-root event
ordering, final refinement/output-budget composition, full security/invariant/
mutation/gas campaigns, financial projections/API/controllers, live wallet
transactions and target deployment remain separate obligations. No G1–G8 gate
is closed by this component-level integration.
