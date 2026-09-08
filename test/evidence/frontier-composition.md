# Closed-input frontier composition

This is the pre-optimization implementation checkpoint; its recorded hashes
and 88-test results are historical. The separately verified payout-targeted
stop and retained-bracket continuation are recorded in
[payout-refinement.md](payout-refinement.md), preserving this component's
geometric hypotheses and original nine golden cases.

`FrontierComposition.certify` now composes a canonical actual start, an exact
initial release/root, ordered original-frame events, certified frontier arcs,
and one final raw-output retention certificate. It remains a pure math helper
separate from the router, fee accounting and settlement. Its conditional
acceptance argument and explicit deferrals are recorded in
[FRONTIER_COMPOSITION](../../docs/audits/FRONTIER_COMPOSITION.md).

The public inputs to this internal helper contain actual reserves, immutable
validated ticks/decimals, the pair, exact raw net input and `maxCrossings<=16`.
No root brackets, event arrays, physical flags or prepared contexts are
accepted from a caller. Only `FrontierPathCertified` authorizes the nested
endpoint's proposed amount. A test retains a valid `EndpointCertified` result
inside an **uncertain composition** when coarse initial output order fails.

Initial and final prefix discovery use zero midpoint budget, with at most
eight attempts each. The chosen final solve consumes its actual `used` from
one 160-step budget. Release departures and frontier events share the caller's
allowance; ordered returned keys/directions identify which transitions belong
to initial release. The actual returned reserve integers apply exact net input
and only the final actual raw output. Original sigma/virtual contributions and
fee separation remain unchanged.

Every join must order cumulative ideal input and output intervals in the
original actual-X frame. Root directions use the entire input-minus-output
reserve interval; event directions use their authenticated separated-root
identity. Same-side mixed arcs use FRONTIER_SEGMENT; a strict inward-to-outward
mixed join additionally requires `FrontierTurn.ProvenNonpositive` at the
largest boundary key. The all-interior arc uses the separate sphere proof.
The actual endpoint then retains at most one output quantum under NUM-12
through NUM-14, including the full reconstructed boundary-price checks and
the length-valued radial bound. This proves no separately clipped monotone
raw-payout curve and makes no intermediate token transfers.

## Tests-first and finite verification

Fourteen compiling behavioral tests failed against the revert placeholder.
The first implementation passed all 14. Expanded coverage and independent
goldens now pass **88 focused Solidity tests**: 18 composition, 14 endpoint,
15 schedule, 10 GRID release, 19 root bracket and 12 turn. Existing RootBracket
and FrontierTurn fuzz entries each reported 257 cases with seed `0x20260908`.
There is no new whole-engine fuzz/cycle/mutation campaign in this task.

The nine accepted fixtures include mixed n2/n3/n8 endpoints, n3 mixed token
decimals, one/two/four frontier events, an initial inward slack release followed
by an outward frontier crossing at the same key, and a three-token mixed turn
with no lower-key intersection. Each existing acceptance test checks exact
oracle raw output, both initial/final root enclosures and the independent ideal
shortfall against the returned conservative bound. No goldens were obtained
from a Solidity solver.

| Fixture | Raw output | Ordered frontier/release transitions |
| --- | ---: | --- |
| n2 mixed | 4126770776962595252 | None |
| n3 mixed | 333207013780241401 | None |
| n8 mixed | 499288825743866812 | None |
| n3 mixed decimals | 333207 | None |
| n2 two roots | 427517751760020282527 | Inward, outward |
| n2 one root | 89372519051296279071 | Inward |
| n2 four roots | 622772057530580375589 | Inward, inward, outward, outward |
| n2 initial release | 157670507261635933550 | Initial inward release, frontier outward |
| n3 mixed turn | 718010770131401740767 | None; lower-key turn certified |

Failures retain insufficient caller transition allowance, invalid original
states/metadata, an in-window uncertified physical event, an exact initial
touch, zero initial output normal, uncertain coarse initial output order and
rounding-created canonical repartition. Some are independently feasible
geometries that the current bounded implementation explicitly defers. They
are not relabeled globally infeasible and do not lower release expectations.

An independent root-agent source review of production SHA-256
`4da2b0abd95d6b395aeb6c4902a5631e85913500fd8fc82a6a7fffa8902e3baf`
found no concrete soundness defect under immutable validated tick/decimal
provenance and the referenced helper certificates. It checked budgets,
range/casts, initial release/root identity, both event sides, strict global
order, sphere/mixed-turn cases and final retention/repartition. This is a
conditional source/proof review, not full supported-range or release acceptance.

