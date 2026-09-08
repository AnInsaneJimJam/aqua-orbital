# Composition gas baseline and bounded optimization proposal

2026-09-08. **Historical baseline and proposal checkpoint.** This note retains
the measured pre-optimization source hashes and gas. Its first proposed change
was subsequently approved and implemented; see
[PAYOUT_REFINEMENT](PAYOUT_REFINEMENT.md) and its
[current evidence](../../test/evidence/payout-refinement.md). References below
to the current source describe that baseline checkpoint. The benchmark is
`packages/contracts/test/FrontierCompositionGas.t.sol`; the accepted source
and correctness evidence remain those in
[frontier-composition.md](../../test/evidence/frontier-composition.md).

## Actual external-call baseline

The harness constructs fixtures before measurement and invokes an external
wrapper around `FrontierComposition.certify`. `gasleft` around that call
includes caller ABI encoding, the external call and return decoding, while
excluding fixture construction, status assertions and logging. A second
counter inside the external wrapper measures the helper body after argument
decoding and before return encoding. These are execution measurements, not
full transaction gas: intrinsic calldata gas, production dispatch, fees,
approval/custody/settlement and deployment-size constraints remain separate.

| Fixture | External call with ABI | Helper body | Midpoints used / remaining |
| --- | ---: | ---: | --- |
| n2 mixed | 11,337,123 | 11,318,039 | 121 / 39 |
| n3 mixed | 13,730,116 | 13,708,450 | 115 / 45 |
| n8 mixed | 22,895,910 | 22,866,625 | 115 / 45 |
| n2 two roots | 11,920,698 | 11,898,940 | 127 / 33 |
| n2 initial release plus outward | 11,671,581 | 11,649,982 | 121 / 39 |
| n3 mixed turn | 13,680,483 | 13,659,631 | 132 / 28 |

Seven harness tests passed. The seventh separately measures n3 phases, each
in a fresh external memory frame:

| Phase | Fresh body gas |
| --- | ---: |
| Initial root identity and GRID release | 941,506 |
| Zero-budget final prefix discovery | 1,318,076 |
| Event schedule | 256,258 |
| Final endpoint solve and retention | 8,561,571 |

These phase measurements are **not additive attribution** of the full call.
They have fresh memory, separate ABI shapes and omit some composition checks
and joins. Their sum (11,077,411) is below the full n3 body (13,708,450).
Solidity's growing memory frame is one relevant difference, so a purported
savings estimate based solely on the sum would be unsound. The ABI/call
overhead itself is small in these observed cases; the math body dominates.

## Repeated work visible in the current source

For the ordinary n3 three-tick/prefix-2 case, the closed composition performs:

- Original-state validation in composition, initial identity, GRID release,
  each of three final prefix proposals, schedule, each of two `atKey` calls,
  and the final solve. Those are ten checks of the same original X, plus the
  necessary changed final-X check in `FrontierEndpoint`. Selected GRID seam
  and interval endpoint checks are additional and cannot be discarded.
- Five `CurveEvaluation.prepare` calls: one initial, three final discovery,
  and one final solve. Each regenerates all three tick coefficients, including
  already represented original sigma/virtual contribution bounds.
- The selected final prefix's high/seed/domain construction twice: once for
  zero-budget discovery and again for the full solve. Within each identity
  attempt, the high is evaluated by `FrontierEndpoint`, then evaluated again
  as the same high by `RootBracket`.
- Final root refinement until GRID adjacency, an uncertain midpoint or the
  160-step cap. Its financial acceptance condition can be met at a much
  wider bracket, although width alone does not prove that condition.

Counts above describe this named path and current call tree, not every input.
They include no claim that all these costs are safely removable without a
new internal provenance and lifetime argument.

## First proposed change: a payout-targeted bracket

Introduce a separately named internal method with the same full domain and
original-radical sign setup as RootBracket. Its additional authenticated
inputs are original output numerator `XG=X_output*GRID` and the immutable
output quantum q. A possible signature is:

```text
refineForPayout(xHi, preparedContext, output, zLo, XG, q, remainingBudget)
    -> {certifiedBracket, payoutBoundReached, amountRaw, used, remaining}
```

The closed composition remains the only source of these arguments; no public
quote/settlement interface accepts prepared contexts or proof arrays. The
ordinary `refine` API and its meanings remain available unchanged. A reached
payout bound must have its own status and must not be mislabeled `Adjacent`
or `Exact` while the numerical bracket is still wide.

After a certified bracket `[lo,hi]` is established, let `Q=q*GRID` and compute

```text
r = floor((XG-hi)/Q)
gap = XG-r*Q-lo.
```

