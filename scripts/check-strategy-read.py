"""Lightweight build/type checkpoint after the user deferred broad test campaigns."""
import datetime
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path
from recorded_command import run_recorded

root=Path(__file__).resolve().parents[1]
out=root/'test/evidence/strategy-read/smoke'
out.mkdir(parents=True,exist_ok=True)
if (out/'checkpoint.json').exists():
    raise SystemExit('Preserve the previous smoke checkpoint')
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=json.loads((root/'test/evidence/strategy-read/final/checkpoint.json').read_text(encoding='utf-8'))
inputs=prior['inputs']+[{'path':'scripts/check-strategy-read.py','sha256':digest(Path(__file__))}]
def unchanged():
    return all((root/v['path']).exists() and digest(root/v['path'])==v['sha256'] for v in inputs)
if not unchanged():
    raise SystemExit('Implementation inputs changed since the completed SDK/shared runs')
record={'schemaVersion':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope':'Production compilation and workspace types only; broad test campaigns deferred at user request.',
        'parentCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        'inputs':inputs,'reusedRuns':[v for v in prior['runs'] if v['label'] in ['sdk','shared']],
        'interruptedRun':'test/evidence/strategy-read/final/checkpoint.json','runs':[],'accepted':False}
for label,command in [('build',[shutil.which('pnpm'),'--filter','@orbital/web','build']),('types',[shutil.which('pnpm'),'typecheck'])]:
    print(f'Running {label}',flush=True)
    path=out/f'{label}.txt';started=time.perf_counter()
    result=run_recorded(command,root,path,timeout=600)
    record['runs'].append({'label':label,'command':command,**result,'seconds':round(time.perf_counter()-started,3),
                          'transcript':path.relative_to(root).as_posix(),'sha256':digest(path)})
    record['inputsUnchanged']=unchanged()
    (out/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    if result['exitStatus'] or not result['terminal'] or not record['inputsUnchanged']:
        raise SystemExit(f'{label} did not pass on unchanged inputs')
record['accepted']=True
(out/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print('Build/type checkpoint accepted; no full browser, API or release campaign claim.',flush=True)
