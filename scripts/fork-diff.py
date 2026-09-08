"""Reproducible diff of the retained baseline against the modified fork."""
import difflib
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
base=root/'packages/contracts/vendor/swap-vm'
fork=root/'packages/contracts/vendor/swap-vm-orbital'
names=sorted({p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file()} | {p.relative_to(fork).as_posix() for p in fork.rglob('*') if p.is_file()})
diff=[];changes=[]
for name in names:
    a=(base/name).read_bytes() if (base/name).exists() else b''
    b=(fork/name).read_bytes() if (fork/name).exists() else b''
    if a==b: continue
    changes.append(dict(path=name,baseline_sha256=hashlib.sha256(a).hexdigest(),fork_sha256=hashlib.sha256(b).hexdigest()))
    diff.extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile=f'swap-vm/{name}',tofile=f'swap-vm-orbital/{name}'))
out=root/'test/evidence';out.mkdir(exist_ok=True,parents=True)
(out/'fork.patch').write_text(''.join(diff),encoding='utf-8',newline='\n')
(out/'fork.json').write_text(json.dumps({'baseline':'f09a41e689240adc645934f965c8061749397cd2','changes':changes,'scope':'Resolver and pre/post hooks only; complete Orbital router and production custom opcodes are not implemented.'},indent=2)+'\n',encoding='utf-8')
print(f'{len(changes)} modified source files; test/evidence/fork.patch')