Stop for the financial bound only when `r>0` and `gap<=Q`. This is exactly
equivalent to `ceil(gap/GRID)<=q`, because q is an integer. `width<=Q` is not
a substitute: the final floor and residual bracket width must share one
quantum, not consume a quantum each.

For the identified exact root z, `lo<=z<=hi` gives

```text
r*Q <= XG-hi <= XG-z,
0 <= XG-r*Q-z <= XG-r*Q-lo <= Q.
```

Therefore r is conservative and omitted ideal output is at most one quantum.
It equals the unique ideal raw floor except for an allowed exact raw-boundary
case, where at most one unit less can meet the same bound. If strict unique-
floor behavior is desired, additionally require
`floor((XG-hi)/Q)==floor((XG-lo)/Q)`; this is a stronger stopping criterion
and must not silently replace NUM-9's expressly allowed one-unit boundary case.

Only after the ordinary endpoint+critical tests and both directed signs pass
can this check authorize a stop. Uncertain residuals retain the previous
outward bracket. The midpoint ledger remains shared and no wider bracket is
accepted to save work. `Q<2^156`, `XG<2^192` and `r*Q<=XG` under current token
metadata/range checks, so these new linear integer operations fit uint256.

The full final `M.certify`, canonical prefix match, extended GRID domain,
boundary-price checks and length-valued radial bound still run. Root financial
accuracy alone never authorizes initial/event/final order or a direction.
If a coarse final interval cannot certify its arc join, refinement should
resume from that same bracket using the remaining budget. Likewise a tentative
raw-boundary choice must not cause an avoidable early repartition/uncertainty
return when further allowed refinement could establish the existing accepted
payout. A safe implementation needs explicit stop/finalize/resume control,
not a generic residual tolerance or a shorter arbitrary iteration limit.

The smallest output quantum already has `q*GRID=2^96`, while the current solver
targets GRID adjacency. The observed calls spend 115–132 midpoints before
stopping. This motivates a financial stopping condition, but no saved-step or
gas claim is established until the new method is implemented and measured.

## Second proposed change: retain prepared work and certificates

After the first change is independently verified, consider a private prepared
strategy object created once within the closed call. It can contain validated
original X, immutable metadata, per-tick geometry, original rounded sigma and
virtual contributions, and exact prefix R/K/S tables. Every cached prefix
must equal the existing `prepare` result under the same rounding convention.
Do not recompute contributions from lifted radii or replace the sum of sigma
contributions by a consolidated-sphere approximation.

An internal root-work object could retain the chosen context, certified
vertical domain, feasible high evaluation and outward bracket. Discovery then
returns a usable certificate rather than only a prefix that triggers the same
work again. A new resume/finalize path should charge actual `used` and never
restart broad bisection after consuming part of the shared budget. Initial
coarse-order failures could spend remaining work on their retained initial
bracket without losing the already proved actual-to-high/root connection.

The original `M.certify(X,ticks)` result can be reused only for that identical
X and immutable tick table. Every changed original endpoint and every selected
one-sided GRID seam still needs its relevant certificate. A generic externally
supplied `alreadyValidated` boolean would break the proof boundary and is not
part of this proposal. Tests should attempt forged/mismatched source metadata
at the closed API, including hashes/contexts accidentally reused after a pair,
dimension, reserve or prefix changes.

Separate linked pure-call frames may also be worth measuring, since memory
growth makes phase costs nonadditive. Such isolation changes ABI/deployment
boundaries and needs source/address binding and total transaction measurements.
Blindly resetting Solidity's free-memory pointer while retained root/event
structures remain live is not a safe proposed optimization.

## Required validation before accepting either change

Keep the current nine whole-path raw outputs and all initial/final root
enclosures as independent regressions. Exercise raw boundaries, mixed decimals,
maximum widths, zero/tiny/exhausted shared budgets, uncertainty at a midpoint,
hidden variance and boundary-price failures, event overlaps/touches, both roots,
initial release and actual rounded repartition. Prove the new stopping rule's
integer inequalities separately, then check unchanged final MATH-7 baskets
and one-quantum/radial bounds with the independent reference.

Compare actual external-call body/ABI measurements before and after using the
same source fixtures and compiler settings. Include full assembly/settlement
and linked code-size checks before claiming a transaction budget. Do not add
an arbitrary gas assertion or claim a universal speedup from this finite
baseline. Current supported-range, equality, economics and release campaigns
remain open regardless of a lower gas figure.

## Reproduction and manifest

From `packages/contracts`:

```powershell
forge test --match-contract '^FrontierCompositionGasTest$' --fuzz-seed 0x20260908 -vv
```

Compilation took 24.27 seconds; the seven-test suite took 173.42 milliseconds
(226.44 milliseconds total runner). The production source hash remained
`4da2b0abd95d6b395aeb6c4902a5631e85913500fd8fc82a6a7fffa8902e3baf`.

