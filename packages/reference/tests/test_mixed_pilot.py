import sys
import unittest
from pathlib import Path

from mpmath import mp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_mixed_pilot import ACTIONS, DIMENSIONS, FAMILIES, TICK_COUNTS, history, specs
from fixtures_initializer import FULL, GRID, U


class MixedPilotTests(unittest.TestCase):
    def test_all_32_configurations_satisfy_exact_supported_key_and_radius_bounds(self):
        values = specs()
        self.assertEqual(len(values), 32)
        self.assertEqual(len({v[0] for v in values}), 32)
        self.assertEqual({(n, len(keys), name.split('-')[-1]) for name, n, _, keys, _ in values},
                         {(n, t, f) for n in DIMENSIONS for t in TICK_COUNTS for f in FAMILIES})
        for _, n, decimals, keys, radii in values:
            self.assertEqual(keys[-1], FULL)
            self.assertEqual(len(set(keys)), len(keys))
            self.assertEqual(keys, sorted(keys))
            self.assertEqual(len(decimals), n)
            self.assertTrue(set(decimals) <= {0, 6, 8, 18})
            self.assertLess(sum(radii), 2**160)
            self.assertTrue(all(0 < r < 2**192 for r in radii))
            for key in keys[:-1]:
                self.assertLess(key, (n-1)*GRID)
                self.assertGreaterEqual((n*GRID*GRID-(n*GRID-key)**2)*GRID, n*GRID*GRID)

    def test_sphere_control_matches_separate_closed_form_and_actual_history(self):
        spec = next(s for s in specs() if s[0] == 'n2-t1-moderate')
        row = history(spec, 110)
        self.assertEqual(row, history(spec, 160))
        self.assertEqual(len(row['actions']), len(ACTIONS))
        point = [int(row['initial']['coordinate'])]*2
        radius = sum(spec[4])
        with mp.workdps(160):
            for action in row['actions']:
                self.assertEqual(action['status'], 'generated')
                w = action['witness']
                self.assertEqual(list(map(int, w['start'])), point)
                i, j = w['input'], w['output']
                after_input = point[i]+int(w['raw_net_input'])*10**(18-spec[2][i])*U
                root = radius-mp.sqrt(radius**2-(radius-after_input)**2)
                quantum = 10**(18-spec[2][j])*U
                expected = int(mp.floor((point[j]-root)/quantum))
                self.assertEqual(int(w['output_raw']), expected)
                self.assertEqual(w['transitions'], [])
                point = point.copy()
                point[i] = after_input
                point[j] -= expected*quantum
                self.assertEqual(list(map(int, w['actual_endpoint'])), point)


if __name__ == '__main__':
    unittest.main()
