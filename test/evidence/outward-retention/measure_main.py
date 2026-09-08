"""Record the authorized main-graph retention promotion checks.

This runs only the named math suites; it never writes deployment configuration
or enables mixed execution in Storage. Source inputs must remain frozen.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
CONTRACTS=ROOT/'packages/contracts'
SUITES=['OutwardRetention','PayoutBracket','PayoutEndpoint','RootBracket',
        'FrontierEndpoint','FrontierComposition','FrontierCompositionGas',
        'SlackGridRelease','FrontierSchedule','FrontierTurn','LinkedMath','SeedProposal']


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main(stage):
    suites=SUITES if stage=='green' else ['OutwardRetention','FrontierEndpoint','FrontierComposition']
    pending=['FrontierComposition.sol'];seen=set();paths=[]
    while pending:
        name=pending.pop()
        if name in seen:continue
        seen.add(name);path=CONTRACTS/'src/libraries'/name;paths.append(path)
        pending.extend(re.findall(r'from "\./([^\"]+)"',path.read_text()))
    paths.extend(CONTRACTS/f'test/{name}.t.sol' for name in suites)
    paths.extend([CONTRACTS/'test/fixtures/CurvePrimitiveFixtures.sol',CONTRACTS/'foundry.toml',
                  CONTRACTS/'remappings.txt',Path(__file__),HERE/'promote_main.py'])
    inputs=[{'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path)} for path in paths]
    command=['forge','test','--threads','2','--fuzz-seed','0x20260908',
             '--match-contract','^('+'|'.join(name+'Test' for name in suites)+')$','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();before=time.perf_counter()
    result=subprocess.run(command,cwd=CONTRACTS,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=600)
    elapsed=time.perf_counter()-before
    (HERE/'runs').mkdir(exist_ok=True);log=HERE/f'runs/main-{stage}.txt';log.write_bytes(result.stdout)
    for item in inputs:assert sha(ROOT/item['path'])==item['sha256'],item['path']
    artifacts=[]
    names=['FrontierComposition','FrontierEndpoint','RetentionTestClient']
    if stage=='green':names.append('LinkedMathClient')
    for name in names:
        path=next((CONTRACTS/'out').rglob(name+'.json'));a=json.loads(path.read_text())
        artifacts.append({'name':name,'runtime_bytes':len(a['deployedBytecode']['object'].removeprefix('0x'))//2,
                          'sha256':sha(path),'path':path.relative_to(ROOT).as_posix(),
                          'links':a['deployedBytecode'].get('linkReferences',{})})
    manifest={'stage':'main-'+stage,'started_at':started,'runtime_seconds':elapsed,'command':command,
              'returncode':result.returncode,'source_inputs':inputs,'artifacts':artifacts,
              'stdout_sha256':sha(log),'environment_overrides':{k:v for k,v in os.environ.items() if k.startswith('FOUNDRY_')},
              'scope':'Named pure-math and linked-consumer promotion; no mixed Storage/router activation or full transaction gas acceptance.'}
    (HERE/f'runs/main-{stage}.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
    sys.stdout.buffer.write(result.stdout);sys.stdout.buffer.flush();print(json.dumps(artifacts,indent=2))
    return result.returncode


if __name__=='__main__':raise SystemExit(main(sys.argv[1]))
