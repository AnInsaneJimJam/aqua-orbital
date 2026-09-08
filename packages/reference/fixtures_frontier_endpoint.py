"""Independent explicit-support endpoint fixtures, not an onchain quote source.

Only immutable input vectors/radii/keys are reused from the scalar corpus.
Root finding solves per-tick supporting-basket reserve matching in price
space; the production radical, seed and bisection are never root oracles.
"""
from mpmath import mp
from fixtures_curve_primitives import corpus as scalar_corpus
from orbital import Tick, geometry, supporting_basket, verify_baskets

GRID = 2**32
U = 2**64


def _canonical(point, radii, keys):
    A, R, K = sum(point), sum(radii), 0
    count = 0
    for r, key in zip(radii[:-1], keys[:-1]):
        if A*GRID-K < R*key:
            break
        R -= r
        K += r*key
        count += 1
    return count


def _actual_baskets(point, radii, keys, ticks):
    """Independent explicit MATH-7 reconstruction of rounded actual reserves."""
    n = len(point)
    count = _canonical(point, radii, keys)
    R = sum(radii[count:])
    K = sum(mp.mpf(r)*key/GRID for r, key in zip(radii[:count], keys))
    S = sum(geometry(n, tick)['sigma']*tick.radius for tick in ticks[:count])
    mean = mp.mpf(sum(point))/n
    rho = mp.sqrt(sum((x-mean)**2 for x in point))
    assert rho >= S
    rows = []
    for k, tick in enumerate(ticks):
        if k < count:
            row = [tick.radius*tick.boundary/n+tick.radius*geometry(n, tick)['sigma']*(x-mean)/rho for x in point]
        else:
            row = [mp.mpf(tick.radius)/R*((sum(point)-K)/n+(rho-S)*(x-mean)/rho) for x in point]
        tolerance = mp.power(10, -mp.dps+20)
        assert sum((x/tick.radius-1)**2 for x in row) <= 1+tolerance
        assert all(geometry(n, tick)['virtual']-tolerance*tick.radius <= x <= tick.radius*(1+tolerance) for x in row)
        if tick.boundary is not None:
            assert sum(row) <= tick.radius*(tick.boundary+tolerance)
        rows.append(row)
    assert max(abs(sum(row[k] for row in rows)-point[k]) for k in range(n)) < mp.power(10, -mp.dps+20)*sum(radii)
    return count


def _case(item, index, mixed_decimals=False):
    n = item['n']
    start = list(map(int, item['x']))
    radii = list(map(int, item['radii']))
    keys = [None if k is None else int(k) for k in item['keys']]
    ticks = [Tick(r, None if key is None else mp.mpf(key)/GRID) for r, key in zip(radii, keys)]
    decimals = [18]*n
    if mixed_decimals:
        decimals[0] = decimals[1] = 6
    raw_input = 10**decimals[0]
    quantum_in, quantum_out = 10**(18-decimals[0])*U, 10**(18-decimals[1])*U
    target = start.copy()
    target[0] += raw_input*quantum_in
    fixed = [i for i in range(n) if i != 1]
    guesses = [2, 1] if n == 2 else [1, 3, 2] if n == 3 else list(range(1, 9))

    def prices(weights):
        p = [mp.mpf(1)]*n
        for i, weight in zip(fixed, weights):
            p[i] = weight
        return p

    def equations(*weights):
        rows = [supporting_basket(prices(weights), tick) for tick in ticks]
        return tuple((sum(row[i] for row in rows)-target[i])/sum(radii) for i in fixed)

    guess = tuple(mp.mpf(guesses[i])/guesses[1] for i in fixed)
    weights = mp.findroot(equations, guess, solver='mdnewton', maxsteps=30,
                          tol=mp.power(10, -mp.dps+10), verify=True)
    p = prices(list(weights))
    assert min(p) > 0
    rows = [supporting_basket(p, tick) for tick in ticks]
    root = sum(row[1] for row in rows)
    ideal = list(map(mp.mpf, target))
    ideal[1] = root
    tolerance = mp.power(10, -mp.dps+20)
    assert max(abs(v) for v in equations(*weights)) < tolerance
    assert verify_baskets(ideal, rows, ticks, p) < tolerance
    h = n-sum(p)/mp.sqrt(sum(v*v for v in p))
    root_count = sum(tick.boundary is not None and h > tick.boundary for tick in ticks)
    assert root_count == item['boundaries']
    amount = mp.mpf(start[1])-root
    raw_output = int(mp.floor(amount/quantum_out))
    assert raw_output > 0
    actual = target.copy()
    actual[1] -= raw_output*quantum_out
    shortfall = mp.mpf(actual[1])-root
    assert 0 <= shortfall < quantum_out
    # The exact supporting price gives strict exclusion of the next raw output.
    assert (raw_output+1)*quantum_out > amount
    assert verify_baskets(ideal, rows, ticks, p) < tolerance
    assert _actual_baskets(start, radii, keys, ticks) == item['boundaries']
    actual_count = _actual_baskets(actual, radii, keys, ticks)
    assert actual_count == root_count
    return {'id': f'n{n}_'+('mixed_decimals' if mixed_decimals else 'decimals18'),
            'dimension': n, 'fixture_index': index, 'input': 0, 'output': 1,
            'start': list(map(str, start)), 'radii': list(map(str, radii)),
            'keys': [None if key is None else str(key) for key in keys], 'decimals': decimals,
            'raw_net_input': str(raw_input), 'net_input_internal': str(raw_input*quantum_in),
            'output_quantum': str(quantum_out), 'root_boundary_count': root_count,
            'actual_boundary_count': actual_count, 'root_floor_grid': str(int(mp.floor(root*GRID))),
            'root_ceil_grid': str(int(mp.ceil(root*GRID))), 'output_raw': str(raw_output),
            'actual_endpoint': list(map(str, actual)), 'ideal_shortfall_ceil': str(int(mp.ceil(shortfall)))}


def corpus(dps):
    if not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    with mp.workdps(dps):
        rows = scalar_corpus(dps)['scalars']
        return {'schema_version': 1, 'oracle': 'explicit per-tick supporting-basket reserve matching',
                'cases': [_case(rows[index], index) for index in [0, 2, 3]]+[_case(rows[2], 2, True)]}


if __name__ == '__main__':
    import json
    fixtures = corpus(160)
    assert fixtures == corpus(110)
    print(json.dumps(fixtures, indent=2))
