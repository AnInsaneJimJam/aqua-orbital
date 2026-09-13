import json,hashlib,time,subprocess,argparse
from pathlib import Path
from decimal import Decimal,localcontext,ROUND_CEILING
parser=argparse.ArgumentParser();parser.add_argument('--input',default='test/evidence/local-integration/profile-initializer.json');parser.add_argument('--output',default='test/evidence/local-integration/profile-independent.json');args=parser.parse_args()
source=Path(args.input);rows=json.loads(source.read_text(encoding='utf-8'))['results'];started=time.time()
def check(precision):
 out=[]
 with localcontext() as ctx:
  ctx.prec=precision;D=Decimal;G=2**32;Q=D(2)**128;U=D(2)**64
  for row in rows:
   config=row['config'];n=D(len(config['tokens']));others=n-1;q=D(1)-D(1)/n.sqrt();capital=D(row['allocation'])*D(10)**18*U;ideal=D(0)
   for tick,radius in zip(row['ticks'],config['radiiInternal']):
    key=int(tick['key']);r=D(radius)
    if key==2**64-1:m=D(0)
    else:
     b=D(key)/G;sigma=(1-(n-b)**2/n).sqrt();m=max(D(0),b/n-((n-1)/n).sqrt()*sigma)
     requested=D(tick['reference'].split(' ')[0]);bp=n-(requested+others)/(requested*requested+others).sqrt()
     assert int((bp*G).to_integral_value(rounding=ROUND_CEILING))==key
     d=(n-b)**2;effective=(-others+(others**2-(1-d)*(others**2-d*others)).sqrt())/(1-d)
     assert D(tick['threshold']['lower'])<=effective<=D(tick['threshold']['upper'])
    ideal+=r*(q-m)
   principal=D(row['principalInternal']);assert 0<ideal<=principal<=capital
   for raw,decimals in zip(config['initialAmountsRaw'],config['decimals']):assert int(raw)==int((principal/(D(10)**(18-decimals)*U)).to_integral_value(rounding=ROUND_CEILING))
   out.append({'allocation':row['allocation'],'preset':row['preset'],'keys':[t['key'] for t in row['ticks']],'raw':config['initialAmountsRaw'],'principalUpper':True,'thresholdBracket':True})
 return out
lo=check(110);hi=check(160);assert lo==hi
output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
result={'scope':f'{len(rows)} preset configurations, independent Decimal cap/support calculation at 110 and 160 digits; not a universal initialization or solver proof','status':'passed','cases':lo,'precisionStable':True,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtimeSeconds':time.time()-started}
output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','cases':len(lo),'precisions':[110,160],'seconds':result['runtimeSeconds']}))
