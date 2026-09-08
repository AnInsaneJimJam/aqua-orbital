"""Finish frontend verification after the isolated negative-test typing fix.

Reuse only passed SDK/API/shared commands after proving all their source and
test inputs unchanged. The sole earlier source delta is a browser test's invalid
typed value replaced by an invalid JSON value; all browser tests run again.
"""
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from recorded_command import run_recorded

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'test/evidence/invoice-admin/final/checkpoint.json'
OUT = ROOT/'test/evidence/invoice-admin/completed'
OUT.mkdir(parents=True, exist_ok=True)
if (OUT/'checkpoint.json').exists():
    raise SystemExit('Preserve the previous completion checkpoint before rerunning')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    names = set()
    for args in (['git','ls-files','-z'], ['git','ls-files','--others','--exclude-standard','-z']):
        names.update(subprocess.check_output(args,cwd=ROOT).decode().split('\0'))
    explicit = {'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json','scripts/audit-payment-ui.py',
                'scripts/audit-swap-ui.py','scripts/audit-swap-controls.py','scripts/audit-invoice-admin.py',
                'scripts/finish-invoice-admin.py','scripts/recorded_command.py','scripts/evidence.mjs'}
    return [{'path':name,'sha256':digest(ROOT/name)} for name in sorted(names) if name and name!='apps/web/next-env.d.ts' and (
        name in explicit or name.startswith(('apps/','packages/')) and Path(name).suffix in {'.ts','.tsx','.css','.json','.sql','.sol','.toml','.yaml','.yml','.mjs'})]


base = json.loads(BASE.read_text(encoding='utf-8'))
assert base['inputsUnchanged'] and not base['accepted']
assert [(r['label'],r['exitStatus']) for r in base['runs']] == [('sdk',0),('api',0),('shared',0),('browser',0),('evidence',0),('build',1)]
for run in base['runs']:
    assert run['terminal'] and not run['timedOut']
    assert digest(ROOT/run['transcript']) == run['sha256'], run['transcript']
before = inputs()
old = {r['path']:r['sha256'] for r in base['inputs']}
current = {r['path']:r['sha256'] for r in before}
changed = [p for p in sorted(old.keys() | current.keys()) if old.get(p) != current.get(p)]
assert changed == ['apps/web/test/invoice-admin-storage.spec.ts', 'scripts/finish-invoice-admin.py'], changed
if os.environ.get('PLAYWRIGHT_BASE_URL') or os.environ.get('ORBITAL_E2E'):
    raise SystemExit('Use the owned browser server and normal production build environment')
node,pnpm = shutil.which('node'),shutil.which('pnpm')
assert node and pnpm
commands = [
    ('browser',[pnpm,'--filter','@orbital/web','exec','playwright','test','--reporter=line']),
    ('evidence',[node,'scripts/evidence.mjs']),
    ('build',[pnpm,'--filter','@orbital/web','build']),
    ('types',[pnpm,'typecheck']),
]
record = {'schemaVersion':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope':'Fresh complete frontend/browser/build/type verification; explicitly reused unchanged SDK/API/shared sources and passing commands.',
          'reusedFrom':{'path':BASE.relative_to(ROOT).as_posix(),'sha256':digest(BASE)},
          'deltaSinceEarlierRun':changed,'reusedRuns':[r for r in base['runs'] if r['label'] in ['sdk','api','shared']],
          'inputs':before,'runs':[],'accepted':False,
          'exclusions':base['exclusions']+['Earlier browser test typing differs; all browser checks rerun here.']}
for label,command in commands:
    if label=='evidence':
        shutil.copyfile(OUT/'browser.txt',ROOT/'test/evidence/browser.txt')
    print('Running '+label,flush=True)
    started=time.perf_counter();path=OUT/f'{label}.txt'
    result=run_recorded(command,ROOT,path,timeout=600)
    record['runs'].append({'label':label,'command':command,**result,'seconds':round(time.perf_counter()-started,3),
                          'transcript':path.relative_to(ROOT).as_posix(),'sha256':digest(path)})
    record['inputsUnchanged']=before==inputs()
    (OUT/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    if result['exitStatus'] or not result['terminal'] or not record['inputsUnchanged']:
        raise SystemExit(label+' failed or source inputs changed; checkpoint not accepted')
record['accepted']=True
record['generatedProof']={'path':'test/evidence/builds/proof.json','sha256':digest(ROOT/'test/evidence/builds/proof.json')}
(OUT/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'accepted':True,'inputs':len(before),'freshRuns':len(record['runs']),'reusedUnchangedRuns':len(record['reusedRuns'])}),flush=True)
