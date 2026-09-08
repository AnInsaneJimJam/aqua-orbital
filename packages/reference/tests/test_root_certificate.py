"""Independent support witnesses for the endpoint dual-gap certificate.

Precision-stable fixtures are numerical cross-checks, not the universal proof.
Run this file with --fixtures to print the exact integer fixture inputs.
"""
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mpmath import mp
from orbital import Tick, aggregate, supporting_basket, geometry

GRID = 1 << 32
SCALE = 10**30

def support(prices, ticks):
    return sum(sum(p*x for p,x in zip(prices,supporting_basket(prices,t))) for t in ticks)

def integer_fixtures(precision):
    with mp.workdps(precision):
        keys = [14*GRID//10, 16*GRID//10]
        ticks = [Tick(SCALE,mp.mpf(j)/GRID) for j in keys]+[Tick(SCALE)]
        prices = [mp.mpf(1),mp.mpf(1),mp.mpf(3)]
        x = [int(mp.ceil(v))+100 for v in aggregate(prices,ticks)]
        root7=mp.sqrt(7)
        seam_x=[int(mp.ceil((mp.mpf(3)/4+3*root7/16)*SCALE)),int(mp.ceil((mp.mpf(3)/4-3*root7/16)*SCALE))]
        seam_p=[int(mp.floor((mp.mpf(5)/8-root7/16)*10**18)),int(mp.floor((mp.mpf(5)/8+root7/16)*10**18))]
        pt=list(map(mp.mpf,seam_p))
        norm=mp.sqrt(sum(p*p for p in pt)); total=sum(pt)
        cap=Tick(SCALE,mp.mpf(3)/4)
        perp=mp.sqrt(sum((p-total/2)**2 for p in pt))
        wrong_support=SCALE*(total-norm)+SCALE*(mp.mpf(3)*total/8-geometry(2,cap)['sigma']*perp)
        wrong_gap=sum(p*v for p,v in zip(pt,seam_x))-wrong_support
        return dict(mixedKeys=keys,mixedX=x,mixedSupportFloor=int(mp.floor(support(prices,ticks))),seamX=seam_x,seamPrices=seam_p,wrongSeamGapCeil=int(mp.ceil(wrong_gap)))

class RootCertificateTests(unittest.TestCase):
    def test_integer_fixtures_stable_at_110_and_160_digits(self):
        self.assertEqual(integer_fixtures(110),integer_fixtures(160))

    def test_cancelled_support_formula_matches_explicit_baskets(self):
        with mp.workdps(160):
            for prices in ([1,1,3],[0,0,1],[1,2,4],[1,1,1],[3,0,2]):
                p=list(map(mp.mpf,prices)); n=len(p); p1=sum(p); p2=sum(v*v for v in p)
                for j in (14*GRID//10,16*GRID//10,19*GRID//10):
                    t=Tick(SCALE,mp.mpf(j)/GRID)
                    d=n*GRID-j; e=n*GRID*GRID-d*d; v=n*p2-p1*p1
                    if GRID*GRID*p1*p1>=d*d*p2:
                        analytic=SCALE*(p1-mp.sqrt(p2))
                    else:
                        analytic=SCALE*(j*p1-mp.sqrt(e*v))/(n*GRID)
                    explicit=sum(a*b for a,b in zip(p,supporting_basket(p,t)))
                    self.assertLess(abs(analytic-explicit),mp.mpf('1e-120'))

    def test_persisted_partition_support_gives_false_output_bound(self):
        with mp.workdps(160):
            f=integer_fixtures(160); x=list(map(mp.mpf,f['seamX'])); p=list(map(mp.mpf,f['seamPrices']))
            ticks=[Tick(SCALE,mp.mpf(3)/4),Tick(SCALE)]
            y=mp.mpf(SCALE)/10
            after=[x[0],x[1]-y]
            # After the inward seam both ticks have the same interior basket.
            basket=[v/2 for v in after]
            self.assertLess(sum((v-SCALE)**2 for v in basket),SCALE*SCALE)
            self.assertLess(sum(basket),mp.mpf(3)*SCALE/4)
            self.assertLess(max(basket),SCALE)
            self.assertLess(f['wrongSeamGapCeil'],p[1]*y)
            correct_gap=sum(a*b for a,b in zip(p,x))-support(p,ticks)
            self.assertGreaterEqual(correct_gap,p[1]*y)

if __name__ == '__main__':
    if '--fixtures' in sys.argv:
        print(json.dumps(integer_fixtures(160),indent=2))
    else:
        unittest.main()
