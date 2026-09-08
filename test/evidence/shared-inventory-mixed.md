# Shared maker inventory replay on the mixed-capable router

Observed 2026-09-08: the unchanged [SharedInventory harness](../../packages/contracts/test/SharedInventory.t.sol) completed **64/64 seeded sequences** against a fresh byte-frozen copy of the newly integrated mixed-capable Router/Storage/Composition/Endpoint graph. The historical all-interior graph results in [shared-inventory.md](shared-inventory.md) remain unchanged.

Run `python test/evidence/shared-inventory/run-mixed.py fuzz`. The replay began at `2026-09-08T08:36:30.444827+00:00`, compiled 97 source files in 72.50 seconds, and completed its test suite in 39.20 seconds (runner 116.886 seconds). Solc 0.8.30, optimizer 700, viaIR, Cancun; Forge 1.5.1; two threads; seed `0x20260908`. Every recorded source/config/runner input was unchanged before and after the run.

Each complete sequence executes 35 swaps and 43 successful static quotes across A0/A1 sharing maker A and B0 belonging to maker B, all six directed pairs on every strategy, four expected funding quote failures, four expected funding swap failures, and three independent retirement/dock operations. Aggregates derived from the 64 successful complete sequences are 2,240 swaps, 2,752 quotes, 256 expected quote failures, 256 expected swap failures, and 192 retirement/dock operations. These are execution counts, not additional test counts.

The same exact principal/fee/version/Aqua allocation and shared physical inventory ghosts, allowance restoration, rollback snapshots, bounded interior drift argument, and independent maker/strategy closure checks described in the baseline evidence apply. A1 and B0 remain usable after A0 closes. The fixed tokens are two six-decimal tokens and one eighteen-decimal token sorted by their deployed addresses; the eighteen-decimal token is not forced into the middle address position.

This replay validates the all-interior execution path on the new production graph. It does **not** establish mixed-boundary shared-inventory behavior, invoice atomicity, a full G3/G8 campaign, or Arc deployment. Funding failures occur during preflight. No reverted-receipt log claim is made here.

The separate [manifest](shared-inventory/mixed/manifest.json), [run result](shared-inventory/mixed/fuzz.json), [stdout](shared-inventory/mixed/fuzz.txt), [effective config](shared-inventory/mixed/fuzz-config.json), [source pins](shared-inventory/mixed/source-pins.json), and source archive preserve the exact finite checkpoint. `make-mixed-manifest.py` verifies the recorded bytes before producing its computation manifest.
