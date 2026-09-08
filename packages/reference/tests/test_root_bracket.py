import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_root_bracket import corpus


class RootBracketReferenceTest(unittest.TestCase):
    def test_independent_support_roots_are_precision_stable(self):
        self.assertEqual(corpus(110), corpus(160))

    def test_independent_basket_roots_match_retained_integer_floors(self):
        cases = corpus(160)["cases"]
        self.assertEqual([case["dimension"] for case in cases], [2, 3, 8])
        self.assertEqual([case["root_floor_grid"] for case in cases], [
            "44500767304604138371755601356080263154504059660318",
            "118110706132445067948266727102904585864375072737707",
            "468195371646119086619158565181678623455543623944581",
        ])
        for case in cases:
            self.assertLess(int(case["low_grid"]), int(case["root_floor_grid"]))
            self.assertGreater(int(case["high_grid"]), int(case["root_floor_grid"]) + 1)

    def test_solidity_fixture_literals_match_independent_regeneration(self):
        source = (Path(__file__).resolve().parents[2] / "contracts/test/RootBracket.t.sol").read_text()
        cases = corpus(160)["cases"]
        self.assertIn(f'MIXED_ROOT_FLOOR={cases[0]["root_floor_grid"]};', source)
        for case in cases[1:]:
            self.assertIn(f'checkHigherDimensionalGolden({case["fixture_index"]},{case["root_floor_grid"]});', source)


if __name__ == "__main__":
    unittest.main()
