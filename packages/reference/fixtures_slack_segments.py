"""Independent explicit-tick fixed-partition segment witnesses. Offline only.

No Solidity solver is imported or executed. Exact Fraction moments select the
finite analytic critical points; every witness is checked by explicit MATH-7
per-tick sphere, cap, principal, and price inequalities. Numerical checks are
precision-dependent evidence, not interval arithmetic or a path proof by samples.
"""
from copy import deepcopy
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time
import mpmath
from mpmath import mp
from orbital import Tick, supporting_basket

GRID = 2**32
SCALE = 10**40


def build_inward_fixtures():
    s = SCALE
    return [
        _fixture('three_asset_one_fractional_seam', [(3*2**31, s//100+1), (None, 10*s)],
                 [61*s//10, 6*s, 61*s//10], 2, 29*s//10),
        _fixture('three_asset_two_fractional_seams',
                 [(7*GRID//5, s//100+1), (3*2**31, s//100+3), (None, 10*s)],
                 [61*s//10, 6*s, 61*s//10], 2, 19*s//10),
    ]


def analyze_inward(fixture, precision=160):
    """Check exact seam-separated pieces and both one-sided reconstructions.

    This is geometric numerical evidence for named intervals. It does not assert
    reachable raw histories or resolve ownership semantics when baskets jump.
    """
    hi = Fraction(fixture['start'][fixture['output']]); lo = Fraction(fixture['end_output'])
    C = sum(a for i, a in enumerate(fixture['start']) if i != fixture['output'])
    ticks = fixture['ticks']
    ordinary = [i for i, tick in enumerate(ticks) if tick['key'] is not None]
    seams = []
    for count, index in enumerate(ordinary):
        lower = ordinary[:count]
        R = sum(t['radius'] for i, t in enumerate(ticks) if i not in lower)
        K = sum(Fraction(ticks[i]['radius']*ticks[i]['key'], GRID) for i in lower)
        seam = K+R*Fraction(ticks[index]['key'], GRID)-C
        if lo < seam < hi:
            seams.append(seam)
    seams.sort(reverse=True)
    limits = [hi]+seams+[lo]
    moments = exact_moments(fixture)
    segments = []
    for high, low in zip(limits, limits[1:]):
        boundary, _, _ = _partition(fixture, (high+low)/2)
        coordinates = dict(start=high, end=low)
        if low <= moments['mean'] <= high:
            coordinates['variance_minimum'] = moments['mean']
        if moments['critical'] is not None and low <= moments['critical'] <= high:
            coordinates['boundary_maximum'] = moments['critical']
        points = {name: explicit_state(fixture, z, precision, len(boundary)) for name, z in coordinates.items()}
        segments.append(dict(boundary_count=len(boundary), points=points))
    return dict(precision=precision, seams=seams, segments=segments,
                accepted=all(not point['violations'] for piece in segments for point in piece['points'].values()))


def _fixture(name, ticks, start, output, end_output, failure=None):
    return dict(name=name, scale=SCALE, ticks=[dict(key=k, radius=r) for k, r in ticks],
                start=start, output=output, end_output=end_output,
                expected='rejected' if failure else 'accepted', failure=failure)


def build_fixtures(precision=160):
    """Construct portable integers; callers compare construction at 110/160 dps."""
    with mp.workdps(precision):
        s = SCALE
        fixtures = [_fixture('all_interior_release', [(None, 2*s)],
                             [s, s+s//1000, s, s], 1, s)]
        # An independent supporting-price witness, followed by funded retention.
        baskets = [supporting_basket([1, 4, 8], Tick(1, mp.mpf(3)/2)),
                   supporting_basket([1, 4, 8], Tick(1))]
        aggregate = [sum(row[i] for row in baskets) for i in range(3)]
        aggregate[1] += mp.mpf(1)/10**6
        x = [int(mp.floor(a*s)) for a in aggregate]
        fixtures.append(_fixture('mixed_boundary_release', [(3*2**31, s), (None, s)],
                                 x, 1, x[1]-s//2_000_000))

        # The retained variance-hole construction, independently integer-embedded.
        n = 4; R = mp.mpf(2); r = mp.mpf(1)/10**6; b = 2+mp.mpf(2)**-31
        transverse = r*mp.sqrt(1-(b-n)**2/n)
        k = mp.sqrt(3)/2
        center = ((R+r)*b+3*transverse/k)/n
        deviation = 3*transverse/4
        x = [int(mp.floor(value*s)) for value in
             [center+deviation, center-deviation/2, center-deviation/2, center+2*transverse/k]]
        end = int(mp.floor((center-2*transverse/k)*s))
        ticks = [(2**33+2, s//10**6), (None, 2*s)]
        fixtures.append(_fixture('variance_hole', ticks, x, 3, end, 'branch'))
        fixtures.append(_fixture('variance_safe_prefix', ticks, x.copy(), 3, x[0]))

        fixtures.append(_fixture('boundary_peak_straddles_mean',
                                 [(7*2**30, s//100), (None, 10*s)],
                                 [61*s//10, 6*s, 61*s//10], 2, 56*s//10, 'boundary_price'))
        fixtures.append(_fixture('boundary_peak_below_mean',
                                 [(33*GRID//20, s//100), (None, 10*s)],
                                 [61*s//10, 6*s, 6049*s//1000], 2, 56*s//10, 'boundary_price'))
        ticks = [(7*2**29, s), (None, s)]
        fixtures.append(_fixture('two_asset_boundary_equality', ticks, [15*s//10, 3*s//10], 1, s//4))
        fixtures.append(_fixture('two_asset_partition_change', ticks, [15*s//10, 3*s//10], 1, s//4-1, 'partition_change'))

        # The critical output is exactly 6*s; the mean is 6.05*s. A safe key
        # isolates closed-interval inclusion from any endpoint price rejection.
        for name, high, low in [
            ('critical_at_lower_endpoint', 6*s+2, 6*s),
            ('critical_at_upper_endpoint', 6*s, 6*s-2),
            ('critical_one_unit_below_interval', 6*s+2, 6*s+1),
            ('critical_one_unit_above_interval', 6*s-1, 6*s-2),
        ]:
            fixtures.append(_fixture(name, [(3*2**31, s//100), (None, 10*s)],
                                     [61*s//10, 6*s, high], 2, low))
        return fixtures


def exact_moments(fixture):
    """Exact rational critical coordinates; never round a mean or critical point."""
    untouched = [a for i, a in enumerate(fixture['start']) if i != fixture['output']]
    m = len(untouched); C = sum(untouched)
    D = m*max(untouched)-C
    H = m*sum(a*a for a in untouched)-C*C
    mean = Fraction(C, m)
    critical = Fraction(C*D-H, m*D) if D else None
    lo, hi = fixture['end_output'], fixture['start'][fixture['output']]
    position = None
    if critical is not None:
        position = ('below' if critical < lo else 'above' if critical > hi else
                    'at_lower' if critical == lo else 'at_upper' if critical == hi else 'inside')
    return dict(C=C, D=D, H=H, mean=mean, critical=critical,
                critical_position=position, mean_included=lo <= mean <= hi,
                critical_included=critical is not None and lo <= critical <= hi)


def _partition(fixture, output_coordinate, boundary_count=None):
    """Enumerate candidate prefix partitions using exact rational inequalities.

    This implements the mathematical classification definition directly, rather
    than the production certifier's incremental K/R update loop.
    """
    x = list(map(Fraction, fixture['start'])); x[fixture['output']] = Fraction(output_coordinate)
    A = sum(x); ticks = fixture['ticks']
    ordinary = [i for i, tick in enumerate(ticks) if tick['key'] is not None]
    candidates = []
    for count in range(len(ordinary)+1):
        if boundary_count is not None and count != boundary_count:
            continue
        boundary = ordinary[:count]
        R = sum(t['radius'] for i, t in enumerate(ticks) if i not in boundary)
        K = sum(Fraction(ticks[i]['radius']*ticks[i]['key'], GRID) for i in boundary)
        h = (A-K)/R
        interior_valid = all((h <= Fraction(ticks[i]['key'], GRID) if boundary_count is not None
                              else h < Fraction(ticks[i]['key'], GRID)) for i in ordinary[count:])
        if all(Fraction(ticks[i]['key'], GRID) <= h for i in boundary) and interior_valid:
            candidates.append((boundary, R, K))
    if len(candidates) != 1:
        raise ArithmeticError('No unique canonical partition under exact key inequalities')
    return candidates[0]


def _mp_fraction(value):
    value = Fraction(value)
    return mp.mpf(value.numerator)/value.denominator


def explicit_state(fixture, output_coordinate, precision=160, boundary_count=None):
    """Reconstruct every tick and check every coordinate with high precision.

    The actual integer fixture, not its unrounded generating state, is used.
    Metrics are normalized by fixture.scale (or its square for squared lengths).
    """
    with mp.workdps(precision):
        z = Fraction(output_coordinate)
        boundary, radius, boundary_sum = _partition(fixture, z, boundary_count)
        n = len(fixture['start']); scale = fixture['scale']
        x = [_mp_fraction(Fraction(a, scale)) for a in fixture['start']]
        x[fixture['output']] = _mp_fraction(z/scale)
        A = sum(x); R = mp.mpf(radius)/scale; K = _mp_fraction(boundary_sum/scale)
        ticks = fixture['ticks']
        sigma = [None if t['key'] is None else
                 mp.sqrt(1-(n-_mp_fraction(Fraction(t['key'], GRID)))**2/n) for t in ticks]
        S = sum(mp.mpf(ticks[i]['radius'])/scale*sigma[i] for i in boundary)
        centered = [a-A/n for a in x]
        rho = mp.sqrt(sum(a*a for a in centered))
        total_radius = mp.mpf(sum(t['radius'] for t in ticks))/scale
        tolerance = mp.power(10, -precision+20)*max(1, total_radius**2)
        violations = []
        def check(label, gap):
            if gap < -tolerance and label not in violations:
                violations.append(label)
        check('branch', rho-S)
        if boundary and rho == 0:
            raise ArithmeticError('Singular reconstruction: an excluded state requires an explicit witness policy')
        u = [a/rho for a in centered] if rho else None
        baskets = []
        gaps = dict(sphere_gap=[], cap_gap=[], principal_gap=[], interior_price_gap=[], boundary_price_gap=[])
        for i, tick in enumerate(ticks):
            r = mp.mpf(tick['radius'])/scale
            b = _mp_fraction(Fraction(tick['key'], GRID)) if tick['key'] is not None else None
            if i in boundary:
                row = [r*b/n+r*sigma[i]*direction for direction in u]
            elif rho:
                row = [r/R*((A-K)/n+(rho-S)*direction) for direction in u]
            else:
                row = [r/R*a for a in x]
            baskets.append(row)
            sphere_gap = r*r-sum((a-r)**2 for a in row)
            gaps['sphere_gap'].append(sphere_gap); check('sphere', sphere_gap)
            if b is not None:
                cap_gap = r*b-sum(row)
                gaps['cap_gap'].append(cap_gap); check('cap', cap_gap)
                virtual = r*(b/n-sigma[i]*mp.sqrt(mp.mpf(n-1)/n))
            else:
                virtual = mp.mpf(0)
            principal_gap = min(row)-virtual
            gaps['principal_gap'].append(principal_gap); check('principal', principal_gap)
            label = 'boundary_price' if i in boundary else 'interior_price'
            price_gap = min(r-a for a in row)
            gaps[label+'_gap'].append(price_gap); check(label, price_gap)
        error = max(abs(sum(row[i] for row in baskets)-x[i]) for i in range(n))
        if error > tolerance:
            violations.append('reconstruction')
        metrics = {name: min(values) if values else None for name, values in gaps.items()}
        metrics.update(branch_gap=rho-S, reconstruction_error=error)
        return dict(output_coordinate=z, partition=boundary, violations=violations,
                    metrics=metrics, baskets=baskets)


def analyze(fixture, precision=160):
    moments = exact_moments(fixture)
    coordinates = dict(start=Fraction(fixture['start'][fixture['output']]), end=Fraction(fixture['end_output']))
    if moments['mean_included']:
        coordinates['variance_minimum'] = moments['mean']
    if moments['critical_included']:
        coordinates['boundary_maximum'] = moments['critical']
    points = {name: explicit_state(fixture, value, precision) for name, value in coordinates.items()}
    failures = []
    if points['start']['partition'] != points['end']['partition']:
        failures.append('partition_change')
    for point in points.values():
        for label in point['violations']:
            if label not in failures:
                failures.append(label)
    return dict(precision=precision, accepted=not failures, failures=failures, moments=moments, points=points)


def portable(fixture):
    """Decimal strings preserve >53-bit integers for Solidity/JS fixture consumers."""
    result = deepcopy(fixture)
    result['scale'] = str(result['scale'])
    result['start'] = list(map(str, result['start']))
    result['end_output'] = str(result['end_output'])
    for tick in result['ticks']:
        tick['radius'] = str(tick['radius'])
        tick['key'] = str(2**64-1 if tick['key'] is None else tick['key'])
    return result


def _json_observation(value):
    if isinstance(value, Fraction):
        return dict(numerator=str(value.numerator), denominator=str(value.denominator))
    if isinstance(value, mp.mpf):
        return mp.nstr(value, 70)
    if isinstance(value, dict):
        return {key: _json_observation(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_observation(item) for item in value]
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2**53:
        return str(value)
    return value


def main():
    start = datetime.now(timezone.utc).isoformat(); clock = time.perf_counter()
    fixtures = build_fixtures(160)
    if fixtures != build_fixtures(110):
        raise ArithmeticError('Integer fixture construction is not precision stable')
    observations = []
    for fixture in fixtures:
        runs = [analyze(fixture, precision) for precision in (110, 160)]
        if any(run['accepted'] != (fixture['expected'] == 'accepted') for run in runs):
            raise ArithmeticError('Unexpected fixture outcome: '+fixture['name'])
        observations.append(dict(name=fixture['name'], runs=[_json_observation(run) for run in runs]))
    inward = build_inward_fixtures()
    inward_observations = []
    for fixture in inward:
        runs = [analyze_inward(fixture, precision) for precision in (110, 160)]
        if any(not run['accepted'] for run in runs):
            raise ArithmeticError('Inward seam witness failed: '+fixture['name'])
        inward_observations.append(dict(name=fixture['name'], runs=[_json_observation(run) for run in runs]))
    root = Path(__file__).resolve().parents[2]
    sources = ['packages/reference/fixtures_slack_segments.py', 'packages/reference/tests/test_slack_certificate.py', 'packages/reference/orbital.py']
    source_rows = [dict(path=path, sha256=hashlib.sha256((root/path).read_bytes()).hexdigest()) for path in sources]
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    result = {
        'schema_version': 1, 'claim_id': 'fixed-partition-explicit-tick-segments-2026-09-08',
        'repository': dict(commit=commit, dirty=bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True))),
        'command': 'python packages/reference/fixtures_slack_segments.py',
        'environment': dict(software=[platform.python_version(), 'mpmath '+mpmath.__version__], hardware=platform.platform()),
        'mathematics': dict(assertion_tested='Named fixed-partition segment outcomes from explicit per-tick reconstruction at finite analytic critical points',
                            coefficient_domain='Exact integer/rational classification and mpmath 110/160-digit radicals',
                            conventions='MATH-7 reconstruction; canonical fixed partitions and explicit one-sided equality witnesses; no Solidity API imported',
                            inputs=source_rows, bounds=dict(fixed_partition_fixtures=len(fixtures), inward_seam_fixtures=len(inward), dimensions=[2,3,4], precisions=[110,160], scale=str(SCALE)),
                            non_claims=['Universal numerical certification', 'Dense-sample path proof', 'Reachable raw-token histories', 'Automated execution of every fixture against Solidity', 'Economic ownership policy for seam reconstruction changes']),
        'randomness': dict(used=False, generator='', seed=None),
        'run': dict(started_at=start, runtime_seconds=time.perf_counter()-clock, exit_status=0),
        'outputs': [],
        'checks': ['Integer input construction stable at 110/160 digits', 'Expected fixture outcomes at both precisions', 'Per-tick sphere/cap/principal/price checks at endpoints and exact analytic critical points', 'Both one-sided per-tick reconstructions at exact fractional seams'],
        'result': 'Named outcomes reproduced at both precisions; numerical per-tick evidence depends on the separately proved finite critical-point theorem',
        'residual_risks': ['High-precision tolerance is not directed interval arithmetic', 'Finite fixtures do not prove universal integer liveness', 'Solidity comparison is through corresponding named unit fixtures, not an automatic RPC harness'],
        'fixtures': [portable(fixture) for fixture in fixtures], 'observations': observations,
        'inward_fixtures': [portable(fixture) for fixture in inward], 'inward_observations': inward_observations,
    }
    destination = root/'test/evidence/slack-segment-differential.json'
    destination.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(fixed_partition_fixtures=len(fixtures), accepted=sum(f['expected']=='accepted' for f in fixtures),
                          rejected=sum(f['expected']=='rejected' for f in fixtures), inward_seam_fixtures=len(inward), output=str(destination))))


if __name__ == '__main__':
    main()
