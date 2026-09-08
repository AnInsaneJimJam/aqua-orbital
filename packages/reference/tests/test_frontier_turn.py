"""Directed turn signs; precision checks are finite evidence, not path proofs."""
import sys
import unittest
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_frontier_turn import corpus


class FrontierTurnTests(unittest.TestCase):
    def test_explicit_tick_moments_are_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_exact_tangent_and_both_nearzero_signs(self):
        rows = {row['id']: row for row in corpus(110)['cases']}
        tangent = rows['n7_exact_tangent']
        self.assertEqual(tangent['status'], 'ProvenNonpositive')
        self.assertEqual(tangent['lower'], '0')
        self.assertEqual(tangent['upper'], '0')
        for name, sign in [('n8_near_negative', -1), ('n8_tangent', 0), ('n8_near_positive', 1)]:
            self.assertEqual(rows[name]['status'], 'Uncertain')
            self.assertEqual(rows[name]['exact_sign'], sign)
        self.assertEqual(rows['n2_small_positive']['lower'], '0')
        self.assertEqual(rows['n2_small_positive']['status'], 'Uncertain')

    def test_signed_wide_bounds_enclose_independent_moments(self):
        for row in corpus(160)['cases']:
            lo, hi, floor = map(int, (row['lower'], row['upper'], row['exact_scaled_floor']))
            self.assertLessEqual(lo, floor)
            self.assertGreaterEqual(hi, floor if row['exact_scaled_is_integer'] else floor+1)
            if row['status'] == 'ProvenNonpositive':
                self.assertLessEqual(row['exact_sign'], 0)
            elif row['status'] == 'ProvenPositive':
                self.assertEqual(row['exact_sign'], 1)

    def test_reject_insufficient_and_noninteger_precision(self):
        for dps in [79, 110.0, '110']:
            with self.assertRaises(ValueError):
                corpus(dps)

    def test_solidity_signed_endpoint_literals_match_independent_oracle(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/FrontierTurn.t.sol').read_text()
        name = 'function testIndependentSignedEndpointGoldens()'
        self.assertEqual(source.count(name), 1)
        section = source.split(name, 1)[1].split('function ', 1)[0]
        data = {row['id']: row for row in corpus(110)['cases']}
        cases = [data[key] for key in ['n3_robust_negative', 'n8_robust_negative', 'n3_two_boundary_prefix']]
        self.assertEqual([int(case['lower']) < 0 for case in cases], [True, True, False])
        self.assertEqual([int(case['upper']) < 0 for case in cases], [True, True, False])
        for array, field, high in [('lowerHigh', 'lower', True), ('lowerLow', 'lower', False),
                                   ('upperHigh', 'upper', True), ('upperLow', 'upper', False)]:
            match = re.search(r'uint256\[3\]\s+memory\s+'+array+r'\s*=\s*\[([^\]]+)\]', section)
            self.assertIsNotNone(match, array)
            literals = []
            for value in match.group(1).split(','):
                literal = re.fullmatch(r'(?:uint256\()?([0-9_]+)\)?', value.strip())
                self.assertIsNotNone(literal, value)
                literals.append(int(literal.group(1).replace('_', '')))
            expected = [abs(int(case[field])) >> 256 if high else abs(int(case[field])) % 2**256 for case in cases]
            self.assertEqual(literals, expected, array)


if __name__ == '__main__':
    unittest.main()
