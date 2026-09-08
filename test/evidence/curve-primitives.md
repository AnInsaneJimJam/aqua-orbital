# Scalar and exact-frontier primitive evidence

2026-09-08. `CurveEvaluation` encloses the original fixed-partition radical and
normals. `FrontierEvents` encloses both exact-frontier candidates at one key.
Both remain components of an unfinished production solver.

- [Scalar proof and range review](../../docs/audits/CURVE_EVALUATION.md)
- [Event algebra and independent review](../../docs/audits/FRONTIER_EVENTS.md)
- [Source/run manifest](curve-primitives.manifest.json)
- [Solidity results](curve-primitives-green.txt)
- [Independent reference results](curve-primitives-reference.txt)

Reproduce with `python scripts/audit-curve-primitives.py`. This runs the two
focused Solidity suites and three independent reference checks, records input
hashes before execution, and rejects a run whose assertion inputs changed.
The latest focused run contains 10 scalar tests and 7 event tests. These tests
have no fuzz entry point; an explicit Forge seed does not make them a fuzz
campaign. The reference goldens use 110/160-digit arithmetic and explicit
per-tick baskets. Regenerate retained JSON/Solidity data with
`python packages/reference/fixtures_curve_primitives.py --write`.

The first six scalar tests failed against a compiling `NotImplemented` stub
([red output](curve-evaluation-red.txt)); the first four event tests failed
before implementation ([red output](frontier-events-red.txt)). Later named
regressions expand the corpus. Earlier small green logs are historical; the
combined source-hashed run is the current evidence.

Independent audits found no false-accept or width defect under the documented
context/coefficient hypotheses. This does not establish a bounded complete root
algorithm, connected frontier traversal, tight output-price witness selection,
one final raw rounding, principal/fee settlement, or release gas/cycle behavior.
The frontend has not been changed or requalified by this computation.
