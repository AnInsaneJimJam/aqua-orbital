import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_reachable_traversal import corpus


class ReachableTraversalTests(unittest.TestCase):
    def test_initialized_history_is_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_first_swap_crosses_outward_and_reverse_swap_crosses_both_ways(self):
        first, second = corpus(110)['swaps']
        self.assertEqual(first['witness']['prefix_walk'], [0, 1])
        self.assertEqual(second['witness']['prefix_walk'], [1, 0, 1])
        self.assertEqual([e['direction'] for e in second['witness']['transitions']], ['inward', 'outward'])
        self.assertEqual(first['witness']['output_raw'], '164721797')
        self.assertEqual(second['witness']['output_raw'], '513016094')

    def test_second_start_uses_actual_first_payment_and_separate_fee_inventory(self):
        data = corpus(110)
        first, second = data['swaps']
        self.assertEqual(first['witness']['start'], data['initial']['directed_reserves'])
        self.assertEqual(second['witness']['start'], first['witness']['actual_endpoint'])
        self.assertEqual(first['fee_raw'], '175000')
        self.assertEqual(second['fee_raw'], '250000')
        for row in data['swaps']:
            witness = row['witness']
            self.assertEqual(int(row['gross_input_raw'])-int(row['fee_raw']), int(witness['raw_net_input']))
            self.assertEqual(row['cumulative_fees_raw'][1], '0')
        self.assertEqual(second['cumulative_fees_raw'], ['175000', '0', '250000'])

    def test_each_payment_has_per_tick_path_checks_and_next_raw_support_exclusion(self):
        for row in corpus(110)['swaps']:
            w = row['witness']
            self.assertGreaterEqual(w['path_checks']['support_points_checked'], 18)
            self.assertTrue(w['path_checks']['all_primal_dual_checks_passed'])
            self.assertGreater(int(w['next_raw_dual_deficit_floor_grid']), 0)
            self.assertLess(int(w['shortfall_ceil_grid']), int(w['output_quantum'])*(1 << 32))


if __name__ == '__main__':
    unittest.main()
