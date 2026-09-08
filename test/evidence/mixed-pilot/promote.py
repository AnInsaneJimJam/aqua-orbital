"""Freeze the post-change differential checkpoint without relabeling baseline evidence."""
import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    generation = read(HERE/'generation.json')
    baseline = read(HERE/'observations.json')
    observed = read(HERE/'promotion.json')
    contracts = read(ROOT/'test/evidence/contracts-current.json')
    gas = read(HERE/'gas.json')
    reference = read(ROOT/'test/evidence/reference-audit/manifest.json')
    assert generation['exit_status'] == 0 and generation['changed_inputs'] == []
    assert generation['output']['generated'] == 128
    assert generation['stdout_sha256'] == sha(HERE/'generation.txt')
    assert generation['output']['sha256'] == sha(ROOT/'packages/reference/fixtures/mixed-pilot.json')
    assert baseline['accepted'] == 127 and baseline['status'] == 'liveness-deferrals-observed'
    for entry in read(HERE/'manifest.json')['outputs']:
        assert sha(ROOT/entry['path']) == entry['sha256'], entry['path']
    assert observed['status'] == 'bounded-pilot-passed' and observed['chainStopped']
    assert observed['observed'] == observed['accepted'] == observed['contiguousAcceptedActions'] == 128
    assert observed['completeHistories'] == 32
    assert observed['counts'] == {'accepted-interior': 68, 'accepted-mixed': 60}
    assert observed['acceptedTransitions'] == {'initialRelease': 0, 'finalRetention': 0, 'frontierInward': 42, 'frontierOutward': 112}
    assert contracts['validCheckpoint'] and contracts['inputsChanged'] == [] and contracts['exitCode'] == 0
    assert contracts['counts']['passed'] > 390 and contracts['counts']['failed'] == contracts['counts']['skipped'] == 0
    assert contracts['logSha256'] == sha(ROOT/contracts['log'])
    assert gas['exitCode'] == 0 and gas['logSha256'] == sha(HERE/'gas.txt')
    assert reference['run']['exit_status'] == 0
    for entry in reference['outputs']:
        assert sha(ROOT/entry['path']) == entry['sha256'], entry['path']
    reference_log = (ROOT/'test/evidence/reference-audit/tests.txt').read_text()
    assert re.search(r'Ran 129 tests\b', reference_log) and re.search(r'^OK\s*$', reference_log, re.M)

    inputs = {}

    def pin(path, digest):
        if path in inputs:
            assert inputs[path] == digest, f'conflicting input: {path}'
        assert sha(ROOT/path) == digest, f'current input differs: {path}'
        inputs[path] = digest

    for group in [generation['inputs'], observed['sourceHashes'], contracts['inputsBefore'], gas['inputs']]:
        for path, digest in group.items():
            pin(path, digest)
    for entry in reference['mathematics']['inputs']:
        pin(entry['path'], entry['sha256'])
    for node in observed['graph']['nodes']:
        assert node['runtimeBytes'] <= 24576
        for entry in node['integrity']['sources']:
            pin('packages/contracts/'+entry['source'], entry['sha256'])
    for path in ['test/evidence/mixed-pilot/promote.py', 'test/evidence/mixed-pilot/validate.test.mjs',
                 'docs/audits/LOWER_SHEET_PROPOSAL.md', 'docs/audits/LOWER_SHEET_REVIEW.md']:
        pin(path, sha(ROOT/path))

    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w') as tar:
        for path in sorted(inputs):
            payload = (ROOT/path).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == inputs[path]
            info = tarfile.TarInfo(path)
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))
    archive = HERE/'promotion-source-snapshot.tar.gz'
    archive.write_bytes(gzip.compress(raw.getvalue(), mtime=0))
    with tarfile.open(archive, 'r:gz') as tar:
        assert sorted(tar.getnames()) == sorted(inputs)
        for member in tar.getmembers():
            assert member.isfile()
            assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == inputs[member.name]
    (HERE/'promotion-source-pins.json').write_text(json.dumps(inputs, indent=2)+'\n', encoding='utf-8')
    maximum = max(observed['observations'], key=lambda x: int(x['result']['innerCallGas']))
    above_cap = [{'id': x['id'], 'inner_gas': int(x['result']['innerCallGas'])}
                 for x in observed['observations'] if int(x['result']['innerCallGas']) > 16777216]
    elapsed = (datetime.datetime.fromisoformat(observed['completedAt'].replace('Z', '+00:00'))-
               datetime.datetime.fromisoformat(observed['startedAt'].replace('Z', '+00:00'))).total_seconds()
    # Preserve bytes even when later checkpoints refresh the repository's
    # current-run paths. Paths inside these raw records identify the original run.
    frozen_outputs = []
    for source, name in [('test/evidence/contracts-current.json', 'contracts.json'),
                         ('test/evidence/contracts.txt', 'contracts.txt'),
                         ('test/evidence/reference-audit/manifest.json', 'reference-manifest.json'),
                         ('test/evidence/reference-audit/tests.txt', 'reference-tests-current.txt')]:
        target = HERE/name
        target.write_bytes((ROOT/source).read_bytes())
        assert sha(target) == sha(ROOT/source)
        frozen_outputs.append(target)
    outputs = [HERE/name for name in ['promotion.json', 'promotion.txt', 'promotion-source-pins.json',
                                     'promotion-source-snapshot.tar.gz', 'manifest.json', 'validation-tests.txt', 'gas.json', 'gas.txt']]
    outputs += frozen_outputs
    manifest = {
        'schema_version': 1, 'claim_id': 'LOWER-SHEET-PROPOSAL-AND-INITIALIZED-MIXED-PILOT-PROMOTION',
        'repository': {'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(), 'dirty': True},
        'command': 'python packages/reference/fixtures_lower_sheet.py; python scripts/audit-contracts.py; python scripts/audit-reference.py; node test/evidence/mixed-pilot/observe-promotion.mjs; python test/evidence/mixed-pilot/promote.py',
        'environment': {'software': [f'Python {generation["python"]}', 'mpmath 1.3.0', 'Node 22.18.0',
            'Solc 0.8.30; optimizer700; viaIR; Cancun', contracts['forgeVersion'], observed['chain']['binaryVersion']], 'hardware': generation['platform']},
        'mathematics': {
            'assertion_tested': 'A bounded arithmetic seed recovers the retained eight-tick reversal while preserving every certificate gate; fresh production dispatch matches every unchanged independent pilot witness.',
            'coefficient_domain': 'Exact pair-difference/Fraction/integer-bisection proposal oracle; independently retained110/160-digit per-tick path witnesses; directed Solidity Uint512 engine.',
            'conventions': 'GRID2^32 keys; radii/reserves10^18*2^64 per whole token; net curve inputs; actual raw payout chaining. Deferral is never infeasibility or an accepted trade.',
            'inputs': [{'path': p, 'sha256': digest} for p, digest in sorted(inputs.items())],
            'bounds': {'dimensions': [2, 3, 5, 8], 'ticks': [1, 2, 3, 8], 'families': 2,
                'configurations': 32, 'actions_per_configuration': 4, 'generated_and_accepted': 128,
                'complete_histories': 32, 'interior': 68, 'mixed': 60, 'frontier_inward': 42, 'frontier_outward': 112,
                'initial_release_and_final_retention': 0, 'refinement_cap': 160, 'crossing_cap': 16,
                'exact_proposal_oracle_cases': 47, 'exact_small_exhaustive_oracle_checks': 625,
                'reference_regressions': 129, 'default_contract_counts': contracts['counts'],
                'default_fuzz_seed': '0x20260908', 'default_fuzz_runs': 256, 'default_invariant_runs': 32, 'default_invariant_depth': 64,
                'owned_anvil_deadline_seconds': 300, 'per_rpc_timeout_seconds': 15, 'rpc_gas_limit': 30000000,
                'maximum_diagnostic_inner_gas': int(maximum['result']['innerCallGas']), 'maximum_gas_case': maximum['id'],
                'n3_three_tick_complete_external_gas': gas['metrics'],
                'observations_above_provisional_arc_cap': above_cap},
            'non_claims': ['No universal liveness or complete proof of the engine.', 'No Aqua/custody/fee/invoice transaction matrix in the pilot.',
                'No initial-release/final-retention transitions in this pilot.', 'No Arc gas/deployment or Privy qualification.',
                'No release/mutation/economic campaign acceptance.', 'Diagnostic inner gas is not full transaction gas.']},
        'randomness': {'used': True, 'generator': 'Foundry default fuzz/invariants; disposable Anvil account/port generation; exact/pilot families deterministic', 'seed': '0x20260908 for Foundry; disposable node entropy not fixed'},
        'run': {'started_at': observed['startedAt'], 'runtime_seconds': elapsed, 'exit_status': 0},
        'outputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in outputs],
        'checks': ['Independent arithmetic/source audit; acceptance predicates and shared-work ledgers preserved.',
            'Exact unequal-coordinate/boundary/wide oracle fixtures and independent small exhaustive controls.',
            'Full default contract regression and129 reference regressions passed with unchanged inputs.',
            'Unchanged baseline fixture;128 outputs/reserves/support gaps/root enclosures/ordered phases/budgets match, no deferrals or reverts.',
            'Three authenticated linked deployments; canonical pinned reads; no observation-mined blocks; pre/post source/code identity; owned node closed.',
            'Historical127/128 baseline preserved with its own source archive; post-change source snapshot authenticated.'],
        'result': 'Finite assertion verified:128/128 matches and32/32 initialized net-input histories. Numerical witness feasibility remains conditional on high precision and finite sampling; general release/gas acceptance is open.',
        'residual_risks': ['Zero/equality and other discovery/order deferrals remain outside this corpus.',
            'Actual mixed economic/invariant/mutation histories and complete transaction gas distributions remain required.',
            'Two largest concentrated n8 observations exceed the provisional Arc transaction cap before full settlement.']}
    (HERE/'promotion-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'inputs': len(inputs), 'accepted': observed['accepted'], 'histories': observed['completeHistories'],
                      'maximum_gas': int(maximum['result']['innerCallGas']), 'above_provisional_cap': above_cap}, indent=2))


if __name__ == '__main__':
    main()
