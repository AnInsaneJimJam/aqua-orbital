"""Independent explicit-tick oracle. Offline only; never used for live quotes."""
from dataclasses import dataclass
from mpmath import mp

@dataclass(frozen=True)
class Tick:
    radius: object
    boundary: object = None

def geometry(n, tick):
    if not isinstance(n,int) or n<2: raise ValueError('dimension')
    r=mp.mpf(tick.radius)
    if not mp.isfinite(r) or r<=0: raise ValueError('radius')
    q0=1-1/mp.sqrt(n)
    if tick.boundary is None:
        return dict(sigma=mp.mpf(0),virtual=mp.mpf(0),principal_equal=r*q0)
    b=mp.mpf(tick.boundary)
    if not mp.isfinite(b) or not n-mp.sqrt(n)<b<n-1: raise ValueError('boundary')
    sigma2=1-(b-n)**2/n
    if sigma2<mp.mpf(2)**-32: raise ValueError('degenerate cap')
    sigma=mp.sqrt(sigma2)
    virtual=r*(b/n-sigma*mp.sqrt(mp.mpf(n-1)/n))
    return dict(sigma=sigma,virtual=virtual,principal_equal=r*q0-virtual)

def supporting_basket(prices, tick):
    p=list(map(mp.mpf,prices)); n=len(p); g=geometry(n,tick); r=mp.mpf(tick.radius)
    if any(not mp.isfinite(a) or a<0 for a in p) or not any(p): raise ValueError('prices')
    norm=mp.sqrt(sum(a*a for a in p))
    free=[r-r*a/norm for a in p]
    if tick.boundary is None or sum(free)<=r*mp.mpf(tick.boundary): return free
    mean=sum(p)/n; transverse=[a-mean for a in p]
    norm_perp=mp.sqrt(sum(a*a for a in transverse))
    if not norm_perp: raise ArithmeticError('equal prices cannot bind a valid cap')
    return [r*mp.mpf(tick.boundary)/n-r*g['sigma']*a/norm_perp for a in transverse]

def aggregate(prices, ticks):
    if not ticks: raise ValueError('empty strategy')
    baskets=[supporting_basket(prices,t) for t in ticks]
    return [sum(row[i] for row in baskets) for i in range(len(prices))]

def verify_baskets(total, baskets, ticks, prices):
    """Independent primal inequalities and analytic dual objective check.

    Numerical tolerance is explicit and precision dependent. This does not prove
    global correctness of mpmath, nor certify an integer production endpoint.
    """
    n=len(total)
    if len(baskets)!=len(ticks) or len(prices)!=n: raise ValueError('witness shape')
    if any(not mp.isfinite(a) or a<0 for a in prices) or not any(prices): raise ValueError('support prices')
    scale=sum(mp.mpf(t.radius) for t in ticks)
    tol=mp.power(10,-mp.dps+20)
    norm=mp.sqrt(sum(p*p for p in prices)); psum=sum(prices)
    pperp=mp.sqrt(sum((p-psum/n)**2 for p in prices))
    dual=mp.mpf(0)
    for row,t in zip(baskets,ticks):
        if len(row)!=n or any(not mp.isfinite(a) for a in row): raise ValueError('basket')
        r=mp.mpf(t.radius); g=geometry(n,t)
        if sum((a-r)**2 for a in row)>r*r+tol*r*r: raise ValueError('sphere feasibility')
        if t.boundary is not None and sum(row)>r*mp.mpf(t.boundary)+tol*r: raise ValueError('cap feasibility')
        if any(a<g['virtual']-tol*r or a>r+tol*r for a in row): raise ValueError('principal or price branch')
        if t.boundary is None or n-psum/norm<=mp.mpf(t.boundary):
            dual+=r*(psum-norm)
        else:
            dual+=r*(mp.mpf(t.boundary)*psum/n-g['sigma']*pperp)
    residual=max(abs(sum(row[i] for row in baskets)-total[i]) for i in range(n))
    if residual>tol*scale: raise ValueError('aggregate reconstruction')
    gap=abs(sum(a*p for a,p in zip(total,prices))-dual)
    if gap>tol*scale*max(prices): raise ValueError('primal dual gap')
    return max(residual/scale,gap/(scale*max(prices)))

