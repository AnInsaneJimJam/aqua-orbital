"""Bind real Router regression inputs to the independent stable-price corpus.

This is fixture provenance, not another numerical solver or full path proof.
The separate reachable_traversal tests regenerate the110/160-digit corpus.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REFERENCE = ROOT / "packages/reference/fixtures/reachable-traversal.json"


class MixedExecutionLiteralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = json.loads(REFERENCE.read_text())
        cls.sources = {
            name: (ROOT / "packages/contracts/test" / f"{name}.t.sol").read_text()
            for name in ("MixedExecution", "ReachableComposition")
        }

    def constants(self, name):
        return {key: int(value) for key, value in re.findall(
            r"uint256\s+constant\s+(\w+)\s*=\s*(\d+)\s*;", self.sources[name])}

    def test_actual_and_pure_trade_literals_match_the_same_independent_corpus(self):
        initial = self.corpus["initial"]
        for name in self.sources:
            constants = self.constants(name)
            self.assertEqual(constants["INITIAL_X"], int(initial["coordinate"]))
            for prefix, row in zip(("FIRST", "SECOND"), self.corpus["swaps"]):
                witness = row["witness"]
                self.assertEqual(constants[f"{prefix}_OUT"], int(witness["output_raw"]))
                if name == "MixedExecution":
                    self.assertEqual(constants[f"{prefix}_GROSS"], int(row["gross_input_raw"]))
                else:
                    self.assertEqual(constants[f"{prefix}_NET"], int(witness["raw_net_input"]))
                gross = int(row["gross_input_raw"])
                fee = (gross * self.corpus["fee_ppm"] + 999999) // 1000000
                self.assertEqual(fee, int(row["fee_raw"]))
                self.assertEqual(gross - fee, int(witness["raw_net_input"]))

    def test_declared_geometry_and_real_sorted_token_precisions_are_bound(self):
        initial = self.corpus["initial"]
        self.assertEqual(initial["decimals"], [6, 18, 6])
        self.assertEqual(list(map(int, initial["radii"])), [(100 << i) * 10**18 * (1 << 64) for i in range(3)])
        self.assertEqual(list(map(int, initial["keys"])), [3 * (1 << 32) // 2, 7 * (1 << 32) // 4, (1 << 64) - 1])
        real = self.sources["MixedExecution"]
        self.assertEqual(real.count("new MixedDollar(6)"), 2)
        self.assertIn("new MixedDollar{salt:bytes32(salt)}(18)", real)
        self.assertIn("uint8 private immutable precision", real)
        for index, precision in enumerate(initial["decimals"]):
            self.assertIn(f"assertEq(precisions[{index}],{precision})", real)
            self.assertIn(f"d[{index}]={precision}", self.sources["ReachableComposition"])
        for source in self.sources.values():
            self.assertIn("(100<<i)*1e18*U", source)
            self.assertIn("uint64(3*GRID/2)", source)
            self.assertIn("uint64(7*GRID/4)", source)
        self.assertNotIn("vm.store(", real)

    def test_second_call_uses_actual_raw_payout_endpoint_and_ordered_crossings(self):
        state = list(map(int, self.corpus["initial"]["directed_reserves"]))
        real = self.sources["MixedExecution"]
        self.assertIn("fill(order,0,2,FIRST_GROSS,1,FIRST_OUT)", real)
        self.assertIn("fill(order,2,0,SECOND_GROSS,2,SECOND_OUT)", real)
        for index, row in enumerate(self.corpus["swaps"]):
            witness = row["witness"]
            self.assertEqual(list(map(int, witness["start"])), state)
            input_index, output_index = witness["input"], witness["output"]
            self.assertEqual((input_index, output_index), ((0, 2), (2, 0))[index])
            state[input_index] += int(witness["net_input_internal"])
            state[output_index] -= int(witness["output_raw"]) * int(witness["output_quantum"])
            self.assertEqual(state, list(map(int, witness["actual_endpoint"])))
            self.assertEqual([event["direction"] for event in witness["transitions"]],
                             [["outward"], ["inward", "outward"]][index])
            self.assertTrue(all(event["key_index"] == 0 for event in witness["transitions"]))


if __name__ == "__main__":
    unittest.main()
