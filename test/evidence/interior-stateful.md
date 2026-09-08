# Frozen all-interior stateful accounting campaign

Status: deterministic smoke, pilot, and larger campaign passed on 2026-09-08.
This is a bounded property campaign for the already implemented all-interior
router path. It is not behavioral RED/GREEN implementation evidence, a mixed
traversal campaign, or completion of G8.

## Scope and reproducibility

The test is `packages/contracts/test/InteriorStateful.t.sol`. It deploys the real
Orbital router, its linked production libraries, and official vendored Aqua.
The only token adaptation is an explicitly controlled failed recipient transfer
on an otherwise ordinary ERC-20. There is no curve double, forced state write,
mocked Aqua balance, ignored handler revert, or `assume`/discard.

Because mixed-path router work is concurrent, `interior-stateful/run.py` compiles
an isolated byte copy of the pre-integration import closure in
`.cache/interior-stateful/snapshot`, with its own `out` and `compile-cache`.
`interior-stateful/source-pins.json` authenticates the original 87-source closure.
The 86 protocol/upstream files are retained in
`interior-stateful/source-snapshot.tar.gz`; only the new test source is refreshed
from the working tree during harness development. Each run manifest records its
actual test hash as well as every copied source and the runner/config/archive.
The runner verifies the archived member set and every SHA-256 before restoring
missing files, then verifies the copied set and pre/post hashes around execution.
It does not use `extractall` or read newer protocol files to fill the frozen graph.
The pin entry for the test records the original harness snapshot; use each run's
actual input map for the tested test version.

Compiler settings match the contract project: Solc 0.8.30, optimizer 700, via IR,
Cancun. The artifact confirms `0.8.30+commit.73712a01`; Forge is
`1.5.1-stable`, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`.
The mirror changes source-unit names/remappings, so this is byte-exact **source**
provenance, not a claim that metadata or deployed bytecode equals another build.
No target RPC, signer, native-gas balance, or deployment is involved.
The frozen production router runtime is 21,919 bytes. The cheatcode-based
handler/test runtimes are 31,099/84,047 bytes and rely on Forge's test harness;
they are not EIP-170-deployable application contracts or target-gas benchmarks.

Reproduce from the repository root:

```text
python test/evidence/interior-stateful/run.py smoke
python test/evidence/interior-stateful/run.py pilot
python test/evidence/interior-stateful/run.py ci
```

The runner removes inherited `FOUNDRY_`/`DAPP_` variables, checks effective config,
sets seed `0x20260908`, uses two threads, and compiles offline. All runs have
`invariant.fail_on_revert=true` and `invariant.call_override=false`. The test also
sets these through inline config for default/CI/release profiles. The single
target selector is `InteriorStatefulHandler.step(uint32,uint32,uint8)`.
Foundry's end-of-run `afterInvariant` hook performs terminal retirement/docking;
the supported hook and inline settings are documented in the official
[invariant guide](https://getfoundry.sh/forge/invariant-testing) and
[inline config reference](https://www.getfoundry.sh/config/reference/inline-test-config).

## Non-vacuous operations and exact ghosts

One canonical three-token strategy has two 6-decimal tokens and one 18-decimal
token sorted by deployed address, fee
500 ppm, tick keys `1.5 GRID`, `1.75 GRID`, and the sentinel, and radii
100/200/400 whole internal units. Publication uses directed initializer amounts,
maker approval, real Aqua shipping, and actual router activation after ownership
renunciation. Fixture construction intentionally uses production coefficients;
the independent initializer and curve oracles remain separate evidence.

Every handler call starts with a real static quote and finishes with a successful
real swap. Directed pair `step mod 6` cycles through all six pairs. Randomized
arguments select gross amounts, donation sizes/assets, and taker versus a separate
recipient. Pre-actions cycle through ordinary execution, direct donor-to-router
transfer, donor-to-maker Aqua push, and an explicitly rejected output transfer.
Donation/recovery steps re-quote and require the same output. Rejection requires
the exact pinned Aqua `SafeTransferFromFailed()` wrapper, compares a complete
financial snapshot, clears the token flag, then succeeds on the same route.
The failure cycle visits pairs 0→2, 1→0, and 2→1; successful swaps cover all six.
This campaign does not claim every pair/pre-action Cartesian combination.

Independent integer ghosts update fee by `ceil(gross/2000)`, principal by net
input and actual output only, and Aqua/physical input by gross input. After every
step they check exact principal, cumulative fee, version, reconstructed X,
sum/sum-of-squares, unchanged virtual credit/config/nonce, and one canonical
`OrbitalSwapExecuted` with exact roles, pair, amounts, version, and empty crossing
arrays. Every token checks:

```text
Aqua allocation × normalization scale
  = principal internal + cumulative fee raw × scale + inert surplus internal
