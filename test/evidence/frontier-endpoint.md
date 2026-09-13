# Fixed-input frontier endpoint coupler

`FrontierEndpoint.sol` binds an identified exact frontier root to actual
rounded reserves, an exact net input and immutable token units. It certifies
one final raw payout with at most one output quantum of shortfall and radial
slack. `EndpointCertified` is deliberately an **endpoint-only** status; the
helper does not implement initial-release connection, event traversal, fees,
custody or settlement. The implementation/proof boundary is recorded in
[ENDPOINT_IDENTIFICATION](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/ENDPOINT_IDENTIFICATION.md).

## Accepted result and source review

`exactInput(X,ticks,decimals,input,output,rawNetInput,count,budget)` checks the
actual original integer state with `M.certify`, validates decimals and positive
raw input, and bounds input against available coordinate capacity before
multiplication/lifting. Ticks and decimals must be the strategy's validated
immutable configuration; the existing M coefficient-provenance precondition
is retained. It never modifies the supplied reserve vector.

The deterministic first high is the original output coordinate after applying
the exact net input to the input coordinate, clipped to the selected prefix's
exact upper key window. It becomes a feasible high only after full
`CurveEvaluation` membership and strict output-price checks. The proposed low
comes from the strong-convexity root-distance formula in the linked proof,
bounded by the exact lower key/principal window. Ordinary `RootBracket`
rechecks both original radical signs and the entire domain. The seed itself
does not authorize any sign, and clipping is not an infeasibility proof.

A certified root bracket identifies a unique exact supporting frontier point
for the fixed coordinates. Its exact nonnegative normal, with positive output
component, proves global ideal endpoint optimality through the existing
per-tick support inequality. A stopped root refinement can still identify that
root even when its remaining width does not yet support a payout. The result
retains this distinction and the caller's remaining shared budget (at most
160 initial midpoint evaluations). The caller must carry remaining into every
later solve and must not reset the shared budget. This pure API cannot enforce
that discipline across separate calls; the shared-budget test exercises it.

The only raw payout is
`floor((X_output*GRID-root.hi)/(outputQuantum*GRID))`. The helper requires
`ceil((actualOutput*GRID-root.lo)/GRID)<=outputQuantum`, where the quantum is
exactly `10^(18-decimals_output)*2^64`. Root width alone is not used as an
output-error bound. Failure keeps the result uncertain, even after all work
is spent. Non-EndpointCertified results never authorize their proposed amount.

The proposed raw endpoint must have the same canonical prefix as the root;
otherwise it returns `RequiresRepartition` without claiming the new candidate
is feasible or that the ideal curve crossed a key. For the matching prefix,
the original integer endpoint must pass `M.certify`. The full fixed-domain
certificate is extended from `root.lo` through the actual rounded output,
which can exceed the old bracket high. Both endpoint domains and the exact
variance/boundary-coordinate critical tests are checked. The low endpoint
need not be invariant-feasible: it is the bracket's outside endpoint.

For the same exact `R,K,S`, the map
`X -> ((sum(X)-K-nR)/sqrt(n), ||P X||-S)` is 1-Lipschitz by orthogonal
projection and reverse triangle. Its norm equals `sqrt(F)`. The ideal root
has norm `R`; the actual endpoint has norm at most `R`. Since they differ
only in output, their length gap bounds `R-sqrt(F(actual))` as well as omitted
ideal output. Thus the returned `shortfallUpper` bounds both quantities and
is at most one raw quantum. The original per-tick contribution intervals
enclose the same exact true `S`; no virtual credit or invariant is reset.

`identifyInitial` applies the same deterministic discovery to zero input but
returns only root identity. It gives no financial payout and does not claim
that actual X is connected to its feasible bracket high. That still needs the
GRID-endpoint initial-release extension described in the proof note.

## Independent finite checks

Eight compiling behavioral tests failed against the revert stub before
implementation. Four reference tests failed against their own stub. The
completed focused run passed **47 Solidity tests**: 14 endpoint, 19 existing
root bracket and 14 existing slack tests. The existing root fuzz entry reported
257 cases with seed `0x20260908`. No new fuzz or complete engine campaign is
claimed by this endpoint task.

