"""Reproducible diff of the retained baseline against the modified fork."""
import difflib
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
base=root/'packages/contracts/vendor/swap-vm'
fork=root/'packages/contracts/vendor/swap-vm-orbital'
def retained_names(directory):
    # Forge writes gas snapshots beside these immutable source copies.
    return {p.relative_to(directory).as_posix() for p in directory.rglob('*')
            if p.is_file() and p.relative_to(directory).parts[0] != 'snapshots'}
names=sorted(retained_names(base) | retained_names(fork))
diff=[];changes=[]
for name in names:
    a=(base/name).read_bytes() if (base/name).exists() else b''
    b=(fork/name).read_bytes() if (fork/name).exists() else b''
    if a==b: continue
    changes.append(dict(path=name,baseline_sha256=hashlib.sha256(a).hexdigest(),fork_sha256=hashlib.sha256(b).hexdigest()))
    diff.extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile=f'swap-vm/{name}',tofile=f'swap-vm-orbital/{name}'))
out=root/'test/evidence';out.mkdir(exist_ok=True,parents=True)
(out/'fork.patch').write_text(''.join(diff),encoding='utf-8',newline='\n')
(out/'fork.json').write_text(json.dumps({'baseline':'f09a41e689240adc645934f965c8061749397cd2','changes':changes,'excludedGeneratedPaths':['snapshots/'],'scope':'Retained upstream changes are limited to the resolver and pre/post hooks in SwapVM.sol. The separate custom router executes certified interior and mixed paths through local Aqua settlement. Equality/discovery liveness and complete release campaigns remain outstanding.'},indent=2)+'\n',encoding='utf-8')
print(f'{len(changes)} modified source files; test/evidence/fork.patch')
