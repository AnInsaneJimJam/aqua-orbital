"""Bounded independent composition witnesses; never a live quote implementation.

Endpoints match fixed reserves through explicit per-tick supporting baskets in
log-price space. At a key, unit supporting prices have known sum n-key. Each
untouched coordinate is recovered from its per-tick affine support functions;
the two traded prices are found by bisection of their remaining unit-norm
constraint. No production coordinate radical, root seed, or event sort is an
oracle. All coordinates retain the original actual start as their origin.

110/160-digit equality is a numerical stability check, not interval arithmetic
or a universal path theorem. Nine support samples per arc and nine primal
samples per release/retention interval check a stated finite range. The corpus
does not establish that these geometric integer starts came from token history.
"""
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache
import json
from math import isqrt
from pathlib import Path

from mpmath import mp
from orbital import Tick, aggregate, geometry, supporting_basket, verify_baskets

GRID = 2**32
U = 2**64
SCALE = 10**40
BISECTION_STEPS = 650
NEWTON_STEPS = 80
SAMPLES_PER_ARC = 9


def _tolerance():
    return mp.power(10, -mp.dps+20)


def _bounds(value, scale=GRID):
    return str(int(mp.floor(value*scale))), str(int(mp.ceil(value*scale)))


def _canonical(point, radii, keys):
    total, radius, axial, count = sum(point), sum(radii), 0, 0
    for r, key in zip(radii[:-1], keys[:-1]):
        if total*GRID-axial < radius*key:
            break
        radius -= r
        axial += r*key
        count += 1
    return count


def _ticks(radii, keys):
    return [Tick(r, None if k is None else mp.mpf(k)/GRID)
            for r, k in zip(radii, keys)]


def _actual(point, radii, keys, ticks, forced_prefix=None):
    """Explicit MATH-7 baskets, independently checked against every primal bound."""
    count = _canonical(point, radii, keys) if forced_prefix is None else forced_prefix
    x = list(map(mp.mpf, point))
    n = len(x)
    mean = sum(x)/n
    rho = mp.sqrt(sum((v-mean)**2 for v in x))
    radius = sum(radii[count:])
    axial = sum(mp.mpf(r)*k/GRID for r, k in zip(radii[:count], keys))
    transverse = sum(t.radius*geometry(n, t)['sigma'] for t in ticks[:count])
    tolerance = _tolerance()
    if rho < transverse-tolerance*sum(radii):
        raise ValueError('negative interior transverse length')
    if not rho and transverse:
        raise ValueError('undefined actual radial reconstruction')
    direction = [(v-mean)/rho if rho else mp.mpf(0) for v in x]
    rows = []
    for index, tick in enumerate(ticks):
        if index < count:
            row = [tick.radius*(tick.boundary/n+geometry(n, tick)['sigma']*v)
                   for v in direction]
        else:
            row = [mp.mpf(tick.radius)/radius*((sum(x)-axial)/n+(rho-transverse)*v)
                   for v in direction]
        r = mp.mpf(tick.radius)
        if sum((v/r-1)**2 for v in row) > 1+tolerance:
            raise ValueError('actual basket sphere infeasible')
        if tick.boundary is not None and sum(row)/r > tick.boundary+tolerance:
            raise ValueError('actual basket cap infeasible')
        virtual = geometry(n, tick)['virtual']
        if any(v < virtual-tolerance*r or v > r*(1+tolerance) for v in row):
            raise ValueError('actual basket principal or price bound')
        rows.append(row)
    assert max(abs(sum(row[i] for row in rows)-x[i]) for i in range(n)) < tolerance*sum(radii)
    interior = rows[count]
    radial_slack = radius*(1-mp.sqrt(sum((v/ticks[count].radius-1)**2 for v in interior)))
    assert radial_slack >= -tolerance*sum(radii)
    return count, rows, max(radial_slack, mp.mpf(0))


