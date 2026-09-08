import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_initializer import corpus, solidity_source, U, Q


class InitializerOracleTest(unittest.TestCase):
    def test_independent_integer_enclosures_are_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_retained_json_and_solidity_are_exact_regeneration(self):
        base = Path(__file__).resolve().parents[1]
        expected = json.loads((base/'fixtures/initializer-oracle.json').read_text())
        self.assertEqual(corpus(160), expected)
        self.assertEqual((base.parent/'contracts/test/fixtures/InitializerOracleFixtures.sol').read_text(), solidity_source(expected))

    def test_exact_rational_benchmark_has_no_virtual_or_radial_error(self):
        value = next(c for c in corpus(110) if c['name'] == 'rational-four-full')
        self.assertEqual(int(value['coordinate']), int(value['radii'][0])//2)
        for field in ['virtual_floor', 'virtual_ceil', 'virtual_lower', 'virtual_error_bound', 'radial_slack_ceil', 'stored_slack_bound']:
            self.assertEqual(int(value[field]), 0, field)

    def test_nontrivial_bounds_and_numeric_extremes_are_retained(self):
        values = corpus(160)
        self.assertEqual(len(values), 12)
        self.assertEqual({c['n'] for c in values}, {2, 3, 4, 5, 8})
        self.assertEqual({d for c in values for d in c['decimals']}, {0, 6, 8, 18})
        for c in values:
            self.assertLess(int(c['stored_slack_bound']), U)
            self.assertLessEqual(int(c['radial_slack_ceil']), int(c['stored_slack_bound']))
            self.assertEqual(c['raw'], c['paper_raw'])
            if c['name'].startswith('near-limit'):
                self.assertEqual(sum(map(int, c['radii'])), (1 << 160)-1)
                self.assertGreater(int(c['virtual_error_bound']), 10**9)
                self.assertGreater(int(c['stored_slack_bound']), 0)
        self.assertTrue(any(int(c['principal_upper']) > int(c['principal_lower']) for c in values))


if __name__ == '__main__':
    unittest.main()
