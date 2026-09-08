"""Independent explicit-tick seam moments and exact directed turn fixtures.

No Solidity/root solver is imported. The primary numerical oracle constructs
every seam basket in a common unit transverse direction, sums its coordinates,
then computes the missing pair's squared difference from aggregate moments.
Exact Python integer coefficient inequalities separately produce the directed
production-format enclosure. Tangent identities use exact rational algebra,
so roundoff is never interpreted as a nonzero tangent discriminant.
"""
from fractions import Fraction
from math import isqrt
from mpmath import mp
from orbital import Tick, aggregate, geometry, supporting_basket, verify_baskets

GRID = 2**32
Q = 2**128
FULL = 2**64-1
SCALE = 10**40


def _sigma_bounds(n, key):
    denominator = n*GRID*GRID
    numerator = denominator-(n*GRID-key)**2
    assert 0 < numerator < denominator and numerator*GRID >= denominator
    square = numerator*Q*Q
    lo = isqrt(square//denominator)
    hi = lo+(lo*lo*denominator != square)
    assert lo*lo*denominator <= square <= hi*hi*denominator
    if hi != lo:
        assert (lo+1)**2*denominator > square
    return lo, hi


def _directed(n, radii, keys, boundary_count, untouched):
    """Exact bigint model, separately compared with explicit basket moments."""
    key = keys[boundary_count-1]
    radius = sum(radii[boundary_count:])
    an = sum(r*k for r, k in zip(radii[:boundary_count], keys))+radius*key
    rho_lo = rho_hi = 0
    for r, k in [*zip(radii[:boundary_count], keys), (radius, key)]:
        lo, hi = _sigma_bounds(n, k)
        rho_lo += r*lo//Q
        rho_hi += (r*hi+Q-1)//Q
    rho_lo *= GRID
    rho_hi *= GRID
    cn = sum(untouched)*GRID
    u2n = sum(c*c for c in untouched)*GRID*GRID
    base = 2*an*an-2*n*u2n-n*(an-cn)**2
    lo, hi = base+2*n*rho_lo*rho_lo, base+2*n*rho_hi*rho_hi
    status = 'ProvenNonpositive' if hi <= 0 else 'ProvenPositive' if lo > 0 else 'Uncertain'
    return an, rho_lo, rho_hi, lo, hi, status


def _seam_moments(n, radii, keys, count, untouched):
    """Explicit MATH-7 baskets; direction is auxiliary, not a price witness."""
    direction = [1/mp.sqrt(2), -1/mp.sqrt(2)]+[mp.mpf(0)]*(n-2)
    key = mp.mpf(keys[count-1])/GRID
    rows = []
    tolerance = mp.power(10, -mp.dps+15)
    for i, (r, k) in enumerate(zip(radii, keys)):
        h = mp.mpf(k)/GRID if i < count else key
        sigma = geometry(n, Tick(r, h))['sigma']
        row = [mp.mpf(r)*(h/n+sigma*u) for u in direction]
        assert abs(sum(row)/r-h) < tolerance
        assert abs(sum((x/r-1)**2 for x in row)-1) < tolerance
        rows.append(row)
    point = [sum(row[i] for row in rows) for i in range(n)]
    A = sum(point)
    B = sum(x*x for x in point)
    rho = mp.sqrt(sum((x-A/n)**2 for x in point))
    missing_pair_sum = A-sum(untouched)
    missing_pair_squares = B-sum(mp.mpf(c)**2 for c in untouched)
    D = 2*missing_pair_squares-missing_pair_sum**2
    return A, rho, D


def _physical_witnesses():
    """Support witnesses for counterexample, exact tangents and a real n8 turn."""
    tolerance = mp.power(10, -mp.dps+20)
    for n, b, radii, prices, expected in [
        (7, mp.mpf(35)/8, [8, 8], [5, 5, 6, 6, 6, 7, 7], [11, 11, 10, 10, 10, 9, 9]),
        (8, mp.mpf(11)/2, [1, 3], [1, 1, 1, 1, 1, 1, 1, 3], [3, 3, 3, 3, 3, 3, 3, 1]),
    ]:
        ticks = [Tick(radii[0], b), Tick(radii[1])]
        p = list(map(mp.mpf, prices))
        rows = [supporting_basket(p, tick) for tick in ticks]
        assert verify_baskets(list(map(mp.mpf, expected)), rows, ticks, p) < tolerance
        h = n-sum(p)/mp.sqrt(sum(x*x for x in p))
        assert abs(h-b) < tolerance
        assert expected[0] == expected[1]

    ticks = [Tick(1, mp.mpf(5)/8), Tick(1)]
    for prices in [[2, 1], [1, 2]]:
        p = list(map(mp.mpf, prices))
        total = aggregate(p, ticks)
        assert verify_baskets(total, [supporting_basket(p, t) for t in ticks], ticks, p) < tolerance
        assert 2-sum(p)/mp.sqrt(sum(x*x for x in p)) > mp.mpf(5)/8
    turn = aggregate([mp.mpf(1)]*2, ticks)
    assert sum(turn)/2 < mp.mpf(5)/8

    # The robust n8 negative case has a physically valid mixed turn, obtained
    # by matching untouched reserves using explicit supporting baskets only.
    ticks = [Tick(1, mp.mpf(11)/2), Tick(3)]
    def equations(a, b):
        p = [mp.mpf(1), mp.mpf(1)]+[a]*5+[b]
        point = aggregate(p, ticks)
        return point[2]-3, point[7]-mp.mpf(9)/10
    a, b = mp.findroot(equations, (1, 3), solver='mdnewton', maxsteps=30,
                       tol=mp.power(10, -mp.dps+10), verify=True)
    p = [mp.mpf(1), mp.mpf(1)]+[a]*5+[b]
    assert min(p) > 0
    point = aggregate(p, ticks)
    assert max(abs(v) for v in equations(a, b)) < tolerance
    assert verify_baskets(point, [supporting_basket(p, t) for t in ticks], ticks, p) < tolerance
    assert 8-sum(p)/mp.sqrt(sum(x*x for x in p)) > mp.mpf(11)/2
    return ['n2_valid_endpoints_hide_two_crossings', 'n7_exact_physical_tangent',
            'n8_exact_physical_tangent', 'n8_negative_has_physical_mixed_turn']


def _case(name, n, radii, keys, count, untouched, exact_nD=None):
    assert 2 <= n <= 8 and 0 < count < len(radii) <= 8
    assert keys[-1] == FULL and keys == sorted(set(keys))
    assert 0 < sum(radii) < 2**160
    assert len(untouched) == n-2 and all(0 <= c < 2**160 for c in untouched)
    an, rho_lo, rho_hi, lo, hi, status = _directed(n, radii, keys, count, untouched)
    A, rho, D = _seam_moments(n, radii, keys, count, untouched)
    tolerance = mp.power(10, -mp.dps+15)*sum(radii)**2*GRID**2*n
    assert abs(A*GRID-an) < mp.power(10, -mp.dps+15)*sum(radii)*GRID
    scaled = n*GRID**2*D
    if exact_nD is None and count == 1:
        # At one key all seam baskets are proportional, so their total sphere
        # second moment is rational even when sigma itself is irrational.
        # Computing floor from a nearly integral mp value would be unsound.
        radius = sum(radii)
        a = Fraction(radius*keys[0], GRID)
        second_moment = 2*radius*a-(n-1)*radius*radius
        exact_nD = 2*n*(second_moment-sum(c*c for c in untouched))-n*(a-sum(untouched))**2
    if exact_nD is not None:
        exact = Fraction(exact_nD)*GRID**2
        assert abs(scaled-mp.mpf(exact.numerator)/exact.denominator) < tolerance
        floor = exact.numerator//exact.denominator
        is_integer = exact.denominator == 1
        sign = (exact > 0)-(exact < 0)
        assert Fraction(lo) <= exact <= Fraction(hi)
    else:
        floor = int(mp.floor(scaled))
        is_integer = False
        sign = int(mp.sign(scaled))
        # A precision-stable floor is an observed numerical fixture only.
        assert lo <= floor and floor+1 <= hi
    assert rho_lo-tolerance <= rho*GRID <= rho_hi+tolerance
    return {'id': name, 'n': n, 'radii': list(map(str, radii)), 'keys': list(map(str, keys)),
            'boundary_count': count, 'untouched': list(map(str, untouched)),
            'seam_sum_numerator': str(an), 'rho_lower': str(rho_lo), 'rho_upper': str(rho_hi),
            'lower': str(lo), 'upper': str(hi), 'status': status, 'exact_sign': sign,
            'exact_scaled_floor': str(floor), 'exact_scaled_is_integer': is_integer}


def corpus(dps):
    if not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    with mp.workdps(dps):
        s = SCALE
        rows = []
        for name, r in [('n2_counterexample', s), ('n2_fractional_seam', s+1), ('n2_small_positive', 1)]:
            rows.append(_case(name, 2, [r, r], [5*GRID//8, FULL], 1, [], Fraction(7*r*r, 8)))
        rows.append(_case('n3_positive', 3, [s, s], [3*GRID//2, FULL], 1, [s], 6*s*s))
        rows.append(_case('n3_negative_pair_sum', 3, [s, s], [3*GRID//2, FULL], 1, [10*s], -723*s*s))
        rows.append(_case('n7_exact_tangent', 7, [8*s, 8*s], [35*GRID//8, FULL], 1, [10*s]*3+[9*s]*2, 0))
        for name, epsilon in [('n8_near_negative', -1), ('n8_tangent', 0), ('n8_near_positive', 1),
                              ('n8_robust_negative', -s//10), ('n8_robust_positive', s//10)]:
            rows.append(_case(name, 8, [s, 3*s], [11*GRID//2, FULL], 1, [3*s]*5+[s+epsilon],
                              64*s*epsilon-24*epsilon*epsilon))
        rows.append(_case('n3_robust_negative', 3, [s//100, 10*s], [13*GRID//10, FULL], 1, [s//10]))
        rows.append(_case('n3_two_boundary_prefix', 3, [s+1, 2*s+3, 3*s+7],
                          [14*GRID//10, 3*GRID//2, FULL], 2, [s]))
        return {'schema_version': 1, 'units': 'returned discriminant = n*GRID^2*D; original integer lengths',
                'oracle': 'independent explicit per-tick seam moments plus exact rational tangent identities',
                'physical_witnesses': _physical_witnesses(), 'cases': rows}


if __name__ == '__main__':
    import json
    fixtures = corpus(160)
    assert fixtures == corpus(110)
    print(json.dumps(fixtures, indent=2))
