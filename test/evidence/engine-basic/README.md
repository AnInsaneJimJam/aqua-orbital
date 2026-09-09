# Basic engine integration validation

**8 passed, 0 failed, 0 skipped**, completed 2026-09-09. Total bounded-command runtime was **82.766 seconds**, including 70.43 seconds compiling two stale cache units; the three test suites took 554.67 ms. All **109 input artifacts** (including the 101-unit source closure) retained identical before/after hashes. Manifest validation passed. The run started at commit `0d044ce5a5d89703c0ce1de182db84d866d04323` with a dirty worktree; the engine sources were unchanged.

This is a deliberately small local integration check, separate from the numerical audit and release campaigns. The exact result is recorded in [summary.json](summary.json), with the executed command, runtime, Git revision/dirty state, and input hashes in the [version 2 manifest](verified/manifest.json). The selected cases use the production router, existing custom SwapVM instructions and pinned upstream Aqua source with local test tokens.

## Computational contract

Eight deterministic test methods exercise the following existing behavior. No fuzz or invariant campaign is selected.

| Cases | Existing assertion checked |
| --- | --- |
| Interior static quotes | All six directed pairs match the retained independently calculated integer-sphere initial-state outputs; quotes preserve strategy state. |
| Six sequential interior swaps | One evolving order settles each directed pair, with exact maker/taker token deltas, Aqua allocation, gross/net/fee separation, principal, version and backing checks. Wide integer square comparisons check feasible payout and infeasibility of one extra output unit. |
| Mixed outward and reverse | An initialized 350-unit input yields 164.721797 output units; the subsequent 500-unit reverse input yields 513.016094 units, with expected crossings and state/fee changes. |
| Mixed static quotes | Both selected mixed quotes preserve state and produce no crossing events. |
| Crossing budget rollback | Insufficient crossing limits revert without changing the tracked state; the adequate limits then permit the same sequence. |
| Post-transfer rollback | An adversarial test token changes a transfer amount; settlement rejects it, state and pending data roll back, and restoring normal token behavior allows execution. |
| Mixed invoice success | The same outward swap funds a 150-unit invoice split 135/15; 14.721797 excess units are refunded, donations remain untouched, and temporary approvals are cleared. Duplicate payment is rejected. |
| Mixed invoice recovery | Failure at the second payout recipient rolls back the curve, invoice and token accounting; restoring the recipient permits payment. |

Arithmetic is exact Solidity integer arithmetic with the existing `Uint512` helpers. Internal reserves use 18-decimal units scaled by `2^64`; tick keys use `2^32`. The fixed three-token/three-tick fixtures use 6/18/6 token precision, radii 100/200/400, keys 1.5/1.75/full range, and a 500-ppm fee. Test token addresses are deployed normally; the mixed fixture bounds CREATE2 salt discovery to 4,096 candidates.

Before running Forge, the driver checks that the initial state, two mixed outputs, invoice fee and refund constants match the existing [reachable-traversal fixture](../../../packages/reference/fixtures/reachable-traversal.json). It records the full 101-unit import closure in [source-pins.json](source-pins.json). Fixture generation, higher-precision comparisons and paper authentication are not rerun here.

## Reproduction and provenance

Run the following only in a fresh evidence output directory; the driver refuses to overwrite the recorded `verified/` run:

```powershell
python test/evidence/engine-basic/run-selected.py <installed-computation-audit-skill-directory>
python <installed-computation-audit-skill-directory>/scripts/validate_manifest.py test/evidence/engine-basic/verified/manifest.json --root .
```

The [driver](run-selected.py) explicitly selects the eight method names through `forge test --root packages/contracts`, one test thread, offline dependencies and `-vv`. It reuses the normal project cache. Compiler settings are pinned to Solidity 0.8.30, optimizer 700, via IR, Cancun. [Configuration](configuration.json) records compiler settings, Windows host, hardware, override policy and evidence-tool hashes; the manifest records actual argv and software versions, including Forge 1.5.1.

The runner bounds wall time to 600 seconds and combined output to 1 MiB. It applies cooperative numerical-library thread limits; Forge receives `--threads 1`. No hard Windows memory, CPU or process-tree limit is claimed. No chain RPC, browser wallet, private key or external transaction is used.

The [raw stdout](verified/stdout.txt), [raw stderr](verified/stderr.txt) and [manifest validation output](selected-validation.txt) are retained. A process exit of zero is insufficient: the driver separately verifies the exact set of eight passed names, zero failed/skipped tests, unchanged input hashes and successful evidence validation.

## Retained empty discovery

The [first invocation](run/manifest.json) exited zero but reported **No tests found**, so it is not accepted as a test pass. List-only probes isolated the selection issue: this Forge build discovers no method when `--match-test` anchors the bare method name with a trailing `$`; the same explicit name without that suffix is discovered. The corrected selection retains the explicit eight-name list and validates the exact executed names afterward. The old driver and raw logs remain unchanged for provenance. A missing MixedInvoice cache unit was compiled during a list-only discovery probe; that probe did not run tests or count toward acceptance.

## Interpretation and exclusions

A passing result means these eight finite integration assertions reproduced in the local Foundry EVM. The accounting/rollback expectations are structural properties exercised by the examples; the selected numerical outputs and successful traversal are specific to the fixed states and trade sequence.

This does **not** establish a new mathematical proof, independently audit the engine, authenticate the paper, prove general economic safety or numerical liveness, meet the 8-token/8-tick worst-case gas requirement, or close complete-engine release acceptance. The recipient failure test uses Foundry revert semantics; this run does not create new mined failure receipts. Arc deployment, Privy wallet association, sponsor qualification and broad fuzz/invariant/mutation/security campaigns remain separate evidence.
