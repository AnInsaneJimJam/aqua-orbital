"""Integer-coordinate embedding of an exact-real regression, not a trade history."""
import json
from pathlib import Path
from mpmath import mp
mp.dps=160
scale=10**40;n=4;R=mp.mpf(2);r=mp.mpf('0.000001');b=2+mp.mpf(2)**-31
sigma=mp.sqrt(1-(b-n)**2/n);S=r*sigma;Ac=(R+r)*b;k=mp.sqrt(3)/2
c=(Ac+3*S/k)/n;v=3*S/4
x=[c+v,c-v/2,c-v/2,c+2*S/k]
data={'precision':mp.dps,'scale':str(scale),'key':str(2**33+2),'radii':[str(scale//10**6),str(2*scale)],'start':[str(int(a*scale)) for a in x],'endOutput':str(int((c-2*S/k)*scale)),'scope':'Floored integer-coordinate fixture with valid endpoints in one partition; no raw-token reachable-history assertion.'}
dest=Path(__file__).resolve().parents[2]/'test/evidence/slack-fixture.json'
dest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(json.dumps(data))
