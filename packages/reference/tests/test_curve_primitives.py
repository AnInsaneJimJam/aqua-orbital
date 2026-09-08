import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fixtures_curve_primitives import corpus, solidity_source

class CurvePrimitivesTest(unittest.TestCase):
    def test_scalar_and_both_root_fixture_precision_stability(self):
        self.assertEqual(corpus(110),corpus(160))

    def test_retained_goldens_match_regeneration(self):
        expected=json.loads((Path(__file__).resolve().parents[1]/'fixtures/curve-primitives.json').read_text())
        self.assertEqual(corpus(160),expected)
        target=Path(__file__).resolve().parents[2]/'contracts/test/fixtures/CurvePrimitiveFixtures.sol'
        self.assertEqual(target.read_text(),solidity_source(expected))

    def test_explicit_baskets_distinguish_inside_from_outside(self):
        fixtures=corpus(160)
        self.assertEqual([item['feasible'] for item in fixtures['scalars']],[True,False,True,True])
        self.assertEqual([int(item['residual_floor'])<0 for item in fixtures['scalars']],[True,False,True,True])
        self.assertEqual([event['direction'] for event in fixtures['events']],['inward','outward'])

if __name__=='__main__': unittest.main()
