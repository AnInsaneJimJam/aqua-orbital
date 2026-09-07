# Implementation and agent handoff plan

**Superseded for the active build:** use [MASTER_PROMPT.md](../MASTER_PROMPT.md), especially its G0–G8 full-stack Aqua/Arc milestones. The P0–P8 plan below preserves the original custodial-baseline history and must not be executed as a second architecture.

This plan sequences [SPEC.md](../SPEC.md). Current status: **documentation only; P0–P8 are not started**. The current workspace has no implementation, executable test suite, package/build configuration, or usable Git repository metadata. Do not infer that an unrun check passed.

## 1. Work protocol

1. Read SPEC and the reference for the assigned requirement IDs. Inspect the current workspace and uncommitted changes before editing.
2. Identify the first incomplete prerequisite below. State the narrow deliverable, owned files, acceptance tests, and any proof obligation. Follow the user's tests-first requirement and `TEST-1`.
3. Write the milestone's extensive tests and stable expected values first. Establish a meaningful red phase. Then implement that milestone and run its targeted tests.
4. Run affected integration/differential tests after any shared-interface change. Keep previous accepted behavior passing.
5. Update the evidence index with actual commands, versions, outcome, seeds, fixture provenance, and remaining blockers. Hand off a reproducible state; do not claim an entire subsystem is finished because one test passed.

These are work instructions, not a mandate to spawn agents. If parallel execution is explicitly requested or otherwise authorized, give each worker disjoint writable ownership and prerequisite evidence. Shared interface changes are serialized. The coordinator integrates and independently verifies results.

## 2. Dependency graph

```text
P0 specification / interfaces / reproducible test scaffold
                          |
                          v
                 P1 independent real model
                          |
                          v
                 P2 integer math and geometry
                          |
                          v
                 P3 accounting / anchor / LP
                          |
                          v
                 P4 fixed-partition swaps
                          |
                          v
                 P5 full crossing traversal
                          |
                          v
                 P6 settlement / factory / fees
                          |
                          v
                 P7 adversarial system validation
                          |
                          v
                 P8 measured release candidate
```

The state machine, accounting model, and scope are already decided in SPEC. Milestones fill in and prove those contracts. Optimizing before an independent oracle and integer solvency evidence exist is premature.

## 3. Milestones and exit criteria

| Milestone | Test-first work and implementation | Exit evidence |
| --- | --- | --- |
| **P0: scaffold and interfaces** | Pin toolchain/dependencies; define ABI/types/errors; create requirement-to-test index and fixture schema; create Foundry profiles and minimal nonfunctional harness stubs | Reproducible compilation of test scaffolding; behavioral tests fail for missing behavior; no production AMM logic yet |
| **P1: real reference** | Write analytic geometry/sphere examples and explicit-tick feasibility/duality checks; implement offline high-precision reference; generate crossing and depeg fixtures | `GEO-01..13`, `SW-01`, constructed inward/outward/double-crossing cases checked independently; fixture values stable under increased precision |
| **P2: integer math** | Exhaustive boundary tests for wide math, coefficients, virtual contributions, variance and root enclosures; implement the pure numeric/geometry harnesses | `NUM-1..11` range and error evidence; all primitive/geometry tests and differential interval checks pass |
| **P3: principal and LP model** | Test locked bootstrap, current-basket mint/burn, virtual deltas, slack allocation, share ownership and unwind in an accounting harness; implement deterministic certified allocation | `LP-01,03..10,18,19`, `NUM-12..16`, `INV-1..6,9` pass; reconstruction/solvency proof and concrete allocation procedure recorded |
| **P4: fixed partition** | Test public-semantic swaps with full-sphere and mixed-geometry snapshots, roots/limits/max-reserve checks, exact input and one output rounding; implement segment solver | `SW-01..12` applicable no-crossing cases pass against independent model; wrong-root mutants detected |
| **P5: crossings** | Write all suite D scenarios, including same-partition endpoints hiding crossings; implement sorted tick book, event traversal, final quantized classification, bounded progress | Complete suite D passes; `SWAP-3..5`, `MATH-10..11`, `INV-8,10` proved/tested; no stuck zero-distance path |
| **P6: onchain integration** | Test token mocks, fees, quotes, owner checks, factory atomicity and reentrancy; connect pure transitions to actual custody | All public operations and `LP-11..17` pass; exact custody identity; factory uniqueness; quotes/execution agree |
| **P7: adversarial system** | Stateful multi-actor campaigns, depegs, mixed decimals, repeated cycles, donation and unwind attacks; run required mutants and minimize failures | `TEST-5..8`, all invariants, all mandatory deterministic suites and numeric evidence pass; no unexplained valid-input reverts |
| **P8: release candidate** | Measure work/gas/size, review compiler/dependencies/storage/errors/events, run full release campaigns and freeze artifacts | `TEST-9..10` pass; explicit supported profile and limitations; reproducible bytecode and evidence index; no deployment performed implicitly |