def frontier_events(start,ticks,token_in,token_out,amount):
    """Exact-frontier event candidates, validated by explicit supporting baskets.

    Enumerates both global M4 roots per distinct key. It is an offline numerical
    diagnostic, not a certified traversal algorithm: it does not certify segment
    connectivity or transitions while initially releasing rounded-state slack.
    """
    x=list(map(mp.mpf,start)); n=len(x); dmax=mp.mpf(amount)
    if not 0<=token_in<n or not 0<=token_out<n or token_in==token_out or dmax<=0: raise ValueError('trade')
    if not any(t.boundary is None for t in ticks): raise ValueError('full range required')
    for t in ticks: geometry(n,t)
    keys=sorted(set(mp.mpf(t.boundary) for t in ticks if t.boundary is not None))
    A=sum(x); B=sum(a*a for a in x); a=x[token_in]; z=x[token_out]
    scale=sum(mp.mpf(t.radius) for t in ticks); tol=mp.power(10,-mp.dps+20)
    result=[]
    for key in keys:
        boundary=[t for t in ticks if t.boundary is not None and mp.mpf(t.boundary)<key]
        R=scale-sum(mp.mpf(t.radius) for t in boundary)
        K=sum(mp.mpf(t.radius)*mp.mpf(t.boundary) for t in boundary)
        S=sum(mp.mpf(t.radius)*geometry(n,t)['sigma'] for t in boundary)
        Ac=K+R*key; rhoc=S+R*geometry(n,Tick(1,key))['sigma']; Bc=Ac*Ac/n+rhoc*rhoc
        C=A-Ac; qa=mp.mpf(2); qb=2*(a-z+C); qc=C*C-2*z*C+B-Bc
        discriminant=qb*qb-4*qa*qc
        if discriminant<0: continue
        radical=mp.sqrt(discriminant)
        q=-(qb+(radical if qb>=0 else -radical))/2
        roots=[-qb/(2*qa)] if q==0 else [q/qa,qc/q]
        for d in sorted(set(roots)):
            y=d+C
            if d<0 or d>dmax or y<0 or y>x[token_out]: continue
            end=x.copy();end[token_in]+=d;end[token_out]-=y
            mean=sum(end)/n; rho=mp.sqrt(sum((v-mean)**2 for v in end))
            if rho<=0 or rho<S: continue
            g=[R-(sum(end)-K)/n-(rho-S)*(v-mean)/rho for v in end]
            if min(g)<-tol*scale or g[token_out]<=0: continue
            g=[max(v,mp.mpf(0)) for v in g]
            baskets=[supporting_basket(g,t) for t in ticks]
            if max(abs(sum(row[i] for row in baskets)-end[i]) for i in range(n))>tol*scale: continue
            verify_baskets(end,baskets,ticks,g)
            difference=end[token_in]-end[token_out]
            if abs(difference)<=tol*scale: continue  # tangent, not a transition
            result.append(dict(key=key,input=d,output=y,direction='inward' if difference<0 else 'outward',end=end))
    return sorted(result,key=lambda event:(event['input'],event['key']))

def swap(start, ticks, token_in, token_out, amount):
    """Solve dual prices using per-tick minimizers, not the consolidated invariant.

    This floating high-precision oracle verifies its constraints numerically. It
    is not a certified onchain interval solver or a universal solvency proof.
    Output price is normalized to one; fixed reserves determine the other prices.
    """
    x=list(map(mp.mpf,start)); n=len(x); d=mp.mpf(amount)
    if not 0<=token_in<n or not 0<=token_out<n or token_in==token_out: raise ValueError('pair')
    if not mp.isfinite(d) or d<=0: raise ValueError('amount')
    if not any(t.boundary is None for t in ticks): raise ValueError('full range required')
    for t in ticks: geometry(n,t)
    fixed=[i for i in range(n) if i!=token_out]
    targets=[x[i]+(d if i==token_in else 0) for i in fixed]
    scale=sum(mp.mpf(t.radius) for t in ticks)
    if any(a<0 or a>scale for a in targets): raise ValueError('unreachable reserves')
    tolerance=mp.power(10,-mp.dps+20)
    def prices(z):
        p=[mp.mpf(1)]*n
        for i,v in zip(fixed,z): p[i]=mp.exp(v)
        return p
    def equations(*z):
        end=aggregate(prices(z),ticks)
        return tuple((end[i]-target)/scale for i,target in zip(fixed,targets))
    errors=[]
    for guess in [0,mp.mpf('-0.5'),mp.mpf('0.5'),mp.mpf('-2')]:
        try:
            z=mp.findroot(equations,tuple(guess for _ in fixed),tol=tolerance**2,maxsteps=150)
            p=prices(list(z)); baskets=[supporting_basket(p,t) for t in ticks]; end=aggregate(p,ticks)
            error=max(abs(end[i]-target) for i,target in zip(fixed,targets))
            if error>tolerance*scale: raise ArithmeticError('constraint residual')
            virtual=sum(geometry(n,t)['virtual'] for t in ticks)
            output=x[token_out]-end[token_out]
            if output<=0 or end[token_out]<virtual-tolerance*scale: raise ValueError('unfunded output')
            gap=verify_baskets(end,baskets,ticks,p)*scale*max(p)
            return dict(output=output,end=end,prices=p,baskets=baskets,constraint_error=error,dual_gap=gap,precision=mp.dps)
        except (ValueError,ZeroDivisionError,ArithmeticError) as exc: errors.append(str(exc))
    raise ValueError('No admissible positive-price dual solution: '+errors[-1])
