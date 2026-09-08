# Certified traversal integration boundary

Status: implementation plan, 2026-09-08. The production router currently calls
the certified all-interior path. The separately tested composition/endpoint
libraries do not yet write mixed strategy state or settled crossing events.
This note records the concrete integration obligations; it does not close a gate.

## State and execution

Preserve the existing guarded validation, immutable tick coefficients, token
metadata checks, gross/net fee wrapper and official Aqua settlement. Pass the
decoded caller `maxCrossings` to the composition entry, under its existing
16-crossing and 160-refinement limits. Only the outer
`FrontierPathCertified` result authorizes its nested endpoint payout.

Retain the inexpensive interior path. A narrow nonthrowing interior probe may
report that traversal is needed only at its existing initial/final strict cap
tests. Preserve all other invalid-input and certificate failures. The existing
`InteriorSwap.exactInput` API can retain its current reverting behavior for
callers/tests. No broad catch of arithmetic, backing or certificate failures may
silently authorize another financial result.

For a certified result, recompute durable metadata from the **actual final**
reserves and actual canonical prefix, not the ideal root prefix:

- `principalInternal[i] = X[i] - virtualInternal`; preserve virtual credit and
  accrued fees. Accrue only the surrounding instruction's one upward-rounded fee.
- Recompute the exact sum and wide sum of squares.
- Sum remaining tick radii; sum boundary `radius * key` numerators and the
  immutable lower/upper sigma contributions captured at initialization.
- Persist the interior suffix mask, including the mandatory anchor, and the
  certified one-quantum final slack bound; increment the version once.

The canonical prefix comparison and wide reconstruction use the existing
[MATH](../MATH.md) and [NUMERICS](../NUMERICS.md) conventions. Confirm the returned
prefix matches the independently recomputed prefix before committing. All
token backing and physical/logical settlement delta checks remain mandatory.

## Crossing events and static calls

The existing settled event ABI contains ordered keys and inward flags. It can
represent the complete initial-release, ideal-frontier and final-retention
sequence in that order without changing its ABI. The new internal phase flags
must not be mistaken for additional ideal-frontier input progress.

If a guarded transient execution record is used to carry these arrays from the
curve instruction to settlement, bind it to the current order and clear it on
successful completion before releasing the global lock. Failed settlement must
roll back it together with principal, fees and version. A static quote must not
write the record, durable state or events. Preserve the final event's placement
after exact token/allowance checks. Validate consecutive different strategies so
no stale crossing record can leak into another maker's event.

## Concrete numerical and integration checks

The independent initialized sequence in
[reachable-traversal.json](../../packages/reference/fixtures/reachable-traversal.json)
starts from the existing three-token/three-tick configuration: radii
100/200/400 whole units, keys 1.5/1.75/full, 6/18/6 decimals and 500 ppm fees.
It derives the actual directed initial reserves and funding ceilings from the
separate paper slice initializer oracle.

The first gross input is 350 units of token 0, net 349.825, paying
164.721797 units of token 2 across one outward frontier. From that actual raw
payout endpoint, gross input 500 units of token 2, net 499.75, pays
513.016094 units of token 0 across inward then outward frontiers. These are
precision-stable reference results, not onchain receipts or accepted Solidity
results. The second numerical endpoint uses an independently checked price-space
guess after the inherited Newton guess encountered a singular Jacobian.

Before accepting integration, require successful real router/Aqua execution from
activation, the independent outputs and all prefix/moment/fee/backing metadata,
ordered settled events, lower-crossing-budget rollback, static quote purity,
failed-settlement rollback and recovery, maker separation, all six pair
regressions and a swap-funded invoice. Test caller arrays/phase data as
non-authoritative on any unsuccessful certificate.

Measure the actual complete swaps, maximum-config activation, linked runtime and
creation bytecode. The graph gains composition and endpoint library links; local
artifact closure verification and future deployment identity must include them.
Do not infer complete transaction headroom from prior pure-helper measurements.
Remaining equality/discovery failures and the full supported-range/release
campaign are separate obligations even if this initialized sequence succeeds.
