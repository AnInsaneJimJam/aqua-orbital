"""Finite checks for FRONTIER_SEGMENT; not a certified onchain path solver."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mpmath import mp
from orbital import Tick, aggregate, geometry, supporting_basket, verify_baskets


def fixed_frontier(n, ticks, fixed, h):
    """Parameterization under a specified partition: one boundary tick here."""
    R = sum(mp.mpf(t.radius) for t in ticks[1:])
    K = mp.mpf(ticks[0].radius) * ticks[0].boundary
    S = mp.mpf(ticks[0].radius) * geometry(n, ticks[0])["sigma"]
    q = 1-h/n
    sigma = mp.sqrt(1-n*q*q)
    A = K+R*h
    rho = S+R*sigma
    s = A-sum(fixed)
    D = 2*A*A/n+2*rho*rho-2*sum(c*c for c in fixed)-s*s
    derivative = 4*R*(rho*q/sigma-(s/2-A/n))
    return R, K, S, A, rho, D, derivative


def roots(n, ticks, fixed, h):
    R, K, S, A, rho, D, derivative = fixed_frontier(n, ticks, fixed, h)
    if D < 0:
        raise ValueError("negative discriminant")
    delta = mp.sqrt(D)
    s = A-sum(fixed)
    result = []
    for sign in [-1, 1]:
        x = [(s+sign*delta)/2, (s-sign*delta)/2, *fixed]
        g = [R-(A-K)/n-(rho-S)*(v-A/n)/rho for v in x]
        result.append((x, g))
    return result


class FrontierSegmentTests(unittest.TestCase):
    def setUp(self):
        mp.dps = 110

    def test_mixed_turns_and_both_roots_match_explicit_tick_baskets(self):
        for digits in [110, 160]:
            with mp.workdps(digits):
                tolerance = mp.power(10, -digits+25)
                for n in [3, 4, 8]:
                    prices = [mp.mpf(1), mp.mpf(1)] + [mp.mpf(k+2) for k in range(n-2)]
                    h_turn = n-sum(prices)/mp.sqrt(sum(p*p for p in prices))
                    grid = 2**32
                    lower = mp.floor((n-mp.sqrt(n)+h_turn)*grid/2)/grid
                    upper = mp.floor((h_turn+n-1)*grid/2)/grid
                    ticks = [Tick(1, lower), Tick(2, upper), Tick(1)]
                    turning = aggregate(prices, ticks)
                    fixed = turning[2:]
                    h_hi = h_turn+min(h_turn-lower, upper-h_turn)/20
                    self.assertLess(fixed_frontier(n, ticks, fixed, lower)[5], 0)
                    self.assertLess(abs(fixed_frontier(n, ticks, fixed, h_turn)[5]), tolerance)
                    self.assertGreater(fixed_frontier(n, ticks, fixed, h_hi)[5], 0)
                    end_roots = roots(n, ticks, fixed, h_hi)
                    self.assertGreater(min(end_roots[0][1]), 0)
                    previous_inward = end_roots[0][0]
                    previous_outward = turning
                    # Actual explicit per-tick support baskets are the independent
                    # primal witness; matching the consolidated equation alone
                    # does not make this test pass.
                    for step in range(1, 65):
                        fraction = mp.mpf(step)/64
                        h = h_turn+(h_hi-h_turn)*fraction*fraction
                        for x, g in roots(n, ticks, fixed, h):
                            baskets = [supporting_basket(g, tick) for tick in ticks]
                            self.assertLess(verify_baskets(x, baskets, ticks, g), tolerance)
                            self.assertEqual(x[2:], fixed)
                            self.assertGreater(g[1], 0)
                        outward = roots(n, ticks, fixed, h)[1][0]
                        self.assertGreater(outward[0], previous_outward[0])
                        self.assertLess(outward[1], previous_outward[1])
                        previous_outward = outward
                        # Read the inward branch in the input-increasing direction.
                        h_reverse = h_turn+(h_hi-h_turn)*(1-fraction/2)**2
                        inward = roots(n, ticks, fixed, h_reverse)[0][0]
                        self.assertGreater(inward[0], previous_inward[0])
                        self.assertLess(inward[1], previous_inward[1])
                        previous_inward = inward

    def test_derivative_and_price_sign_identities(self):
        for n in [3, 4, 8]:
            p = [mp.mpf(1), mp.mpf(1)] + [mp.mpf(k+2) for k in range(n-2)]
            h_turn = n-sum(p)/mp.sqrt(sum(v*v for v in p))
            grid = 2**32
            lower = mp.floor((n-mp.sqrt(n)+h_turn)*grid/2)/grid
            upper = mp.floor((h_turn+n-1)*grid/2)/grid
            ticks = [Tick(1, lower), Tick(2, upper), Tick(1)]
            fixed = aggregate(p, ticks)[2:]
            h = h_turn+(upper-h_turn)/100
            R, K, S, A, rho, D, D1 = fixed_frontier(n, ticks, fixed, h)
            q = 1-h/n
            sigma = mp.sqrt(1-n*q*q)
            numeric_second = mp.diff(lambda t: fixed_frontier(n, ticks, fixed, t)[5], h, 2)
            self.assertLess(abs(numeric_second-(-2*R*R-4*S*R/(n*sigma**3))), mp.mpf('1e-90'))
            for x, g in roots(n, ticks, fixed, h):
                large = max(range(2), key=lambda i: x[i])
                predicted = sigma*(D1-2*R*mp.sqrt(D))/(4*R*rho)
                self.assertLess(abs(g[large]/R-predicted), mp.mpf('1e-90'))
                for c, price in zip(fixed, g[2:]):
                    H = n*R+K-n*c
                    self.assertLess(abs(price/R-(S*q+H*sigma/n)/rho), mp.mpf('1e-90'))

    def test_valid_endpoints_can_hide_two_required_partition_crossings(self):
        ticks = [Tick(1, mp.mpf(5)/8), Tick(1)]
        start = aggregate([2, 1], ticks)
        end = aggregate([1, 2], ticks)
        self.assertGreater(end[0], start[0])
        self.assertLess(end[1], start[1])
        for x, p in [(start, [mp.mpf(2), mp.mpf(1)]), (end, [mp.mpf(1), mp.mpf(2)])]:
            baskets = [supporting_basket(p, tick) for tick in ticks]
            self.assertLess(verify_baskets(x, baskets, ticks, p), mp.mpf('1e-90'))
            h = 2-sum(p)/mp.sqrt(sum(v*v for v in p))
            self.assertGreater(h, ticks[0].boundary)
        D_lower = fixed_frontier(2, ticks, [], ticks[0].boundary)[5]
        self.assertLess(abs(D_lower-mp.mpf(7)/16), mp.mpf('1e-90'))
        self.assertGreater(D_lower, 0)  # the additional finite check rejects
        actual_turn = aggregate([1, 1], ticks)
        self.assertLess(sum(actual_turn)/2, ticks[0].boundary)
        self.assertLess(abs(actual_turn[0]-actual_turn[1]), mp.mpf('1e-90'))

    def test_outward_endpoint_may_have_zero_input_price(self):
        ticks = [Tick(1, mp.mpf(3)/4), Tick(1)]
        endpoint = aggregate([0, 1], ticks)
        evaluated = roots(2, ticks, [], mp.mpf(1))[1]
        self.assertLess(max(abs(a-b) for a, b in zip(endpoint, evaluated[0])), mp.mpf('1e-90'))
        self.assertLess(abs(evaluated[1][0]), mp.mpf('1e-90'))
        self.assertGreater(evaluated[1][1], 0)
        previous = roots(2, ticks, [], mp.mpf('0.9'))[1][0]
        for k in range(1, 21):
            h = mp.mpf('0.9')+mp.mpf(k)/200
            x, g = roots(2, ticks, [], h)[1]
            self.assertGreater(x[0], previous[0])
            self.assertLess(x[1], previous[1])
            if k < 20:
                self.assertGreater(g[0], 0)
            self.assertGreater(g[1], 0)
            previous = x


if __name__ == '__main__':
    unittest.main()
