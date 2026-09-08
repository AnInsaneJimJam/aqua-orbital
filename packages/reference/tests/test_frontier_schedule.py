import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_frontier_schedule import corpus


class FrontierScheduleTests(unittest.TestCase):
    def test_independent_price_space_events_are_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_authenticated_two_root_goldens_match_explicit_baskets(self):
        row = corpus(110)['cases'][0]
        self.assertEqual(row['id'], 'n2_two_crossings')
        self.assertEqual([e['direction'] for e in row['events']], ['inward', 'outward'])
        self.assertEqual([int(e['input_floor_grid']) for e in row['events']], [
            1785320583495630165674573230691291655457572108493,
            30193858969424478990258992973288832930589074016050])
        self.assertEqual([int(e['output_floor_grid']) for e in row['events']], [
            3218130843201826607943555981180276194095320250573,
            31626669229130675432527975723777817469226822158130])
        source = (Path(__file__).resolve().parents[2]/'contracts/test/FrontierEvents.t.sol').read_text()
        literals = re.findall(r'encloses\(roots\.candidates\[[01]\],([0-9]+),([0-9]+)\);', source)
        self.assertEqual(literals, [(e['input_floor_grid'], e['output_floor_grid']) for e in row['events']])

    def test_input_cuts_and_negative_roots_keep_the_actual_frame(self):
        rows = {row['id']: row for row in corpus(110)['cases']}
        self.assertEqual(len(rows['n2_before_first']['events']), 0)
        self.assertEqual(len(rows['n2_between_roots']['events']), 1)
        self.assertEqual(len(rows['n2_behind_start']['events']), 0)
        for event in rows['n2_behind_start']['all_events']:
            self.assertLess(int(event['input_ceil_grid']), 0)
            self.assertLess(int(event['output_ceil_grid']), 0)

    def test_three_ticks_and_maximum_eight_ticks_retain_every_direction(self):
        rows = {row['id']: row for row in corpus(160)['cases']}
        for name, count in [('n2_three_ticks', 2), ('n2_fourteen_crossings', 7)]:
            row = rows[name]
            self.assertEqual(len(row['events']), count*2)
            self.assertEqual([e['key_index'] for e in row['events']],
                             list(range(count-1, -1, -1))+list(range(count)))
            self.assertEqual(row['prefix_walk'], list(range(count, -1, -1))+list(range(1, count+1)))
            self.assertEqual(row['initial_ideal_prefix'], count)
            self.assertEqual(row['final_ideal_prefix'], count)

    def test_every_selected_event_preserves_strict_input_and_output_order(self):
        for row in corpus(110)['cases']:
            for event in row['events']:
                self.assertTrue(event['explicit_baskets_verified'])
                self.assertEqual(int(event['input_ceil_grid'])-int(event['input_floor_grid']), 1)
                self.assertEqual(int(event['output_ceil_grid'])-int(event['output_floor_grid']), 1)
                self.assertGreater(int(event['input_floor_grid']), 0)
                self.assertLess(int(event['input_ceil_grid']), int(row['net_input_internal'])*2**32)
            for previous, following in zip(row['events'], row['events'][1:]):
                self.assertLess(int(previous['input_ceil_grid']), int(following['input_floor_grid']))
                self.assertLess(int(previous['output_ceil_grid']), int(following['output_floor_grid']))

    def test_in_range_unphysical_fixture_has_independent_price_branch_failure(self):
        row = corpus(160)['unphysical_case']
        self.assertTrue(row['initial_explicit_baskets_feasible'])
        self.assertTrue(row['exact_rational_input_range_checked'])
        self.assertGreater(int(row['input_floor_grid']), 0)
        self.assertLess(int(row['input_ceil_grid']), int(row['net_input_internal'])*2**32)
        self.assertGreater(int(row['output_reserve_floor_grid']), int(row['total_radius'])*2**32)

    def test_invalid_precision_rejected(self):
        for dps in [79, 110.0, '110', True]:
            with self.assertRaises(ValueError):
                corpus(dps)


if __name__ == '__main__':
    unittest.main()
