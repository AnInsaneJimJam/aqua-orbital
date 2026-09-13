# Initialized traversal reference

2026-09-08. Four meaningful assertions failed against an unimplemented generator
and then passed in 7.005 seconds. The complete serialized result agrees at
110 and 160 digits. Logs: [RED](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/reachable-traversal-reference-red.txt),
[GREEN](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/reachable-traversal-reference-green.txt).

The [generator](../../packages/reference/fixtures_reachable_traversal.py) uses
the independent paper slice initializer oracle and the existing explicit
per-tick support/price-space solver. It chains the actual raw payout endpoint
of its first trade into the second, without adding fees to geometric reserves.
The [fixture](../../packages/reference/fixtures/reachable-traversal.json) records
funding bounds, directed initial reserves, fees, root enclosures, support prices,
one-/two-crossing paths, nine support samples per arc, actual primal baskets,
final raw payout shortfall and a strict support exclusion for the next raw unit.

The reverse endpoint's inherited initial-price Newton guess gave a singular
Jacobian; its [failed discovery transcript](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/reachable-traversal-discovery-failure.txt)
is retained. The shared private `_case` helper now accepts an optional final
price-space guess; its default behavior is unchanged. The explicit positive
guess `[10,7,1]` is a numerical starting proposal only: all support equations,
primal checks, path samples and both precision runs must still succeed. No
production root or reserve seed is imported into this oracle. This change does
not prove convergence for arbitrary inputs or make a failed numerical solve an
infeasibility certificate.

This is a derived initialized token-unit sequence, not evidence of a transaction
or a deployed contract. The next acceptance step is the
[router integration](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/MIXED_ROUTER_INTEGRATION.md). The standard
reference computation manifest includes this new generator, tests and fixture:
the full 109-test run passed in 46.843 seconds with unchanged inputs, and its
manifest validates. Earlier default oracle fixture checks remain green.

```text
python -m unittest discover -s packages/reference/tests -p test_reachable_traversal.py -v
python packages/reference/fixtures_reachable_traversal.py --write
```
