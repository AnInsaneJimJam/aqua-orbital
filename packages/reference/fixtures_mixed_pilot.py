"""Independent initialized mixed-state pilot; not production quote code.

Exact configuration generation precedes the numerical oracle. No Solidity
status or output selects a configuration or a proposed action.
"""
from math import isqrt
from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path

from mpmath import mp

from fixtures_initializer import FULL, GRID, U, fixture
from fixtures_frontier_composition import _actual, _case, _ticks

DIMENSIONS = (2, 3, 5, 8)
TICK_COUNTS = (1, 2, 3, 8)
FAMILIES = ('moderate', 'concentrated')
ACTIONS = ((0, -1, 1, 128), (0, -1, 1, 8), (-1, 0, 3, 8), (1, 0, 1, 64))
WHOLE = 10**18*U
MAX_HALVINGS = 8


def specs():
    result = []
    for n in DIMENSIONS:
        minimum_key = n*GRID-isqrt(n*GRID*GRID-n*GRID)
        for count in TICK_COUNTS:
            for family_index, family in enumerate(FAMILIES):
                denominator = 16 if family_index == 0 else 1024
                keys = [minimum_key+j*GRID//(denominator*count)
                        for j in range(1, count)]+[FULL]
                radii = [1000*(j+1 if family_index == 0 else 10**j)*WHOLE
                         for j in range(count)]
                decimals = [[0, 6, 8, 18][(j+family_index)%4] for j in range(n)]
                result.append((f'n{n}-t{count}-{family}', n, decimals, keys, radii))
    return result


def history(spec, dps):
    if isinstance(dps, bool) or not isinstance(dps, int) or dps < 100:
        raise ValueError('at least 100 integer decimal digits required')
    name, n, decimals, keys, radii = spec
    frozen = name, n, tuple(decimals), tuple(keys), tuple(radii)
    return deepcopy(_history(frozen, dps))


@lru_cache(maxsize=64)
def _history(spec, dps):
    name, n, decimals, keys, radii = spec
    with mp.workdps(dps):
        initial = fixture(spec)
        # tuple/list differences must not leak into persisted fixture JSON.
        initial['decimals'] = list(decimals)
        point = [int(initial['coordinate'])]*n
        mathematical_keys = list(keys[:-1])+[None]
        actions = []
        for step, (i, j, numerator, denominator) in enumerate(ACTIONS):
            i %= n
            j %= n
            quantum = 10**(18-decimals[i])*U
            proposed = (sum(radii)-point[i])*numerator//(denominator*quantum)
            attempts = []
            if any(a['status'] != 'generated' for a in actions):
                actions.append({'step': step, 'status': 'blocked_by_oracle_history'})
                continue
            for halving in range(MAX_HALVINGS+1):
                amount = proposed//(2**halving)
                if amount == 0:
                    attempts.append({'raw_net_input': '0', 'result': 'zero_input_quantum'})
                    break
                try:
                    witness = _case(f'{name}-step{step}', point, list(radii), mathematical_keys,
                                    list(decimals), amount, [1]*n, i, j, allow_repartition=True)
                    _retention(witness, radii, mathematical_keys)
                except (ArithmeticError, ValueError, AssertionError, ZeroDivisionError) as error:
                    # This is a failed reference proposal, not a proof that the
                    # target is infeasible. Production is never called here.
                    attempts.append({'raw_net_input': str(amount), 'result': type(error).__name__})
                    continue
                attempts.append({'raw_net_input': str(amount), 'result': 'primal_dual_witness'})
                witness['scope'] = 'independent initialized net-input history; actual raw payouts chained; no transaction receipts'
                witness['reachable_raw_history_verified'] = False
                witness['proposed_net_input_raw'] = str(proposed)
                actions.append({'step': step, 'status': 'generated', 'attempts': attempts, 'witness': witness})
                point = list(map(int, witness['actual_endpoint']))
                break
            else:
                actions.append({'step': step, 'status': 'oracle_not_generated', 'attempts': attempts})
                continue
            if len(actions) != step+1:
                actions.append({'step': step, 'status': 'oracle_not_generated', 'attempts': attempts})
        return {'id': name, 'initial': initial, 'actions': actions}


def _retention(witness, radii, keys):
    """Explicitly check both baskets at each final outward accounting seam."""
    start = list(map(int, witness['start']))
    final = list(map(int, witness['actual_endpoint']))
    ticks = _ticks(radii, keys)
    output = witness['output']
    first, last = witness['final_ideal_prefix'], witness['actual_final_prefix']
    assert first <= last
    for transition in witness['transitions']:
        transition['final_retention'] = False
    for index in range(first, last):
        seam_sum = sum(mp.mpf(r)*k/GRID for r, k in zip(radii[:index], keys))
        seam_sum += sum(radii[index:])*mp.mpf(keys[index])/GRID
        coordinate = seam_sum-sum(final[k] for k in range(len(final)) if k != output)
        assert mp.mpf(witness['final']['root_floor_grid'])/GRID <= coordinate <= final[output]
        seam = list(map(mp.mpf, final))
        seam[output] = coordinate
        _actual(seam, radii, keys, ticks, index)
        _actual(seam, radii, keys, ticks, index+1)
        progress = (mp.mpf(start[output])-coordinate)*GRID
        input_grid = int(witness['net_input_internal'])*GRID
        witness['transitions'].append({'key_index': index, 'key': str(keys[index]),
            'direction': 'outward', 'initial_release': False, 'final_retention': True,
            'input_floor_grid': str(input_grid), 'input_ceil_grid': str(input_grid),
            'output_floor_grid': str(int(mp.floor(progress))), 'output_ceil_grid': str(int(mp.ceil(progress)))})
        witness['prefix_walk'].append(index+1)


def corpus(dps, progress=None):
    rows = []
    for spec in specs():
        value = history(spec, dps)
        rows.append(value)
        if progress:
            progress(value, dps)
    return {'schema_version': 1, 'configurations': rows, 'precisions_checked': [110, 160],
            'configuration_count': 32, 'planned_actions': 128, 'maximum_halvings': MAX_HALVINGS,
            'domain': 'net-input mathematical execution; fees, custody and RPC are separate',
            'non_claims': ['universal proof or interval oracle', 'full release distribution',
                           'actual transaction history', 'infeasibility from failed reference discovery']}


if __name__ == '__main__':
    import sys
    def show(row, dps):
        count = sum(a['status'] == 'generated' for a in row['actions'])
        transitions = sum(len(a['witness']['transitions']) for a in row['actions'] if a['status'] == 'generated')
        print(f'{dps} {row["id"]}: {count}/4 generated; {transitions} transitions', flush=True)
    low = corpus(110, show)
    high = corpus(160, show)
    if low != high:
        raise ArithmeticError('pilot precision instability; no goldens written')
    if '--write' in sys.argv:
        target = Path(__file__).parent/'fixtures/mixed-pilot.json'
        target.write_text(json.dumps(low, indent=2)+'\n', encoding='utf-8')
        print(f'Wrote {target.name}; compare oracle generation counts before any Solidity claim.')