def _support(prices, ticks):
    rows = [supporting_basket(prices, t) for t in ticks]
    point = [sum(row[i] for row in rows) for i in range(len(prices))]
    assert min(prices) >= 0 and max(prices) > 0
    assert verify_baskets(point, rows, ticks, prices) < _tolerance()
    return point, rows


def _solve(target, output, ticks, guess):
    """Numerical dual optimum with fixed non-output reserves and positive prices."""
    n = len(target)
    fixed = [i for i in range(n) if i != output]
    radius = sum(t.radius for t in ticks)

    def prices(logs):
        result = [mp.mpf(1)]*n
        for i, value in zip(fixed, logs):
            result[i] = mp.exp(value)
        return result

    def equations(*logs):
        point = aggregate(prices(logs), ticks)
        return tuple((point[i]-target[i])/radius for i in fixed)

    initial = tuple(mp.log(mp.mpf(guess[i])/guess[output]) for i in fixed)
    root = mp.findroot(equations, initial, solver='mdnewton',
                       tol=mp.power(10, -mp.dps+10), maxsteps=NEWTON_STEPS, verify=True)
    p = prices(list(root))
    point, rows = _support(p, ticks)
    assert min(p) > 0
    assert max(abs(point[i]-target[i]) for i in fixed) < _tolerance()*radius
    return point, p, rows


def _prefix(prices, ticks):
    h = len(prices)-sum(prices)/mp.sqrt(sum(v*v for v in prices))
    return sum(t.boundary is not None and h > t.boundary for t in ticks)


def _exact_free_initial(start, radii, keys, output_index, prices):
    """Recognize a specified rational free-sphere support witness exactly.

    Used for the retained repartition case whose initial endpoint is already
    exact. This does not snap a numerical root according to a tolerance.
    """
    norm_squared = sum(p*p for p in prices)
    norm = isqrt(norm_squared)
    assert norm*norm == norm_squared and min(prices) > 0
    rows = [[r*(1-Fraction(p, norm)) for p in prices] for r in radii]
    for row, radius, key in zip(rows, radii, keys):
        assert sum((x-radius)**2 for x in row) == radius**2
        assert key is None or sum(row) <= radius*Fraction(key, GRID)
        assert all(0 <= x <= radius for x in row)
    assert [sum(row[i] for row in rows) for i in range(len(start))] == start
    return list(map(mp.mpf, start)), [mp.mpf(p)/prices[output_index] for p in prices]


def _record(point, prices, start, input_index, output_index, progress):
    result = {}
    quantities = {'input': mp.mpf(progress), 'output': mp.mpf(start[output_index])-point[output_index],
                  'root': point[output_index],
                  'direction': mp.mpf(start[input_index])+progress-point[output_index]}
    for name, value in quantities.items():
        result[name+'_floor_grid'], result[name+'_ceil_grid'] = _bounds(value)
    result['price_floor_grid'] = [_bounds(v/prices[output_index])[0] for v in prices]
    return result


