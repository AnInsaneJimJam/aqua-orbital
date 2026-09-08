"""Golden arithmetic and per-tick witnesses; dense samples are not a path proof."""
import sys
import unittest
import re
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_interior_swap import corpus


class InteriorSwapTests(unittest.TestCase):
    def test_all_six_directed_pairs_are_precision_stable(self):
        low = corpus(110)
        high = corpus(160)
        self.assertEqual(low, high)
        self.assertEqual([(p['input'], p['output']) for p in high['pairs']],
                         [(0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1)])

    def test_actual_endpoints_are_exactly_feasible_and_one_extra_raw_output_is_outside(self):
        data = corpus(110)
        start = list(map(int, data['start_internal']))
        radii = list(map(int, data['radii_internal']))
        radius = sum(radii)
        self.assertEqual(sum((radius-x)**2 for x in start), radius**2)
        for case in data['pairs']:
            i, j = case['input'], case['output']
            qi = 10**(18-data['decimals'][i])*2**64
            qj = 10**(18-data['decimals'][j])*2**64
            end = list(map(int, case['actual_endpoint_internal']))
            self.assertEqual(int(case['net_input_raw']), 10**data['decimals'][i])
            expected = start.copy()
            expected[i] += int(case['net_input_raw'])*qi
            expected[j] -= int(case['output_raw'])*qj
            self.assertEqual(end, expected)
            self.assertGreater(int(case['output_raw']), 0)
            self.assertLess(2*sum(start), 3*radius)
            self.assertLess(2*sum(end), 3*radius)
            self.assertTrue(all(0 < x < radius for x in end))
            self.assertLessEqual(sum((radius-x)**2 for x in end), radius**2)
            extra = end.copy()
            extra[j] -= qj
            self.assertGreater(sum((radius-x)**2 for x in extra), radius**2)
            self.assertGreater(int(case['shortfall_upper_internal']), 0)
            self.assertLessEqual(int(case['shortfall_upper_internal']), qj)
            self.assertEqual(int(case['shortfall_upper_internal']),
                             int(case['ideal_output_deficit_ceil_internal'])-(radius-end[j]))
            # Exact rational MATH-7 baskets are not rounded into different
            # per-tick balances. Check the actual baskets, not only aggregate F.
            for tick_radius, key in zip(radii, data['tick_keys']):
                row = [Fraction(tick_radius*x, radius) for x in end]
                self.assertLessEqual(sum((x-tick_radius)**2 for x in row), tick_radius**2)
                self.assertTrue(all(0 <= x <= tick_radius for x in row))
                if int(key) != 2**64-1:
                    b = Fraction(int(key), 2**32)
                    self.assertLess(sum(row), tick_radius*b)
                    offset_squared = (1-(3-b)**2/3)*Fraction(2, 3)
                    for x in row:
                        deficit = b/3-x/tick_radius
                        # x/r >= b/3-sqrt(offset_squared); square only after
                        # establishing the nonnegative side of the comparison.
                        if deficit > 0:
                            self.assertLessEqual(deficit**2, offset_squared)

    def test_deficit_ceil_is_certified_by_independent_integer_squares(self):
        data = corpus(160)
        radius = sum(map(int, data['radii_internal']))
        for case in data['pairs']:
            end = list(map(int, case['actual_endpoint_internal']))
            output = case['output']
            radicand = radius**2-sum((radius-x)**2 for i, x in enumerate(end) if i != output)
            upper = int(case['ideal_output_deficit_ceil_internal'])
            self.assertGreater(radicand, 0)
            self.assertLess((upper-1)**2, radicand)
            self.assertLessEqual(radicand, upper**2)

    def test_reject_insufficient_or_noninteger_precision(self):
        for dps in [79, 110.0, '110']:
            with self.assertRaises(ValueError):
                corpus(dps)

    def test_solidity_six_pair_literals_match_independent_oracle(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/InteriorSwap.t.sol').read_text()
        name = 'function testAllSixPairsThreeTicksMatchIndependentSupportOracle()'
        self.assertEqual(source.count(name), 1)
        section = source.split(name, 1)[1].split('function ', 1)[0]
        data = corpus(110)
        for array_name, field in [('outputs', 'output_raw'), ('slack', 'shortfall_upper_internal')]:
            match = re.search(r'uint256\[6\]\s+memory\s+'+array_name+r'\s*=\s*\[([^\]]+)\]', section)
            self.assertIsNotNone(match, array_name)
            actual = []
            for value in match.group(1).split(','):
                literal = re.fullmatch(r'(?:uint256\()?([0-9_]+)\)?', value.strip())
                self.assertIsNotNone(literal, value)
                actual.append(int(literal.group(1).replace('_', '')))
            self.assertEqual(actual, [int(case[field]) for case in data['pairs']])


if __name__ == '__main__':
    unittest.main()
