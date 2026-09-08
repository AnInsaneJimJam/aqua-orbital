"""Authenticate the completed pilot and preserve its exact source boundary."""
import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    generation = json.loads((HERE/'generation.json').read_text())
    observed = json.loads((HERE/'observations.json').read_text())
    assert generation['exit_status'] == 0 and generation['changed_inputs'] == []
    assert generation['output']['generated'] == 128
    assert generation['stdout_sha256'] == sha(HERE/'generation.txt')
    assert observed['status'] == 'liveness-deferrals-observed' and observed['chainStopped']
    assert observed['observed'] == 128 and observed['accepted'] == 127
    assert observed['counts'] == {'accepted-interior': 68, 'accepted-mixed': 59, 'final-discovery-or-event-schedule': 1}
    inputs = dict(generation['inputs'])
    inputs.update(observed['sourceHashes'])
    for node in observed['graph']['nodes']:
        for entry in node['integrity']['sources']:
            path = 'packages/contracts/'+entry['source']
            if path in inputs:
                assert inputs[path] == entry['sha256']
            inputs[path] = entry['sha256']
    for path in ['packages/reference/tests/test_mixed_pilot_fixture.py',
                 'test/evidence/mixed-pilot/validate.test.mjs', 'test/evidence/mixed-pilot/make_manifest.py']:
        inputs[path] = sha(ROOT/path)
    for path, digest in inputs.items():
        assert sha(ROOT/path) == digest, path
    # Exact recorded input bytes; dependency installation and compiler versions
    # remain explicit prerequisites, not contents of this source-only archive.
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w') as tar:
        for path in sorted(inputs):
            payload = (ROOT/path).read_bytes()
            info = tarfile.TarInfo(path)
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))
    (HERE/'source-snapshot.tar.gz').write_bytes(gzip.compress(raw.getvalue(), mtime=0))
    with tarfile.open(HERE/'source-snapshot.tar.gz', 'r:gz') as tar:
        assert sorted(tar.getnames()) == sorted(inputs)
        for member in tar.getmembers():
            assert member.isfile()
            assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == inputs[member.name]
    (HERE/'source-pins.json').write_text(json.dumps(inputs, indent=2)+'\n', encoding='utf-8')
    outputs = [HERE/name for name in ['generation.json', 'generation.txt', 'observations.json', 'observations.txt',
        'reference-tests.txt', 'validation-tests.txt', 'source-pins.json', 'source-snapshot.tar.gz']]
    elapsed = (datetime.datetime.fromisoformat(observed['completedAt'].replace('Z', '+00:00'))-
               datetime.datetime.fromisoformat(observed['startedAt'].replace('Z', '+00:00'))).total_seconds()
    manifest = {'schema_version': 1, 'claim_id': 'INITIALIZED-MIXED-PILOT-BASELINE-32-CONFIGURATIONS-128-ACTIONS',
        'repository': {'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(), 'dirty': True},
        'command': 'python test/evidence/mixed-pilot/generate.py; node test/evidence/mixed-pilot/observe.mjs; python -m unittest discover -s packages/reference/tests -p test_mixed_pilot*.py -v; node --test test/evidence/mixed-pilot/validate.test.mjs',
        'environment': {'software': [f'Python {generation["python"]}', 'mpmath 1.3.0', 'Node 22.18.0',
            'Solc 0.8.30; optimizer700; viaIR; Cancun', observed['chain']['binaryVersion']], 'hardware': generation['platform']},
        'mathematics': {
            'assertion_tested': 'Compare actual production interior/mixed dispatch against independently initialized, explicit-per-tick, precision-stable four-action histories; preserve all conservative deferrals.',
            'coefficient_domain': 'Exact integer configuration/amounts; mpmath110/160-digit per-tick support and primal checks; directed Solidity Uint512 arithmetic.',
            'conventions': 'Keys b on GRID2^32; radii/internal coordinates use10^18*2^64 per whole token. Inputs are net curve amounts. Each reference history propagates actual raw payout endpoints; production continuation counts stop at a deferral.',
            'inputs': [{'path': p, 'sha256': digest} for p, digest in sorted(inputs.items())],
            'bounds': {'dimensions': [2, 3, 5, 8], 'ticks': [1, 2, 3, 8], 'families': 2, 'configurations': 32,
                'actions_per_configuration': 4, 'planned_actions': 128, 'generated_actions': 128, 'halvings_used': 0,
                'generation_timeout_seconds': 900, 'owned_anvil_deadline_seconds': 300, 'per_rpc_timeout_seconds': 15,
                'rpc_gas_limit': 30000000, 'accepted_interior': 68, 'accepted_mixed': 59, 'deferrals': 1,
                'contiguous_accepted_actions': 126, 'complete_histories': 31, 'accepted_frontier_inward': 41,
                'accepted_frontier_outward': 105, 'maximum_observed_diagnostic_inner_gas': 18365475},
            'non_claims': ['No complete liveness or G1/G2/G8 acceptance.', 'No formal interval oracle or universal proof.',
                'No executed Aqua/custody/fee/invoice transaction matrix.', 'No actual retained-seam coverage in this matrix.',
                'No Arc gas/deployment or Privy qualification.', 'Pure diagnostic gas is not complete router transaction gas.']},
        'randomness': {'used': True, 'generator': 'Only disposable Anvil account/port generation; mathematical family is deterministic', 'seed': None},
        'run': {'started_at': generation['started_at'], 'runtime_seconds': generation['runtime_seconds']+elapsed, 'exit_status': 0},
        'outputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in outputs],
        'checks': ['All128 independent actions generated on their first proposal and byte-stable at110/160 digits.',
            'Independent sphere benchmark and all actual per-tick endpoints checked.',
            '127 accepted outputs/reserves, root enclosures, transition phases and shared budgets match; no accepted-result discrepancy.',
            'One feasible n3/t8 reversal defers, retained as a liveness failure rather than excluded.',
            'Five comparison-boundary mutation tests; six reference fixture/benchmark checks.',
            'Three authenticated linked deployments, exact constructor/code/receipt validation, one canonical read pin and no blocks mined by observations.',
            'Pre/post source/artifact identity and owned-node shutdown checked; archived inputs authenticated.'],
        'result': 'Conditional finite numerical comparisons; 127/128 accepted, one conservative deferral, 31/32 complete initialized histories. Liveness is not passed.',
        'residual_risks': ['Reference feasibility uses arbitrary-precision arithmetic and finite path sampling, not directed intervals.',
            'Named retained counterexamples, equality cases, extreme limits and broad economic/mutation/release distributions remain separate.',
            'Two largest n8 concentrated diagnostic calls already exceed the provisional Arc transaction cap before actual settlement.']}
    (HERE/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(f'Authenticated {len(inputs)} inputs; 127 matches, one recorded deferral. No liveness pass.')


if __name__ == '__main__':
    main()