## Independent reference scope

The separate reference generator solves fixed reserves through explicit
per-tick supporting baskets in log-price space. At each key, untouched reserves
determine their unit-normal prices; the remaining pair is found from its unit
norm by price-space bisection. It does not copy the production coordinate
discriminant, root seed or event sort. The original actual frame is retained
through initial release, events and final output.

Fifteen reference tests pass, including saved JSON and Solidity literal
consistency. Thirteen tests failed against the reference placeholder before
implementation; later added zero-price/sample-count tests also failed before
their witnesses were completed. The corpus is repeated at 110/160 digits.
Nine support samples per arc and
nine primal samples per release/retention interval check the recorded finite
family. Each sample has explicit sphere/cap/principal/price and reconstruction
checks; supporting points also have primal/dual equality. Exact rational
witnesses handle the initial equality/touch fixtures instead of snapping a
numerical root according to tolerance. These samples and decimal stability
support the implementation; the all-points statement rests on the linked exact
proofs. Prior raw-token histories for every geometric fixture are not asserted.

Long initial/final root literals and reference diagnostics are retained in
`packages/reference/fixtures/frontier-composition.json`; reference tests bind
the four Solidity oracle arrays to regenerated values. The standard reference
manifest therefore must include `FrontierComposition.t.sol` as a literal input.
The final reference run took 11.903 seconds on 2026-09-08. Its exact UTC start
was not captured; successful output was collected before the separately
observed 05:31:53 UTC clock. No start time is invented in the manifest.

A second independent backend-agent source/proof review also found no concrete
defect under the same helper/provenance hypotheses. That reviewer independently
generated the reference witnesses and separately checked initial and seam
identities, global order, sphere/turn branches and final retention.

## Gas and remaining release work

The final test-call gas includes fixture construction, assertions and returndata
memory: n2 mixed 11,474,804; n3 mixed 13,954,772; n8 mixed 23,173,434; two roots
12,054,363; four roots 13,280,496; initial release plus outward crossing
11,805,535; n3 mixed turn 13,824,303. The earlier combined three-dimension test
reported 90,749,397 across three same-EVM calls and accumulating memory, so it
is not presented as a single swap cost. Compilation took 34.09 seconds; the
final six suites took 2.34 seconds. External helper-call measurements and safe
reuse/resume optimizations are a separate next task.

This helper does not complete equality/touch handling, all supported-range
liveness, cycle economics, full differential/mutation campaigns, linked
deployment size, complete transaction gas acceptance, fees/custody integration
or live target verification. The mixed router remains unchanged by this task.

Reproduce from the repository root (Forge from `packages/contracts`):

```powershell
forge test --match-contract '^(FrontierCompositionTest|FrontierEndpointTest|FrontierScheduleTest|SlackGridReleaseTest|RootBracketTest|FrontierTurnTest)$' --fuzz-seed 0x20260908 -vv
python -m unittest discover -s packages/reference/tests -p test_frontier_composition.py -v
python packages/reference/fixtures_frontier_composition.py
```