def _key_events(start, radii, keys, ticks, input_index, output_index):
    """All positive-price key witnesses, via unit-normal price-space constraints.

    At key b, sum(q)=n-b and ||q||=1. Explicit cap/free supporting-basket
    coordinates are affine in each q_i with a common strictly negative slope.
    Untouched reserves therefore uniquely fix every untouched q_i. The two
    remaining coordinates satisfy their sum and unit norm: bisection on either
    side of their equal point identifies both possible roots without a
    coordinate discriminant. Negative-price solutions are never made physical.
    """
    n = len(start)
    fixed = [i for i in range(n) if i not in (input_index, output_index)]
    events, checks = [], []
    for key_index, key in enumerate(keys[:-1]):
        b = mp.mpf(key)/GRID
        normal_sum = n-b
        normal_transverse = mp.sqrt(1-normal_sum**2/n)

        def component(q):
            values = []
            for tick in ticks:
                if tick.boundary is None or tick.boundary >= b:
                    values.append(tick.radius*(1-q))
                else:
                    values.append(tick.radius*(tick.boundary/n-
                                  geometry(n, tick)['sigma']*(q-normal_sum/n)/normal_transverse))
            return sum(values)

        zero, one = component(mp.mpf(0)), component(mp.mpf(1))
        assert zero > one
        q = [mp.mpf(0)]*n
        for i in fixed:
            q[i] = (zero-start[i])/(zero-one)
        pair_sum = normal_sum-sum(q)
        fixed_norm = sum(v*v for v in q)
        minimum = fixed_norm+pair_sum**2/2
        check = {'key_index': key_index, 'key': str(key),
                 'minimum_norm_squared_floor_1e30': _bounds(minimum, 10**30)[0]}
        if minimum > 1+_tolerance():
            check['status'] = 'no_real_normal'
            checks.append(check)
            continue
        if any(q[i] < 0 for i in fixed) or pair_sum <= 0 or fixed_norm+pair_sum**2 < 1:
            check['status'] = 'no_positive_price_pair'
            checks.append(check)
            continue
        if abs(minimum-1) < _tolerance():
            check['status'] = 'touch_requires_exact_case_analysis'
            checks.append(check)
            continue

        def residual(v):
            return fixed_norm+v*v+(pair_sum-v)**2-1

        low, high = pair_sum/2, pair_sum
        assert residual(low) < 0 < residual(high)
        for _ in range(BISECTION_STEPS):
            mid = (low+high)/2
            if residual(mid) < 0:
                low = mid
            else:
                high = mid
            if high-low < mp.power(10, -mp.dps+15):
                break
        else:
            raise ArithmeticError('unit-normal bisection exhausted')
        root = (low+high)/2
        for inward, value in [(True, root), (False, pair_sum-root)]:
            p = q.copy()
            p[input_index], p[output_index] = value, pair_sum-value
            assert min(p) >= 0 and p[output_index] > 0
            assert abs(sum(p)-normal_sum) < _tolerance()
            assert abs(sum(v*v for v in p)-1) < _tolerance()
            point, _ = _support(p, ticks)
            assert max([abs(point[i]-start[i]) for i in fixed]+[mp.mpf(0)]) < _tolerance()*sum(radii)
            assert (point[input_index] < point[output_index]) == inward
            events.append({'point': point, 'prices': p, 'key_index': key_index,
                           'key': str(key), 'direction': 'inward' if inward else 'outward',
                           'progress': point[input_index]-start[input_index]})
        check['status'] = 'two_physical_normal_roots'
        checks.append(check)
    # The marginal input/output support price decreases along this convex
    # fixed-reserve frontier. This ordering is independent of coordinate roots.
    events.sort(key=lambda e: e['prices'][input_index]/e['prices'][output_index], reverse=True)
    for left, right in zip(events, events[1:]):
        assert left['progress'] < right['progress']
        assert left['point'][output_index] > right['point'][output_index]
    return events, checks


