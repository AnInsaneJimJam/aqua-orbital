# Outward retention: isolated endpoint/composition experiment

This file records the isolated checkpoint before the subsequently authorized
[main-source promotion](outward-retention-promotion.md).

Date: 2026-09-08. This is an isolated implementation of the repository-derived
[retention proposal](../../docs/audits/OUTWARD_RETENTION_PROPOSAL.md), under the
existing root, membership, GRID-release, and immutable coefficient-provenance
hypotheses. It does not change the production contract graph, activate mixed
router execution, establish reachable raw-token history, or close G1/G8.

## Exact code boundary

The frozen production closure is copied to
`.cache/outward-retention/baseline/libraries`; only the experiment copies of
`FrontierEndpoint.sol` and `FrontierComposition.sol` change. The experiment keeps
their existing public linked entries and all root/seed/refinement formulas.

Endpoint results add `actualBoundaryCount` and `retentionCrossings`. Once the
existing single output floor and combined `ceil((actualOut*GRID-lo)/GRID)<=q`
check pass, the endpoint computes actual canonical prefix `j`. It certifies the
actual reserves with the original `M.certify`. For `j>k`, where `k` remains the
ideal root prefix, it requires

```text
P.certifyInwardReleaseToGrid(finalActual, ticks, output, root.hi, k)
    == (true, j-k).
```

These are the final fixed-input reserves; the original pre-input vector would
prove a different vertical line. Failed reconstruction leaves an uncertified
status. Failed reverse release remains `RequiresRepartition`, which is a
deferral, not a proof of global infeasibility. The prior same-prefix extended
domain checks are unchanged. Every metadata field in an unsuccessful result
remains non-authoritative.

Composition retains its initial-release proof, original-frame event schedule,
full ideal-arc checks, and shared 160-step first/resume ledger. Only after those
checks succeed does it charge the returned retention count against the
schedule's remaining caller allowance. Insufficient allowance returns
`TransitionLimit` before allocating transitions or authorizing payout. Successful
results append keys `k..j-1` in ascending order, with `inward=false`,
`initialRelease=false`, and a new `finalRetention=true` flag. Earlier transition
flags remain unchanged. These are final accounting seams, not ideal frontier
output-progress events. No intermediate raw payment, additional token floor, or
per-seam economic allowance is introduced.

## Conditional proof and scope

The existing root certificate supplies the exact ideal root `z`, its global
support optimum, and the feasible same-prefix interval from `z` to `hi`.
Reverse GRID release supplies all points from `hi` to the actual final point,
including both one-sided seam reconstructions and hidden coordinate extrema.

For exact immutable coefficients, the fixed-prefix map
`T=((sum(X)-K-nR)/sqrt(n), ||PX||-S)` is 1-Lipschitz: its axial difference and
transverse norm difference are bounded by the two orthogonal components of
`Delta X`. At an outward seam, with `c=(b-n)/sqrt(n)` and `s=sqrt(1-c*c)`,
`T_old=T_new+r(c,s)` and `||(c,s)||=1`. The triangle inequality therefore yields
`delta_new<=delta_old` for `delta=R-||T||`. Starting with zero defect at the exact
root, the total final-prefix radial defect is at most the total vertical
distance, hence at most the existing combined shortfall bound and one raw
output quantum. This uses NUM-11 through NUM-14; it does not assert continuous
per-tick slack baskets at a seam or a monotone clipped raw-payment path.

The inherited original-length `<2^160` bound makes all lifted coordinates
`<2^192`; canonical sum/key comparisons remain below `2^195`. Each retention
walk has at most seven seams. Both prefixes exclude the mandatory interior
anchor, so every remaining interior radius is positive. The existing P/M wide
arithmetic bounds apply without a new product or rounding operation. Total
release + frontier + retention transitions are bounded by the caller's limit,
which is checked `<=16`; midpoint work is unchanged and bounded by 160.

Independent read-only source review by the backend agent found no concrete
false acceptance under these named helper and provenance hypotheses. Public
library calls remain conditional pure math; deployment must authenticate the
library code/links and immutable strategy metadata. New return fields alter the
linked ABI and require all consumers to rebuild before any production promotion.

## Tests and numerical evidence

The independent [generator](../../packages/reference/fixtures_outward_retention.py)
and [tests](../../packages/reference/tests/test_outward_retention.py) use explicit
per-tick supporting baskets and MATH-7 reconstruction. Two 110/160-digit corpora
agree exactly after serialization: the existing n3 exact-seam arrival changes
ideal prefix 0 to actual prefix 1; the n3/eight-tick case changes prefix 0 to 7.
Both share the same exact ideal reserve root. The outputs are respectively
`18669858` at six decimals and `18` at zero decimals. The reference checks both
reconstructions at all eight total seams, nine points in every retention
segment, per-tick prices/principal/caps, the final radial defect and one-extra-raw
support infeasibility. These numerical samples and residual-check tolerances
are bounded evidence, not the segment proof or production economic tolerances.

The prototype imports the stable root-floor, shortfall-ceiling and radial-slack
goldens directly from that independently regenerated corpus. Solidity requires
the bracket to enclose the exact root's floor/ceiling and its conservative slack
bound to cover both reference bounds while remaining within one output quantum.

