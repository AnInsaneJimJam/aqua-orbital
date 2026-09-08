"""Record a full local Foundry checkpoint without inheriting profile overrides."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / 'packages/contracts'
OUT = ROOT / 'test/evidence'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inputs():
    paths = {Path(__file__).resolve(), ROOT/'pnpm-lock.yaml', CONTRACTS/'foundry.toml', CONTRACTS/'remappings.txt', CONTRACTS/'package.json'}
    for directory in ['src', 'test', 'vendor/aqua', 'vendor/swap-vm-orbital', 'vendor/forge-std',
                      'node_modules/@openzeppelin/contracts', 'node_modules/@1inch/solidity-utils']:
        paths.update(p for p in (CONTRACTS/directory).rglob('*.sol') if p.is_file())
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(paths)}

before = inputs()
env = {k:v for k,v in os.environ.items() if not k.startswith(('FOUNDRY_', 'DAPP_', 'ETHERSCAN_'))
       and k not in ['ETH_RPC_URL', 'ETH_RPC_JWT']}
env.update(FOUNDRY_PROFILE='default', FOUNDRY_INVARIANT_FAIL_ON_REVERT='true', FOUNDRY_GAS_SNAPSHOT_CHECK='false')
command = ['forge', 'test', '--root', 'packages/contracts', '--offline', '--threads', '2', '--fuzz-seed', '0x20260908']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.perf_counter()
run = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=3600)
runtime = time.perf_counter()-clock
OUT.mkdir(exist_ok=True, parents=True)
log = OUT/'contracts.txt'
log.write_bytes(run.stdout)
after = inputs()
changed = [p for p in sorted(before.keys() | after.keys()) if before.get(p) != after.get(p)]
decoded = run.stdout.decode(errors='replace')
summaries = re.findall(r'Ran (\d+) test suites? in .*?: (\d+) tests passed, (\d+) failed, (\d+) skipped', decoded)
counts = dict(zip(['suites', 'passed', 'failed', 'skipped'], map(int, summaries[-1]))) if summaries else None
valid = run.returncode == 0 and not changed and counts is not None and counts['passed'] > 0 and counts['failed'] == 0 and counts['skipped'] == 0
record = {'schemaVersion':1, 'startedAt':started, 'runtimeSeconds':runtime, 'command':command,
          'environmentOverrides':{k:env[k] for k in ['FOUNDRY_PROFILE', 'FOUNDRY_INVARIANT_FAIL_ON_REVERT', 'FOUNDRY_GAS_SNAPSHOT_CHECK']},
          'forgeVersion':subprocess.check_output(['forge', '--version'], cwd=ROOT, text=True).strip(),
          'repositoryCommit':subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
          'dirty':bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)),
          'inputsBefore':before, 'inputsChanged':changed, 'log':log.relative_to(ROOT).as_posix(), 'logSha256':digest(log),
          'exitCode':run.returncode, 'counts':counts, 'validCheckpoint':valid,
          'scope':'All default-profile contract tests on the recorded dirty source graph. CI/release fuzz, full mutation, economic ranges, target gas acceptance and live Privy/Arc remain separate.'}
(OUT/'contracts-current.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:record[k] for k in ['runtimeSeconds', 'counts', 'inputsChanged', 'exitCode', 'validCheckpoint']}, indent=2))
if not valid:
    print(decoded[-14000:])
raise SystemExit(0 if valid else 1)
