"""Reproduce the reviewed pure search bounds; no database or live RPC required."""
import datetime
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'test/evidence/payment-search'
out.mkdir(parents=True, exist_ok=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

names = ['apps/api/src/payment-search.ts', 'apps/api/test/payment-search.test.ts',
         'docs/audits/PAYMENT_SEARCH_POLICY.md', 'docs/audits/PAYMENT_SEARCH_REVIEW.md',
         'docs/audits/archive/PAYMENT_QUOTE_PLAN-preimplementation.md',
         'apps/api/package.json', 'apps/api/tsconfig.json', 'tsconfig.base.json',
         'pnpm-lock.yaml', 'scripts/audit-payment-search.py']
inputs = [{'path': name, 'sha256': digest(root / name)} for name in names]
command = ['node', 'apps/api/node_modules/tsx/dist/cli.mjs', '--test', 'apps/api/test/payment-search.test.ts']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.perf_counter()
run = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
runtime = time.perf_counter() - clock
log = out / 'tests.txt'
log.write_bytes(run.stdout)
changed = [entry['path'] for entry in inputs if digest(root / entry['path']) != entry['sha256']]
if changed:
    raise SystemExit(f'Inputs changed during the run: {changed}')
manifest = {
    'schema_version': 1, 'claim_id': 'orbital-payment-sufficient-search-bounded-v1',
    'repository': {'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
                   'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True))},
    'command': 'python scripts/audit-payment-search.py (runs ' + ' '.join(command) + ')',
    'environment': {'software': [subprocess.check_output(['node', '--version'], text=True).strip(), 'tsx 4.23.13',
                                  f'Python {platform.python_version()}'],
                    'hardware': f'{platform.system()} {platform.machine()} {platform.processor()}'},
    'mathematics': {
        'assertion_tested': 'Bounded sufficient-witness retention with exact bigint input search and complete fixed-order stage coverage; no minimum-input or global feasibility assertion.',
        'coefficient_domain': 'JavaScript bigint exact integers; small bounded counters are exact safe integer numbers.',
        'conventions': 'Raw gross input >=2, bound <2^256. Unavailable probes are unknown, not infeasible lower bounds. A non-null callback value is sufficient only under the separately validated-callback hypothesis.',
        'inputs': inputs,
        'bounds': {'eligible_orders': [0, 32], 'maximum_expansions': 8, 'maximum_refinements': 8,
                   'maximum_stages': 16, 'maximum_planned_quote_members': 128,
                   'maximum_planned_quote_batches': 28, 'native_batch_size': 8,
                   'raw_bound': '2 <= B < 2^256', 'positive_seed': 'arbitrary bigint, clamped to [2,B]',
                   'schedule_enumeration': 'Every E in 1..32; representative success/partial-oracle/no-success patterns.',
                   'retained_payload': 'depth 24, expanded nodes 8192, container entries 512, aggregate UTF-16 text units 1048576 including keys; inert plain data only.',
                   'test_timeout_seconds': 60},
        'non_claims': ['No minimum input or global route feasibility proof',
                       'No authentication of callback quote sufficiency or completeness of actual RPC work',
                       'No integrated payment endpoint, canonical final-check or live wallet result',
                       'No universal payload fuzzing or arbitrary proxy/enumeration CPU bound']},
    'randomness': {'used': False, 'generator': '', 'seed': None},
    'run': {'started_at': started, 'runtime_seconds': runtime, 'exit_status': run.returncode},
    'outputs': [{'path': log.relative_to(root).as_posix(), 'sha256': digest(log)}],
    'checks': ['Complete immutable eligible set and reordered outcomes', 'All 32 stage/member/batch ceilings',
               'Distinct clamped expansion/refinement inputs and forced final bound probe',
               'Retained sufficient value despite subsequent unknown probes and callback mutation',
               'Partial-oracle countermodel rejects a minimum-input interpretation',
               'Synchronous cancellation/freshness/final-return checkpoints',
               'Shared-memory, accessor, cycle, typed-array and excessive payload rejection'],
    'result': '16 focused tests passed; conditional pure-search proof is recorded separately' if run.returncode == 0 else 'regression failure: inspect tests.txt',
    'residual_risks': ['Financial sufficiency is a caller obligation, not established by the generic helper',
                       'A probe must settle or abort under the shared service deadline',
                       'The public service still requires actual RPC accounting and canonical invoice/funding/time rechecks']}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(run.stdout.decode(errors='replace'))
print(f'Manifest: {out / "manifest.json"}')
sys.exit(run.returncode)
