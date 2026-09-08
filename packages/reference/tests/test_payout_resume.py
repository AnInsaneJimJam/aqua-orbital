import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_payout_resume import corpus, integer_examples

G = 2**32
U = 2**64


class PayoutResumeTests(unittest.TestCase):
    def row(self):
        return corpus(110)['fallback']

    def test_all_integer_witnesses_are_stable_at_110_and_160_digits(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_fallback_input_and_exact_payout_roots_match_independent_goldens(self):
        row = self.row()
        self.assertEqual(row['decimals'], [18, 17])
        self.assertEqual(row['raw_net_input'], '125744046821095790489')
        self.assertEqual(row['output_raw'], '15284910113323340133')
        self.assertEqual(row['initial']['root_floor_grid'], '2727661870432494227584340053151140775347369778220')
        self.assertEqual(row['final']['root_floor_grid'], '774948463256958748921205633758743101811279660918')
        self.assertEqual(row['shortfall_ceil'], '149862797252778292187')

    def test_exact_raw_input_is_second_unit_after_outward_event(self):
        row = self.row()
        event = row['transitions'][-1]
        lower, upper = int(event['input_floor_grid']), int(event['input_ceil_grid'])
        quantum = U*G
        ceil_from_lower = (lower+quantum-1)//quantum
        ceil_from_upper = (upper+quantum-1)//quantum
        self.assertEqual(ceil_from_lower, ceil_from_upper)
        self.assertEqual(int(row['raw_net_input']), ceil_from_upper+1)
        self.assertLess(upper, int(row['net_input_internal'])*G)
        self.assertLess(int(event['output_ceil_grid']), int(row['final']['output_floor_grid']))
        self.assertLess(int(row['final']['output_ceil_grid'])-int(event['output_floor_grid']), U*G)

    def test_initial_release_and_frontier_have_one_original_frame(self):
        row = self.row()
        self.assertEqual(row['prefix_walk'], [1, 0, 1])
        self.assertEqual(row['actual_final_prefix'], row['final_ideal_prefix'])
        release, outward = row['transitions']
        self.assertEqual([release['direction'], outward['direction']], ['inward', 'outward'])
        self.assertTrue(release['initial_release'])
        self.assertFalse(outward['initial_release'])
        self.assertEqual(release['key'], outward['key'])
        self.assertEqual(release['input_floor_grid'], '0')
        self.assertLess(int(release['output_ceil_grid']), int(row['initial']['output_floor_grid']))
        self.assertLess(int(row['initial']['output_ceil_grid']), int(outward['output_floor_grid']))

    def test_one_final_raw_floor_has_primal_dual_and_length_slack_checks(self):
        row = self.row()
        quantum = 10*U
        start, actual = list(map(int, row['start'])), list(map(int, row['actual_endpoint']))
        self.assertEqual(int(row['output_quantum']), quantum)
        self.assertEqual(actual[0], start[0]+int(row['raw_net_input'])*U)
        self.assertEqual(actual[1], start[1]-int(row['output_raw'])*quantum)
        self.assertGreaterEqual(int(row['shortfall_floor_grid']), 0)
        self.assertLess(int(row['shortfall_ceil_grid']), quantum*G)
        self.assertLessEqual(int(row['radial_slack_ceil']), int(row['shortfall_ceil']))
        self.assertGreater(int(row['next_raw_dual_deficit_floor_grid']), 0)
        self.assertEqual(row['path_checks'], {'support_points_checked': 18, 'release_points_checked': 18,
                                              'retention_points_checked': 9, 'all_primal_dual_checks_passed': True})

    def test_old_seed_deferral_remains_feasible_without_claiming_solver_liveness(self):
        row = corpus(110)['seed_deferral']
        self.assertEqual(row['raw_net_input'], '381100078699772177738')
        self.assertEqual(row['output_raw'], '399184686675480708007')
        self.assertEqual(row['prefix_walk'], [1, 0, 1])
        self.assertEqual(row['actual_final_prefix'], 1)
        self.assertTrue(row['path_checks']['all_primal_dual_checks_passed'])
        self.assertEqual(corpus(110)['production_status_scope'], 'Solidity tests establish fallback behavior; this oracle establishes geometry only')

    def test_solidity_fallback_literals_bind_this_exact_reference_case(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/FrontierComposition.t.sol').read_text()
        body = source.split('function testFallbackAfterOutwardEventSucceedsWithOneSharedLedger()', 1)[1].split('\n    function ', 1)[0]
        row = self.row()
        self.assertIn('pair(true)', body)
        self.assertRegex(body, r'd\[1\]\s*=\s*17')
        self.assertEqual(re.search(r'uint256 raw=([0-9]+);', body).group(1), row['raw_net_input'])
        self.assertEqual(re.search(r'assertEq\(r.endpoint.amountOutRaw,([0-9]+)\)', body).group(1), row['output_raw'])
        self.assertEqual(re.search(r'uint256 rootFloor=([0-9]+);', body).group(1), row['final']['root_floor_grid'])
        self.assertEqual(re.search(r'assertGe\(r.endpoint.shortfallUpper,([0-9]+)\)', body).group(1), row['shortfall_ceil'])
        self.assertIn('assertTrue(r.resumeAttempted)', body)

    def test_recovered_seed_solidity_literals_bind_the_retained_independent_geometry(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/SeedProposal.t.sol').read_text()
        row = corpus(110)['seed_deferral']
        self.assertEqual(re.search(r'constant RAW=([0-9]+);', source).group(1), row['raw_net_input'])
        self.assertEqual(re.search(r'x\[0\]=([0-9]+);', source).group(1), row['start'][0])
        self.assertEqual(re.search(r'x\[1\]=([0-9]+);', source).group(1), row['start'][1])
        self.assertIn('uint64(5*GRID/8)', source)
        body = source.split('function endpoint(E.Result memory r)', 1)[1].split('\n    function ', 1)[0]
        self.assertEqual(re.search(r'assertEq\(r.amountOutRaw,([0-9]+)\)', body).group(1), row['output_raw'])
        self.assertEqual(re.search(r'uint256 floor=([0-9]+);', body).group(1), row['final']['root_floor_grid'])
        self.assertEqual(re.search(r'assertGe\(r.shortfallUpper,([0-9]+)\)', body).group(1), row['shortfall_ceil'])
        self.assertIn('testOldHighIsStrictlyBelowSheetBeforeAnyRootIteration', source)
        self.assertIn('F.Status.FrontierPathCertified', source)

    def test_integer_bound_rejects_false_width_and_preserves_closed_boundary(self):
        examples = {row['id']: row for row in integer_examples()}
        for row in examples.values():
            lo, hi, origin, quantum = [row[key] for key in ('lo', 'hi', 'origin', 'quantum')]
            self.assertLessEqual(lo, hi)
            self.assertLessEqual(hi, origin)
            raw = (origin-hi)//quantum
            retained = origin-raw*quantum
            self.assertEqual(raw > 0 and retained-lo <= quantum, row['payout_bounded'])
        false_width = examples['width_is_not_total_shortfall']
        self.assertLess(false_width['hi']-false_width['lo'], false_width['quantum'])
        self.assertFalse(false_width['payout_bounded'])
        for name in ('width_is_not_total_shortfall', 'total_shortfall_bounded'):
            # Exact sphere equation certifies the root enclosure without sqrt.
            row = examples[name]
            self.assertGreaterEqual((80-row['lo'])**2, 34*64)
            self.assertLessEqual((80-row['hi'])**2, 34*64)
        boundary = examples['exact_one_quantum_retention']
        raw = (boundary['origin']-boundary['hi'])//boundary['quantum']
        self.assertEqual(boundary['origin']-raw*boundary['quantum']-boundary['exact_root'], boundary['quantum'])
        self.assertEqual((boundary['origin']-boundary['exact_root'])//boundary['quantum'], raw+1)

    def test_geometric_scope_json_and_mutation_isolation(self):
        data = corpus(110)
        self.assertEqual(data, json.loads(json.dumps(data)))
        for name in ('fallback', 'seed_deferral'):
            self.assertFalse(data[name]['reachable_raw_history_verified'])
        data['fallback']['start'][0] = '0'
        self.assertNotEqual(data, corpus(110))

    def test_invalid_precision_rejected(self):
        for dps in (79, 110.0, '110', True):
            with self.assertRaises(ValueError):
                corpus(dps)


if __name__ == '__main__':
    unittest.main()