The first shape-only RED run retained 12 expected failures and two passing
metadata/size checks. The first behavior GREEN passed all 14 tests. New tests
cover ordinary/targeted roots, one/seven accounting seams, exact equality counted
once, one-less crossing allowance, wrong original frame, changed-input root
reuse, uncertified high, zero-budget retained-root finalization, immutable caller
arrays and invalid metadata. Final regression additionally checks unchanged
initial/ideal phase flags, the hidden-boundary-coordinate rejection and the prior
root/endpoint/composition/linked/seed suites. The only excluded legacy tests are
the two assertions specifically demanding the old rounded-prefix deferral;
their exact case is now covered by stronger successful retention assertions.

## Reproduction and measured limits

Reproducer and exact behavior patch:

- [measure.py](outward-retention/measure.py) snapshots the source closure, builds
  the test template and records run inputs, generated-source hashes, artifacts,
  commands, compiler output hashes and times.
- [promote_copy.py](outward-retention/promote_copy.py) applies only the isolated
  endpoint/composition behavior changes after requiring a retained RED manifest.
- [Prototype.t.sol.in](outward-retention/Prototype.t.sol.in) contains the focused
  source tests and actual externally called linked consumer.
- [measure_baseline.py](outward-retention/measure_baseline.py) measures the frozen
  original public-library bodies with unchanged linked/seed regression tests.

From the repository root, with a fresh `.cache/outward-retention` workspace:

```text
python test/evidence/outward-retention/measure.py init
python test/evidence/outward-retention/measure.py red
python test/evidence/outward-retention/promote_copy.py
python test/evidence/outward-retention/measure.py regression
python test/evidence/outward-retention/measure_baseline.py
```

The retained historical RED used the initial 14-test template; later phase and
counterexample tests strengthen the final suite. The final manifest records both
historical and final template hashes rather than claiming those templates are
identical. `.cache` is an isolated build area, not a production source directory.
The generator refuses changed frozen production inputs on later runs. It uses
separate `FOUNDRY_SRC`, `FOUNDRY_TEST`, `FOUNDRY_OUT`, and `FOUNDRY_CACHE_PATH`;
the main Foundry artifacts are untouched.

Compiler settings remain Solidity 0.8.30, optimizer 700, via IR, Cancun, with
seed `0x20260908`. Gas measures an actual cold deployed consumer call, after
fixture construction and address cooling, including ABI and nested linked-call
work. It excludes transaction intrinsic gas, real router/state writes, fee and
token settlement, and EIP-150 top-level forwarding requirements. It is not a
complete-swap budget certificate. No gas cap or mathematical range is weakened.

The isolated final regression passed **146/146 tests across 12 suites**, including
16 focused retention tests. The byte-copied original baseline separately passed
19/19 unchanged linked/seed tests. The final regression's Forge process exited
successfully and saved its log/manifest; the wrapper subsequently failed while
printing a Greek `mu` to Windows CP1252. Console forwarding was corrected to
write the original UTF-8 bytes; no mathematical test was rerun or reinterpreted
to repair that reporting-only failure.

| Actual cold linked quote | Original bodies | Retention bodies |
|---|---:|---:|
| n2 ordinary, two ticks | 5,867,849 | 5,870,931 |
| n3 ordinary, three ticks | 7,104,461 | 7,108,075 |
| n8 ordinary, three ticks | 11,581,668 | 11,585,758 |
| Two frontier roots | 6,231,123 | 6,234,769 |
| Retained-bracket fallback | 9,793,724 | 9,798,389 |
| Recovered n2 outward seed | 9,672,096 | 9,676,791 |
| New exact-seam retention | Previously deferred | 1,302,534 |
| New seven-seam retention | Previously deferred | 4,127,684 |

The new retention calls use zero midpoint iterations and preserve all 160
remaining steps. Their body measurements are 1,285,676 and 4,101,924 gas. Existing
ordinary and fallback work ledgers are unchanged. The n8 measurement has three
ticks; the seven-retention measurement has n3/eight ticks. Neither is a measured
worst-case n8/eight-tick complete swap.

| Runtime | Original bodies | Retention bodies | EIP-170 headroom |
|---|---:|---:|---:|
| FrontierComposition | 22,253 | 22,635 | 1,941 |
| FrontierEndpoint | 18,812 | 22,458 | 2,118 |
| General linked test consumer | 3,027 | 3,223 | 21,353 |

The dedicated retention consumer is 3,195 bytes. Composition still has four
compiler-fixed endpoint link references; Endpoint has none. Deployment size
passes, but the remaining library headroom is limited and every later code
change needs another size check.

Retained [RED](outward-retention/runs/red.json),
[first GREEN](outward-retention/runs/green.json),
[final regression](outward-retention/runs/regression.json), and
[original baseline](outward-retention/runs/baseline.json) manifests include the
exact source/configuration/compiler inputs and measured artifacts; corresponding
UTF-8 logs are alongside them. The [initial 14-test source](outward-retention/runs/initial-test.sol.txt)
is retained byte-for-byte to reproduce the historical tests-first checkpoint.
The final source review covers copied composition SHA-256
`2b0cced7ca334b9eb814d821edbdcd4ebb40b4fc9219dd9beddf7bc07599069f`
and copied endpoint SHA-256
`ecb7eb1206cd1fc3fe03341f31d1442b2aabd4eeba0eaf629faba5807a0335fd`.
Those exact values are recorded in the final manifest.