```json
{
  "schema_version": 1,
  "claim_id": "orbital-composition-external-gas-baseline-v1",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract '^FrontierCompositionGasTest$' --fuzz-seed 0x20260908 -vv",
  "environment": {
    "software": [
      "Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2",
      "Solc 0.8.30; optimizer700; viaIR; Cancun"
    ],
    "hardware": "Windows AMD64"
  },
  "mathematics": {
    "assertion_tested": "Observed external-call gas for six accepted composition fixtures, four isolated n3 phase costs, shared midpoint work and the proposed exact payout-gap stopping inequality.",
    "coefficient_domain": "Current exact directed uint256/512 production arithmetic; no optimized arithmetic or production control flow implemented",
    "conventions": "External call measurement includes caller ABI/call/return but excludes fixture/assertions; body excludes ABI decode/encode; phases have fresh memory and are not additive attribution.",
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
        "path": "packages/contracts/test/FrontierCompositionGas.t.sol",
        "sha256": "ae92deeb9eac221e1dc2a1ee73fb76a6987ac561eb886cf8bd3c562be1200808"
      },
      {
        "path": "packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol",
        "sha256": "ef0c9b0d9ecc07af1c754a85f5459510c1e9a54fd055b3d058201816a9357d5b"
      },
      {
        "path": "packages/contracts/foundry.toml",
        "sha256": "8837e44a7819ccc323dfe5d24eb65b9a5fe4a9fc2d6c47418a88aaa94bfd4f9a"
      },
      {
        "path": "docs/NUMERICS.md",
        "sha256": "b0061a4359bed4185b51ddbe9d3f868adaecc8e0b8f952d5b1d721d72b22949f"
      }
    ],
    "bounds": {
      "harness_tests": 7,
      "external_fixtures": 6,
      "phase_measurements": 4,
      "fixture_dimensions": [
        2,
        3,
        8
      ],
      "largest_fixture_tick_count": 3,
      "midpoint_budget": 160,
      "observed_midpoints_used": [
        121,
        115,
        115,
        127,
        121,
        132
      ],
      "payout_quantum_times_GRID_min_bits": 96
    },
    "non_claims": [
      "Optimization implemented or measured",
      "Universal gas bound or speedup",
      "Intrinsic/full transaction or settlement gas",
      "Linked deployment-size acceptance",
      "Universal liveness or release completion"
    ]
  },
  "randomness": {
    "used": false,
    "generator": "Deterministic named benchmark fixtures; no fuzz entries",
    "seed": null
  },
  "run": {
    "started_at": "2026-09-08T05:37:22.046539Z",
    "runtime_seconds": 0.17342,
    "timing_scope": "suite; total runner0.22644 seconds; compile24.27 seconds",
    "exit_status": 0
  },
  "outputs": [],
  "measurements": {
    "n2_mixed": {
      "external_ABI": 11337123,
      "body": 11318039,
      "used": 121
    },
    "n3_mixed": {
      "external_ABI": 13730116,
      "body": 13708450,
      "used": 115
    },
    "n8_mixed": {
      "external_ABI": 22895910,
      "body": 22866625,
      "used": 115
    },
    "n2_two_roots": {
      "external_ABI": 11920698,
      "body": 11898940,
      "used": 127
    },
    "n2_initial_release": {
      "external_ABI": 11671581,
      "body": 11649982,
      "used": 121
    },
    "n3_mixed_turn": {
      "external_ABI": 13680483,
      "body": 13659631,
      "used": 132
    },
    "n3_fresh_phases": {
      "initial_release": 941506,
      "discovery": 1318076,
      "schedule": 256258,
      "final_solve_retention": 8561571
    }
  },
  "checks": [
    "7 harness tests passed with accepted composition status and positive output",
    "Source remained4da2b0abd95d6b395aeb6c4902a5631e85913500fd8fc82a6a7fffa8902e3baf",
    "Fixtures and assertions excluded from external call measurements",
    "Body and outer ABI measurements separately retained",
    "Fresh-frame phase nonadditivity explicitly stated",
    "Exact payout-gap inequality proved algebraically in proposal; implementation deferred"
  ],
  "result": "Baseline measurements verified for named inputs; payout-targeted stopping and prepared-context reuse remain reviewed design proposals only.",
  "residual_risks": [
    "Full transaction cost includes omitted production work",
    "Compiler/memory layout changes can alter observed gas",
    "Continuation is needed if financial accuracy precedes geometric join certification",
    "New stopping method still needs tests and independent code review",
    "Source/context caching needs separate provenance proof"
  ]
}
```
