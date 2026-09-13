# GRID endpoint inward release

`SlackCertificate.certifyInwardReleaseToGrid` connects canonical original
reserves to a selected one-sided proof endpoint with denominator `2^32`.
There is no output floor, financial payout or root-identity claim. The exact
decomposition, hypotheses and width proof are in
[GRID_RELEASE](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/GRID_RELEASE.md), extending the existing
[fixed-partition theorem](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/SLACK_SEGMENT.md).

The original API retains both original-unit membership checks and canonical
final equality. Only the subsequent seam loop is shared. The new method
validates its exact final selected prefix before entering that loop. Every
seam is certified on both sides, with the same original per-tick contribution
rounding. At most seven inward departures are possible. False still includes
numerical uncertainty and cannot be used as a global exclusion.

Eight positive Solidity tests failed against the compiling `false` stub;
two rejection tests passed, as did all 14 legacy slack tests. Five independent
reference tests failed against their own placeholder before implementation.
The completed focused run passed **57 tests**: 10 GRID release, 14 legacy
slack, 14 frontier endpoint and 19 root bracket. The existing root fuzz test
reported 257 cases with seed `0x20260908`; no new release fuzz campaign is
claimed. A root-agent read-only review found no defect under the unchanged
validated-coefficient and canonical-start hypotheses.

Coverage includes fractional final coordinates, fractional seams, both
selected sides of an exact final seam, zero-distance departures at both the
start and end, all seven seams, a three-token two-seam case with lengths
near the `2^160` limit, invalid prefixes/direction, retained hidden variance
and boundary-price failures, unchanged caller memory, and legacy integral
endpoint equivalence. Actual n2/n3/n8 states connect to the fractional highs
returned by `FrontierEndpoint.identifyInitial`; these tests separately require
root identity before invoking the release certificate.

The new reference corpus has **13 fixtures**: 11 accepted and two retained
rejections. It enumerates each prefix's rational key half-spaces independently
and reconstructs every tick via MATH-7 at endpoints and the exact analytic
critical coordinates. Both one-sided seam baskets are checked separately.
It does not reproduce the incremental Solidity K/R loop or use a production
solver as a root oracle. The n2/n3/n8 reference cases check tiny fractional
initial prefixes; the full initial-root connection is a separate Solidity
composition check, not an independently regenerated root bracket here.

Five reference tests pass at 110 and 160 digits. Exact coordinates, prefix
choices and violations agree; normalized basket and metric differences are
below `1e-65`. The explicit per-tick checker retains its documented numerical
comparison tolerance `10^(-precision+20)*max(1,totalRadius^2)`. This is bounded
numerical evidence; the all-points conclusion rests on the exact theorem,
not dense sampling or that comparison tolerance.

Observed test-call gas includes setup, assertions and repeated calls: 203,303
for one fractional crossing, 364,739 for the wide n3 two-seam test, 1,239,897
for seven crossings, and 32,212,927 for the combined three-dimension initial
root solves plus releases. These are helper-test measurements, not complete
swap gas acceptance. Compilation took 65.80 seconds; the focused suites took
2.41 seconds. No whole mixed swap, cycle campaign, ownership transition
economics, reachable history for every fixture, or live deployment is claimed.

Reproduce from the repository root (Forge from `packages/contracts`):

```powershell
forge test --match-contract '^(SlackGridReleaseTest|SlackCertificateTest|FrontierEndpointTest|RootBracketTest)$' --fuzz-seed 0x20260908 -vv
python -m unittest discover -s packages/reference/tests -p test_slack_grid_release.py -v
python packages/reference/fixtures_slack_grid_release.py
```

The generator reads no Solidity literal file. Its Python inputs are already
included by the standard reference manifest's Python glob; no additional
Solidity literal input is required by these new reference checks.

## Computation manifest

