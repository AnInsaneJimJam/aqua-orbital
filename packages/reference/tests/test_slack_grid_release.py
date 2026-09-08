"""Finite exact seam and explicit-basket checks; no production solver oracle."""
import sys
import unittest
from fractions import Fraction
from pathlib import Path
from mpmath import mp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_slack_grid_release import corpus


class SlackGridReleaseReferenceTests(unittest.TestCase):
    def test_named_outcomes_and_selected_final_partitions(self):
        for precision in (110, 160):
            rows = corpus(precision)
            self.assertEqual(len(rows), 13)
            for row in rows:
                with self.subTest(precision=precision, name=row['name']):
                    self.assertEqual(row['accepted'], row['expected'])
                    self.assertEqual(row['crossings'], row['start_count']-row['end_count'])
                    self.assertLessEqual(row['crossings'], 7)
                    self.assertFalse(row['segments'][0]['points']['start']['violations'])
                    self.assertFalse(row['segments'][-1]['points']['end']['violations'])

    def test_zero_distance_departures_are_distinct_and_counted_once(self):
        rows = {row['name']: row for row in corpus(160)}
        for name, expected in [('final_seam_boundary', [1]), ('final_seam_interior', [1, 0]),
                               ('start_and_final_departures', [2, 1, 0]),
                               ('canonical_final_seam', [2, 1])]:
            row = rows[name]
            self.assertEqual([s['boundary_count'] for s in row['segments']], expected)
            self.assertEqual(row['crossings'], len(expected)-1)
        both = rows['start_and_final_departures']['segments']
        self.assertEqual(both[0]['high'], both[0]['low'])
        self.assertEqual(both[-1]['high'], both[-1]['low'])
        self.assertNotEqual(both[0]['points']['end']['baskets'], both[1]['points']['start']['baskets'])

    def test_fractional_seam_cannot_be_floored_into_another_partition(self):
        rows = {row['name']: row for row in corpus(160)}
        row = rows['above_fractional_seam']
        seam = rows['final_seam_boundary']['end']
        self.assertNotEqual(seam.denominator, 1)
        self.assertEqual(row['end']-seam, Fraction(1, 2**32))
        self.assertLess(row['end'].numerator//row['end'].denominator, seam)
        self.assertEqual(row['end_count'], 1)
        self.assertEqual(rows['seven_fractional_seams']['crossings'], 7)

    def test_hidden_holes_remain_at_analytic_points(self):
        rows = {row['name']: row for row in corpus(160)}
        variance = rows['variance_hole']['segments'][0]['points']['variance_minimum']
        boundary = rows['boundary_price_maximum']['segments'][0]['points']['boundary_maximum']
        self.assertIn('branch', variance['violations'])
        self.assertEqual(boundary['violations'], ['boundary_price'])
        self.assertNotEqual(variance['output_coordinate'], rows['variance_hole']['maximum_untouched'])

    def test_110_160_stable_rational_coordinates_and_baskets(self):
        left, right = corpus(110), corpus(160)
        with mp.workdps(170):
            for a, b in zip(left, right):
                for key in ('name', 'start', 'end', 'start_count', 'end_count', 'crossings', 'accepted'):
                    self.assertEqual(a[key], b[key])
                for x, y in zip(a['segments'], b['segments']):
                    self.assertEqual((x['high'], x['low']), (y['high'], y['low']))
                    self.assertEqual(x['points'].keys(), y['points'].keys())
                    for label in x['points']:
                        xp, yp = x['points'][label], y['points'][label]
                        self.assertEqual(xp['violations'], yp['violations'])
                        self.assertEqual(xp['partition'], yp['partition'])
                        for metric, value in xp['metrics'].items():
                            if value is not None:
                                self.assertLess(abs(value-yp['metrics'][metric]), mp.mpf('1e-65'))
                        for xr, yr in zip(xp['baskets'], yp['baskets']):
                            for xv, yv in zip(xr, yr):
                                self.assertLess(abs(xv-yv), mp.mpf('1e-65'))


if __name__ == '__main__':
    unittest.main()