def _case(name, start, radii, keys, decimals, raw_input, guess, input_index=0,
          output_index=1, allow_repartition=False, exact_initial=None, final_guess=None):
    ticks = _ticks(radii, keys)
    n = len(start)
    initial_actual_count, _, _ = _actual(start, radii, keys, ticks)
    quantum_in = 10**(18-decimals[input_index])*U
    quantum_out = 10**(18-decimals[output_index])*U
    amount = raw_input*quantum_in
    assert 0 < amount <= sum(radii)-start[input_index]
    if exact_initial is None:
        initial, p0, _ = _solve(start, output_index, ticks, guess)
    else:
        initial, p0 = _exact_free_initial(start, radii, keys, output_index, exact_initial)
    target = start.copy()
    target[input_index] += amount
    # Optional price-space proposal for a large endpoint displacement. This is
    # never a production reserve/root witness; all explicit support equations,
    # primal checks and path samples below still apply. Default corpora retain
    # the original starting-price seed exactly.
    final, pf, _ = _solve(target, output_index, ticks, p0 if final_guess is None else final_guess)
    initial_count, final_count = _prefix(p0, ticks), _prefix(pf, ticks)
    assert initial[output_index] <= start[output_index]
    assert final[output_index] < initial[output_index]
    all_events, key_checks = _key_events(start, radii, keys, ticks, input_index, output_index)
    events = [e for e in all_events if 0 < e['progress'] < amount]
    transitions, prefix_walk = [], [initial_actual_count]
    release_points = [mp.mpf(start[output_index])]
    for index in range(initial_actual_count-1, initial_count-1, -1):
        seam_sum = (sum(mp.mpf(r)*k/GRID for r, k in zip(radii[:index], keys))+
                    sum(radii[index:])*mp.mpf(keys[index])/GRID)
        seam_output = seam_sum-sum(start[i] for i in range(n) if i != output_index)
        assert initial[output_index] < seam_output <= release_points[-1]
        seam = list(map(mp.mpf, start))
        seam[output_index] = seam_output
        # A slack seam needs both reconstructions, not a frontier identity.
        _actual(seam, radii, keys, ticks, index)
        _actual(seam, radii, keys, ticks, index+1)
        output_bounds = _bounds(mp.mpf(start[output_index])-seam_output)
        transitions.append({'key_index': index, 'key': str(keys[index]), 'direction': 'inward',
                            'initial_release': True, 'input_floor_grid': '0', 'input_ceil_grid': '0',
                            'output_floor_grid': output_bounds[0], 'output_ceil_grid': output_bounds[1]})
        prefix_walk.append(index)
        release_points.append(seam_output)
    assert prefix_walk[-1] == initial_count
    release_points.append(initial[output_index])
    release_checked = 0
    for left, right in zip(release_points, release_points[1:]):
        for index in range(SAMPLES_PER_ARC):
            point = list(map(mp.mpf, start))
            point[output_index] = left+(right-left)*index/(SAMPLES_PER_ARC-1)
            _actual(point, radii, keys, ticks)
            release_checked += 1

    prefix = initial_count
    anchors = [{'point': initial, 'prices': p0, 'progress': mp.mpf(0)}]+events+[
        {'point': final, 'prices': pf, 'progress': mp.mpf(amount)}]
    support_checked = 0
    for left, right in zip(anchors, anchors[1:]):
        assert left['progress'] < right['progress']
        assert left['point'][output_index] > right['point'][output_index]
        for sample in range(SAMPLES_PER_ARC):
            fraction = mp.mpf(sample)/(SAMPLES_PER_ARC-1)
            progress = left['progress']+(right['progress']-left['progress'])*fraction
            sample_target = list(map(mp.mpf, start))
            sample_target[input_index] += progress
            guess_at = [mp.exp(mp.log(a)*(1-fraction)+mp.log(b)*fraction)
                        for a, b in zip(left['prices'], right['prices'])]
            point, p, _ = _solve(sample_target, output_index, ticks, guess_at)
            assert min(p) > 0
            if 0 < sample < SAMPLES_PER_ARC-1:
                assert _prefix(p, ticks) == prefix
            _actual(point, radii, keys, ticks)
            support_checked += 1
        if 'key_index' in right:
            key_index = right['key_index']
            assert prefix == (key_index+1 if right['direction'] == 'inward' else key_index)
            prefix = key_index if right['direction'] == 'inward' else key_index+1
            prefix_walk.append(prefix)
            record = _record(right['point'], right['prices'], start, input_index, output_index, right['progress'])
            record.update({k: right[k] for k in ('key_index', 'key', 'direction')})
            record['initial_release'] = False
            transitions.append(record)
    assert prefix == final_count
    ideal_output = mp.mpf(start[output_index])-final[output_index]
    output_raw = int(mp.floor(ideal_output/quantum_out))
    assert output_raw > 0
    actual = target.copy()
    actual[output_index] -= output_raw*quantum_out
    shortfall = mp.mpf(actual[output_index])-final[output_index]
    assert 0 <= shortfall < quantum_out
    actual_count, _, radial_slack = _actual(actual, radii, keys, ticks)
    if not allow_repartition:
        assert actual_count == final_count
    assert radial_slack <= shortfall+_tolerance()*sum(radii)
    for sample in range(SAMPLES_PER_ARC):
        point = list(map(mp.mpf, target))
        point[output_index] = final[output_index]+shortfall*sample/(SAMPLES_PER_ARC-1)
        _actual(point, radii, keys, ticks)
    deficit = ((output_raw+1)*quantum_out-ideal_output)*pf[output_index]
    assert deficit > 0  # next raw output violates the exact support objective
    shortfall_low, shortfall_high = _bounds(shortfall)
    return {'id': name, 'dimension': n, 'input': input_index, 'output': output_index,
            'scope': 'geometric actual state; raw-token history not established',
            'reachable_raw_history_verified': False,
            'start': list(map(str, start)), 'radii': list(map(str, radii)),
            'keys': [None if k is None else str(k) for k in keys], 'decimals': decimals,
            'raw_net_input': str(raw_input), 'net_input_internal': str(amount),
            'output_quantum': str(quantum_out), 'output_raw': str(output_raw),
            'actual_initial_prefix': initial_actual_count, 'initial_ideal_prefix': initial_count,
            'final_ideal_prefix': final_count, 'actual_final_prefix': actual_count,
            'prefix_walk': prefix_walk, 'transitions': transitions, 'key_checks': key_checks,
            'initial': _record(initial, p0, start, input_index, output_index, 0),
            'final': _record(final, pf, start, input_index, output_index, amount),
            'actual_endpoint': list(map(str, actual)), 'shortfall_floor_grid': shortfall_low,
            'shortfall_ceil_grid': shortfall_high, 'shortfall_ceil': _bounds(shortfall, 1)[1],
            'radial_slack_ceil': _bounds(radial_slack, 1)[1],
            'next_raw_dual_deficit_floor_grid': _bounds(deficit)[0],
            'path_checks': {'support_points_checked': support_checked,
                            'release_points_checked': release_checked,
                            'retention_points_checked': SAMPLES_PER_ARC,
                            'all_primal_dual_checks_passed': True}}