```json
{
  "schema_version": 1,
  "claim_id": "orbital-grid-inward-release-bounded-v1",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(SlackGridReleaseTest|SlackCertificateTest|FrontierEndpointTest|RootBracketTest)$' --fuzz-seed 0x20260908 -vv; python -m unittest discover -s packages/reference/tests -p test_slack_grid_release.py -v; python packages/reference/fixtures_slack_grid_release.py",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solc 0.8.30; optimizer 700; viaIR; Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows AMD64"
  },
  "mathematics": {
    "assertion_tested": "Exact GRID-denominator inward-seam release with canonical original start, independently selected end prefix, finite critical-point domain checks and unchanged original API semantics.",
    "coefficient_domain": "Exact uint256/512 Solidity arithmetic and rational prefix moments; independent mpmath explicit per-tick reconstruction at 110/160 digits",
    "conventions": "GRID=2^32; radii and sigma/virtual contributions preserve original-unit rounding; proof endpoint is not a raw token payout; false includes uncertainty.",
    "inputs": [
      {
        "path": "packages/contracts/src/libraries/SlackCertificate.sol",
        "sha256": "1f4fafba1f78f98fa1ac868ed6ddaad91e40bbef5dc079ca5cdddf50f72c4e17"
      },
      {
        "path": "packages/contracts/test/SlackGridRelease.t.sol",
        "sha256": "f0b5ec21cd4248edd243697c910f6c8cddb156ad47e037e62c7f502219523252"
      },
      {
        "path": "packages/contracts/test/SlackCertificate.t.sol",
        "sha256": "5a6631553e3777af5892706f371dc8bc284123743b810a886cbae1f1a0240c11"
      },
      {
        "path": "packages/contracts/src/libraries/FrontierEndpoint.sol",
        "sha256": "197f3eb7647f58c689e4c2df56b7d072bd955c2a1618600504606bbb6114f7bd"
      },
      {
        "path": "packages/contracts/test/FrontierEndpoint.t.sol",
        "sha256": "897a13bf3faaf056a0d3c49fb9ca4c0e58bbb93cc940182953dbda01b37876eb"
      },
      {
        "path": "packages/contracts/src/libraries/RootBracket.sol",
        "sha256": "9659a03745a5d2d1c3770748e78f201ccbadf1dc4b719a2505c104f94e29ffa3"
      },
      {
        "path": "packages/contracts/test/RootBracket.t.sol",
        "sha256": "2b89df005bf1014a6dcfa5800c2581351e472edbda1ca0265b22809a56554f6b"
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
        "path": "packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol",
        "sha256": "ef0c9b0d9ecc07af1c754a85f5459510c1e9a54fd055b3d058201816a9357d5b"
      },
      {
        "path": "packages/reference/fixtures_slack_grid_release.py",
        "sha256": "cca601ad35340c7a9e19af4c3c5e96e7e9332d17c7f224070d79f87f11eec788"
      },
      {
        "path": "packages/reference/tests/test_slack_grid_release.py",
        "sha256": "1e5350df1909e79fba2963cc0f8a3d8f0f4991a2756db1532a1c781832206cae"
      },
      {
        "path": "packages/reference/fixtures_slack_segments.py",
        "sha256": "4255665b8c64c5ded11027ef9ed96bcd009915358d3a1ce75b7c0468488b0b10"
      },
      {
        "path": "packages/reference/fixtures_curve_primitives.py",
        "sha256": "a07127b6a82a935a60496ba5926fdccbbc91722447e4e86f957c3005d92894a2"
      },
      {
        "path": "packages/reference/orbital.py",
        "sha256": "4d13eb4a96ff96dcfc32e3a73ec722cf6d3a8694bcb53365e44e887f54dd6352"
      },
      {
        "path": "docs/audits/SLACK_SEGMENT.md",
        "sha256": "01bc487c9081bb08b503330ed48e09bea69b910d55335fb10bfea6533ae69c14"
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
      "focused_solidity_tests": 57,
      "new_grid_tests": 10,
      "legacy_slack_tests": 14,
      "endpoint_tests": 14,
      "root_tests": 19,
      "existing_root_fuzz_cases": 257,
      "reference_tests": 5,
      "named_reference_fixtures": 13,
      "reference_accepted": 11,
      "reference_rejected": 2,
      "fixture_dimensions": [
        2,
        3,
        4,
        8
      ],
      "supported_dimensions": [
        2,
        8
      ],
      "maximum_ticks": 8,
      "maximum_inward_crossings": 7,
      "maximum_pieces": 8,
      "original_length_bits": 160,
      "proof_coordinate_bits": 192,
      "critical_comparison_bits_upper_bound": 457,
      "reference_precisions": [
        110,
        160
      ],
      "normalized_stability_threshold": "1e-65"
    },
    "non_claims": [
      "Root identity or raw payout from the release certificate alone",
      "Entire mixed swap or universal release liveness",
      "LP ownership transition economics",
      "Reachable raw history for every geometric fixture",
      "Full-swap gas acceptance",
      "Universal proof from finite numerical checks",
      "Live deployment or sponsor qualification"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Existing Foundry RootBracket fuzz entry; deterministic new Solidity/reference cases",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T04:46:29.974537Z",
    "runtime_seconds": 2.41,
    "timing_scope": "focused Solidity suites after 65.80-second compilation",
    "reference_started_at": "2026-09-08T04:49:59.241994+00:00",
    "reference_test_runtime_seconds": 0.712,
    "reference_tests_and_cli_process_seconds": 1.9073531000176445,
    "exit_status": 0
  },
  "outputs": [],
  "fixture_stdout_sha256": "2a5fab9527477fa3bb9dca9b8e2f369ccc5bf3d59935771e497ba7e431eef7ea",
  "fixture_stdout_bytes": 12815,
  "checks": [
    "Eight positive Solidity placeholder failures, two expected rejection passes and14 legacy passes before behavior",
    "Five independent reference placeholder failures before behavior",
    "57 focused tests passed, including257 existing seeded root cases",
    "13 rational seam fixtures and explicit MATH-7 baskets stable at110/160 digits",
    "Both endpoint seam sides and zero-distance departures checked independently",
    "No extra floor across a fractional seam",
    "Seven inward seams and near-maximum original lengths",
    "Retained hidden variance and boundary-price rejection witnesses",
    "Actual n2/n3/n8 root-high connections in Solidity",
    "Root-agent read-only source audit passed under stated hypotheses"
  ],
  "result": "Implementation and finite assertions pass; exact segment soundness remains conditional on the unchanged validated-coefficient and endpoint-certificate hypotheses in GRID_RELEASE.",
  "residual_risks": [
    "Full mixed arc/event composition is separate",
    "Each pure caller must bind immutable tick configuration",
    "Precision uncertainty can conservatively reject otherwise feasible geometry",
    "Numerical reference basket checks are finite evidence",
    "Helper-test gas is not whole-engine acceptance"
  ]
}
```
