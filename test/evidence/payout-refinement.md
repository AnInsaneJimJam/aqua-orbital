# Payout-targeted refinement checkpoint

This is the pre-linking checkpoint. The later visibility-only promotion and
its current call-frame/size/gas results are recorded in
[linked-math-promotion.md](linked-math-promotion.md); this record's original
source hashes and measurements remain historical.

The new `RootBracket.refineForPayout` stops at the exact combined raw-floor and
root-gap bound, using an appended `PayoutBounded` status. Ordinary `refine` and
`FrontierEndpoint.exactInput` remain available with their original behavior.
`exactInputForPayout` retains every final check; `resumeExactInput` regenerates
the original frame and rechecks proposed retained bounds. Composition permits
one ordinary continuation and separately records both phases' actual work.
Only its outer path certificate authorizes payout. The conditional argument is
in [PAYOUT_REFINEMENT](../../docs/audits/PAYOUT_REFINEMENT.md).

The first 13 new bracket/endpoint tests failed against compiling revert stubs.
They then passed after implementation. Two new composition tests initially
failed before the targeting/fallback switch. The first trial fallback fixture
was geometrically feasible but its existing seed discovery deferred; a second
trial already resolved order without fallback. Those failures changed fixture
selection, not protocol acceptance conditions. The retained successful case
uses a larger immutable output quantum and demonstrates the actual two-phase
path below. The independent reference began with 10 placeholder failures.

**Final focused result: 113 Solidity tests passed across nine suites**, zero
failed/skipped, with seed `0x20260908`. This includes 9 payout bracket tests
(one 256-case scaled wide-square fuzz entry), 6 payout endpoint tests, 20
composition tests, 8 gas harness tests, and the unchanged 19 ordinary root,
14 ordinary endpoint, 10 GRID release, 15 schedule and 12 turn tests. Existing
root/turn fuzz entries each reported 257 cases. The run compiled in 31.94s;
the nine suites took 1.73s. The observed pre-suite trace timestamp was
`2026-09-08T06:12:53.995131Z`, not a separately captured command-start time.

The independent new reference passed **10/10 tests** in 1.668s at 110 and 160
digits. It uses explicit per-tick supporting baskets and price-space roots,
without importing the production radical, seed, bisection or stopping rule.
It binds raw input, decimals, payout, final root and shortfall to the Solidity
literals. Each named geometry has 45 sampled primal/dual release/arc/retention
checks, plus the final next-unit support deficit. These samples are bounded
numerical evidence, not a universal path proof or verified reachable history.
The existing nine composition goldens remain unchanged and pass onchain.

Coverage includes exact `<=q` boundary retention, rejection of a width-only
criterion, no positive payout at zero raw output, exact-root status precedence,
zero/exhausted budgets, carried remaining work, preserved outward brackets,
regenerated-frame rejection of replayed roots with changed input, invalid
metadata/bounds, n2/n3/n8 target/full/resume agreement, and the existing negative
domain, hidden-crossing, initial-order, exact-touch and repartition cases.

The successful fallback is the two-token key-7/8 fixture starting at
`[1.5*10^40,0.3*10^40]`, with two radius-`10^40` ticks, decimals `[18,17]`,
raw net input `125744046821095790489`, and two allowed transitions. Its initial
release goes inward and its later frontier event goes outward. The first
63-step targeted result is `EndpointCertified`, but its final cumulative
output box overlaps the outward event. The test explicitly checks that
overlap and verifies that ordinary standalone refinement resolves it.
Composition continues from the retained box for 62 steps, then rechecks the
endpoint and complete arc order. It returns `FrontierPathCertified`, payout
`15284910113323340133`, and 35 remaining steps: `63+62+35=160`.

Its independent ideal output-reserve root floor in GRID units is
`774948463256958748921205633758743101811279660918`, and the exact-real
shortfall ceiling in internal length units is `149862797252778292187`.
The returned bracket encloses the root; returned shortfall bounds the oracle
ceiling and is no greater than quantum `184467440737095516160`.

