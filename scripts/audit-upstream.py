"""Run unchanged pinned SwapVM tests in isolated baseline/fork Foundry roots.

This compares test identities and pass results, not bytecode or gas equality.
The fork intentionally changes dispatch/settlement hooks. Offline compilation
and unchanged local tests need no live RPC or deployment.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / 'packages/contracts'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--suite', choices=['core', 'all'], default='core')
parser.add_argument('--target', choices=['stock', 'fork', 'both'], default='both')
args = parser.parse_args()
targets = ['stock', 'fork'] if args.target == 'both' else [args.target]
evidence = ROOT / 'test/evidence'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def source_inputs():
    inputs = {Path(__file__).resolve(), ROOT / 'pnpm-lock.yaml', CONTRACTS / 'package.json', evidence / 'upstream.json'}
    for directory in ['vendor/swap-vm', 'vendor/swap-vm-orbital', 'vendor/aqua',
                      'vendor/forge-std', 'node_modules/@openzeppelin/contracts',
                      'node_modules/@1inch/solidity-utils']:
        inputs.update(p for p in (CONTRACTS / directory).rglob('*.sol') if p.is_file())
    for name in ['swap-vm', 'swap-vm-orbital']:
        inputs.add(CONTRACTS / 'vendor' / name / 'foundry.toml')
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(inputs)}

before = source_inputs()
# Authenticate every retained baseline file against acquisition evidence.
upstream = json.loads((evidence / 'upstream.json').read_text(encoding='utf-8'))
for name, source in upstream.items():
    for path, expected in source['files'].items():
        if digest(CONTRACTS / 'vendor' / name / path) != expected:
            raise SystemExit(f'Pinned upstream file changed: {name}/{path}')

def test_tree(name):
    directory = CONTRACTS / 'vendor' / name / 'test'
    return {p.relative_to(directory).as_posix(): digest(p) for p in directory.rglob('*') if p.is_file()}

baseline_tests = test_tree('swap-vm')
if not baseline_tests or test_tree('swap-vm-orbital') != baseline_tests:
    raise SystemExit('Fork tests differ from the authenticated upstream test tree')

results = []
for target in targets:
    project = CONTRACTS / 'vendor' / ('swap-vm' if target == 'stock' else 'swap-vm-orbital')
    cache = ROOT / '.cache' / f'upstream-{target}'
    # Inherited test filters or fork URLs must not silently narrow the suite or
    # turn a local source comparison into a live-network test.
    removed = [k for k in os.environ if k.startswith(('FOUNDRY_', 'DAPP_', 'ETHERSCAN_')) or k in ['ETH_RPC_URL', 'ETH_RPC_JWT']]
    env = {k: v for k, v in os.environ.items() if k not in removed}
    overrides = {'FOUNDRY_PROFILE': 'default', 'FOUNDRY_SRC': 'src', 'FOUNDRY_TEST': 'test',
                 'FOUNDRY_ALLOW_PATHS': json.dumps([ROOT.as_posix()]),
                 'FOUNDRY_SNAPSHOTS': (cache / 'snapshots').as_posix(),
                 'FOUNDRY_GAS_SNAPSHOT_CHECK': 'false', 'FOUNDRY_GAS_SNAPSHOT_EMIT': 'true'}
    env.update(overrides)
    command = ['forge', 'test', '--root', str(project), '--out', str(cache / 'artifacts'),
               '--cache-path', str(cache / 'compile-cache'),
               '-R', 'forge-std/=../forge-std/src/',
               '-R', '@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/',
               '-R', '@1inch/solidity-utils/=../../node_modules/@1inch/solidity-utils/',
               '-R', '@1inch/aqua/=../aqua/', '--use', '0.8.30', '--offline', '--evm-version', 'cancun',
               '--optimize', '--optimizer-runs', '700', '--via-ir',
               '--fuzz-runs', '256', '--fuzz-seed', '0x20260908', '--threads', '2']
    if args.suite == 'core':
        command += ['--match-contract', '^(SwapVMTest|SwapVMAquaTest)$']
    log = evidence / f'upstream-{target}-{args.suite}.txt'
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    clock = time.perf_counter()
    print(f'Running {target}/{args.suite}; log: {log.relative_to(ROOT)}', flush=True)
    with log.open('wb') as output:
        run = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
    content = log.read_text(encoding='utf-8', errors='replace')
    summary = re.findall(r'Ran (\d+) test suites?.*: (\d+) tests passed, (\d+) failed, (\d+) skipped', content)
    tests, current = [], None
    for line in content.splitlines():
        suite = re.match(r'Ran \d+ tests? for (.+)$', line)
        if suite:
            current = suite[1]
        test = re.match(r'\[PASS\] (.+) \((?:gas:|runs:)', line)
        if test and current:
            tests.append(f'{current}::{test[1]}')
    counts = dict(zip(['suites', 'passed', 'failed', 'skipped'], map(int, summary[-1]))) if summary else None
    passed = bool(run.returncode == 0 and counts and counts['failed'] == counts['skipped'] == 0
                  and counts['passed'] == len(tests) == len(set(tests)) and len(tests) >= (5 if args.suite == 'core' else 100))
    after = source_inputs()
    changed = sorted(path for path in before.keys() | after.keys() if before.get(path) != after.get(path))
    if test_tree('swap-vm') != baseline_tests or test_tree('swap-vm-orbital') != baseline_tests:
        changed.append('upstream-test-tree')
    if changed:
        passed = False
    result = {'target': target, 'startedAt': started, 'runtimeSeconds': time.perf_counter() - clock,
              'command': command, 'environmentOverrides': overrides, 'removedEnvironmentNames': removed,
              'exitStatus': run.returncode, 'counts': counts, 'testIdentities': sorted(tests),
              'inputsChanged': changed, 'passed': passed,
              'log': log.relative_to(ROOT).as_posix(), 'logSha256': digest(log)}
    results.append(result)
    (evidence / f'upstream-{target}-{args.suite}.json').write_text(json.dumps({
        'schemaVersion': 1, 'inputs': before, 'result': result,
        'scope': 'Unchanged retained upstream tests with project-pinned dependencies/compiler; no network, deployment, full differential equality or Orbital release claim.'
    }, indent=2) + '\n', encoding='utf-8')
    print(f'{target}: {counts}; verified test result: {passed}', flush=True)
    if not passed:
        raise SystemExit(1)

if len(results) == 2:
    equal = results[0]['testIdentities'] == results[1]['testIdentities']
    (evidence / f'upstream-comparison-{args.suite}.json').write_text(json.dumps({
        'schemaVersion': 1, 'suite': args.suite, 'samePassingTestIdentities': equal,
        'runs': [{k: r[k] for k in ['target', 'counts', 'log', 'logSha256']} for r in results],
        'scope': 'Same unchanged upstream tests pass. Assertions govern compared behavior; this is not complete output/state/revert equivalence for every input.'
    }, indent=2) + '\n', encoding='utf-8')
    if not equal:
        raise SystemExit('Baseline and fork executed different tests')