Five reference tests pass. The primary root oracle uses explicit per-tick
supporting baskets to match every non-output reserve in price space, at 110
and 160 digits with at most 30 Newton steps. It does not use the production
radical, seed or bisection as an oracle. Explicit MATH-7 reconstruction checks
each rounded basket's sphere, cap, principal and price bounds. The exact
supporting price also excludes one additional raw output for each fixture.
The named fixtures are geometric states; reachable prior raw-token histories
are not asserted for all their initial slack values.

Each case starts from the retained scalar corpus's original integer reserves,
adds one whole nominal input token to coordinate 0, and pays coordinate 1:

| Case | Raw output | Root floor in GRID numerators |
| --- | ---: | ---: |
| n2, 18 decimals | 4126770776962595252 | 44340703412623690595350829985285122856085410428353 |
| n3, 18 decimals | 333207013780241401 | 118084306753006480165245949185059670947237519748186 |
| n8, 18 decimals | 499288825743866812 | 468155813909892268425727901700349720754977690259405 |
| n3, 6-decimal input/output | 333207 | 118084306753006480165245949185059670947237519748186 |

All four root/raw-output/ideal-shortfall goldens are automatically compared
with the Solidity literals. Additional behavior checks cover exhausted or
tiny budgets, initial-root identity, unchanged caller reserves, wrong prefix,
invalid units/pair/capacity, an eight-token total radius `1.3*10^48<2^160`,
and a raw rounding step that creates a canonical key arrival while the ideal
root is still interior. The latter explicitly returns `RequiresRepartition`.

```powershell
# cwd: packages/contracts
forge test --match-contract '^(FrontierEndpointTest|RootBracketTest|SlackCertificateTest)$' --fuzz-seed 0x20260908 -vv
# cwd: repository
python -m unittest discover -s packages/reference/tests -p test_frontier_endpoint.py -v
python packages/reference/fixtures_frontier_endpoint.py
```

The separate golden helper tests measured 8,784,068 gas (n2), 9,357,377 (n3),
13,019,621 (n8), and 9,357,154 (n3 mixed decimals), including setup and assertions.
The three-call test measured 54,852,657 gas with accumulated EVM memory costs;
the near-maximum-radius n8 case measured 10,794,222. These measurements are
not a complete mixed-swap or target-network gas acceptance. The first proposal
executes the named ordinary cases; it does not establish feasible-high
discovery or numerical liveness for every supported trade.

## Retained computation manifest

The manifest schema and input hashes were validated with the installed
computation-audit validator. The parent owns subsequent complete integrated
test/reference runs; this record describes the focused unchanged source run.

