"""Freeze and measure three named pilot cases; never overwrite an earlier run."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import platform
import re
import subprocess
import time
from pathlib import Path
from recorded_command import run_recorded

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / 'packages/contracts'
parser = argparse.ArgumentParser()
parser.add_argument('label', choices=['baseline', 'candidate', 'restored'])
args = parser.parse_args()
out = ROOT / 'test/evidence/pilot-gas' / args.label
out.mkdir(parents=True, exist_ok=True)
assert not any(out.iterdir()), 'Preserve earlier evidence: choose a new reviewed run namespace.'
spec = importlib.util.spec_from_file_location('fixtures', ROOT / 'scripts/generate-pilot-gas-fixtures.py')
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
assert fixtures.OUTPUT.read_bytes() == fixtures.render().encode('utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    paths = {Path(__file__).resolve(), ROOT/'scripts/recorded_command.py', ROOT/'scripts/generate-pilot-gas-fixtures.py',
             ROOT/'pnpm-lock.yaml', CONTRACTS/'foundry.toml', CONTRACTS/'remappings.txt',
             ROOT/'packages/reference/fixtures/mixed-pilot.json', ROOT/'test/evidence/mixed-pilot/generation.json',
             ROOT/'test/evidence/pilot-gas/contract.md'}
    for directory in ['src', 'test', 'vendor/aqua', 'vendor/swap-vm-orbital', 'vendor/forge-std',
                      'node_modules/@openzeppelin/contracts', 'node_modules/@1inch/solidity-utils']:
        paths.update(p for p in (CONTRACTS/directory).rglob('*.sol') if p.is_file())
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(paths)}


for key in list(os.environ):
    if key.startswith(('FOUNDRY_', 'DAPP_', 'ETHERSCAN_')) or key in ['ETH_RPC_URL', 'ETH_RPC_JWT']:
        del os.environ[key]
os.environ.update(FOUNDRY_PROFILE='default', FOUNDRY_GAS_SNAPSHOT_CHECK='false')
command = ['forge', 'test', '--root', 'packages/contracts', '--offline', '--threads', '2', '--match-contract', '^PilotGasTest$', '-vv']
before = inputs()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.perf_counter()
run = run_recorded(command, ROOT, out/'forge.txt', timeout=900)
runtime = time.perf_counter()-clock
after = inputs()
changed = [p for p in sorted(before.keys() | after.keys()) if before.get(p) != after.get(p)]
log = (out/'forge.txt').read_text(encoding='utf-8', errors='replace')
passed = re.findall(r'\[PASS\] (testGas\w+)\(\)', log)
measurements = {}
for name, body in re.findall(r'\[PASS\] (testGas\w+)\(\).*?Logs:\s*(.*?)(?=\[PASS\]|Suite result:|\Z)', log, re.S):
    measurements[name] = {k: int(v) for k, v in re.findall(r'^\s*(\w+): (\d+)\s*$', body, re.M)}
sizes = {}
artifacts = {}
if run['exitStatus'] == 0:
    for name in ['FrontierComposition', 'FrontierEndpoint']:
        path = CONTRACTS / f'out/{name}.sol/{name}.json'
        artifact = json.loads(path.read_text(encoding='utf-8'))
        code = artifact['deployedBytecode']['object'].removeprefix('0x')
        sizes[name] = len(code)//2
        artifacts[path.relative_to(ROOT).as_posix()] = sha(path)
valid = run['exitStatus'] == 0 and run['terminal'] and not changed and len(set(passed)) == 6 and len(measurements) == 6
checkpoint = {'command': command, 'environmentOverrides': {'FOUNDRY_PROFILE': 'default', 'FOUNDRY_GAS_SNAPSHOT_CHECK': 'false'},
              'inputsBefore': before, 'changedInputs': changed, 'run': run, 'measurements': measurements,
              'runtimeBytes': sizes, 'compiledArtifactHashes': artifacts, 'valid': valid}
(out/'checkpoint.json').write_text(json.dumps(checkpoint, indent=2)+'\n', encoding='utf-8')
manifest = {
    'schema_version': 1, 'claim_id': 'PILOT-GAS-'+args.label.upper(),
    'repository': {'commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                   'dirty': bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True))},
    'command': 'python scripts/audit-pilot-gas.py '+args.label,
    'environment': {'software': [subprocess.check_output(['forge','--version'],cwd=ROOT,text=True).strip(),
                               'Solidity 0.8.30; via IR; optimizer 700; Cancun', 'Python '+platform.python_version(), platform.platform()],
                    'hardware': platform.machine()+'; '+platform.processor()},
    'mathematics': {'assertion_tested': 'Three named complete compositions match independent pilot raw outputs/reserves/transitions; measure their bounded gas and phase diagnostics.',
                    'coefficient_domain': 'Solidity checked uint256/int256 with directed 512-bit arithmetic; original internal U=2^64 and GRID=2^32.',
                    'conventions': 'Eight tokens/eight ticks including full anchor; exact raw amounts; coefficients regenerated from keys; phases use fresh memory and may warm library addresses.',
                    'inputs': ['packages/reference/fixtures/mixed-pilot.json', 'packages/contracts/test/fixtures/PilotGasFixtures.sol',
                               'packages/contracts/test/PilotGas.t.sol', str((out/'checkpoint.json').relative_to(ROOT).as_posix())],
                    'bounds': {'configuration': 'n8-t8-concentrated', 'steps': [1,2,3], 'refinements': 160, 'crossings': 16, 'timeout_seconds': 900},
                    'non_claims': ['Not the full 128-action differential campaign.', 'Not a universal proof, feasible-input coverage, full settlement gas or Arc transaction acceptance.',
                                   'Fresh phase measurements are not an additive trace of production composition.']},
    'randomness': {'used': False, 'generator': '', 'seed': None},
    'run': {'started_at': started, 'runtime_seconds': runtime, 'exit_status': run['exitStatus']},
    'outputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in [out/'forge.txt', out/'checkpoint.json']],
    'checks': ['Authenticated oracle-generation inputs and output hash before use.', 'Generated Solidity fixture byte equality.',
               'Six explicit tests; independent raw output/reserves/prefix/transition goldens and shared ledgers.',
               'Pre/post contract/test/vendor/compiler-config input hashes.'],
    'result': 'Bounded measurements passed.' if valid else 'Measurement failed; inspect transcript/checkpoint; no successful gas claim.',
    'residual_risks': ['Excluded router fees/backing/settlement, transaction intrinsic gas and EIP-150 forwarding.',
                       'Other supported cases can cost more; existing mathematical liveness/release gaps remain.']}
(out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'valid': valid, 'runtimeSeconds': runtime, 'changedInputs': changed,
                  'measurements': measurements, 'runtimeBytes': sizes}, indent=2), flush=True)
if not valid:
    print(log[-9000:])
raise SystemExit(0 if valid else 1)
