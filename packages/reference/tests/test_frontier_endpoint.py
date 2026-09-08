import sys
import unittest
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_frontier_endpoint import corpus


class FrontierEndpointTests(unittest.TestCase):
    def test_mixed_frontier_roots_and_raw_floors_are_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_all_dimensions_preserve_input_and_one_final_output_floor(self):
        rows = corpus(160)['cases']
        self.assertEqual([row['dimension'] for row in rows], [2, 3, 8, 3])
        for row in rows:
            initial = list(map(int, row['start']))
            end = list(map(int, row['actual_endpoint']))
            i, j = row['input'], row['output']
            self.assertEqual(end[i]-initial[i], int(row['net_input_internal']))
            self.assertEqual(initial[j]-end[j], int(row['output_raw'])*int(row['output_quantum']))
            for k in range(len(initial)):
                if k not in [i, j]:
                    self.assertEqual(initial[k], end[k])
            self.assertGreater(int(row['output_raw']), 0)
            self.assertLessEqual(int(row['ideal_shortfall_ceil']), int(row['output_quantum']))
            self.assertEqual(row['root_boundary_count'], row['actual_boundary_count'])

    def test_true_root_lies_between_adjacent_grid_integers(self):
        for row in corpus(110)['cases']:
            self.assertEqual(int(row['root_ceil_grid'])-int(row['root_floor_grid']), 1)

    def test_invalid_precision_rejected(self):
        for dps in [79, 110.0, '110']:
            with self.assertRaises(ValueError):
                corpus(dps)

    def test_solidity_root_output_and_shortfall_literals_match_oracle(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/FrontierEndpoint.t.sol').read_text()
        name = 'function _assertGolden(uint8 index)'
        self.assertEqual(source.count(name), 1)
        section = source.split(name, 1)[1].split('function ', 1)[0]
        rows = corpus(110)['cases']
        for array, field in [('outputs', 'output_raw'), ('floors', 'root_floor_grid'), ('idealShortfalls', 'ideal_shortfall_ceil')]:
            match = re.search(r'uint256\[4\]\s+memory\s+'+array+r'\s*=\s*\[([^\]]+)\]', section)
            self.assertIsNotNone(match, array)
            literals = []
            for value in match.group(1).split(','):
                literal = re.fullmatch(r'(?:uint256\()?([0-9_]+)\)?', value.strip())
                self.assertIsNotNone(literal, value)
                literals.append(int(literal.group(1).replace('_', '')))
            self.assertEqual(literals, [int(row[field]) for row in rows])


if __name__ == '__main__':
    unittest.main()
