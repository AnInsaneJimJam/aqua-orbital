"""Freeze input identity and run the independent 110/160-digit pilot generator."""
import datetime
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    paths = sorted((ROOT/'packages/reference').glob('*.py'))+[
        ROOT/'packages/reference/tests/test_mixed_pilot.py',
        ROOT/'packages/reference/requirements.txt', ROOT/'docs/MATH.md', ROOT/'docs/NUMERICS.md',
        Path(__file__).resolve()]
    inputs = {p.relative_to(ROOT).as_posix(): sha(p) for p in paths}
    command = [sys.executable, '-u', 'packages/reference/fixtures_mixed_pilot.py', '--write']
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    before = time.perf_counter()
    timed_out = False
    with (HERE/'generation.txt').open('wb') as log:
        try:
            run = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=900)
            code = run.returncode
        except subprocess.TimeoutExpired:
            code = 124
            timed_out = True
    changed = [p for p, digest in inputs.items() if sha(ROOT/p) != digest]
    fixture = ROOT/'packages/reference/fixtures/mixed-pilot.json'
    output = None
    if code == 0:
        rows = json.loads(fixture.read_text())
        actions = [a for row in rows['configurations'] for a in row['actions']]
        output = {'path': fixture.relative_to(ROOT).as_posix(), 'sha256': sha(fixture),
                  'configurations': len(rows['configurations']), 'planned_actions': len(actions),
                  'generated': sum(a['status'] == 'generated' for a in actions),
                  'oracle_not_generated': sum(a['status'] == 'oracle_not_generated' for a in actions),
                  'blocked_by_oracle_history': sum(a['status'] == 'blocked_by_oracle_history' for a in actions)}
    result = {'started_at': started, 'runtime_seconds': time.perf_counter()-before,
              'command': command, 'python': platform.python_version(), 'platform': platform.platform(),
              'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
              'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT)),
              'inputs': inputs, 'changed_inputs': changed, 'exit_status': code, 'timed_out': timed_out,
              'timeout_seconds': 900, 'stdout_sha256': sha(HERE/'generation.txt'), 'output': output,
              'scope': 'Numerical oracle generation only; no Solidity execution or infeasibility inference from a failed proposal.'}
    (HERE/'generation.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['runtime_seconds', 'exit_status', 'changed_inputs', 'output']}, indent=2))
    return code if not changed else 1


if __name__ == '__main__':
    raise SystemExit(main())
