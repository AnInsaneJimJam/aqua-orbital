"""Independent exact oracle and literal binding for the proposal helper only."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_lower_sheet import cases, oracle, pair_variance, solidity


class LowerSheetTests(unittest.TestCase):
    def test_hand_integer_edge_and_distinct_deferrals(self):
        self.assertEqual(oracle([1, 0, 2, 2], 0, 2, 0), (True, 0))
        self.assertEqual(pair_variance([0, 0, 2, 2]), 4*2**2)
        self.assertEqual(oracle([10, 11, 12], 0, 3, 7), (True, 7))
        self.assertEqual(oracle([10, 11, 12], 0, 3, 8), (False, 7))
        self.assertEqual(oracle([10, 0, 20], 0, 1, 0), (False, None))
        self.assertEqual(oracle([10, 0, 0], 0, 3, 0), (False, None))

    def test_exact_bisection_matches_exhaustive_small_integer_lower_half(self):
        from itertools import product
        from fractions import Fraction
        for untouched in product(range(5), repeat=3):
            for sigma in range(5):
                mean = Fraction(sum(untouched), len(untouched))
                threshold = 4*sigma**2
                gap = pair_variance([mean, *untouched]) < threshold
                choices = [z for z in range(mean.numerator//mean.denominator+1)
                           if pair_variance([z, *untouched]) >= threshold]
                expected = (True, max(choices)) if gap and choices else (False, None)
                self.assertEqual(oracle([10, *untouched], 0, sigma, 0), expected)

    def test_generated_solidity_matches_all_47_exact_cases(self):
        self.assertEqual(len(cases()), 47)
        self.assertEqual({len(row[1]) for row in cases()}, set(range(2, 9)))
        self.assertEqual((ROOT/'packages/contracts/test/fixtures/LowerSheetFixtures.sol').read_text(), solidity())
        found = 0
        for _, point, output, sigma, lower in cases():
            accepted, capped = oracle(point, output, sigma, lower)
            if accepted:
                found += 1
                self.assertTrue(lower <= capped <= point[output])
                after = point.copy()
                after[output] = capped
                self.assertGreaterEqual(pair_variance(after), len(point)*sigma**2)
        self.assertGreater(found, 20)
        self.assertLess(found, 47)


if __name__ == '__main__':
    unittest.main()