def _failures(successes):
    whole = 10**18*U
    repartition = _case('n3_rounding_repartition', [500*whole, 400*whole, 100*whole],
                        [100*whole, 200*whole, 400*whole], [3*GRID//2, 7*GRID//4, None],
                        [6, 6, 6], 68669858, [2, 3, 6], 0, 2, True, [2, 3, 6])
    assert repartition['final_ideal_prefix'] != repartition['actual_final_prefix']
    coarse = _case('n2_coarse_initial_order', [15*SCALE//10, 3*SCALE//10], [SCALE]*2,
                   [7*GRID//8, None], [18, 18], SCALE//100//U, [1, 4])
    raw = SCALE//100//U
    amount = raw*U
    zero_initial = [0, SCALE]
    # Exact start has supporting price (1,0); no output-price normalization
    # exists there. A strictly positive-input support solution still exists.
    assert sum((x-SCALE)**2 for x in zero_initial) == SCALE**2
    previous_output = mp.mpf(SCALE)
    zero_points_checked = 0
    for sample in range(1, SAMPLES_PER_ARC):
        progress = mp.mpf(amount)*sample/(SAMPLES_PER_ARC-1)
        zero_final, zero_prices, _ = _solve([progress, SCALE], 1, [Tick(SCALE)], [100, 1])
        assert min(zero_prices) > 0 and 0 < zero_final[1] < previous_output
        _actual(zero_final, [SCALE], [None], [Tick(SCALE)])
        previous_output = zero_final[1]
        zero_points_checked += 1
    zero_raw = int(mp.floor((SCALE-zero_final[1])/U))
    _actual([amount, SCALE-zero_raw*U], [SCALE], [None], [Tick(SCALE)])

    # Exact rational n7 key touch: each radius-8 basket is half the aggregate.
    start = [11, 11, 10, 10, 10, 9, 9]
    q = [Fraction(16-x, 16) for x in start]
    assert sum(q) == Fraction(21, 8) and sum(x*x for x in q) == 1
    assert q[0] == q[1] and min(q) > 0
    assert sum(Fraction(x, 2) for x in start) == 8*Fraction(35, 8)
    assert sum((Fraction(x, 2)-8)**2 for x in start) == 8**2

    # Retained in-range negative-price branch: exact rational inequalities
    # establish z>totalRadius at a sphere/key intersection. It cannot be a
    # positive-price support endpoint, even though the actual start is feasible.
    b = Fraction(18*GRID//10, GRID)
    pair = 2*b-Fraction(1, 10)
    square = 2*(8*b-8-Fraction(1, 100))-pair*pair
    assert pair-2*Fraction(139, 100) > 0
    assert (pair-2*Fraction(139, 100))**2 < square < (pair-2*Fraction(138, 100))**2
    assert 4-pair > 0 and square > (4-pair)**2
    x = [138*SCALE//100, 199*SCALE//100, SCALE//10]
    _actual(x, [SCALE, SCALE], [18*GRID//10, None], _ticks([SCALE, SCALE], [18*GRID//10, None]))

    rejected = False
    try:
        _actual([0, 0], [SCALE, SCALE], [5*GRID//8, None], _ticks([SCALE, SCALE], [5*GRID//8, None]))
    except ValueError:
        rejected = True
    assert rejected
    release = next(x for x in successes if x['id'] == 'n2_initial_release')
    two = next(x for x in successes if x['id'] == 'n2_two_roots')
    return [{'id': 'n3_rounding_repartition', 'production_expectation': 'FrontierPathCertified',
             'previous_production_expectation': 'RequiresRepartition',
             'resolution': 'one certified final-retention seam, charged to the crossing budget',
             'ideal_prefix': repartition['final_ideal_prefix'], 'actual_prefix': repartition['actual_final_prefix'],
             'witness': repartition},
            {'id': 'n7_exact_initial_touch', 'production_expectation': 'Uncertain',
             'exact_rational_witness_verified': True, 'dimension': 7,
             'start': [str(x*SCALE) for x in start], 'radii': [str(8*SCALE)]*2,
             'keys': [str(35*GRID//8), None], 'input_floor_grid': '0',
             'raw_net_input': str(SCALE//1000//U)},
            {'id': 'n3_nonphysical_branch', 'production_expectation': 'FrontierPathCertified',
             'previous_production_expectation': 'Uncertain',
             'resolution': 'strict negative-price exclusion of the algebraic key branch; the physical sphere path certifies',
             'violation_scope': 'algebraic key branch, not the entire trade',
             'positive_output_normal_violated': True, 'start': list(map(str, x)),
             'radii': [str(SCALE)]*2, 'keys': [str(18*GRID//10), None],
             'raw_net_input': str(SCALE//100//U),
             'exact_rational_input_interval': ['0', str(SCALE//100)]},
            {'id': 'n2_insufficient_crossing_allowance', 'production_expectation': 'TransitionLimit',
             'source_case': release['id'], 'required': len(release['transitions']), 'supplied': [0, 1]},
            {'id': 'n2_hidden_turn', 'production_expectation': 'direct mixed arc must be rejected',
             'source_case': two['id'], 'required_frontier_events': len(two['transitions']),
             'same_endpoint_prefix_does_not_certify_the_path': True},
            {'id': 'invalid_zero_start', 'production_expectation': 'UncertifiedStart',
             'explicit_primal_rejection': rejected},
            {'id': 'n2_coarse_initial_order', 'production_expectation': 'Uncertain',
             'reason': 'current zero-budget initial bracket cannot order the join', 'witness': coarse},
            {'id': 'n2_initial_zero_output_normal', 'production_expectation': 'Uncertain',
             'initial_output_normal': '0', 'positive_one_sided_path_verified': True,
             'positive_one_sided_support_points_checked': zero_points_checked,
             'start': list(map(str, zero_initial)), 'radii': [str(SCALE)], 'keys': [None],
             'raw_net_input': str(raw), 'net_input_internal': str(amount), 'output_raw': str(zero_raw),
             'root_floor_grid': _bounds(zero_final[1])[0], 'root_ceil_grid': _bounds(zero_final[1])[1]}]


@lru_cache(maxsize=2)
def _corpus(dps):
    with mp.workdps(dps):
        # Only immutable geometry/actual inputs are reused from this source;
        # its scalar residuals, normals and production-related outputs are not.
        scalar_path = Path(__file__).parent/'fixtures/curve-primitives.json'
        scalars = json.loads(scalar_path.read_text())['scalars']
        cases = []
        for index, guess in [(0, [2, 1]), (2, [1, 3, 2]), (3, list(range(1, 9)))]:
            item = scalars[index]
            cases.append(_case(f'n{item["n"]}_mixed_no_crossing', list(map(int, item['x'])),
                               list(map(int, item['radii'])), item['keys'], [18]*item['n'], 10**18, guess))
        item = scalars[2]
        cases.append(_case('n3_mixed_decimals', list(map(int, item['x'])), list(map(int, item['radii'])),
                           item['keys'], [6, 6, 18], 10**6, [1, 3, 2]))
        pair = [2527133520585472095299795479050357292168,
                10306468614415789726245162508561985295187]
        for name, amount in [('n2_two_roots', 8*SCALE//10), ('n2_one_root', SCALE//10)]:
            cases.append(_case(name, pair, [SCALE, SCALE], [5*GRID//8, None], [18, 18], amount//U, [2, 1]))
        cases.append(_case('n2_four_roots', [2*SCALE//5, 39*SCALE//25], [SCALE]*3,
                           [61*GRID//100, 5*GRID//8, None], [18, 18], 11*SCALE//10//U, [2, 1]))
        cases.append(_case('n2_initial_release', [15*SCALE//10, 3*SCALE//10], [SCALE]*2,
                           [7*GRID//8, None], [18, 18], 35*SCALE//100//U, [1, 4]))
        cases.append(_case('n3_mixed_turn', [863*SCALE//100, 999*SCALE//100, SCALE//10],
                           [SCALE//100, 10*SCALE], [13*GRID//10, None], [18]*3,
                           SCALE//U, [3, 1, 25]))
        return {'schema_version': 1,
                'oracle': 'explicit per-tick support; log-price reserve matching and unit-normal key bisection',
                'numerical_bounds': {'minimum_precision': 80, 'checked_precisions': [110, 160],
                                     'newton_max_steps': NEWTON_STEPS, 'bisection_max_steps': BISECTION_STEPS,
                                     'samples_per_arc': SAMPLES_PER_ARC, 'dimensions': [2, 3, 8],
                                     'failure_dimensions': [2, 3, 7],
                                     'max_ordinary_ticks_in_success_cases': 2},
                'non_claims': ['universal path proof', 'validated onchain interval enclosure',
                               'reachable raw-token history', 'shared onchain refinement-budget verification'],
                'cases': cases, 'failures': _failures(cases)}


def corpus(dps):
    if isinstance(dps, bool) or not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    return deepcopy(_corpus(dps))


if __name__ == '__main__':
    import sys
    fixtures = corpus(160)
    assert fixtures == corpus(110)
    encoded = json.dumps(fixtures, indent=2)+'\n'
    if '--write' in sys.argv:
        target = Path(__file__).parent/'fixtures/frontier-composition.json'
        target.write_bytes(encoded.encode('utf-8'))
        print('Wrote precision-stable composition fixtures.')
    else:
        print(encoded, end='')
