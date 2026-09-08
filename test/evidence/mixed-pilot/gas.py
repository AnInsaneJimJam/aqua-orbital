"""Re-measure the existing complete-settlement benchmark on the frozen source graph."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
checkpoint = json.loads((ROOT/'test/evidence/contracts-current.json').read_text())
assert checkpoint['validCheckpoint'] and checkpoint['inputsChanged'] == []
inputs = dict(checkpoint['inputsBefore'])
inputs[Path(__file__).relative_to(ROOT).as_posix()] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def verify():
    for path, digest in inputs.items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest() == digest, path


verify()
env = {k: v for k, v in os.environ.items() if not k.startswith(('FOUNDRY_', 'DAPP_', 'ETHERSCAN_'))
       and k not in ['ETH_RPC_URL', 'ETH_RPC_JWT']}
env['FOUNDRY_PROFILE'] = 'default'
command = ['forge', 'test', '--root', 'packages/contracts', '--offline', '--match-contract', 'MixedExecutionTest',
           '--match-test', 'testCompleteMixedSwapGasAndLinkedRuntimeSizes', '-vv']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.perf_counter()
run = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
runtime = time.perf_counter()-clock
(HERE/'gas.txt').write_bytes(run.stdout)
verify()
log = run.stdout.decode(errors='replace')
assert run.returncode == 0 and re.search(r'1 tests passed, 0 failed, 0 skipped', log), log[-5000:]
metrics = dict((name, int(value)) for name, value in re.findall(r'(first_complete_external_swap_gas|second_complete_external_swap_gas): (\d+)', log))
assert len(metrics) == 2
sizes = list(map(int, re.findall(r'runtime_bytes: (\d+)', log)))
assert len(sizes) == 5 and all(0 < size <= 24576 for size in sizes)
record = {'startedAt': started, 'runtimeSeconds': runtime, 'command': command, 'exitCode': run.returncode,
          'inputs': inputs, 'metrics': metrics, 'runtimeBytesInTestGraphOrder': sizes,
          'testGraphOrder': ['Router', 'Storage', 'Settlement', 'Composition', 'Endpoint'],
          'logSha256': hashlib.sha256(run.stdout).hexdigest(),
          'scope': 'Existing n3/three-tick cold external Router/Aqua settlement calls; excludes transaction intrinsic and minimum forwarding headroom, not worst-range/Arc acceptance.'}
(HERE/'gas.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'metrics': metrics, 'runtimeBytes': sizes, 'runtimeSeconds': runtime}, indent=2))