P3's accounting harness tests the eventual pool semantics through controlled geometry snapshots; it is not an alternate deployable custody system. P4/P5 may use fixed tick snapshots, then P6 reruns the same expectations through the public factory/pool. Harness assumptions must become integration fixtures, not disappear at integration.

## 4. Planned repository layout

```text
SPEC.md                         controlling product / architecture contract
docs/
  MATH.md                       geometry, prices, traversal, oracle
  NUMERICS.md                   representation and certified accounting
  TESTS.md                      acceptance requirements
  PLAN.md                       this dependency/status map
src/                            modules listed in SPEC section 4
test/
  unit/                         declared pure arithmetic/geometry seams
  integration/                  public pool/factory behavior
  invariant/                    handlers and ghost accounting
  regressions/                  minimized reproducible failures
  mocks/                        tokens and external-call adversaries
  reference/                    independent offline explicit-tick model
  fixtures/                     versioned immutable expected values
  evidence/                     commands, proofs, seeds, gas and release index
foundry.toml                    pinned build/test profiles (future)
```

The paths under `src/` and `test/` are planned, not created by the documentation task. Avoid new explanatory documents unless they own information that does not already have a home. A new proof belongs in numerical evidence; a changed economic rule belongs in SPEC; a regression belongs in TESTS and its fixture; a task status belongs here or the evidence index. Do not create competing definitions in inline comments and multiple design notes.

## 5. Evidence and handoff format

The implementation's `test/evidence/INDEX.md` must have one row per requirement group: status (`not started`, `red`, `implemented`, `verified`, `blocked`), owning module, tests/fixtures, command/profile, observed result, and open issue. Record actual compiler/Foundry/dependency revisions once per evidence run. Link outputs rather than pasting huge logs into every handoff.

Each handoff contains:

- Requirement IDs completed, exact file ownership/effects, and next dependency.
- Reproducible red and green commands and observed outcomes; never just “tests pass.”
- Fixture/reference provenance, precision, and seeds for any new numerical result.
- Remaining uncertainty, minimized counterexample or blocker, and the smallest needed decision.

A normal failed test stays failed until its cause is resolved. A discovered mathematical counterexample stops only dependent work; unaffected documentation or independent tests may proceed. Changes to fee policy, anchor availability, supported assets, token limits, tick grid, rounding guarantees, or withdrawal semantics require an explicit SPEC revision and updated acceptance tests before implementation changes.

## 6. Release report

Report implemented scope and explicit exclusions, artifact hashes/build settings, all required checks actually run, numerical proof status, maximum tested dimensions/ticks/crossings, gas evidence, any known failures, and external-review status. Keep “implementation tested,” “externally audited,” and “approved for deployment” distinct. Completion of this plan never authorizes sending transactions, funding a pool, or publishing contracts without user authorization.
