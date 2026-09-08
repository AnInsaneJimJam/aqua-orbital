import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mpmath import mp
from orbital import Tick, geometry, supporting_basket, aggregate, swap

class ReferenceTests(unittest.TestCase):
    def setUp(self):
        mp.dps = 110

    def close(self,a,b):
        self.assertLess(abs(a-b), mp.mpf('1e-90') * max(1,abs(b)))

    def test_geo_01_sphere_equal_point(self):
        self.assertEqual(supporting_basket([1]*4,Tick(2)),[mp.mpf(1)]*4)

    def test_geo_02_03_analytic_cap(self):
        g=geometry(4,Tick(2,mp.mpf(9)/4))
        self.close(g['sigma'],mp.sqrt(15)/8)
        self.close(g['virtual'],(9-3*mp.sqrt(5))/8)
        self.close(g['principal_equal'],(3*mp.sqrt(5)-1)/8)

    def test_geo_05_invalid_ticks(self):
        for b in [mp.mpf(2),mp.mpf('1.99'),mp.mpf(3),mp.mpf('3.1')]:
            with self.assertRaises(ValueError): geometry(4,Tick(1,b))
        with self.assertRaises(ValueError): geometry(3,Tick(0))

    def test_geo_09_boundary_primal_and_support(self):
        p=[mp.mpf('0.1'),mp.mpf(1),mp.mpf(1)]
        t=Tick(3,mp.mpf('1.3'))
        x=supporting_basket(p,t)
        self.close(sum(x),t.radius*t.boundary)
        self.close(sum((a-t.radius)**2 for a in x),t.radius**2)
        g=geometry(3,t)
        self.assertTrue(all(a>=g['virtual'] for a in x))

    def test_sw_01_exact_sphere(self):
        q=swap([mp.mpf(1)]*4,[Tick(2)],0,1,mp.mpf('0.5'))
        self.close(q['output'],mp.sqrt(7)/2-1)
        self.assertLess(q['constraint_error'],mp.mpf('1e-90'))

    def test_sw_02_interior_consolidation(self):
        ticks=[Tick(1),Tick(1)]
        q=swap([mp.mpf(1)]*4,ticks,0,1,mp.mpf('0.5'))
        self.close(q['output'],mp.sqrt(7)/2-1)

    def test_double_crossing_two_asset_regression(self):
        ticks=[Tick(1),Tick(1,mp.mpf(5)/8)]
        start=aggregate([2,1],ticks)
        amount=1/mp.sqrt(5)+mp.sqrt(7)/8
        q=swap(start,ticks,0,1,amount)
        self.close(q['output'],amount)
        self.close(q['end'][0],start[1])
        midpoint=aggregate([1,1],ticks)
        self.assertLess(sum(supporting_basket([1,1],ticks[1])),mp.mpf(5)/8)
        self.close(sum(supporting_basket([2,1],ticks[1])),mp.mpf(5)/8)
        self.assertLess(midpoint[0],start[1])

    def test_all_six_pairs_and_precision_stability(self):
        ticks=[Tick(1),Tick(2,mp.mpf('1.3')),Tick(3,mp.mpf('1.28'))]
        start=aggregate([1,1,1],ticks)
        values=[]
        for i in range(3):
            for j in range(3):
                if i!=j:
                    result=swap(start,ticks,i,j,mp.mpf('0.01'))
                    self.assertGreater(result['output'],0)
                    values.append(result['output'])
        for value in values: self.close(value,values[0])
        with mp.workdps(160):
            refined=swap(aggregate([1,1,1],ticks),ticks,0,1,mp.mpf('0.01'))
        self.close(values[0],refined['output'])

    def test_invalid_trade(self):
        for amount in [0,-1]:
            with self.assertRaises(ValueError): swap([1]*4,[Tick(2)],0,1,amount)
        with self.assertRaises(ValueError): swap([1]*4,[Tick(2)],0,0,1)

if __name__=='__main__': unittest.main()
