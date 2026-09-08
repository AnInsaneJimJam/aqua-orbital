"""Retain a bounded main-graph seed regression run; never edits source."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main(stage):
    if stage not in ('production-red','production-green','production-regression'):
        raise ValueError('unknown stage')
    names=['SeedProposal'] if stage!='production-regression' else ['SeedProposal','FrontierComposition','FrontierEndpoint','PayoutEndpoint','PayoutBracket','RootBracket','SlackCertificate','SlackGridRelease','FrontierSchedule','FrontierTurn','FrontierEvents','LinkedMath','FrontierCompositionGas']
    paths=sorted((ROOT/'packages/contracts/src/libraries').glob('*.sol'))+sorted((ROOT/'packages/contracts/test/fixtures').glob('*.sol'))
    paths += [ROOT/f'packages/contracts/test/{name}.t.sol' for name in names if (ROOT/f'packages/contracts/test/{name}.t.sol').exists()]
    paths += [ROOT/'packages/contracts/foundry.toml',ROOT/'packages/contracts/remappings.txt',Path(__file__).resolve()]
    inputs={p.relative_to(ROOT).as_posix():sha(p) for p in paths}
    env={key:value for key,value in os.environ.items() if not key.startswith(('FOUNDRY_','DAPP_'))}
    env['FOUNDRY_PROFILE']='default'
    command=['forge','test','--match-contract','^('+'|'.join(names)+')Test$','--fuzz-runs','256','--fuzz-seed','0x20260908','--threads','2','--offline','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
    run=subprocess.run(command,cwd=ROOT/'packages/contracts',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
    log=HERE/f'{stage}.txt';log.write_bytes(run.stdout)
    changed=[name for name,digest in inputs.items() if sha(ROOT/name)!=digest]
    result={'stage':stage,'started_at':started,'runtime_seconds':time.perf_counter()-clock,'command':command,'exit_status':run.returncode,'inputs':inputs,'changed_inputs':changed,'stdout_sha256':sha(log)}
    (HERE/f'{stage}.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
    sys.stdout.buffer.write(run.stdout)
    if changed:raise RuntimeError(f'inputs changed: {changed}')
    return run.returncode
if __name__=='__main__':raise SystemExit(main(sys.argv[1]))
