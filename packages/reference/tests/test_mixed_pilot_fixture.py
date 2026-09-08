"""Cheap checks of the retained corpus; full regeneration has its own 900s runner."""
import json
import re
import sys
import unittest
from pathlib import Path

from mpmath import mp

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_frontier_composition import _actual, _ticks
from fixtures_initializer import FULL, GRID, U
from fixtures_mixed_pilot import specs


class MixedPilotFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT/'packages/reference/fixtures/mixed-pilot.json').read_text())

    def test_all_planned_configurations_and_actions_are_retained_without_oracle_exclusions(self):
        self.assertEqual(self.data['precisions_checked'], [110, 160])
        rows = self.data['configurations']
        self.assertEqual([r['id'] for r in rows], [s[0] for s in specs()])
        self.assertEqual(sum(len(r['actions']) for r in rows), 128)
        for row, spec in zip(rows, specs()):
            _, n, decimals, keys, radii = spec
            self.assertEqual(row['initial']['decimals'], decimals)
            self.assertEqual(row['initial']['keys'], list(map(str, keys)))
            self.assertEqual(row['initial']['radii'], list(map(str, radii)))
            self.assertEqual([a['step'] for a in row['actions']], list(range(4)))
            for action in row['actions']:
                self.assertEqual(action['status'], 'generated')
                self.assertLessEqual(len(action['attempts']), 9)
                self.assertEqual(action['attempts'][-1]['result'], 'primal_dual_witness')
                w = action['witness']
                self.assertEqual(w['dimension'], n)
                self.assertFalse(w['reachable_raw_history_verified'])
                self.assertTrue(w['path_checks']['all_primal_dual_checks_passed'])

    def test_every_action_uses_the_actual_previous_payout_and_exact_token_quantum(self):
        for row in self.data['configurations']:
            start = [int(row['initial']['coordinate'])]*row['initial']['n']
            for action in row['actions']:
                w = action['witness']
                self.assertEqual(list(map(int, w['start'])), start)
                i, j = w['input'], w['output']
                quantum_in = 10**(18-w['decimals'][i])*U
                quantum_out = 10**(18-w['decimals'][j])*U
                self.assertEqual(int(w['net_input_internal']), int(w['raw_net_input'])*quantum_in)
                self.assertEqual(int(w['output_quantum']), quantum_out)
                after = start.copy()
                after[i] += int(w['net_input_internal'])
                after[j] -= int(w['output_raw'])*quantum_out
                self.assertEqual(list(map(int, w['actual_endpoint'])), after)
                self.assertGreater(int(w['shortfall_floor_grid']), 0)
                self.assertLess(int(w['shortfall_ceil_grid']), quantum_out*GRID)
                self.assertGreater(int(w['next_raw_dual_deficit_floor_grid']), 0)
                self.assertLessEqual(int(w['radial_slack_ceil']), int(w['shortfall_ceil']))
                start = after

    def test_actual_endpoints_have_explicit_per_tick_feasible_baskets(self):
        with mp.workdps(110):
            for row in self.data['configurations']:
                for action in row['actions']:
                    w = action['witness']
                    radii = list(map(int, w['radii']))
                    keys = [None if k is None else int(k) for k in w['keys']]
                    ticks = _ticks(radii, keys)
                    point = list(map(int, w['actual_endpoint']))
                    prefix, baskets, slack = _actual(point, radii, keys, ticks)
                    self.assertEqual(prefix, w['actual_final_prefix'])
                    self.assertEqual(len(baskets), len(keys))
                    self.assertLessEqual(int(mp.ceil(slack)), int(w['output_quantum']))

    def test_crossing_walk_keeps_initial_release_frontier_and_retention_distinct(self):
        counts = {'inward': 0, 'outward': 0}
        for row in self.data['configurations']:
            for action in row['actions']:
                w = action['witness']
                count = w['actual_initial_prefix']
                walk = [count]
                last_phase = 0
                for t in w['transitions']:
                    self.assertFalse(t['initial_release'] and t['final_retention'])
                    phase = 0 if t['initial_release'] else 2 if t['final_retention'] else 1
                    self.assertGreaterEqual(phase, last_phase)
                    last_phase = phase
                    index = t['key_index']
                    self.assertEqual(t['key'], w['keys'][index])
                    self.assertEqual(count, index+1 if t['direction'] == 'inward' else index)
                    count += -1 if t['direction'] == 'inward' else 1
                    walk.append(count)
                    counts[t['direction']] += 1
                self.assertEqual(walk, w['prefix_walk'])
                self.assertEqual(count, w['actual_final_prefix'])
                self.assertLessEqual(len(w['transitions']), 16)
        self.assertGreater(counts['inward'], 0)
        self.assertGreater(counts['outward'], 0)

    def test_reversal_regression_literals_match_retained_independent_history(self):
        row = next(r for r in self.data['configurations'] if r['id'] == 'n3-t8-moderate')
        w = row['actions'][2]['witness']
        source = (ROOT/'packages/contracts/test/PilotReversal.t.sol').read_text()
        coordinates = re.findall(r'x\[(\d+)\]=(\d+);', source)
        self.assertEqual(coordinates, [(str(k), value) for k, value in enumerate(w['start'])])
        first, stride = map(int, re.search(r'uint64\((\d+)\+k\*(\d+)\)', source).groups())
        self.assertEqual(list(map(int, row['initial']['keys'])), [first+k*stride for k in range(7)]+[FULL])
        self.assertIn('uint192(1000*(k+1)*1e18*U)', source)
        self.assertEqual(list(map(int, w['radii'])), [1000*(k+1)*10**18*U for k in range(8)])
        decimals = re.findall(r'decimals\[(\d+)\]=(\d+);', source)
        self.assertEqual(decimals, [(str(k), str(value)) for k, value in enumerate(w['decimals'])])
        i, j, raw, budget = map(int, re.search(r'C.certify\(x,ticks,d,(\d+),(\d+),(\d+),(\d+)\)', source).groups())
        self.assertEqual((i, j, raw, budget), (w['input'], w['output'], int(w['raw_net_input']), 16))
        self.assertEqual(int(re.search(r'assertEq\(r.endpoint.amountOutRaw,(\d+)\)', source).group(1)), int(w['output_raw']))


if __name__ == '__main__':
    unittest.main()