```

All maker/taker/donor/recipient/router balances, total supply, zero Aqua/handler
custody, live-token count, full backing, funding ceiling, zero deficits, exact
surplus, maker/taker approvals, consumed donor approvals, and cleared
router-to-Aqua approvals are checked. Direct router donations remain inert;
Aqua pushes increase only maker balance/allocation/surplus. Quote snapshots cover
financial storage/views, balances, and allowances and require no emitted logs.

The failed transfer is asserted before canonical swap emission. `recordLogs` is
an execution inspector and can include reverted token logs; it is **not** proof
that a reverted transaction receipt has no logs. Actual reverted-receipt evidence
is a separate security campaign.

At each run's end, assertions require all six pairs and every pre-action mode,
retire as maker, dock all tokens through Aqua, and prove the only strategy-state
change is status plus one version increment. Docking sets allocations to zero
and raw live count to 255, disables funding/quoting, and moves no maker tokens.
The deliberately donated router assets remain where the donor sent them; no user
withdrawal claim or escrowed LP principal is inferred.

## Finite all-interior bound

Write one whole internal unit as `10^18 × 2^64`, radius `R=700` whole units,
and `qmax=10^-6` whole units. The activated X coordinate is asserted strictly
between 295 and 296. Work in the bootstrap box `[288,300]^3`; then each normal
component `g_i=R−X_i` lies in `[400,412]`. Every successful endpoint independently
checks the all-interior sphere formula using exact wide integer products:

```text
(R−qmax)^2 ≤ Σ_i (R−X_i)^2 ≤ R^2.
```

The existing wide arithmetic is a shared tested dependency; this formula is
independent of the production root algorithm, not a second implementation of
wide multiplication. Gross input is 0.001–0.01 whole units inclusive, and net
input `d≤0.01`. Adding d decreases the squared norm by at most `824d`; releasing
ideal output y increases it by at least `800y`. Initial radial slack contributes
at most `2R qmax`. Therefore

```text
y ≤ 1.03 d + 1.75 qmax < 2 d + 2 qmax.
```

Conservative raw output is no larger; the handler also checks that looser bound.
Even assigning all 256 inputs or all 256 outputs to one coordinate gives upward
drift at most 2.56 and downward drift less than 5.120512. Thus every coordinate
stays strictly inside the bootstrap box (`>289.879488` and `<298.56`). Its sum is
at most 900, strictly below the first seam `R×1.5=1050`. The bound covers both
the 128-depth campaign here and the test's hard maximum of 256 calls. It does not
justify unbounded histories. Runtime assertions require positive quote/swap
output; a failed feasibility or liveness check fails the campaign.

## Observed results

The initial harness needed compilation/config corrections and correction of its
expected wrapped transfer error. These were test setup defects; no production
behavior was changed or protocol counterexample hidden.

| Stage | Observed result | Exact operations |
| --- | --- | --- |
| Deterministic smoke | 1/1 passed | 12 swaps, 21 quotes, 3 expected transfer failures/recoveries, 3 router donations, 3 Aqua pushes, all six pairs, final retire/dock |
| Pilot | 32 runs × 64 depth; 2,048 calls; 0 reverts; 0 discards | Each run asserts 64 swaps, 112 quotes, 16 failures/recoveries, 16 router donations, 16 Aqua pushes, all six pairs, final retire/dock |
| Larger campaign | 256 runs × 128 depth; 32,768 calls; 0 reverts; 0 discards | Each run asserts 128 swaps, 224 quotes, 32 failures/recoveries, 32 router donations, 32 Aqua pushes, all six pairs, final retire/dock |

The retained transcripts and machine-readable manifests are under
`interior-stateful/`. Pilot began `2026-09-08T07:41:21.951725+00:00`, with
29.18 seconds reported by the Forge suite and 33.40 seconds for the captured
runner interval. Its pre/post changed-input list is empty.

The larger campaign began `2026-09-08T07:42:13.381356+00:00`, with 467.85 seconds
reported by Forge and 470.85 seconds for the captured runner interval. Its
pre/post changed-input list is also empty. From the reported 256 full runs and
the asserted deterministic cycles, this represents 32,768 successful swaps,
57,344 quotes, 8,192 expected transfer-failure recoveries, 8,192 router donations,
8,192 Aqua pushes, and 256 retire/dock sequences. These totals are derived
operation counts, not separately defined test cases.

`interior-stateful/manifest.json` follows the computation-audit manifest schema
and passed the installed skill's structural validator.
`python test/evidence/interior-stateful/make_manifest.py` verifies the transcript,
all recorded current hashes, and exact run/call/log counts before regenerating
it. Final test SHA-256:
`8a565158b8af8514b640b8439c60f2525b3dfa381753f6b36355cddf21196027`.
Runner SHA-256:
`1228c2adeb6eaf714c3cc7fd87ade342b010d0b644f4f77c3e5d5b362add8948`.
Frozen source archive SHA-256:
`9c9ca123355806277b817c567a0ded4af4bf9c35cb9be2adfa8a276f4f9c0ad7`.

This does not close the larger mandatory stateful matrix: multiple makers,
shared-wallet strategies, allowance depletion and replenishment, external maker
spending, invoices, arbitrary mid-sequence lifecycle operations, mixed ticks,
more token/decimal/radius ranges, and the release campaign's three seeds remain
separate obligations. One property test with thousands of executions is not
thousands of independently defined tests, nor a universal conservation proof.
