"""Exact-real audit regression: not a reachable raw-token trade fixture."""
import unittest
from mpmath import mp

class RoundingRegression(unittest.TestCase):
    def test_aggregate_prices_do_not_certify_boundary_prices(self):
        observations=[]
        for precision in [100,160]:
            with mp.workdps(precision):
                n=3; R=mp.mpf(1);K=mp.mpf(7)/4;S=mp.sqrt(69)/12
                p=[mp.mpf(0),(5+mp.sqrt(7))/8,(5-mp.sqrt(7))/8]
                x=[2*(1-a) for a in p];x[1]+=mp.mpf('0.000001')
                A=sum(x);w=[a-A/n for a in x];rho=mp.sqrt(sum(a*a for a in w));u=[a/rho for a in w]
                F=(A-K-n*R)**2/n+(rho-S)**2
                g=[R-(A-K)/n-(rho-S)/rho*a for a in w]
                boundary=[K/n+S*a for a in u]
                self.assertLess(F,R*R)
                self.assertTrue(all(a>=0 for a in g))
                self.assertGreater(boundary[0],1)
                self.assertGreater(max(u),(1-K/n)/S)
                observations.append(boundary[0]-1)
        with mp.workdps(100): self.assertLess(abs(observations[0]-observations[1]),mp.mpf('1e-95'))
