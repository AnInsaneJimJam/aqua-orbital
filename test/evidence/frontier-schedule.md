# Both-root event scheduling

Observed 2026-09-08. `FrontierSchedule.enumerate` produces a conservative ordered
list of ordinary-key intersections and checks the ideal-prefix transitions in
the same call. It is a scheduling certificate, not a complete swap/path solver.
The [proof and remaining obligations](../../docs/audits/FRONTIER_SCHEDULE.md)
separate initial connection, frontier arcs/turns and final raw rounding.

Every root uses the unchanged actual reserve vector as its progress origin.
The helper enumerates both candidates at every ordinary key, including both
crossings when the initial and final ideal prefixes happen to be equal. A root
is excluded only when its input enclosure is definitely outside the requested
range, or its key has a proved negative upper discriminant. Exact touches use
an exact doubled input position to avoid signed division; a touch inside or on
the range remains uncertain. Unknown discriminants, endpoint overlaps and
in-range `physical=false` candidates never disappear from consideration.

Sorting by lower input bounds only proposes an order. Whole adjacent input and
cumulative-output intervals must strictly separate. The same-call prefix walk
requires each inward transition `k+1 -> k` and outward transition `k -> k+1`,
and forbids outward-then-inward order. Supplied ideal prefixes still require
authenticated endpoint identities from the caller; actual slack classification
alone is insufficient. There is no public arbitrary-witness interface.

The largest possible work list has 14 separated events for eight ticks. The
caller passes its remaining allowance under the 16-transition cap after initial
release; success subtracts exactly the listed count. Empty schedules may use
zero allowance. A failed result authorizes no partial list and does not consume
the allowance. This is distinct from the 160-step root-refinement budget.

## Verification

- Eleven behavioral tests failed against the compiling initial stub, retained
  in [frontier-schedule-red.txt](frontier-schedule-red.txt).
- Fifteen completed Solidity tests pass, including four later independent
  edge-case fixtures. [Focused output](frontier-schedule-green.txt).
- Seven independent reference tests pass; the 110/160-digit corpora agree
  exactly. [Reference output](frontier-schedule-reference.txt), [full fixture
  values](frontier-schedule-fixtures.json).
- The retained n2 two-root input/output values agree with the authenticated
  existing `FrontierEvents` literals. The three-tick case keeps four events;
  the eight-tick case keeps all fourteen at individual radius `2^156`.
- An independent n3 fixture has feasible actual reserves but an in-range key
  root exceeding the price-branch reserve bound. The scheduler returns
  uncertainty rather than discarding that root. Other tests cover strict
  NoRoots/behind-start exclusions, exact touches, final-input overlap, prefix
  mismatch, exhausted budget, invalid inputs and unchanged caller memory.
- Independent read-only source review found no concrete defect under the
  existing event-enclosure and immutable-metadata hypotheses.

The reference finds key prices through monotone log-price bisection and sums
explicit per-tick supporting baskets. It checks each basket's sphere, cap,
principal and supporting-price conditions. It does not call the production
crossing discriminant, event routine or candidate sorting to obtain expected
events. Its maximum 650 numerical bisections are reference work, not an onchain
budget. The rejected n3 case also has an exact rational range/branch check.

Reproduce from the repository root:

```powershell
forge test --root packages/contracts --match-contract FrontierScheduleTest --fuzz-seed 0x20260908
python -m unittest discover -s packages/reference/tests -p test_frontier_schedule.py -v
python packages/reference/fixtures_frontier_schedule.py
```

These three commands were rerun together with input hashes checked before and
after execution; all passed. The [computation manifest](frontier-schedule-manifest.json)
records the measured combined wall time, environment, source and output hashes.
Its schema validates. The canonical LF fixture JSON SHA-256 is
`f115e6d3a7b4543bfa9e0b2616435c36d5f67d8bad74f5e4bd07ca7b9af951a0`.

The 14-event Solidity test measured 1,405,920 gas including setup/assertions;
the four-event test measured 325,874. These are helper measurements, not complete
mixed-swap or Arc gas qualification. The full local checkpoint passed 281
contract tests and 73 reference tests. No invariant/mutation/release campaign,
universal scheduling liveness, live wallet flow or Arc deployment is claimed.
