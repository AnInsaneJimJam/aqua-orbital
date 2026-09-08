"""Independent explicit-support schedule fixtures; never an onchain quote source.

The n2 oracle solves normalized supporting-price sums, then constructs every
event by summing per-tick minimizers. Event order is the decreasing-price sweep,
not a sort of production discriminant roots. Original integer starts remain the
coordinate frame. The n3 negative fixture uses separate sphere/cap identities.
All numerical witnesses are bounded checks, not a universal traversal proof.
"""
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache

from mpmath import mp
from orbital import Tick, aggregate, supporting_basket, verify_baskets
from fixtures_frontier_endpoint import _actual_baskets

GRID = 2**32
SCALE = 10**40
MAX_STEPS = 650


def _bisect(function, low, high, increasing):
    """Bounded numerical solve in log-price space; residual checked afterward."""
    tol = mp.power(10, -mp.dps+15)
    left, right = function(low), function(high)
    assert (left < 0 < right) if increasing else (left > 0 > right)
    for _ in range(MAX_STEPS):
        middle = (low+high)/2
        value = function(middle)
        if (value < 0) == increasing:
            low = middle
        else:
            high = middle
        if high-low < tol:
            answer = (low+high)/2
            assert abs(function(answer)) < tol*10
            return answer
    raise ArithmeticError('price-space iteration bound exhausted')


def _h(log_price):
    p = mp.exp(log_price)
    return 2-(p+1)/mp.sqrt(p*p+1)


def _witness(log_price, ticks):
    prices = [mp.exp(log_price), mp.mpf(1)]
    baskets = [supporting_basket(prices, tick) for tick in ticks]
    point = [sum(row[i] for row in baskets) for i in range(2)]
    assert verify_baskets(point, baskets, ticks, prices) < mp.power(10, -mp.dps+20)
    assert min(prices) > 0
    return point


def _endpoint(target_input, ticks, keys):
    radius = sum(tick.radius for tick in ticks)
    log_price = _bisect(lambda p: (aggregate([mp.exp(p), 1], ticks)[0]-target_input)/radius,
                        -mp.log(10**6), mp.log(10**6), False)
    point = _witness(log_price, ticks)
    assert abs(point[0]-target_input) < radius*mp.power(10, -mp.dps+20)
    count = sum(_h(log_price) > mp.mpf(key)/GRID for key in keys)
    return point, count


def _event(key_index, key, direction, log_price, start, ticks):
    point = _witness(log_price, ticks)
    assert abs(_h(log_price)-mp.mpf(key)/GRID) < mp.power(10, -mp.dps+14)
    if direction == 'inward':
        assert point[0] < point[1]
    else:
        assert point[0] > point[1]
    input_progress, output_progress = point[0]-start[0], start[1]-point[1]
    return {'key_index': key_index, 'key': str(key), 'direction': direction,
            'input_floor_grid': str(int(mp.floor(input_progress*GRID))),
            'input_ceil_grid': str(int(mp.ceil(input_progress*GRID))),
            'output_floor_grid': str(int(mp.floor(output_progress*GRID))),
            'output_ceil_grid': str(int(mp.ceil(output_progress*GRID))),
            'explicit_baskets_verified': True}, input_progress, output_progress


def _case(name, start, radii, keys, amount):
    ticks = [Tick(r, None if k is None else mp.mpf(k)/GRID) for r, k in zip(radii, keys+[None])]
    _actual_baskets(start, radii, keys+[None], ticks)
    root_logs = [_bisect(lambda p: _h(p)-mp.mpf(key)/GRID, mp.mpf(0), mp.log(1024), True)
                 for key in keys]
    # h rises with log(p) for p>1 and falls for p<1. Thus a decreasing
    # supporting-price sweep visits descending inward keys, then ascending
    # outward keys. No coordinate-root sort supplies this expected order.
    sweep = [(k, 'inward', root_logs[k]) for k in range(len(keys)-1, -1, -1)]
    sweep += [(k, 'outward', -root_logs[k]) for k in range(len(keys))]
    all_events, selected = [], []
    previous = None
    for k, direction, log_price in sweep:
        event, progress, output = _event(k, keys[k], direction, log_price, start, ticks)
        if previous is not None:
            assert previous[0] < progress and previous[1] < output
        previous = progress, output
        all_events.append(event)
        if 0 < progress < amount:
            selected.append(event)
    initial, initial_count = _endpoint(mp.mpf(start[0]), ticks, keys)
    final, final_count = _endpoint(mp.mpf(start[0]+amount), ticks, keys)
    assert initial[1] <= start[1]
    assert final[1] < initial[1]
    prefix = initial_count
    walk = [prefix]
    for event in selected:
        key = event['key_index']
        if event['direction'] == 'inward':
            assert prefix == key+1
            prefix = key
        else:
            assert prefix == key
            prefix = key+1
        walk.append(prefix)
    assert prefix == final_count
    return {'id': name, 'dimension': 2, 'start': list(map(str, start)),
            'radii': list(map(str, radii)), 'keys': list(map(str, keys))+[None],
            'input': 0, 'output': 1, 'net_input_internal': str(amount),
            'initial_ideal_prefix': initial_count, 'final_ideal_prefix': final_count,
            'prefix_walk': walk, 'all_events': all_events, 'events': selected}


