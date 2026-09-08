"""Isolated outward-retention experiment: snapshot, RED, GREEN, regressions.

Main sources/configuration are read-only. Every run records their byte hashes;
the immutable baseline is retained independently of the modified copy.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
WORK = ROOT / '.cache/outward-retention'
CORE = ROOT / 'packages/contracts/src/libraries'
TESTS = ['RootBracket', 'PayoutBracket', 'PayoutEndpoint', 'FrontierEndpoint',
         'FrontierComposition', 'FrontierCompositionGas', 'SlackGridRelease',
         'FrontierSchedule', 'FrontierTurn', 'LinkedMath', 'SeedProposal']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode('utf-8'))


def initialize():
    if (WORK/'snapshot.json').exists():
        raise RuntimeError('Snapshot already exists; use its frozen inputs.')
    files = []
    pending = ['FrontierComposition.sol']
    seen = set()
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        path = CORE/name
        files.append(path)
        text = path.read_text()
        pending.extend(re.findall(r'from "\./([^\"]+)"', text))
        for area in ['src', 'baseline']:
            destination = WORK/area/'libraries'/name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(path.read_bytes())
    for name in TESTS:
        path = ROOT/f'packages/contracts/test/{name}.t.sol'
        if path.exists():
            files.append(path)
            destination = WORK/'test'/path.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(path.read_bytes())
    path = ROOT/'packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol'
    files.append(path)
    destination = WORK/'test/fixtures'/path.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(path.read_bytes())
    files.extend(ROOT/p for p in ['packages/contracts/foundry.toml',
                                 'packages/contracts/remappings.txt',
                                 'docs/audits/OUTWARD_RETENTION_PROPOSAL.md',
                                 'packages/reference/fixtures_outward_retention.py',
                                 'packages/reference/tests/test_outward_retention.py',
                                 'packages/reference/fixtures_frontier_composition.py',
                                 'packages/reference/orbital.py'])
    write(WORK/'snapshot.json', json.dumps([
        {'path':p.relative_to(ROOT).as_posix(), 'sha256':sha(p)} for p in files
    ], indent=2)+'\n')


def shape():
    epath = WORK/'src/libraries/FrontierEndpoint.sol'
    etext = (WORK/'baseline/libraries/FrontierEndpoint.sol').read_text()
    etext = etext.replace('uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;',
        'uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;\n'
        '        uint8 actualBoundaryCount;uint8 retentionCrossings;')
    write(epath, etext)
    cpath = WORK/'src/libraries/FrontierComposition.sol'
    ctext = (WORK/'baseline/libraries/FrontierComposition.sol').read_text()
    ctext = ctext.replace('bool initialRelease;}', 'bool initialRelease;bool finalRetention;}')
    ctext = ctext.replace('uint8 releaseCrossings;uint8 frontierCrossings;',
                          'uint8 releaseCrossings;uint8 frontierCrossings;uint8 retentionCrossings;')
    ctext = ctext.replace('.key,true,true);', '.key,true,true,false);')
    ctext = ctext.replace('.candidate.inward,false);', '.candidate.inward,false,false);')
    write(cpath, ctext)


def prepare_test():
    sys.path.insert(0, str(ROOT/'packages/reference'))
    from fixtures_outward_retention import corpus
    one, seven = corpus(110)['cases']
    assert corpus(110) == corpus(160)
    witness = {'one':one, 'seven':seven}
    write(WORK/'oracle.json', json.dumps(witness, indent=2)+'\n')
    text = (HERE/'Prototype.t.sol.in').read_text()
    for label, case in witness.items():
        w = case['witness']
        for key, value in {'ROOT':w['final']['root_floor_grid'],
                           'SHORTFALL':w['shortfall_ceil'],
                           'SLACK':w['radial_slack_ceil']}.items():
            text = text.replace(f'__{label.upper()}_{key}__', str(value))
    write(WORK/'test/OutwardRetentionPrototype.t.sol', text)


def run(stage):
    prepare_test()
    env = dict(os.environ)
    for key, path in {'FOUNDRY_SRC':WORK/'src', 'FOUNDRY_TEST':WORK/'test',
                      'FOUNDRY_OUT':WORK/'out', 'FOUNDRY_CACHE_PATH':WORK/'cache'}.items():
        env[key] = Path(os.path.relpath(path, ROOT/'packages/contracts')).as_posix()
    command = ['forge', 'test', '--threads', '2', '--fuzz-seed', '0x20260908', '-vv']
    if stage != 'regression':
        command += ['--match-contract', '^OutwardRetentionPrototypeTest$']
    else:
        # These two historical assertions require precisely the deferral this
        # experiment replaces. Their inputs and stronger new assertions remain
        # in the explicit prototype suite; no other historical test is excluded.
        command += ['--no-match-test', 'testRoundedKeyArrivalRequiresRepartition|testRoundedCanonicalPrefixMismatchRemainsExplicitlyDeferred']
    inputs = json.loads((WORK/'snapshot.json').read_text())
    for item in inputs:
        if sha(ROOT/item['path']) != item['sha256']:
            raise RuntimeError(('Frozen input changed', item['path']))
    generated = [{'path':p.relative_to(ROOT).as_posix(), 'sha256':sha(p)}
                 for area in ['src', 'baseline', 'test']
                 for p in sorted((WORK/area).rglob('*.sol'))]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    before = time.perf_counter()
    result = subprocess.run(command, cwd=ROOT/'packages/contracts', env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    elapsed = time.perf_counter()-before
    (WORK/f'{stage}.txt').write_bytes(result.stdout)
    for item in inputs+generated:
        if sha(ROOT/item['path']) != item['sha256']:
            raise RuntimeError(('Input changed during run', item['path']))
    artifacts = []
    for name in ['FrontierComposition', 'FrontierEndpoint', 'RetentionClient']:
        paths = list((WORK/'out').rglob(name+'.json'))
        if not paths:
            continue
        path = max(paths, key=lambda p:len(json.loads(p.read_text())['deployedBytecode']['object']))
        artifact = json.loads(path.read_text())
        artifacts.append({'name':name, 'path':path.relative_to(ROOT).as_posix(),
            'runtime_bytes':len(artifact['deployedBytecode']['object'].removeprefix('0x'))//2,
            'links':artifact['deployedBytecode'].get('linkReferences',{}), 'sha256':sha(path)})
    manifest = {'stage':stage, 'started_at':started, 'runtime_seconds':elapsed,
        'command':command, 'environment':{k:env[k] for k in env if k.startswith('FOUNDRY_')},
        'returncode':result.returncode, 'source_inputs':inputs, 'generated_sources':generated,
        'generator_sha256':sha(Path(__file__)), 'template_sha256':sha(HERE/'Prototype.t.sol.in'),
        'patch_generator_sha256':sha(HERE/'promote_copy.py'),
        'oracle_sha256':sha(WORK/'oracle.json'), 'artifacts':artifacts,
        'stdout_sha256':sha(WORK/f'{stage}.txt')}
    write(WORK/f'{stage}.json', json.dumps(manifest, indent=2)+'\n')
    sys.stdout.buffer.write(result.stdout)
    sys.stdout.buffer.flush()
    print(json.dumps(artifacts, indent=2))
    return result.returncode


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'init':
        initialize();shape()
    else:
        raise SystemExit(run(action))
