"""Independent six-pair explicit-support fixtures for the all-interior wrapper.

The primary root oracle matches fixed reserves in price space by summing each
tick's analytic supporting basket. It never solves the production sphere/torus
residual. Exact integer square inequalities and rational per-tick checks then
validate the rounded fixture independently. Precision agreement is finite
numerical evidence; it is not a universal path or optimizer proof.
"""
from fractions import Fraction
from mpmath import mp
from orbital import Tick, supporting_basket, verify_baskets

GRID = 2**32
U = 2**64
WHOLE = 10**18*U
RADII = [100*WHOLE, 200*WHOLE, 400*WHOLE]
KEYS = [3*GRID//2, 7*GRID//4, 2**64-1]
START = [500*WHOLE, 400*WHOLE, 100*WHOLE]
DECIMALS = [6, 6, 18]
INITIAL_PRICES = [2, 3, 6]


def _rounded_witness(point):
    """Exact rational baskets certify more than a small aggregate residual."""
    radius = sum(RADII)
    rows = [[Fraction(r*x, radius) for x in point] for r in RADII]
    assert [sum(row[i] for row in rows) for i in range(3)] == point
    assert all(0 < x < radius for x in point)
    assert 2*sum(point) < 3*radius  # strict first-key interior membership
    for r, key, row in zip(RADII, KEYS, rows):
        assert sum((x-r)**2 for x in row) <= r*r
        assert all(0 <= x <= r for x in row)
        if key == 2**64-1:
            continue
        b = Fraction(key, GRID)
        assert sum(row) < r*b
        offset_squared = (1-(3-b)**2/3)*Fraction(2, 3)
        assert offset_squared > 0
        for x in row:
            # Verify the true minimum x/r >= b/3-sqrt(offset_squared).
            # Represented virtual credits are no greater than this minimum.
            deficit = b/3-x/r
            assert deficit <= 0 or deficit*deficit <= offset_squared


def _case(token_in, token_out):
    ticks = [Tick(r, None if key == 2**64-1 else mp.mpf(key)/GRID)
             for r, key in zip(RADII, KEYS)]
    radius = sum(RADII)
    quantum_in = 10**(18-DECIMALS[token_in])*U
    quantum_out = 10**(18-DECIMALS[token_out])*U
    raw_input = 10**DECIMALS[token_in]
    target = START.copy()
    target[token_in] += raw_input*quantum_in
    fixed = [i for i in range(3) if i != token_out]

    def prices(weights):
        p = [mp.mpf(1)]*3
        for i, weight in zip(fixed, weights):
            p[i] = weight
        return p

    def equations(*weights):
        rows = [supporting_basket(prices(weights), tick) for tick in ticks]
        return tuple((sum(row[i] for row in rows)-target[i])/radius for i in fixed)

    guess = tuple(mp.mpf(INITIAL_PRICES[i])/INITIAL_PRICES[token_out] for i in fixed)
    weights = mp.findroot(equations, guess, solver='mdnewton', maxsteps=30,
                          tol=mp.power(10, -mp.dps+10), verify=True)
    p = prices(list(weights))
    assert all(value > 0 for value in p)
    rows = [supporting_basket(p, tick) for tick in ticks]
    ideal = list(map(mp.mpf, target))
    ideal[token_out] = sum(row[token_out] for row in rows)
    tolerance = mp.power(10, -mp.dps+20)
    assert max(abs(value) for value in equations(*weights)) < tolerance
    verify_baskets(ideal, rows, ticks, p)
    assert sum(ideal)/radius < mp.mpf(KEYS[0])/GRID
    assert all(sum(row) < tick.radius*mp.mpf(KEYS[0])/GRID
               for row, tick in zip(rows, ticks))

    ideal_output = mp.mpf(START[token_out])-ideal[token_out]
    assert ideal_output > 0
    raw_output = int(mp.floor(ideal_output/quantum_out))
    actual = target.copy()
    actual[token_out] -= raw_output*quantum_out
    deficit_ceil = int(mp.ceil(radius-ideal[token_out]))
    actual_deficit = radius-actual[token_out]
    shortfall_upper = deficit_ceil-actual_deficit
    assert 0 < shortfall_upper <= quantum_out
    assert ideal[token_out] <= actual[token_out]
    _rounded_witness(actual)

    # Secondary exact oracle, after the explicit-support solve. It verifies
    # the root ceiling and the largest feasible raw output for this fixture.
    radicand = radius*radius-sum((radius-x)**2 for i, x in enumerate(actual) if i != token_out)
    assert (deficit_ceil-1)**2 < radicand <= deficit_ceil**2
    assert actual_deficit**2 <= radicand < (actual_deficit+quantum_out)**2
    return {'input': token_in, 'output': token_out, 'net_input_raw': str(raw_input),
            'output_raw': str(raw_output), 'actual_endpoint_internal': list(map(str, actual)),
            'ideal_output_deficit_ceil_internal': str(deficit_ceil),
            'shortfall_upper_internal': str(shortfall_upper)}


def corpus(dps):
    if not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    with mp.workdps(dps):
        _rounded_witness(START)
        radius = sum(RADII)
        assert sum((radius-x)**2 for x in START) == radius*radius
        assert [Fraction(radius-x, radius) for x in START] == [Fraction(p, 7) for p in INITIAL_PRICES]
        return {'schema_version': 1, 'dimension': 3,
                'oracle': 'price-space solve of independent explicit per-tick supporting baskets',
                'coordinate_unit': 'internal geometric length; WHOLE=10^18*2^64',
                'radii_internal': list(map(str, RADII)), 'tick_keys': list(map(str, KEYS)),
                'start_internal': list(map(str, START)), 'decimals': DECIMALS.copy(),
                'pairs': [_case(i, j) for i in range(3) for j in range(3) if i != j]}


if __name__ == '__main__':
    import json
    fixtures = corpus(160)
    assert fixtures == corpus(110)
    print(json.dumps(fixtures, indent=2))
