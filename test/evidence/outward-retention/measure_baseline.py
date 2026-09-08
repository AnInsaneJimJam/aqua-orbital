"""Measure the frozen, unmodified public-library baseline in its own build.

Uses only the byte-copied snapshot and the unchanged LinkedMath/SeedProposal
tests. The baseline predates the new result fields and retention acceptance.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'.cache/outward-retention'
BASE=WORK/'baseline-project'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    snapshot=json.loads((WORK/'snapshot.json').read_text())
    for p in (WORK/'baseline/libraries').glob('*.sol'):
        target=BASE/'src/libraries'/p.name;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(p.read_bytes())
    for name in ['LinkedMath.t.sol','SeedProposal.t.sol','fixtures/CurvePrimitiveFixtures.sol']:
        p=WORK/'test'/name;target=BASE/'test'/name;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(p.read_bytes())
    inputs=[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)}
            for p in sorted(BASE.rglob('*.sol'))]
    for item in snapshot:
        assert sha(ROOT/item['path'])==item['sha256'],item['path']
    env=dict(os.environ)
    overrides={'FOUNDRY_SRC':BASE/'src','FOUNDRY_TEST':BASE/'test',
               'FOUNDRY_OUT':BASE/'out','FOUNDRY_CACHE_PATH':BASE/'cache'}
    for key,path in overrides.items():env[key]=Path(os.path.relpath(path,ROOT/'packages/contracts')).as_posix()
    command=['forge','test','--threads','2','--fuzz-seed','0x20260908','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();before=time.perf_counter()
    result=subprocess.run(command,cwd=ROOT/'packages/contracts',env=env,
                          stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=600)
    elapsed=time.perf_counter()-before;(WORK/'baseline.txt').write_bytes(result.stdout)
    for item in inputs+snapshot:assert sha(ROOT/item['path'])==item['sha256'],item['path']
    artifacts=[]
    for name in ['FrontierComposition','FrontierEndpoint','LinkedMathClient','SeedLinkedProbe']:
        path=next((BASE/'out').rglob(name+'.json'));a=json.loads(path.read_text())
        artifacts.append({'name':name,'runtime_bytes':len(a['deployedBytecode']['object'].removeprefix('0x'))//2,
                          'sha256':sha(path),'path':path.relative_to(ROOT).as_posix(),
                          'links':a['deployedBytecode'].get('linkReferences',{})})
    manifest={'started_at':started,'runtime_seconds':elapsed,'command':command,
              'environment':{key:env[key] for key in overrides},'returncode':result.returncode,
              'production_snapshot':snapshot,'generated_inputs':inputs,
              'generator_sha256':sha(Path(__file__)),'artifacts':artifacts,
              'stdout_sha256':sha(WORK/'baseline.txt')}
    (WORK/'baseline.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
    sys.stdout.buffer.write(result.stdout);sys.stdout.buffer.flush();print(json.dumps(artifacts,indent=2))
    return result.returncode


if __name__=='__main__':raise SystemExit(main())
