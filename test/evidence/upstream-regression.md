# Pinned upstream regression comparison

Status: full retained upstream regression passes. Stock and minimal fork each
pass the same 807 tests across 103 suites, with zero failures/skips and unchanged
pre/post inputs. This checkpoint covers those assertions, not exhaustive
equivalence or Orbital release acceptance.

The retained SwapVM source and tests are pinned to
[`f09a41e689240adc645934f965c8061749397cd2`](https://github.com/1inch/swap-vm/tree/f09a41e689240adc645934f965c8061749397cd2).
Its test fixture
[`mocks/ProtocolFeeProviderMock.sol`](https://github.com/1inch/swap-vm/blob/f09a41e689240adc645934f965c8061749397cd2/mocks/ProtocolFeeProviderMock.sol)
was omitted by the original vendoring path filter. Restoring that exact pinned
file to both copies and retaining `mocks/` in the acquisition script fixes the
missing-import failure. Its SHA-256 is
`8307b7117ebe22e2f67fad8256d305b25c6115210f85579eb838279ec0c54aa5`.
The [acquisition ledger](upstream.json) includes this file. The
[fork comparison](fork.json) still reports only the intended `SwapVM.sol`
source modification.

The initial main-contract-root run compiled library sources but discovered no
upstream tests because the retained source lives under the main project's
library directory. That output is not a test pass. Isolated upstream project
roots and explicit remappings select the actual suites. On Windows, the
compiler's allowed paths must include the workspace's resolved pnpm dependency
store; allowing only `packages/contracts` is insufficient. The missing-fixture,
test-filter and allowed-path failures remain in their separate logs.

The successful core run compiled 133 files with Solidity 0.8.30, optimizer 700,
via IR and Cancun in 117.54 seconds. Its two suites are the unchanged
`SwapVMTest` (three limit-order/event tests) and `SwapVMAquaTest` (two Aqua
swaps, including taker-first transfer). Five tests pass, zero fail/skip; see
[core fork output](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/upstream-fork-core.txt). This is standard upstream behavior,
not an Orbital curve test.

The [reproducer](../../scripts/audit-upstream.py) runs the stock and fork trees
with isolated output/cache/snapshot directories, a fixed seed and local profile.
It authenticates the acquisition files, requires identical complete upstream
test trees, hashes input source sets before/after and compares unique passing
test identities. It strips inherited Foundry filters/fork settings and uses
offline compilation. Tests use locally created contracts; an independent source
review found no live RPC/fork, FFI, environment-secret or external fixture
requirements, and no justified suite exclusion.

The runner's acquisition/test-tree/filter guards were strengthened while the
first full baseline compilation was in progress. That preliminary execution
passed 807 tests in 103 suites but correctly failed the reproducibility guard
because the runner source changed; its transcript/manifest remain under
`upstream-stock-all-preliminary.*`. A fresh cached stock execution under the
final runner passed all 807 tests, zero failed/skipped, in 21.33 seconds of test
execution, with unchanged pre/post inputs. See [stock result](upstream-stock-all.json)
and [transcript](upstream-stock-all.txt). The full fork run subsequently passed
all 807 tests in the same 103 suites, zero failed/skipped, with unchanged pre/post
inputs. Its test execution took 21.56 seconds; the captured interval including
compilation was 2,080.60 seconds. Both tool invocations exited zero and their
recorded transcript hashes were independently rechecked. The
[comparison](upstream-comparison-all.json) confirms identical unique passing
test identities; [fork manifest](upstream-fork-all.json) and
[transcript](upstream-fork-all.txt) retain the exact inputs and output. Gas
snapshot equality is disabled because the intended hook/dispatch changes can
affect gas.

```text
python scripts/audit-upstream.py --suite core
python scripts/audit-upstream.py --suite all
```

Matching pass identities proves only the assertions exercised by these unchanged
tests. It is not exhaustive output/state/revert equivalence for arbitrary input,
the full Orbital differential campaign, a gas-equivalence claim or deployment
verification. The full retained upstream regression requirement passes for this
recorded source/compiler/dependency checkpoint; Orbital's own mathematical,
financial and release campaigns remain separate.
