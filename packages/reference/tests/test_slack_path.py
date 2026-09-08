"""Retained exact-real counterexample; not an integer reachable trade claim."""
import unittest
from mpmath import mp

class SlackPathRegression(unittest.TestCase):
    def test_small_slack_vertical_release_leaves_reconstruction_sheet(self):
        values=[]
        for precision in [110,160]:
            with mp.workdps(precision):
                n=4;R=mp.mpf(2);r=mp.mpf('0.000001');b=2+mp.mpf(2)**-31
                sigma=mp.sqrt(1-(b-4)**2/4);S=r*sigma;K=r*b;Ac=(R+r)*b
                k=mp.sqrt(3)/2;c=(Ac+3*S/k)/4;v=3*S/4
                untouched=[c+v,c-v/2,c-v/2]
                start=c+2*S/k;T=R+r
                end=T-mp.sqrt(T*T-sum((T-a)**2 for a in untouched))
                def state(z):
                    x=untouched+[z];A=sum(x);rho=mp.sqrt(sum((a-A/n)**2 for a in x))
                    F=(A-K-n*R)**2/n+(rho-S)**2
                    g=[R-(A-K)/n-(rho-S)*(a-A/n)/rho for a in x] if rho else []
                    boundary_max=b/n+sigma*max((a-A/n)/rho for a in x) if rho else mp.inf
                    return A,rho,F,g,boundary_max
                for z in [start,c+v,c-3*S/k]:
                    A,rho,F,g,maximum=state(z)
                    self.assertGreaterEqual(rho,S)
                    self.assertLessEqual(F,R*R)
                    self.assertGreater(min(g),0)
                    self.assertLess(maximum,1)
                A,rho,*_=state(c)
                self.assertGreater(A,Ac)
                self.assertLess(rho,S)
                self.assertLess(abs(rho/S-mp.sqrt(mp.mpf(27)/32)),mp.mpf('1e-90'))
                self.assertLess((sum(untouched)+end)/T,b)
                self.assertTrue(all(0<a<T for a in untouched+[end]))
                released=start-end
                self.assertGreater(released,0)
                self.assertLess(released,mp.mpf('0.000001'))
                values.append(released)
        self.assertLess(abs(values[0]-values[1]),mp.mpf('1e-90'))
