"""Retain authorized official HTML with intact TeX; never republish cached text."""
from pathlib import Path
from urllib.request import Request,urlopen
from datetime import datetime,timezone
import hashlib,json,re,html
root=Path(__file__).resolve().parents[1]
url='https://www.paradigm.xyz/2025/06/orbital'
with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as r:
 body=r.read();resolved=r.url
digest=hashlib.sha256(body).hexdigest()
cache=root/'docs/sources/cache';cache.mkdir(parents=True,exist_ok=True)
(cache/f'{digest}.html').write_bytes(body)
text=body.decode('utf-8')
formulas=[html.unescape(v) for v in re.findall(r'<span[^>]*class="katex-math[^\"]*"[^>]*aria-label="([^\"]*)"',text)]
(cache/f'{digest}.tex.txt').write_text('\n\n'.join(formulas),encoding='utf-8')
record={'title':'Orbital','authors':['Dan Robinson','Ciamac Moallemi','Dave White'],'published':'2025-06-02','url':resolved,'checkedAt':datetime.now(timezone.utc).isoformat(),'sha256':digest,'bytes':len(body),'texExpressions':len(formulas),'extraction':'TeX from katex-math aria-label attributes, HTML entity decoded; formulas require independent verification.','retentionBasis':'User explicitly requested source authentication and retention.'}
(root/'docs/sources/orbital.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record,indent=2))