def _unphysical_case():
    """An actual in-range algebraic root with an independently false price branch."""
    b = Fraction(18*GRID//10, GRID)
    basket = [Fraction(69, 100), Fraction(199, 200), Fraction(1, 20)]
    assert sum((x-1)**2 for x in basket) == Fraction(7989, 8000) < 1
    assert sum(basket) < b and all(0 < x < 1 for x in basket)
    # At the exact key both radius-1 baskets equal half of the aggregate.
    # The ordinary all-interior sphere gives B=4*A-8, with A=2*b.
    pair = 2*b-Fraction(1, 10)
    difference_squared = 2*(8*b-8-Fraction(1, 100))-pair*pair
    assert difference_squared > 0
    # a=(pair-sqrt(D))/2. Squaring only positive comparison terms proves
    # 1.38<a<1.39, and z=(pair+sqrt(D))/2>2, with exact rationals.
    assert pair-2*Fraction(139, 100) > 0
    assert (pair-2*Fraction(139, 100))**2 < difference_squared
    assert difference_squared < (pair-2*Fraction(138, 100))**2
    assert 4-pair > 0 and difference_squared > (4-pair)**2
    value = lambda f: mp.mpf(f.numerator)/f.denominator
    delta = mp.sqrt(value(difference_squared))
    a, z = (value(pair)-delta)/2, (value(pair)+delta)/2
    input_progress = (a-mp.mpf(138)/100)*SCALE
    assert 0 < input_progress < SCALE//100 and z > 2
    return {'id': 'n3_in_range_price_branch_failure', 'dimension': 3,
            'start': [str(138*SCALE//100), str(199*SCALE//100), str(SCALE//10)],
            'radii': [str(SCALE), str(SCALE)], 'keys': [str(18*GRID//10), None],
            'net_input_internal': str(SCALE//100), 'total_radius': str(2*SCALE),
            'initial_explicit_baskets_feasible': True,
            'exact_rational_input_range_checked': True,
            'input_floor_grid': str(int(mp.floor(input_progress*GRID))),
            'input_ceil_grid': str(int(mp.ceil(input_progress*GRID))),
            'output_reserve_floor_grid': str(int(mp.floor(z*SCALE*GRID)))}


@lru_cache(maxsize=2)
def _corpus(dps):
    with mp.workdps(dps):
        start = [2527133520585472095299795479050357292168,
                 10306468614415789726245162508561985295187]
        single = lambda name, amount, x=start: _case(name, x, [SCALE, SCALE], [5*GRID//8], amount)
        radius = 2**156
        return {'schema_version': 1,
                'oracle': 'explicit per-tick support with monotone log-price sweep; no coordinate discriminant sorting',
                'price_solve_max_steps': MAX_STEPS,
                'cases': [single('n2_two_crossings', SCALE),
                          single('n2_before_first', SCALE//100),
                          single('n2_between_roots', SCALE//10),
                          single('n2_behind_start', SCALE//10, [104*SCALE//100, SCALE//4]),
                          _case('n2_three_ticks', [2*SCALE//5, 39*SCALE//25], [SCALE]*3,
                                [61*GRID//100, 5*GRID//8], 11*SCALE//10),
                          _case('n2_fourteen_crossings', [6*radius//5, 104*radius//25], [radius]*8,
                                [(59+k)*GRID//100 for k in range(7)], 27*radius//10)],
                'unphysical_case': _unphysical_case()}


def corpus(dps):
    if isinstance(dps, bool) or not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    return deepcopy(_corpus(dps))


if __name__ == '__main__':
    import json
    fixtures = corpus(160)
    assert fixtures == corpus(110)
    print(json.dumps(fixtures, indent=2))
