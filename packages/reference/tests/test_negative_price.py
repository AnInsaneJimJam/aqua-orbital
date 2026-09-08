from fractions import Fraction as F
from math import isqrt
from pathlib import Path
import re
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures_negative_price import zero_price_fixture


class NegativePriceTests(unittest.TestCase):
    def test_rational_prices_have_exact_unit_norm_and_key(self):
        row = zero_price_fixture()
        p = row['prices']
        self.assertEqual(p, (F(0), F(3, 4), F(1, 2), F(1, 4), F(1, 4), F(1, 4)))
        self.assertEqual(sum(p), 2)
        self.assertEqual(sum(v*v for v in p), 1)
        self.assertEqual(row['dimension']-sum(p), row['key'])
        self.assertEqual(row['radii'], (10**40, 10**40))

    def test_both_separated_events_have_exact_zero_and_positive_output_price(self):
        row = zero_price_fixture(); radius = sum(row['radii']); s = row['radii'][0]
        self.assertEqual([(e[1], e[2]) for e in row['events']], [(s//2, s), (s, s//2)])
        for event in row['events']:
            prices = tuple(1-F(v, radius) for v in event)
            self.assertEqual(prices[0], 0)
            self.assertGreater(prices[row['output']], 0)
            self.assertTrue(all(v >= 0 for v in prices))
            self.assertEqual(sum(prices), 2)
            self.assertEqual(sum(v*v for v in prices), 1)
            self.assertEqual(sum(event), row['key']*radius)
            self.assertEqual(sum((radius-v)**2 for v in event), radius**2)
            self.assertNotEqual(event[row['input']], event[row['output']])

    def test_start_is_exact_rounded_feasible_all_interior_basket(self):
        row = zero_price_fixture(); start = row['start']; s = row['radii'][0]; radius = 2*s
        radicand = F(51*s*s, 25)
        self.assertEqual(radicand.denominator, 1)
        normal = radius-start[2]
        self.assertEqual(normal, isqrt(radicand.numerator))
        self.assertLess(normal*normal, radicand)
        self.assertLess(radicand, (normal+1)**2)
        norm_squared = sum((radius-v)**2 for v in start)
        self.assertLess(norm_squared, radius**2)
        self.assertGreater(norm_squared, (radius-1)**2)
        self.assertLess(sum(start), row['key']*radius)
        self.assertTrue(all(0 <= v <= radius for v in start))
        # Explicit per-tick reconstruction, not a consolidated radical solver.
        basket = tuple(F(v, 2) for v in start)
        self.assertLess(sum((s-v)**2 for v in basket), s*s)
        self.assertLess(sum(basket), row['key']*s)
        self.assertEqual(tuple(2*v for v in basket), start)

    def test_outward_root_uses_original_frame_and_lies_strictly_inside_input(self):
        row = zero_price_fixture(); s = row['radii'][0]; start = row['start']
        first, second = row['events']
        self.assertEqual(first[1]-start[1], -2*s//5)
        self.assertEqual(second[1]-start[1], s//10)
        self.assertLess(0, second[1]-start[1])
        self.assertLess(second[1]-start[1], row['net_input'])
        self.assertEqual(row['net_input'], s//5)
        self.assertGreater(start[2]-second[2], 0)
        self.assertLess(start[1]+row['net_input'], 2*s)
        self.assertEqual(tuple(first[i] for i in (0, 3, 4, 5)), tuple(start[i] for i in (0, 3, 4, 5)))
        self.assertEqual(tuple(second[i] for i in (0, 3, 4, 5)), tuple(start[i] for i in (0, 3, 4, 5)))

    def test_exact_zero_cannot_satisfy_strict_directed_negative_price_test(self):
        row = zero_price_fixture(); radius = sum(row['radii']); n = row['dimension']; key = row['key']
        # At this shared key rho=radius*sigma and sigma^2=1/3. The coefficient
        # of positive sigma in the exact price margin vanishes identically.
        for event in row['events']:
            delta = n*max(event)-sum(event)
            self.assertEqual(delta-(n-key)*radius, 0)
            for q in (1, 2, 2**32, 2**128, 2**256):
                lower = isqrt(q*q//3); upper = lower+1
                self.assertLess(F(lower, q)**2, F(1, 3))
                self.assertGreater(F(upper, q)**2, F(1, 3))
                lhs = F(lower, q)*delta
                rhs = (n-key)*radius*F(upper, q)
                self.assertLess(lhs, rhs)

    def test_fixture_is_independent_and_fresh(self):
        row = zero_price_fixture()
        self.assertEqual(row['scope'], 'Exact geometric zero-price witness; no reachable raw-token history or production schedule liveness claim')
        row['start'] = (0,)*6
        self.assertNotEqual(row, zero_price_fixture())

    def test_solidity_zero_fixture_and_both_event_literals_bind_exact_reference(self):
        row = zero_price_fixture(); s = row['radii'][0]
        source = (Path(__file__).resolve().parents[2]/'contracts/test/FrontierPriceExclusion.t.sol').read_text()
        self.assertEqual(int(re.search(r'constant ZERO_PRICE_OUTPUT\s*=\s*(\d+);', source).group(1)), row['start'][2])
        body = source.split('function zeroPrice()', 1)[1].split('\n    function ', 1)[0]
        self.assertEqual(10**int(re.search(r'uint256 s\s*=\s*1e(\d+);', body).group(1)), s)
        self.assertEqual(int(re.search(r'new uint256\[\]\((\d+)\)', body).group(1)), row['dimension'])
        compact = re.sub(r'\s+', '', body)
        for expression in ('x[0]=2*s;', 'x[1]=9*s/10;', 'x[2]=ZERO_PRICE_OUTPUT;',
                           'x[3]=3*s/2;', 'x[4]=3*s/2;', 'x[5]=3*s/2;', 'pairTicks(6,s,uint64(4*GRID))'):
            self.assertIn(expression, compact)
        tick_body = re.sub(r'\s+', '', source.split('function pairTicks(', 1)[1].split('\n    function ', 1)[0])
        self.assertIn('newM.Tick[](2)', tick_body)
        self.assertIn('ticks[0]=M.Tick(key,uint192(r),', tick_body)
        self.assertIn('ticks[1]=M.Tick(type(uint64).max,uint192(r),', tick_body)
        exact_body = re.sub(r'\s+', '', source.split('function testExactZeroUntouchedPriceOnBothRootsIsNotNegative()', 1)[1].split('\n    function ', 1)[0])
        self.assertIn('V.atKey(x,ticks,1,2,0)', exact_body)
        self.assertIn('(i==0?1e40/2:1e40)*GRID', exact_body)
        self.assertIn('(i==0?1e40:1e40/2)*GRID', exact_body)
        self.assertIn('assertFalse(excluded(x,ticks,1,2,0,roots,i))', exact_body)
        schedule_body = re.sub(r'\s+', '', source.split('function testInWindowUnknownZeroPriceRootStillDefersSchedule()', 1)[1].split('\n    function ', 1)[0])
        self.assertIn('F.enumerate(x,ticks,1,2,s/5,0,1,16)', schedule_body)
        self.assertIn('F.Status.Uncertain', schedule_body)


if __name__ == '__main__':
    unittest.main()
