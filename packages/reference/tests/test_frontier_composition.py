import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_frontier_composition import corpus

GRID = 2**32
U = 2**64


class FrontierCompositionTests(unittest.TestCase):
    def cases(self, precision=110):
        return {item['id']: item for item in corpus(precision)['cases']}

    def test_all_integer_witnesses_are_stable_at_110_and_160_digits(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_ordinary_mixed_dimensions_retain_the_independent_endpoint_goldens(self):
        rows = self.cases()
        for n, expected in [(2, 4126770776962595252), (3, 333207013780241401),
                            (8, 499288825743866812)]:
            item = rows[f'n{n}_mixed_no_crossing']
            self.assertEqual(int(item['output_raw']), expected)
            self.assertGreater(item['initial_ideal_prefix'], 0)
            self.assertEqual(item['initial_ideal_prefix'], item['final_ideal_prefix'])
            self.assertEqual(item['transitions'], [])

    def test_two_root_traversal_uses_original_actual_frame_and_raw_lift(self):
        item = self.cases()['n2_two_roots']
        self.assertEqual(int(item['net_input_internal']), (8*10**40//10//U)*U)
        self.assertEqual(item['prefix_walk'], [1, 0, 1])
        self.assertEqual([x['direction'] for x in item['transitions']], ['inward', 'outward'])
        self.assertEqual([int(x['input_floor_grid']) for x in item['transitions']], [
            1785320583495630165674573230691291655457572108493,
            30193858969424478990258992973288832930589074016050])
        self.assertEqual([int(x['output_floor_grid']) for x in item['transitions']], [
            3218130843201826607943555981180276194095320250573,
            31626669229130675432527975723777817469226822158130])

    def test_single_and_four_crossing_sequences_are_preserved(self):
        rows = self.cases()
        self.assertEqual(rows['n2_one_root']['prefix_walk'], [1, 0])
        self.assertEqual(rows['n2_four_roots']['prefix_walk'], [2, 1, 0, 1, 2])
        self.assertEqual([x['key_index'] for x in rows['n2_four_roots']['transitions']], [1, 0, 0, 1])

    def test_initial_release_crossing_precedes_the_frontier_in_the_same_frame(self):
        item = self.cases()['n2_initial_release']
        self.assertEqual(item['actual_initial_prefix'], 1)
        self.assertEqual(item['initial_ideal_prefix'], 0)
        self.assertEqual(item['prefix_walk'], [1, 0, 1])
        release, frontier = item['transitions']
        self.assertTrue(release['initial_release'])
        self.assertFalse(frontier['initial_release'])
        self.assertEqual(release['key_index'], frontier['key_index'])
        self.assertEqual(release['input_floor_grid'], '0')
        self.assertLess(int(release['output_ceil_grid']), int(item['initial']['output_floor_grid']))
        self.assertLess(int(item['initial']['output_ceil_grid']), int(frontier['output_floor_grid']))

    def test_one_final_output_floor_has_independent_primal_and_dual_checks(self):
        for item in self.cases().values():
            q = int(item['output_quantum'])
            self.assertGreater(int(item['output_raw']), 0)
            self.assertGreaterEqual(int(item['shortfall_floor_grid']), 0)
            self.assertLess(int(item['shortfall_ceil_grid']), q*GRID)
            self.assertLessEqual(int(item['radial_slack_ceil']), int(item['shortfall_ceil']))
            self.assertGreater(int(item['next_raw_dual_deficit_floor_grid']), 0)
            initial = list(map(int, item['start']))
            final = list(map(int, item['actual_endpoint']))
            self.assertEqual(final[item['input']], initial[item['input']]+int(item['net_input_internal']))
            self.assertEqual(final[item['output']], initial[item['output']]-int(item['output_raw'])*q)
            for i in range(item['dimension']):
                if i not in [item['input'], item['output']]:
                    self.assertEqual(final[i], initial[i])

    def test_mixed_six_eighteen_decimals_changes_only_the_final_financial_floor(self):
        rows = self.cases()
        a, b = rows['n3_mixed_no_crossing'], rows['n3_mixed_decimals']
        self.assertEqual(b['decimals'], [6, 6, 18])
        self.assertEqual(int(b['output_raw']), 333207)
        self.assertEqual(int(b['output_quantum']), 10**12*U)
        self.assertEqual(a['initial'], b['initial'])
        self.assertEqual(a['final'], b['final'])
        self.assertEqual(a['net_input_internal'], b['net_input_internal'])

    def test_n3_mixed_turn_has_no_physical_lower_key_solution(self):
        item = self.cases()['n3_mixed_turn']
        self.assertEqual(item['prefix_walk'], [1])
        self.assertLess(int(item['initial']['direction_ceil_grid']), 0)
        self.assertGreater(int(item['final']['direction_floor_grid']), 0)
        self.assertEqual(item['key_checks'][0]['status'], 'no_real_normal')
        self.assertGreater(int(item['key_checks'][0]['minimum_norm_squared_floor_1e30']), 10**30)

    def test_explicit_support_and_release_samples_check_each_join(self):
        for item in self.cases().values():
            self.assertGreaterEqual(item['path_checks']['support_points_checked'], 9)
            self.assertGreaterEqual(item['path_checks']['release_points_checked'], 9)
            self.assertTrue(item['path_checks']['all_primal_dual_checks_passed'])
            frontier = [x for x in item['transitions'] if not x['initial_release']]
            points = [item['initial']]+frontier+[item['final']]
            for left, right in zip(points, points[1:]):
                self.assertLess(int(left['input_ceil_grid']), int(right['input_floor_grid']))
                self.assertLess(int(left['output_ceil_grid']), int(right['output_floor_grid']))

    def test_geometric_states_do_not_claim_reachable_token_histories(self):
        for item in self.cases().values():
            self.assertEqual(item['scope'], 'geometric actual state; raw-token history not established')
            self.assertFalse(item['reachable_raw_history_verified'])

    def test_failure_corpus_preserves_specific_math_and_protocol_obligations(self):
        rows = {x['id']: x for x in corpus(110)['failures']}
        self.assertEqual(rows['n3_rounding_repartition']['ideal_prefix'], 0)
        self.assertEqual(rows['n3_rounding_repartition']['actual_prefix'], 1)
        self.assertEqual(rows['n3_rounding_repartition']['previous_production_expectation'], 'RequiresRepartition')
        self.assertEqual(rows['n3_rounding_repartition']['production_expectation'], 'FrontierPathCertified')
        self.assertTrue(rows['n7_exact_initial_touch']['exact_rational_witness_verified'])
        self.assertEqual(rows['n7_exact_initial_touch']['input_floor_grid'], '0')
        self.assertTrue(rows['n3_nonphysical_branch']['positive_output_normal_violated'])
        self.assertEqual(rows['n3_nonphysical_branch']['previous_production_expectation'], 'Uncertain')
        self.assertEqual(rows['n3_nonphysical_branch']['production_expectation'], 'FrontierPathCertified')
        self.assertEqual(rows['n3_nonphysical_branch']['violation_scope'], 'algebraic key branch, not the entire trade')
        self.assertEqual(rows['n2_insufficient_crossing_allowance']['required'], 2)
        self.assertEqual(rows['n2_hidden_turn']['required_frontier_events'], 2)
        self.assertTrue(rows['invalid_zero_start']['explicit_primal_rejection'])

    def test_zero_output_normal_and_coarse_initial_order_are_feasible_deferrals(self):
        rows = {x['id']: x for x in corpus(110)['failures']}
        zero = rows['n2_initial_zero_output_normal']
        self.assertTrue(zero['positive_one_sided_path_verified'])
        self.assertEqual(zero['positive_one_sided_support_points_checked'], 8)
        self.assertEqual(zero['initial_output_normal'], '0')
        self.assertGreater(int(zero['output_raw']), 0)
        coarse = rows['n2_coarse_initial_order']
        self.assertEqual(coarse['production_expectation'], 'Uncertain')
        self.assertGreater(int(coarse['witness']['output_raw']), 0)
        self.assertEqual(coarse['witness']['prefix_walk'], [1, 0])

    def test_corpus_is_json_round_trip_safe_and_cache_cannot_be_mutated(self):
        value = corpus(110)
        self.assertEqual(value, json.loads(json.dumps(value)))
        value['cases'][0]['start'][0] = '0'
        self.assertNotEqual(value, corpus(110))

    def test_solidity_golden_bindings_and_saved_fixture_match_the_independent_corpus(self):
        base = Path(__file__).resolve().parents[1]
        fixtures = corpus(160)
        self.assertEqual(json.loads((base/'fixtures/frontier-composition.json').read_text()), fixtures)
        source = (base.parent/'contracts/test/FrontierComposition.t.sol').read_text()
        values = {
            'oracleOutputs': [item['output_raw'] for item in fixtures['cases']],
            'oracleInitialFloors': [item['initial']['root_floor_grid'] for item in fixtures['cases']],
            'oracleFinalFloors': [item['final']['root_floor_grid'] for item in fixtures['cases']],
            'oracleShortfalls': [item['shortfall_ceil'] for item in fixtures['cases']],
        }
        for name, expected in values.items():
            match = re.search(name+r'=\[([^]]+)\];', source)
            self.assertIsNotNone(match, name)
            actual = re.findall(r'[0-9]+', match.group(1).replace('uint256(', ''))
            self.assertEqual(actual, expected, name)

    def test_invalid_precision_rejected(self):
        for dps in [79, 110.0, '110', True]:
            with self.assertRaises(ValueError):
                corpus(dps)


if __name__ == '__main__':
    unittest.main()
