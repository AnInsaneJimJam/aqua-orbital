import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_execution import fixtures, DECIMALS


class ExecutionOracleTest(unittest.TestCase):
    def test_precision_stability_and_explicit_baskets(self):
        self.assertEqual(fixtures(110), fixtures(160))

    def test_six_initial_pairs_and_invoice_input(self):
        values = fixtures()
        self.assertEqual(len(values['cases']), 12)
        for case in values['cases']:
            if case['whole_input'] == 1:
                self.assertEqual(case['amount_out_raw'], 997034 if DECIMALS[case['output']] == 6 else 997034206127854582)
            elif DECIMALS[case['output']] == 6:
                self.assertGreater(case['amount_out_raw'], 5_000_000)

    def test_production_test_literals_are_bound_to_oracle(self):
        source = (Path(__file__).resolve().parents[2]/'contracts/test/InteriorExecution.t.sol').read_text()
        self.assertIn(str(fixtures()['initial_x']), source)
        self.assertIn('997034:997034206127854582', source)


if __name__ == '__main__':
    unittest.main()
