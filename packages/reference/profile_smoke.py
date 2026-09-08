import json,hashlib,time,subprocess
from pathlib import Path
from decimal import Decimal,localcontext,ROUND_CEILING
source=Path('test/evidence/local-integration/profile-initializer.json');rows=json.loads(source.read_text(encoding='utf-8'))['results'];started=time.time()
def check(precision):
 out=[]
 with localcontext() as ctx:
  ctx.prec=precision;D=Decimal;G=2**32;Q=D(2)**128;U=D(2)**64;q=D(1)-D(1)/D(3).sqrt()
  for row in rows:
   config=row['config'];capital=D(row['allocation'])*D(10)**18*U;ideal=D(0)
   for tick,radius in zip(row['ticks'],config['radiiInternal']):
    key=int(tick['key']);r=D(radius)
    if key==2**64-1:m=D(0)
    else:
     b=D(key)/G;m=(b-(b*b-D(3)*(b-2)**2).sqrt())/3
     requested=D(tick['reference'].split(' ')[0]);bp=D(3)-(requested+2)/(requested*requested+2).sqrt()
     assert int((bp*G).to_integral_value(rounding=ROUND_CEILING))==key
     d=(3-b)**2;effective=(-4+(16-4*(1-d)*(4-2*d)).sqrt())/(2*(1-d))
     assert D(tick['threshold']['lower'])<=effective<=D(tick['threshold']['upper'])
    ideal+=r*(q-m)
   principal=D(row['principalInternal']);assert 0<ideal<=principal<=capital
   for raw,decimals in zip(config['initialAmountsRaw'],config['decimals']):assert int(raw)==int((principal/(D(10)**(18-decimals)*U)).to_integral_value(rounding=ROUND_CEILING))
   out.append({'allocation':row['allocation'],'preset':row['preset'],'keys':[t['key'] for t in row['ticks']],'raw':config['initialAmountsRaw'],'principalUpper':True,'thresholdBracket':True})
 return out
lo=check(110);hi=check(160);assert lo==hi
outdir=Path('test/evidence/local-integration');outdir.mkdir(exist_ok=True)
result={'scope':'Six preset allocations, independent Decimal cap/support calculation at 110 and 160 digits; not a universal initialization or solver proof','status':'passed','cases':lo,'precisionStable':True,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtimeSeconds':time.time()-started}
(outdir/'profile-independent.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','cases':len(lo),'precisions':[110,160],'seconds':result['runtimeSeconds']}))
