# Complete existing engine suites

The complete existing contract suite passed **404 tests across 47 suites, with 0 failures and 0 skips**. It took **570.657 seconds**, including 401.37 seconds compiling 22 stale cache units and 162.36 seconds running the tests. All 158 pinned inputs were unchanged; version 2 manifest validation passed. The stateful invariant completed **32 runs / 2,048 calls / 0 reverts** under its existing default settings.

The complete existing Python reference suite passed **129 tests, with 0 failures and 0 skips**, in **54.422 seconds** of bounded-command runtime (52.604 seconds reported by unittest). All 109 pinned inputs were unchanged and its version 2 manifest also validated. Both runs started from `0dc0ac2a44469c797155009d3ae746654ccfb0ac` with dirty worktrees: evidence changes at the contract start, and concurrent frontend/evidence changes at the reference start. The recorded engine/reference inputs did not change. These results were recorded on 2026-09-09.

This checkpoint runs the complete existing contract suite and Python reference suite, separately from the [eight-case integration smoke check](../engine-basic/README.md). It does not add an audit, release campaign, implementation change or live wallet transaction.

The [aggregate report](summary.json) records the final status of both suites. Each suite retains raw stdout/stderr and a version 2 computation manifest with its own starting Git revision, dirty state, actual command, source hashes before/after, runtime, exit status and enforced resource limits.

## Scope and commands

The contract command follows the existing repository full-suite runner, `scripts/audit-contracts.py`, while writing only new evidence in this directory:

```powershell
forge test --root packages/contracts --offline --threads 2 --fuzz-seed 0x20260908
```

All existing `packages/contracts/test` tests are included; no method, contract or path filter is applied. The default profile uses **256 fuzz runs**, **32 invariant runs** and **depth 64**. The existing strict `FOUNDRY_INVARIANT_FAIL_ON_REVERT=true` setting is retained so invariant reverts cannot silently become discarded cases. `FOUNDRY_GAS_SNAPSHOT_CHECK=false` keeps separate gas-snapshot comparisons outside this ordinary suite. Other inherited Foundry/Dapp profile/filter overrides are removed, as are external RPC/etherscan variables.

The Solidity compiler remains **0.8.30**, optimizer **700**, via IR, **Cancun**. Normal compilation caching is reused. The run pins all production/test source files and recursively resolves their Solidity imports through the repository remappings: 153 source units from 47 test files plus compiler/package/driver configuration, 158 input artifacts in total. The [source-unit map](contract-source-units.json) includes the resolved dependency paths; the manifest contains file hashes. Tests do not use FFI, external RPC or dynamic file-reading cheatcodes.

The reference command is the documented repository unittest suite:

```powershell
python -m unittest discover -s packages/reference/tests -v
```

It retains existing per-test precision, exact arithmetic, fixture comparisons and literal-binding checks. Python **3.12.10** and **mpmath 1.3.0** are used. All reference Python/JSON/text inputs and contract test files used by the reference literal checks are pinned; generated caches are excluded. Individual suite results are in [contracts-summary.json](contracts-summary.json) and [reference-summary.json](reference-summary.json).

## Bounds and reproduction

Both commands have a **1,800-second wall limit** and **8 MiB combined log limit**. They run sequentially on the Windows 11 host with 7.8 GB physical memory. Forge uses two test threads; cooperative numerical-library thread caps are recorded. No hard Windows memory/CPU/process-tree limit is claimed.

The [driver](run.py) uses the installed computation-audit bounded runner. Its `main(argv)` entry point is called directly to avoid Windows command-line length limits for the full source closure; the executed program still receives a literal argument array. The driver refuses to overwrite an existing suite directory.

```powershell
python -X utf8 test/evidence/engine-suite/run.py <installed-computation-audit-skill-directory> all
python <installed-computation-audit-skill-directory>/scripts/validate_manifest.py test/evidence/engine-suite/contracts/manifest.json --root .
python <installed-computation-audit-skill-directory>/scripts/validate_manifest.py test/evidence/engine-suite/reference/manifest.json --root .
```

Use a fresh evidence output directory for another run. Both the contract and reference result must be nonempty, have zero failures and skips, retain stable inputs, and pass manifest validation to receive a passing aggregate status. A zero process exit or a valid provenance schema alone is insufficient.

The first `all` driver invocation completed the contract suite, wrote its successful summary and validated its manifest, then the Windows cp1252 console could not echo Forge's `μ` character. This was an output-encoding failure after evidence capture, not a contract test failure. The reference-only continuation uses `python -X utf8 ... reference`; contracts were not rerun or altered. Reproduction commands above include UTF-8 mode to avoid that console issue.

## Interpretation

A passing result reproduces the assertions in the **complete existing test suites at their configured finite bounds**. Solidity uses exact integer/wide arithmetic, while reference tests combine exact Python arithmetic with mpmath at their specified precision and tolerances. Those are distinct evidence types.

This is not universal numerical correctness or liveness, an independent engine/security audit, all-size economics, CI/release fuzz counts, a mutation campaign, target-chain worst-case gas acceptance or proof of Privy wallet ownership. The complete engine's release gates and mathematical obligations remain separate. The run does not submit transactions, modify deployment artifacts, regenerate paper provenance, or claim sponsor qualification.
