"""Freeze source inputs around the payment endpoint's complete TS regressions.

Requires the explicitly configured local TEST_DATABASE_URL and Docker used by
existing SDK deployment tests. Does not configure a deployment or sign a wallet.
"""
import datetime
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'test/evidence/payment-endpoint'
out.mkdir(parents=True, exist_ok=True)
if not os.environ.get('TEST_DATABASE_URL'):
    raise SystemExit('TEST_DATABASE_URL is required; no database tests are skipped')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
names = sorted({name for name in tracked + untracked if name and (
    (name.startswith(('apps/', 'packages/')) and name.endswith(('.ts', '.tsx', '.json', '.sql', '.sol', '.toml', '.yaml', '.yml')))
    or name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
                'scripts/audit-payment-endpoint.py', 'docs/audits/PAYMENT_SERVICE_REVIEW.md'])})
before = [{'path': name, 'sha256': digest(root / name)} for name in names]
node = shutil.which('node')
pnpm = shutil.which('pnpm')
if not node or not pnpm:
    raise SystemExit('Pinned node and pnpm toolchain required')
commands = [
    ('api', [node, 'apps/api/node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1', *sorted(p.as_posix() for p in Path('apps/api/test').glob('*.test.ts'))]),
    ('sdk', [node, 'packages/sdk/node_modules/tsx/dist/cli.mjs', '--test', *sorted(p.as_posix() for p in Path('packages/sdk/test').glob('*.test.ts'))]),
    ('shared', [node, 'packages/shared/node_modules/tsx/dist/cli.mjs', '--test', *sorted(p.as_posix() for p in Path('packages/shared/test').glob('*.test.ts'))]),
    ('types', [pnpm, 'typecheck']),
]
manifest = {
    'schemaVersion': 1, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'repository': {'parentCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(), 'dirty': True},
    'scope': 'Complete API/SDK/shared regressions and workspace types; pre/post byte hashes of enumerated source/configuration/fixture inputs. Local database and RPC fixtures are not live payment receipts.',
    'environment': {'platform': platform.platform(), 'python': platform.python_version(),
                    'node': subprocess.check_output([node, '--version'], text=True).strip(),
                    'pnpm': subprocess.check_output([pnpm, '--version'], text=True).strip(),
                    'database': 'Explicit TEST_DATABASE_URL; each database fixture owns an isolated schema. Credentials omitted.'},
    'inputs': before, 'runs': [],
    'nonClaims': ['No universal numerical proof or full release campaign', 'No Privy wallet execution or Arc deployment',
                  'No frontend/browser verification in this run', 'No hash freeze of compiler caches, installed dependency contents, Docker images or external database state'],
}
failed = False
for label, command in commands:
    started = time.perf_counter()
    print(f'Running {label}', flush=True)
    run = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    path = out / f'{label}.txt'
    path.write_bytes(run.stdout)
    contents = run.stdout.decode(errors='replace')
    counts = {key: int(re.findall(rf'(?:#|ℹ) {key} (\d+)', contents)[-1]) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped'] if re.findall(rf'(?:#|ℹ) {key} (\d+)', contents)}
    good = run.returncode == 0 and (label == 'types' or (counts.get('pass', 0) > 0 and counts.get('fail') == 0 and counts.get('cancelled') == 0 and counts.get('skipped') == 0))
    manifest['runs'].append({'label': label, 'command': command, 'runtimeSeconds': time.perf_counter()-started,
                             'exitStatus': run.returncode, 'counts': counts, 'accepted': good,
                             'output': {'path': path.relative_to(root).as_posix(), 'sha256': digest(path)}})
    failed |= not good
    print(f'{label}: exit={run.returncode}, counts={counts}', flush=True)
manifest['changedInputs'] = [row['path'] for row in before if digest(root / row['path']) != row['sha256']]
manifest['inputsUnchanged'] = not manifest['changedInputs']
manifest['accepted'] = not failed and manifest['inputsUnchanged']
(out / 'checkpoint.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Inputs unchanged: {manifest["inputsUnchanged"]}; accepted: {manifest["accepted"]}', flush=True)
sys.exit(0 if manifest['accepted'] else 1)
