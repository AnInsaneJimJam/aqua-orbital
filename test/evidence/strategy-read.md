# Liquidity registry and strategy inventory

`/liquidity` now reads the connected maker's paginated registered history with
active/retired filters and an explicit restart after an orphaned cursor. Cards
read current strategy details independently; each inventory has its own block
label. `/liquidity/[strategyHash]` is public and shows exact principal, received
fees, Aqua allocation, wallet balance/allowance, conservative output capacity,
tick classification and activation/latest-update receipts.

The SDK binds deployment identity, canonical config/order bytes, requested maker
or hash, receipt ordering, cursor scope/order, coverage, freshness and exact
accounting. It checks principal/virtual-reserve reconstruction, sums/squares,
tick-mask bookkeeping and Aqua backing/capacity. These are consistency checks on
read observations, not a new curve solver, mathematical proof or signing permit.
Principal uses its exact terminating decimal in whole-token units; capacity is
separately floored to transferable token units. Fees are never added to principal.

The current API covers registered strategies only. Unactivated shipments are
explicitly excluded; an empty page cannot imply that no pending shipment exists.
Neither a current card nor its output ceiling proves that a curve trade will
execute. Pagination is not an aggregate funding report: strategies can share the
same wallet funds. Preset names are not inferred from unrelated tick configurations.

Verification performed before the owner's request to defer broad testing:

- [SDK red](strategy-read/sdk-red.txt), followed by
  [six focused SDK cases](strategy-read/sdk-focused.txt).
- [Browser red](strategy-read/browser-red.txt) established the missing detail UI;
  [six focused Chromium cases](strategy-read/browser-focused.txt) then passed.
  These cover exact mobile inventory, failed/deployment-mismatched refresh,
  stale/historical state, indexed absence, wallet/filter changes and cursor recovery.
  The [320px screenshot](strategy-read/detail-mobile.png) was visually inspected.
- The subsequent [SDK run](strategy-read/final/sdk.txt) passed **129 tests** and
  [shared run](strategy-read/final/shared.txt) passed **7**, with frozen inputs.
  The [broader browser checkpoint](strategy-read/final/checkpoint.json) was
  intentionally interrupted at the owner's request and is **not accepted**.
  [Interruption details](strategy-read/interruption.md).
- A focused web typecheck found a fixture address typing error; the correction
  is recorded [here](strategy-read/type-failure.md). The current smoke runner
  checks the production build and workspace types without another test campaign.
  Its [checkpoint](strategy-read/smoke/checkpoint.json) is the authority for status.

The focused browser run preceded the fixture type annotation and an extra SDK
check requiring docked Aqua entries to have zero allocation. The full SDK run
includes that final decoder change. No new full browser count is claimed.

No contracts, financial transaction controllers or API implementation were changed.
The previous 72-browser and 210-API checkpoints remain separate observations.
No real wallet, persistent deployment, live Privy flow or Arc release is verified.
Publication, owner lifecycle actions, shipment indexing, activity history and the
full integrated demo remain separate work.
