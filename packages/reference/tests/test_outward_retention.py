import sys
import re
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_outward_retention import corpus


class OutwardRetentionTests(unittest.TestCase):
    def test_existing_exact_seam_arrival_has_one_retention_crossing(self):
        case = corpus()['cases'][0]
        self.assertEqual(case['witness']['output_raw'], '18669858')
        self.assertEqual(case['witness']['final_ideal_prefix'], 0)
        self.assertEqual(case['witness']['actual_final_prefix'], 1)
        self.assertEqual([s['key_index'] for s in case['seams']], [0])
        self.assertTrue(case['ends_at_seam'])

    def test_seven_retention_seams_share_one_raw_unit_budget(self):
        case = corpus()['cases'][1]
        w = case['witness']
        self.assertEqual(w['dimension'], 3)
        self.assertEqual(len(w['radii']), 8)
        self.assertEqual(w['decimals'], [6, 6, 0])
        self.assertEqual(w['output_raw'], '18')
        self.assertEqual([w['final_ideal_prefix'], w['actual_final_prefix']], [0, 7])
        self.assertEqual([s['key_index'] for s in case['seams']], list(range(7)))
        self.assertLessEqual(int(w['radial_slack_ceil']), int(w['shortfall_ceil']))
        self.assertLessEqual(int(w['shortfall_ceil']), int(w['output_quantum']))

    def test_every_one_sided_basket_and_each_retention_segment_is_checked(self):
        for case in corpus()['cases']:
            self.assertEqual(case['two_sided_seam_checks'], 2 * len(case['seams']))
            self.assertEqual(case['segment_points_checked'], 9 * (len(case['seams']) + 1))
            self.assertTrue(case['within_prefix_slack_length_bounds'])
            self.assertTrue(all(s['slack_nonincreasing'] for s in case['seams']))
            self.assertFalse(case['witness']['reachable_raw_history_verified'])

    def test_precision_stable_integer_witnesses(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_price_hole_counterexample_remains_infeasible(self):
        self.assertTrue(corpus()['retained_price_hole_rejected'])

    def test_solidity_retention_literals_match_independent_basket_oracle(self):
        source = (Path(__file__).resolve().parents[2] /
                  'contracts/test/OutwardRetention.t.sol').read_text()
        for label, case in zip(['ONE', 'SEVEN'], corpus()['cases']):
            witness = case['witness']
            values = {'ROOT': witness['final']['root_floor_grid'],
                      'SHORTFALL': witness['shortfall_ceil'],
                      'SLACK': witness['radial_slack_ceil']}
            for suffix, expected in values.items():
                name = label + '_' + suffix
                literal = re.search(r'\b' + name + r'=(\d+);', source)
                self.assertIsNotNone(literal, name)
                self.assertEqual(literal.group(1), expected, name)


if __name__ == '__main__':
    unittest.main()
