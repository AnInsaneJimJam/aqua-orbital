"""Bounded explicit-basket witnesses for outward accounting-seam retention.

Uses the independent per-tick price-space oracle, never production root or
reconstruction certificates. Finite 110/160-digit checks are not a proof.
"""
from copy import deepcopy
from functools import lru_cache
from mpmath import mp
from fixtures_frontier_composition import GRID, U, _case, _actual, _ticks, _solve


def _one(name, radii, keys, decimals):
    whole = 10**18 * U
    start = [500*whole, 400*whole, 100*whole]
    witness = _case(name, start, radii, keys, decimals, 68669858, [2, 3, 6],
                    0, 2, True, [2, 3, 6])
    ticks = _ticks(radii, keys)
    target = start.copy()
    target[0] += 68669858 * 10**(18-decimals[0]) * U
    root, _, _ = _solve(target, 2, ticks, [2, 3, 6])
    actual = list(map(int, witness['actual_endpoint']))
    k, j = witness['final_ideal_prefix'], witness['actual_final_prefix']
    assert k == 0 and j > k
    tolerance = mp.power(10, -mp.dps+20) * sum(radii)
    radius, axial = sum(radii), 0
    seams, nodes = [], [root[2]]
    for index in range(j):
        seam_sum = mp.mpf(axial + radius*keys[index]) / GRID
        value = seam_sum - target[0] - target[1]
        assert root[2] <= value <= actual[2]
        point = [mp.mpf(target[0]), mp.mpf(target[1]), value]
        _, _, before = _actual(point, radii, keys, ticks, index)
        _, _, after = _actual(point, radii, keys, ticks, index+1)
        assert after <= before + tolerance
        assert value*GRID == int(value*GRID)
        seams.append({'key_index': index, 'key': str(keys[index]),
                      'output_reserve_grid': str(int(value*GRID)),
                      'slack_before_ceil': str(int(mp.ceil(before))),
                      'slack_after_ceil': str(int(mp.ceil(after))),
                      'slack_nonincreasing': True})
        nodes.append(value)
        radius -= radii[index]
        axial += radii[index]*keys[index]
    nodes.append(mp.mpf(actual[2]))
    checked = 0
    for prefix, (left, right) in enumerate(zip(nodes, nodes[1:])):
        left_point = [mp.mpf(target[0]), mp.mpf(target[1]), left]
        _, _, left_slack = _actual(left_point, radii, keys, ticks, prefix)
        for sample in range(9):
            value = left+(right-left)*sample/8
            _, _, slack = _actual([mp.mpf(target[0]), mp.mpf(target[1]), value],
                                   radii, keys, ticks, prefix)
            assert abs(slack-left_slack) <= value-left+tolerance
            assert slack <= value-root[2]+tolerance
            checked += 1
    return {'witness': witness, 'seams': seams, 'ends_at_seam': nodes[-2] == nodes[-1],
            'two_sided_seam_checks': 2*len(seams), 'segment_points_checked': checked,
            'within_prefix_slack_length_bounds': True}


@lru_cache(maxsize=2)
def _corpus(dps):
    with mp.workdps(dps):
        whole = 10**18*U
        single = _one('n3_exact_retention_seam', [100*whole, 200*whole, 400*whole],
                      [3*GRID//2, 7*GRID//4, None], [6, 6, 6])
        multiple = _one('n3_seven_retention_seams', [10*whole]*6+[40*whole, 600*whole],
                        [3*GRID//2+i for i in range(7)]+[None], [6, 6, 0])
        # The retained price-hole example still fails an individual tick bound.
        prices = [mp.mpf(0), (5+mp.sqrt(7))/8, (5-mp.sqrt(7))/8]
        point = [2*(1-p) for p in prices]
        point[1] += mp.mpf('0.000001')
        rejected = False
        try:
            _actual(point, [1, 1], [7*GRID//4, None], _ticks([1, 1], [7*GRID//4, None]))
        except ValueError:
            rejected = True
        assert rejected
        return {'cases': [single, multiple], 'retained_price_hole_rejected': rejected}


def corpus(dps=110):
    return deepcopy(_corpus(dps))