The feasible key-5/8 near-outward candidate remains a seed-discovery liveness
deferral: raw input `381100078699772177738` has an independently feasible path
and ideal floor payout `399184686675480708007`, but the current proposal high
does not establish a root identity. The optimization does not turn that failure
into a global infeasibility claim or silently remove it from required ranges.

## Actual helper-call gas

The same harness builds inputs before measurement, then measures the external
call and its body separately. Caller ABI/call/return work is included in the
external figure; fixtures, assertions, logs and transaction intrinsic gas are
excluded. Body figures exclude ABI decode/encode. Historical baseline source
hashes and commands remain in
[COMPOSITION_GAS](../../docs/audits/COMPOSITION_GAS.md).

| Fixture | Baseline external | Current external | Current body | First / resumed / remaining |
| --- | ---: | ---: | ---: | --- |
| n2 mixed | 11,337,123 | 6,919,896 | 6,902,212 | 65 / 0 / 95 |
| n3 mixed | 13,730,116 | 8,953,766 | 8,933,424 | 60 / 0 / 100 |
| n8 mixed | 22,895,910 | 16,735,765 | 16,707,814 | 60 / 0 / 100 |
| n2 two roots | 11,920,698 | 7,311,656 | 7,291,673 | 70 / 0 / 90 |
| n2 release then outward | 11,671,581 | 7,077,795 | 7,057,990 | 64 / 0 / 96 |
| n3 mixed turn | 13,680,483 | 8,656,365 | 8,636,985 | 73 / 0 / 87 |
| n2 successful fallback | Not measured before | 13,760,398 | 13,736,678 | 63 / 62 / 35 |

Fresh external n3 phases measure 942,019 gas for initial identity/release,
1,327,020 for zero-budget final-prefix discovery, 256,258 for schedule, and
4,630,327 for payout-targeted final solve/retention (formerly 8,561,571 for
the ordinary final phase). Fresh phases have separate memory frames and are
**not additive attribution** of the full composition cost.

Parent and backend independent read-only source/proof reviews found no
concrete acceptance defect, conditional on the existing helper theorems and
validated immutable coefficient/decimal provenance. No reviewer result or
finite campaign establishes universal supported-range liveness. The eight-token
helper cost, fallback cost, deployment size, production dispatch and complete
settlement gas remain material work. No router integration, new tolerance,
intermediate payout, cache or public proof-witness interface was added.

## Reproduction

From `packages/contracts`:

```text
forge test --match-contract '^(PayoutBracketTest|PayoutEndpointTest|RootBracketTest|FrontierEndpointTest|FrontierCompositionTest|FrontierCompositionGasTest|SlackGridReleaseTest|FrontierScheduleTest|FrontierTurnTest)$' --fuzz-seed 0x20260908 -vv
```

From the repository root:

```text
python -m unittest discover -s packages/reference/tests -p test_payout_resume.py -v
python packages/reference/fixtures_payout_resume.py
```

The final reference test run began at `2026-09-08T06:13:01.1421188Z`.
Its CLI stdout was captured as 10,839 Windows bytes with SHA-256
`95a3265af98003555b2180a070a1a0865c71f5f4406f5d8ad88fed67e5a9209d`;
newline conversion on another platform changes that stream hash. The semantic
110/160 corpus equality is tested independently of serialization newlines.

## Computation manifest