```json
{
  "schema_version": 1,
  "claim_id": "fixed-input-frontier-endpoint-2026-09-08",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^(FrontierEndpointTest|RootBracketTest|SlackCertificateTest)$' --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)\npython -m unittest discover -s packages/reference/tests -p test_frontier_endpoint.py -v (cwd: repository)\npython packages/reference/fixtures_frontier_endpoint.py (cwd: repository)",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solidity 0.8.30, optimizer 700, viaIR, Cancun",
      "Python 3.12.10",
      "mpmath 1.3.0"
    ],
    "hardware": "Windows host; helper tests only, complete traversal gas unverified"
  },
  "mathematics": {
    "assertion_tested": "Actual-state fixed-input root identity, deterministic validated seed, token-bound single raw floor, same-partition extended endpoint domain and at-most-one-quantum output/radial slack",
    "coefficient_domain": "Exact signed512 interval Solidity arithmetic, 110/160-digit independent supporting-basket roots, integer raw arithmetic and exact rational canonical keys",
    "conventions": "Original integer reserves; GRID=2^32 root proof units; original per-tick contributions; validated immutable metadata; EndpointCertified does not establish connected traversal",
    "inputs": [
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
        "path": "packages/contracts/src/libraries/SlackCertificate.sol",
        "sha256": "fbd85875262f8a4a2004a26d85b0014b372312253cc9e224ed3f6cc9d6e33cf3"
      },
      {
        "path": "packages/contracts/test/SlackCertificate.t.sol",
        "sha256": "5a6631553e3777af5892706f371dc8bc284123743b810a886cbae1f1a0240c11"
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
        "path": "packages/reference/fixtures_frontier_endpoint.py",
        "sha256": "e0ad4a43e00f70b94a79dd24638c63f4eec29bec9f405754355f970cd9217e55"
      },
      {
        "path": "packages/reference/tests/test_frontier_endpoint.py",
        "sha256": "6447d92be27150722767cd93109d9d8dd44bf73cf8240cdbe7fb084f8dc712ff"
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
        "path": "docs/audits/ENDPOINT_IDENTIFICATION.md",
        "sha256": "d74000199da7a7d49a4232c469b4e6e4c19fa49f1caf99780530301c0807cfa5"
      },
      {
        "path": "scripts/audit-reference.py",
        "sha256": "fc78788e4993b52b8c5144a5cd400cf58e33a27a1622d2b6bf7d096367530790"
      }
    ],
    "bounds": {
      "focused_solidity_tests": 47,
      "endpoint_tests": 14,
      "root_bracket_tests": 19,
      "slack_tests": 14,
      "existing_root_fuzz_cases_reported": 257,
      "new_fuzz_entries": 0,
      "reference_tests": 5,
      "independent_endpoint_cases": 4,
      "fixture_dimensions": [
        2,
        3,
        8
      ],
      "fixture_decimals": [
        6,
        18
      ],
      "maximum_fixture_ticks": 3,
      "maximum_original_length_bits": 160,
      "maximum_lifted_length_bits": 192,
      "convex_seed_radicand_bound_bits": 391,
      "maximum_shared_midpoint_budget": 160,
      "oracle_precisions": [
        110,
        160
      ],
      "support_newton_maxsteps": 30,
      "near_maximum_radius_sum": "1300000000000000000000000000000000000000000000000"
    },
    "non_claims": [
      "Initial release path to the identified root",
      "Complete both-root event ordering or mixed traversal",
      "Financial execution for initial-root identity",
      "Payout authorization from an uncertain result",
      "Rounded repartition acceptance",
      "Reachable previous raw-token history for every geometric fixture",
      "Universal feasible-high discovery or convergence",
      "Complete engine or target-network gas acceptance"
    ]
  },
  "randomness": {
    "used": true,
    "generator": "Existing Foundry root fuzz; new endpoint/reference cases deterministic",
    "seed": "0x20260908"
  },
  "run": {
    "started_at": "2026-09-08T04:28:15.369607Z",
    "runtime_seconds": 1.6,
    "timing_scope": "focused Solidity suites; compilation29.12 seconds",
    "reference_started_at": "2026-09-08T04:28:04.256218+00:00",
    "reference_runtime_seconds": 1.379,
    "reference_process_runtime_seconds": 1.8845254,
    "exit_status": 0
  },
  "outputs": [],
  "fixture_stdout_sha256": "3955127ab95c31ad05249fd392837828b6a30537bcea61270ec365741f4ec41d",
  "checks": [
    "8 compiling Solidity stub failures before behavior",
    "4 independent reference stub failures before implementation",
    "47 focused Solidity tests passed",
    "5 reference tests with4 precision-stable mixed cases",
    "Automatic Solidity raw/root/shortfall literal agreement",
    "Explicit per-tick supporting and actual rounded MATH7 baskets",
    "Positive output, exact input, unchanged untouched coordinates and shared budget conservation",
    "Exhausted budget retains identity without manufacturing quantum accuracy",
    "Rounding-created canonical key arrival returns RequiresRepartition",
    "Eight-token near2^160 original-length case passes"
  ],
  "result": "Implementation and finite assertion verified in the recorded range; root/global-output and same-partition radial claims are conditional on the displayed domain and immutable metadata hypotheses",
  "residual_risks": [
    "The deterministic first feasible-high/seed proposal may not certify every valid trade",
    "No complete initial-release and frontier-traversal composition exists in this helper",
    "Canonical repartition after raw flooring is deliberately deferred",
    "Stored metadata must be the strategy configuration with activation-derived coefficients",
    "Helper gas is material and complete mixed execution gas remains unmeasured"
  ]
}
```