## Computation manifest
```json
{
  "schema_version": 1,
  "claim_id": "orbital-frontier-composition-bounded-v1",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(FrontierCompositionTest|FrontierEndpointTest|FrontierScheduleTest|SlackGridReleaseTest|RootBracketTest|FrontierTurnTest)$' --fuzz-seed 0x20260908 -vv; python -m unittest discover -s packages/reference/tests -p test_frontier_composition.py -v; python packages/reference/fixtures_frontier_composition.py",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solc 0.8.30; optimizer700; viaIR; Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows 11 build26200 AMD64"
  },
  "mathematics": {
    "assertion_tested": "Closed-input actual-state to exact initial release/root, original-frame event order, authenticated one-sided frontier arcs and single final raw payout/retention with counted transitions and shared midpoint work.",
    "coefficient_domain": "Exact directed uint256/512 production arithmetic; independent explicit per-tick support/primal checks in110/160-digit mpmath and exact rational special witnesses",
    "conventions": "GRID=2^32; original contribution rounding; raw input/output quantum=10^(18-decimals)*2^64; only FrontierPathCertified authorizes the nested amount; final retention follows NUM11-14.",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/FrontierComposition.sol",
        "sha256": "4da2b0abd95d6b395aeb6c4902a5631e85913500fd8fc82a6a7fffa8902e3baf"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierEndpoint.sol",
        "sha256": "197f3eb7647f58c689e4c2df56b7d072bd955c2a1618600504606bbb6114f7bd"
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
        "sha256": "9659a03745a5d2d1c3770748e78f201ccbadf1dc4b719a2505c104f94e29ffa3"
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
        "sha256": "044afe948230b0957ea0b13dea7c805113311257a63c7b6d86f70d96a97ca39d"
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
        "sha256": "d02cd1daebf9b3196f0a2aa2c7a2b51a43d04bcd54c495a73c2174297ea5301d"
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
      }
    ],
    "bounds": {
      "focused_solidity_tests": 88,
      "composition_tests": 18,
      "endpoint_tests": 14,
      "schedule_tests": 15,
      "grid_release_tests": 10,
      "root_tests": 19,
      "turn_tests": 12,
      "existing_root_fuzz_cases": 257,
      "existing_turn_fuzz_cases": 257,
      "new_composition_fuzz_entries": 0,
      "reference_tests": 15,
      "accepted_reference_cases": 9,
      "retained_reference_failures": 8,
      "accepted_fixture_dimensions": [
        2,
        3,
        8
      ],
      "failure_fixture_dimensions": [
        2,
        3,
        7
      ],
      "maximum_ordinary_ticks_in_accepted_reference": 2,
      "reference_samples_per_arc_release_retention": 9,
      "reference_newton_maxsteps": 80,
      "reference_key_bisection_maxsteps": 650,
      "reference_precisions": [
        110,
        160
      ],
      "onchain_supported_max_dimension": 8,
      "onchain_max_ticks": 8,
      "shared_midpoint_budget": 160,
      "caller_max_crossings_upper_bound": 16,
      "bounded_initial_prefix_attempts": 8,
      "bounded_final_prefix_attempts": 8,
      "original_coordinate_bits": 160,
      "lifted_coordinate_bits": 192,
      "linear_sum_bound_bits": 195
    },
    "non_claims": [
      "Universal supported-range liveness",
      "All equality/touch/zero-output-price endpoint policies",
      "Monotone clipped raw-payout path",
      "Full mixed router, fee or settlement integration",
      "Complete cycle/fuzz/differential/mutation release campaigns",
      "Reachable raw histories for every geometric fixture",
      "Full transaction gas or linked deployment-size acceptance",
      "Live Arc deployment or sponsor qualification"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Existing Foundry root/turn seeded fuzz; deterministic new composition and reference cases",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T05:28:49.840819Z",
    "runtime_seconds": 2.34,
    "timing_scope": "six focused Solidity suites after34.09-second compile",
    "reference_date": "2026-09-08",
    "reference_runtime_seconds": 11.903,
    "reference_exact_start_captured": false,
    "reference_success_observed_before": "2026-09-08T05:31:53Z",
    "exit_status": 0
  },
  "outputs": [
    {
      "path": "packages/reference/fixtures/frontier-composition.json",
      "sha256": "f29eba1a4d6411d156f186de4375fb0845e505ef44b015a41836280e71bf3bb4"
    }
  ],
  "checks": [
    "14 compiling Solidity revert-stub failures before behavior",
    "13 initial reference placeholder failures; added one-sided/sample-count red cases retained",
    "88 focused Solidity tests passed, with257 existing cases per root/turn fuzz entry",
    "15 independent reference tests pass with110/160 precision-stable JSON",
    "Nine raw payouts and initial/final root/shortfall tuples bound to Solidity literals",
    "Both-root and four-root event sequences verified in the original actual frame",
    "Initial inward release and later outward key order returned and counted against caller allowance",
    "Feasible coarse-order and zero-output-price geometries remain explicit deferrals",
    "Final EndpointCertified cannot masquerade as FrontierPathCertified",
    "Two independent conditional source/proof reviews found no concrete defect"
  ],
  "result": "Scoped composition implementation and named finite liveness verified under immutable metadata and referenced helper-certificate hypotheses; supported-range and release acceptance remain open.",
  "residual_risks": [
    "Zero-budget initial enclosures can be too coarse for order/direction",
    "Current schedule defers exact/overlapping endpoint events and touches",
    "Final rounded prefix mismatch remains deferred",
    "Pure helper gas excludes complete settlement and deployment concerns",
    "Numerical samples are not universal proofs",
    "All upstream certificate and immutable coefficient-provenance hypotheses remain necessary"
  ]
}
```
