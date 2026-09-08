"""Bounded independent geometry for payout-target/resume regression tests.

Reuse only the independent explicit per-tick support construction from
fixtures_frontier_composition, including its price-space key roots. This never
calls the Solidity radical, its seed, refinement loop or payout-target helper.
The successful-fallback input has 18 input decimals and 17 output decimals;
larger output quantum changes final rounding, not the ideal endpoint or event.

The retained key-5/8 case originally exposed deferred production seed
discovery. SeedProposal.t.sol now binds its recovered endpoint/path result;
the historical case label remains stable. This oracle certifies no solver
status: numerical feasibility alone is not solver liveness.
110/160-digit stability is finite numerical evidence, not interval arithmetic,
a universal path proof, a reachable token history or a gas-bound certificate.
The shared support code checks nine points per arc/release/retention interval.
Run this module directly for deterministic JSON on stdout; no files are written.
"""
from copy import deepcopy
from functools import lru_cache
import json

from fixtures_frontier_composition import GRID, SCALE, _case, mp


def integer_examples():
    """Exact normalized length numerators, quantum 8 (one unit at scale 8).

First two intervals enclose 8*(10-sqrt(34)), the output root of the
four-dimensional radius-10 sphere with fixed coordinates (5,5,6).
The closed-boundary row is an arithmetic witness, not an assertion that the
production helper stops early rather than recognizing an exact endpoint.
"""
    return [
        {'id': 'width_is_not_total_shortfall', 'origin': 48, 'lo': 30, 'hi': 36,
         'quantum': 8, 'payout_bounded': False},
        {'id': 'total_shortfall_bounded', 'origin': 48, 'lo': 33, 'hi': 36,
         'quantum': 8, 'payout_bounded': True},
        {'id': 'exact_one_quantum_retention', 'origin': 64, 'lo': 40, 'hi': 42,
         'quantum': 8, 'exact_root': 40, 'payout_bounded': True},
        {'id': 'zero_raw_output_is_not_a_payout', 'origin': 48, 'lo': 42, 'hi': 45,
         'quantum': 8, 'payout_bounded': False},
    ]


@lru_cache(maxsize=4)
def _corpus(dps):
    with mp.workdps(dps):
        fallback = _case('n2_outward_event_payout_resume',
                         [15*SCALE//10, 3*SCALE//10], [SCALE]*2,
                         [7*GRID//8, None], [18, 17], 125744046821095790489, [1, 4])
        deferred = _case('n2_five_eighths_seed_discovery_deferral',
                         [2527133520585472095299795479050357292168,
                          10306468614415789726245162508561985295187],
                         [SCALE]*2, [5*GRID//8, None], [18, 18],
                         381100078699772177738, [2, 1])
        return {
            'schema_version': 1,
            'method': 'independent explicit per-tick supporting baskets and price-space endpoint/key roots',
            'numerical_scope': {'dimensions': [2], 'ticks_per_case': 2,
                                'stable_precisions_checked_by_tests': [110, 160],
                                'newton_step_limit': 80, 'key_bisection_step_limit': 650},
            'production_status_scope': 'Solidity tests establish fallback behavior; this oracle establishes geometry only',
            'fallback': fallback, 'seed_deferral': deferred,
            'integer_examples': integer_examples(),
        }


def corpus(dps):
    if type(dps) is not int or dps < 80:
        raise ValueError('precision must be an integer of at least 80 digits')
    return deepcopy(_corpus(dps))


if __name__ == '__main__':
    print(json.dumps(corpus(160), sort_keys=True, indent=2))
