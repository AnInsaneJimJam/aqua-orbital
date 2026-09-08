"""Independent explicit-tick checks; finite critical points, not dense sampling."""
import sys
import unittest
from fractions import Fraction
from pathlib import Path
from mpmath import mp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_slack_segments import (build_fixtures, analyze, exact_moments, explicit_state,
                                     portable, build_inward_fixtures, analyze_inward)


class SlackCertificateReferenceTests(unittest.TestCase):
    def fixture(self, name):
        return next(row for row in build_fixtures(160) if row['name'] == name)

    def test_integer_inputs_stable_at_110_and_160_digits(self):
        self.assertEqual(build_fixtures(110), build_fixtures(160))

    def test_named_results_and_endpoint_validity(self):
        fixtures = build_fixtures(160)
        self.assertEqual(len(fixtures), 12)
        for precision in (110, 160):
            for fixture in fixtures:
                with self.subTest(name=fixture['name'], precision=precision):
                    result = analyze(fixture, precision)
                    self.assertEqual(result['accepted'], fixture['expected'] == 'accepted')
                    self.assertFalse(result['points']['start']['violations'])
                    self.assertFalse(result['points']['end']['violations'])
                    if fixture.get('failure'):
                        self.assertIn(fixture['failure'], result['failures'])

    def test_variance_minimum_is_not_a_pair_equality(self):
        fixture = self.fixture('variance_hole')
        moments = exact_moments(fixture)
        untouched = [x for i, x in enumerate(fixture['start']) if i != fixture['output']]
        self.assertTrue(all(moments['mean'] != x for x in untouched))
        for precision in (110, 160):
            at_pair_equality = explicit_state(fixture, Fraction(max(untouched)), precision)
            self.assertFalse(at_pair_equality['violations'])
            result = analyze(fixture, precision)
            self.assertIn('branch', result['points']['variance_minimum']['violations'])
            self.assertLess(result['points']['variance_minimum']['metrics']['branch_gap'], 0)
        self.assertTrue(analyze(self.fixture('variance_safe_prefix'), 160)['accepted'])

    def test_hidden_boundary_maximum_has_its_own_failure(self):
        for name in ('boundary_peak_straddles_mean', 'boundary_peak_below_mean'):
            fixture = self.fixture(name)
            for precision in (110, 160):
                point = analyze(fixture, precision)['points']['boundary_maximum']
                self.assertEqual(point['violations'], ['boundary_price'])
                self.assertGreater(point['metrics']['branch_gap'], 0)
                self.assertLess(point['metrics']['boundary_price_gap'], 0)
        fixture = self.fixture('boundary_peak_below_mean')
        moments = exact_moments(fixture)
        self.assertLess(fixture['start'][fixture['output']], moments['mean'])
        self.assertLess(fixture['end_output'], moments['mean'])

    def test_two_asset_degeneracy_and_canonical_equality(self):
        fixture = self.fixture('two_asset_boundary_equality')
        moments = exact_moments(fixture)
        self.assertEqual((moments['D'], moments['H']), (0, 0))
        self.assertIsNone(moments['critical'])
        result = analyze(fixture, 160)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['points']['end']['partition'], [0])
        across = analyze(self.fixture('two_asset_partition_change'), 160)
        self.assertFalse(across['accepted'])
        self.assertEqual(across['points']['end']['partition'], [])
        self.assertEqual(across['failures'], ['partition_change'])

    def test_exact_near_critical_inclusion_without_rounding(self):
        cases = {
            'critical_at_lower_endpoint': 'at_lower',
            'critical_at_upper_endpoint': 'at_upper',
            'critical_one_unit_below_interval': 'below',
            'critical_one_unit_above_interval': 'above',
        }
        for name, expected in cases.items():
            fixture = self.fixture(name)
            moments = exact_moments(fixture)
            critical = moments['critical']
            self.assertEqual(moments['critical_position'], expected)
            self.assertTrue(analyze(fixture, 160)['accepted'])
            if expected == 'at_lower': self.assertEqual(critical, fixture['end_output'])
            if expected == 'at_upper': self.assertEqual(critical, fixture['start'][fixture['output']])
            if expected == 'below': self.assertEqual(fixture['end_output'] - critical, 1)
            if expected == 'above': self.assertEqual(critical - fixture['start'][fixture['output']], 1)

    def test_precision_stable_explicit_baskets_and_checks(self):
        for fixture in build_fixtures(160):
            low, high = analyze(fixture, 110), analyze(fixture, 160)
            self.assertEqual(low['failures'], high['failures'])
            self.assertEqual(low['points'].keys(), high['points'].keys())
            with mp.workdps(170):
                for name in low['points']:
                    left, right = low['points'][name], high['points'][name]
                    self.assertEqual(left['violations'], right['violations'])
                    self.assertEqual(left['partition'], right['partition'])
                    for metric, value in left['metrics'].items():
                        other = right['metrics'][metric]
                        if value is not None:
                            self.assertLess(abs(value - other), mp.mpf('1e-65'), (fixture['name'], name, metric))
                    for row_left, row_right in zip(left['baskets'], right['baskets']):
                        for a, b in zip(row_left, row_right):
                            self.assertLess(abs(a-b), mp.mpf('1e-65'))

    def test_integer_moment_variance_identity_at_named_points(self):
        for fixture in build_fixtures(160):
            moments = exact_moments(fixture)
            n, m = len(fixture['start']), len(fixture['start'])-1
            for point in analyze(fixture, 160)['points'].values():
                z = point['output_coordinate']
                x = list(map(Fraction, fixture['start'])); x[fixture['output']] = z
                mean = sum(x)/n
                variance = sum((a-mean)**2 for a in x)
                T = m*z-moments['C']
                self.assertEqual(variance, Fraction(n*moments['H']+T*T, m*n))

    def test_portable_integer_fixtures_and_known_witness(self):
        fixture = self.fixture('mixed_boundary_release')
        values = portable(fixture)
        self.assertEqual(values['start'][0], '17244669164959010447296955565943832839392')
        self.assertEqual(values['start'][1], '10891143583162567711396362223261049950605')
        self.assertEqual(values['start'][2], '2419752807433977396862237766350672765557')
        for fixture in build_fixtures(160):
            self.assertTrue(all(0 <= x < 2**160 for x in fixture['start']))
            self.assertLess(sum(t['radius'] for t in fixture['ticks']), 2**160)

    def test_three_asset_inward_seams_have_two_valid_reconstructions(self):
        fixtures = build_inward_fixtures()
        self.assertEqual(len(fixtures), 2)
        for fixture in fixtures:
            for precision in (110, 160):
                result = analyze_inward(fixture, precision)
                self.assertTrue(result['accepted'])
                self.assertEqual([segment['boundary_count'] for segment in result['segments']],
                                 list(range(len(fixture['ticks'])-1, -1, -1)))
                self.assertTrue(any(seam.denominator != 1 for seam in result['seams']))
                for segment in result['segments']:
                    for point in segment['points'].values():
                        self.assertFalse(point['violations'])
                # At a seam the aggregate matches on each side, although the
                # individual slack-state reconstructions need not coincide.
                for left, right in zip(result['segments'], result['segments'][1:]):
                    self.assertEqual(left['points']['end']['output_coordinate'],
                                     right['points']['start']['output_coordinate'])
                    self.assertNotEqual(left['points']['end']['baskets'],
                                        right['points']['start']['baskets'])

    def test_three_asset_inward_seam_precision_stability(self):
        for fixture in build_inward_fixtures():
            low, high = analyze_inward(fixture, 110), analyze_inward(fixture, 160)
            self.assertEqual(low['seams'], high['seams'])
            with mp.workdps(170):
                for left, right in zip(low['segments'], high['segments']):
                    self.assertEqual(left['points'].keys(), right['points'].keys())
                    for name in left['points']:
                        a, b = left['points'][name], right['points'][name]
                        self.assertEqual(a['violations'], b['violations'])
                        for metric, value in a['metrics'].items():
                            if value is not None:
                                self.assertLess(abs(value-b['metrics'][metric]), mp.mpf('1e-65'))


if __name__ == '__main__':
    unittest.main()