```json
{
  "schema_version": 1,
  "claim_id": "orbital-payout-target-resume-v1",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "cd packages/contracts; forge test --match-contract '^(PayoutBracketTest|PayoutEndpointTest|RootBracketTest|FrontierEndpointTest|FrontierCompositionTest|FrontierCompositionGasTest|SlackGridReleaseTest|FrontierScheduleTest|FrontierTurnTest)$' --fuzz-seed 0x20260908 -vv; from root: python -m unittest discover -s packages/reference/tests -p test_payout_resume.py -v; python packages/reference/fixtures_payout_resume.py",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solc 0.8.30; optimizer700; viaIR; Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows AMD64"
  },
  "mathematics": {
    "assertion_tested": "Exact certified root-to-retained-reserve gap stopping, preserved ordinary solver and domain checks, regenerated-frame retained-bracket resume, a carried 160-step composition ledger, nine old golden paths plus successful near-event fallback and measured helper-call gas.",
    "coefficient_domain": "Production exact directed uint256/Uint512 arithmetic with GRID=2^32; independent 110/160-digit real supporting-basket reference and exact integer bound examples.",
    "conventions": "q is original internal output length per raw unit; root brackets are GRID numerators; exact gap includes output rounding. Only outer FrontierPathCertified authorizes payout. Helper external gas excludes fixtures/assertions and transaction intrinsic/settlement costs.",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/FrontierComposition.sol",
        "sha256": "9e267caada4ec4824e52cf1b9c59368e9505ef45ad6566356ac1c013ebaa66df"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierEndpoint.sol",
        "sha256": "6fec6e292c7344c10e0fc5f628fd64882d74e87f012aaaeeef02181bdfe7259d"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierSchedule.sol",
        "sha256": "a5d10a931895e30d59ca19e91055b58f2748cba796789a5ce09fa8392ed0b506"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierEvents.sol",
        "sha256": "5fd37fd1cf314474a22eeda3856743d95f98da6b49d06671921f5e6c5b120721"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierTurn.sol",
        "sha256": "f1d9fc9cf528310040214af00101907ee011efd2be18f58b9394ea7843378e34"
      },
      {
        "path": "packages/contracts/src/libraries/SlackCertificate.sol",
        "sha256": "1f4fafba1f78f98fa1ac868ed6ddaad91e40bbef5dc079ca5cdddf50f72c4e17"
      },
      {
        "path": "packages/contracts/src/libraries/RootBracket.sol",
        "sha256": "0e19eb8cb8c7daa41a3ea4ed32c1f6751d254edf689ff140cb155a554dad529d"
      },
      {
        "path": "packages/contracts/src/libraries/CurveEvaluation.sol",
        "sha256": "1537bc49e14837d32279279f99a1f09f937c3a9c17e7226fd7dbceab61a864be"
      },
      {
        "path": "packages/contracts/src/libraries/OrbitalMath.sol",
        "sha256": "6454e86f8b8bea61506c2f5eead0df7936df8a89415597aabf76d3618acbfaeb"
      },
      {
        "path": "packages/contracts/src/libraries/TickGeometry.sol",
        "sha256": "930431a7bab7d38ad1fc5b173d91a4f5e9340ca5af04631a46c61fc1fd35204b"
      },
      {
        "path": "packages/contracts/src/libraries/WideMath.sol",
        "sha256": "61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d"
      },
      {
        "path": "packages/contracts/src/libraries/SignedWide.sol",
        "sha256": "8142108db5cc11ddf3a33e17855c7ca4a467f22687194967c28588aef6cb4426"
      },
      {
        "path": "packages/contracts/src/libraries/IntervalMath.sol",
        "sha256": "e7ea7cd4aa5bb7a63f52b665f1311667bb52715f8a4a5ad32a4dde30bd820898"
      },
      {
        "path": "packages/contracts/test/FrontierComposition.t.sol",
        "sha256": "302e4c5f878e4c6049159ad1b59a81f14b97f644a01aae3e6d0b6a33efe440c4"
      },
      {
        "path": "packages/contracts/test/FrontierEndpoint.t.sol",
        "sha256": "897a13bf3faaf056a0d3c49fb9ca4c0e58bbb93cc940182953dbda01b37876eb"
      },
      {
        "path": "packages/contracts/test/FrontierSchedule.t.sol",
        "sha256": "f9ab02e80df78cf610816b5ed9af1d7303cc097b0aa2ef035fd1cc30a29259b5"
      },
      {
        "path": "packages/contracts/test/SlackGridRelease.t.sol",
        "sha256": "f0b5ec21cd4248edd243697c910f6c8cddb156ad47e037e62c7f502219523252"
      },
      {
        "path": "packages/contracts/test/RootBracket.t.sol",
        "sha256": "2b89df005bf1014a6dcfa5800c2581351e472edbda1ca0265b22809a56554f6b"
      },
      {
        "path": "packages/contracts/test/FrontierTurn.t.sol",
        "sha256": "0b5d386a1e504fa2447c47895c552b20d464e22a6b1b85ac7d0132207deb188b"
      },
      {
        "path": "packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol",
        "sha256": "ef0c9b0d9ecc07af1c754a85f5459510c1e9a54fd055b3d058201816a9357d5b"
      },
      {
        "path": "packages/reference/fixtures_frontier_composition.py",
        "sha256": "d8b420ef059fb01995791a15feb0f2b90dada25806e086b2ea563f3df0d86bfe"
      },
      {
        "path": "packages/reference/tests/test_frontier_composition.py",
        "sha256": "9a7c23dee9ded1b583c3e9db720d1dfef4d5af6236f9a00de9349759a8de3aaa"
      },
      {
        "path": "packages/reference/fixtures/frontier-composition.json",
        "sha256": "f29eba1a4d6411d156f186de4375fb0845e505ef44b015a41836280e71bf3bb4"
      },
      {
        "path": "packages/reference/fixtures/curve-primitives.json",
        "sha256": "46c5a3225a34958c184c83aaba3458000d29e5586c64d896e28e99270e761ce4"
      },
      {
        "path": "packages/reference/orbital.py",
        "sha256": "4d13eb4a96ff96dcfc32e3a73ec722cf6d3a8694bcb53365e44e887f54dd6352"
      },
      {
        "path": "docs/audits/FRONTIER_COMPOSITION.md",
        "sha256": "dd9d74a26906c4fce4e855b0f9363f18b3fd41dac43cfd0d4d4130f86aa47267"
      },
      {
        "path": "docs/audits/FRONTIER_SEGMENT.md",
        "sha256": "5bb43409ef3c1ddac4a6af80228e87aa8c698b88036571bcff4cbbec01ccdfbb"
      },
      {
        "path": "docs/audits/GRID_RELEASE.md",
        "sha256": "b76e3aba0aaaa467aebfc3ea446187593fec923cdf0717ec98cebfc57c28c494"
      },
      {
        "path": "docs/MATH.md",
        "sha256": "3a73a91b071371869b5d54dd37a76003eb9eb04bdb77d4e33ee895e131ef45e2"
      },
      {
        "path": "docs/NUMERICS.md",
        "sha256": "b0061a4359bed4185b51ddbe9d3f868adaecc8e0b8f952d5b1d721d72b22949f"
      },
      {
        "path": "packages/contracts/test/PayoutBracket.t.sol",
        "sha256": "6b4bf37f110c539d9aeaad6ce2bd9ba58b971e3793891ceecc1df98be9a031fe"
      },
      {
        "path": "packages/contracts/test/PayoutEndpoint.t.sol",
        "sha256": "7e28fce616af6cb7aa35adb0ce8bbc93113f8834f190e9800a41a5bf63d3a736"
      },
      {
        "path": "packages/contracts/test/FrontierCompositionGas.t.sol",
        "sha256": "db8fac5643a75e62605c753deb22089422a1298ce0f1419a34eaffbd10571c71"
      },
      {
        "path": "packages/reference/fixtures_payout_resume.py",
        "sha256": "7b9e38dcc2f0b8d02e806e87a575f7c2399724acf88d4e07971f3d9551c695d1"
      },
      {
        "path": "packages/reference/tests/test_payout_resume.py",
        "sha256": "ec51a40f31a1216558f7e985fbe476521dd8d250b98988222f5c3d30baa234ac"
      },
      {
        "path": "docs/audits/PAYOUT_REFINEMENT.md",
        "sha256": "608b7465b2b6b72b26ddd38861d573c793425aadf3e57e0f9eba4cd0f506d2c9"
      },
      {
        "path": "docs/audits/COMPOSITION_GAS.md",
        "sha256": "8c6e7d34f3be5814a38f36e426930480c9d90c7c701a155eb0cc48f00dda4a7e"
      }
    ],
    "bounds": {
      "solidity_tests": 113,
      "solidity_suites": 9,
      "payout_bracket_tests": 9,
      "payout_endpoint_tests": 6,
      "composition_tests": 20,
      "gas_harness_tests": 8,
      "ordinary_root_tests": 19,
      "ordinary_endpoint_tests": 14,
      "grid_release_tests": 10,
      "schedule_tests": 15,
      "turn_tests": 12,
      "payout_fuzz_cases": 256,
      "root_fuzz_cases": 257,
      "turn_fuzz_cases": 257,
      "reference_tests": 10,
      "reference_cases": 2,
      "reference_dimensions": [
        2
      ],
      "old_golden_dimensions": [
        2,
        3,
        8
      ],
      "precisions": [
        110,
        160
      ],
      "reference_samples_per_case": 45,
      "reference_newton_step_limit": 80,
      "reference_key_bisection_step_limit": 650,
      "shared_midpoint_budget": 160,
      "maximum_resume_phases": 1,
      "maximum_initial_prefix_attempts": 8,
      "maximum_final_prefix_attempts": 8,
      "maximum_crossings_including_release": 16,
      "decimals_range": [
        0,
        18
      ],
      "original_length_bits": 160,
      "grid_numerator_bits": 192,
      "wide_square_fuzz_scale_bits": 104
    },
    "non_claims": [
      "Universal supported-range liveness or proof from samples",
      "Exact event/equality/zero-price policy completion",
      "Reachable raw token history for all geometric fixtures",
      "Full-engine differential/cycle/mutation release acceptance",
      "Router/fee/settlement integration",
      "Complete transaction gas or linked deployment-size acceptance",
      "Geometry caches or a public proof-witness interface"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Foundry seeded scaled-sphere, legacy-root and legacy-turn fuzz; deterministic reference",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T06:12:53.995131Z",
    "runtime_seconds": 1.73,
    "timing_scope": "Observed Forge pre-suite trace timestamp and nine-suite runtime; separate command-start timestamp not captured; compile31.94s excluded",
    "reference_started_at": "2026-09-08T06:13:01.1421188Z",
    "reference_runtime_seconds": 1.668,
    "exit_status": 0
  },
  "outputs": [],
  "checks": [
    "13 compiling payout/endpoint stubs failed before behavior",
    "Two initial composition target/fallback tests failed before switch; fixture-selection failures retained honestly",
    "113 focused Solidity tests pass including256 new scaled wide-square and257 existing root/turn cases each",
    "10 independent 110/160-stable reference tests pass after10 placeholder failures",
    "Nine old raw-output/root/shortfall golden tuples unchanged",
    "Width-only false positive, exact quantum boundary, zero payout/budget and exhausted resume",
    "Changed-input replay bounds and malformed frames do not acquire root identity",
    "Successful dOut17 fallback:63+62+35=160, retained box narrows and complete endpoint/arc checks rerun",
    "Seven actual external helper-call benchmarks and four isolated n3 phases; no full-transaction gas claim",
    "Independent parent and backend conditional source/proof audits found no concrete defect"
  ],
  "result": "Scoped optimization and finite regression family verified under existing root/domain/path theorems and immutable metadata provenance. External n3 helper falls from13,730,116 to8,953,766 gas; n8 remains16,735,765 and successful fallback13,760,398. Full gas/liveness/deployment acceptance remains open.",
  "residual_risks": [
    "Feasible key5/8 near-outward seed discovery still defers",
    "Coarse initial direction/order, touch/equality and final repartition policies remain incomplete",
    "An endpoint certificate or PayoutBounded alone is not a path certificate",
    "Standalone pure resume callers must carry rather than reset remaining work",
    "Eight-token and fallback helper cost still material before full settlement overhead",
    "Reference finite numerical support checks are not universal proofs"
  ]
}
```
