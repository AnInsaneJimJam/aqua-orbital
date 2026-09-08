"""Freeze authored inputs around SDK and complete frontend swap verification.

Next-generated next-env.d.ts and build caches are excluded explicitly. This
runner makes no live Privy/Arc claim and never configures a signing key.
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

root = Path(__file__).resolve().parents[1]
out = root / 'test/evidence/swap-flow'
out.mkdir(parents=True, exist_ok=True)
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def inputs():
    names = set()
    for args in (['git','ls-files','-z'], ['git','ls-files','--others','--exclude-standard','-z']):
        names.update(subprocess.check_output(args,cwd=root).decode().split('\0'))
    return [{'path':name,'sha256':digest(root/name)} for name in sorted(names) if name and name!='apps/web/next-env.d.ts' and (
        (name.startswith(('apps/','packages/')) and Path(name).suffix in {'.ts','.tsx','.css','.json','.sql','.sol','.toml','.yaml','.yml'})
        or name in {'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json','scripts/audit-payment-ui.py','scripts/audit-swap-ui.py','scripts/recorded_command.py'})]
node,pnpm=shutil.which('node'),shutil.which('pnpm')
if not node or not pnpm:
    raise SystemExit('Pinned Node and pnpm required')
if os.environ.get('PLAYWRIGHT_BASE_URL') or os.environ.get('ORBITAL_E2E'):
    raise SystemExit('Run with a fresh Playwright-owned development server and normal production build environment')
commands=[
    ('sdk',[node,'packages/sdk/node_modules/tsx/dist/cli.mjs','--test',*sorted(p.relative_to(root).as_posix() for p in (root/'packages/sdk/test').glob('*.test.ts'))]),
    ('shared',[node,'packages/shared/node_modules/tsx/dist/cli.mjs','--test',*sorted(p.relative_to(root).as_posix() for p in (root/'packages/shared/test').glob('*.test.ts'))]),
    ('browser',[pnpm,'--filter','@orbital/web','exec','playwright','test','--reporter=line']),
    ('build',[pnpm,'--filter','@orbital/web','build']),
    ('types',[pnpm,'typecheck']),
]
record={'schemaVersion':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'parentCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        'scope':'SDK/shared and workspace types; complete Chromium fixture suite; production compilation. No real wallet or financial receipt verification.',
        'exclusions':['Next-generated next-env.d.ts and build caches','Installed dependency bytes and external runtime state','No new API, Solidity or numerical campaign'],
        'inputs':inputs(),'runs':[],'accepted':False}
for label,command in commands:
    print(f'Running {label}',flush=True)
    started=time.perf_counter()
    path=out/f'{label}.txt'
    result=run_recorded(command,root,path,timeout=600)
    record['runs'].append({'label':label,'command':command,**result,'seconds':round(time.perf_counter()-started,3),'transcript':path.relative_to(root).as_posix(),'sha256':digest(path)})
    record['inputsUnchanged']=record['inputs']==inputs()
    (out/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    if result['exitStatus'] or not result['terminal'] or not record['inputsUnchanged']:
        raise SystemExit(f'{label} failed or source inputs changed; retained checkpoint is not accepted')
record['accepted']=True
(out/'checkpoint.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'accepted':True,'inputs':len(record['inputs']),'runs':len(record['runs'])}),flush=True)
