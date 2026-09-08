"""Independent exact-seam / explicit per-tick GRID release witnesses.

Prefix domains are independently enumerated as rational half-spaces. Each
piece's endpoints and finite analytic critical coordinates are checked using
explicit MATH-7 baskets. Neither Solidity's incremental loop nor any production
root/residual implementation is used as an oracle. These finite numerical
checks supplement the analytic certificate proof; they are not that proof.
"""
from copy import deepcopy
from fractions import Fraction
from fixtures_curve_primitives import corpus as scalar_corpus
from fixtures_slack_segments import (GRID, SCALE, _fixture, _partition,
                                     build_fixtures, exact_moments, explicit_state)


def _fixtures(precision):
    s = SCALE
    key = 7*GRID//8+1
    pair_ticks = [(key, s+1), (None, s)]
    pair_start = [15*s//10, 3*s//10]
    seam = Fraction((2*s+1)*key, GRID)-pair_start[0]
    rows = []
    def add(name, ticks, start, output, end, count, expected=True, scale=s):
        row = _fixture(name, ticks, start, output, Fraction(end))
        row.update(end_count=count, expected=expected, scale=scale)
        rows.append(row)

    add('fractional_endpoint', pair_ticks, pair_start, 1, Fraction(s, 5)+Fraction(1, GRID), 0)
    add('final_seam_boundary', pair_ticks, pair_start, 1, seam, 1)
    add('final_seam_interior', pair_ticks, pair_start, 1, seam, 0)
    add('above_fractional_seam', pair_ticks, pair_start, 1, seam+Fraction(1, GRID), 1)
    ticks = [(3*GRID//4, s), (7*GRID//8, s), (None, s)]
    start = [21*s//10, 4*s//10]
    add('start_and_final_departures', ticks, start, 1, 15*s//100, 0)
    add('canonical_final_seam', ticks, start, 1, 15*s//100, 1)
    ticks = [((980+i)*GRID//1000, s) for i in range(7)]+[(None, s)]
    add('seven_fractional_seams', ticks, [74*s//10, s//2], 1, Fraction(4*s, 10)+Fraction(1, GRID), 0)
    wide = 2**156
    ticks = [(6012954214, wide//100+1), (3*GRID//2, wide//100+3), (None, 10*wide)]
    add('three_asset_wide_two_seams', ticks, [61*wide//10, 6*wide, 61*wide//10], 2,
        19*wide//10+Fraction(GRID-1, GRID), 0, scale=wide)
    retained = {row['name']: row for row in build_fixtures(precision)}
    for name, source in [('variance_hole', 'variance_hole'),
                         ('boundary_price_maximum', 'boundary_peak_straddles_mean')]:
        row = deepcopy(retained[source])
        row.update(name=name, end_count=1, expected=False,
                   end_output=Fraction(row['end_output'])+Fraction(1, GRID))
        rows.append(row)
    # Tiny but exact fractional releases on the same actual n2/n3/n8 states
    # used by FrontierEndpoint. Their initial-root connections are exercised
    # separately in Solidity; this reference does not copy a computed bracket.
    scalar = scalar_corpus(precision)['scalars']
    for index in [0, 2, 3]:
        item = scalar[index]
        ticks = [(None if key is None else int(key), int(r))
                 for key, r in zip(item['keys'], item['radii'])]
        start = list(map(int, item['x']))
        add(f'n{item["n"]}_fractional_initial_prefix', ticks, start, 1,
            Fraction(start[1])-Fraction(1, GRID), item['boundaries'])
    return rows


def _analyze(fixture, precision):
    start = Fraction(fixture['start'][fixture['output']])
    end = fixture['end_output']
    ticks = fixture['ticks']
    C = sum(value for i, value in enumerate(fixture['start']) if i != fixture['output'])
    start_count = len(_partition(fixture, start)[0])
    end_count = fixture['end_count']
    assert end <= start and end_count <= start_count
    assert len(_partition(fixture, end, end_count)[0]) == end_count
    moments = exact_moments(fixture)
    pieces = []
    for count in range(start_count, end_count-1, -1):
        # Recompute each prefix from its defining set; no incremental crossed
        # radius, sigma or K update is copied from the production certificate.
        R = sum(t['radius'] for t in ticks[count:])
        K = sum(Fraction(t['radius']*t['key'], GRID) for t in ticks[:count])
        lower = K+R*Fraction(ticks[count-1]['key'], GRID)-C if count else Fraction(0)
        upper = K+R*Fraction(ticks[count]['key'], GRID)-C if count < len(ticks)-1 else start
        high, low = min(start, upper), max(end, lower)
        assert low <= high
        coordinates = dict(start=high, end=low)
        if count and low <= moments['mean'] <= high:
            coordinates['variance_minimum'] = moments['mean']
        if count and moments['critical'] is not None and low <= moments['critical'] <= high:
            coordinates['boundary_maximum'] = moments['critical']
        points = {name: explicit_state(fixture, z, precision, count) for name, z in coordinates.items()}
        pieces.append(dict(boundary_count=count, high=high, low=low, points=points))
    for previous, following in zip(pieces, pieces[1:]):
        assert previous['low'] == following['high']
    assert pieces[0]['high'] == start and pieces[-1]['low'] == end
    return dict(name=fixture['name'], expected=fixture['expected'], start=fixture['start'], end=end,
                maximum_untouched=max(value for i, value in enumerate(fixture['start']) if i != fixture['output']),
                start_count=start_count, end_count=end_count, crossings=start_count-end_count,
                accepted=all(not p['violations'] for s in pieces for p in s['points'].values()), segments=pieces)


def corpus(precision=160):
    if not isinstance(precision, int) or precision < 80:
        raise ValueError('at least 80 integer decimal digits required')
    return [_analyze(row, precision) for row in _fixtures(precision)]


def portable(rows):
    return [dict(name=row['name'], accepted=row['accepted'], start_count=row['start_count'],
                 end_count=row['end_count'], crossings=row['crossings'],
                 start=list(map(str, row['start'])), end_numerator=str(row['end']*GRID),
                 pieces=[dict(boundary_count=s['boundary_count'], high=str(s['high']), low=str(s['low']),
                              checks={name: p['violations'] for name, p in s['points'].items()})
                         for s in row['segments']]) for row in rows]


if __name__ == '__main__':
    import json
    rows = portable(corpus(160))
    assert rows == portable(corpus(110))
    print(json.dumps(rows, indent=2))
