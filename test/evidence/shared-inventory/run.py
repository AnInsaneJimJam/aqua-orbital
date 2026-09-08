"""Run a byte-copied pinned all-interior router closure, never shared Forge files."""
import datetime
import hashlib
import gzip
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time

ROOT=Path(__file__).resolve().parents[3]
CONTRACTS=ROOT/'packages/contracts'
WORK=ROOT/'.cache/shared-inventory'
HERE=Path(__file__).resolve().parent
TEST=CONTRACTS/'test/SharedInventory.t.sol'
IMPORT=re.compile(r'\bimport\s+(?:[^;]*?\sfrom\s+)?["\']([^"\']+)["\']\s*;')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,text):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8',newline='\n')
def closure():
    remaps=[tuple(line.strip().split('=',1)) for line in (CONTRACTS/'remappings.txt').read_text().splitlines() if '=' in line]
    pending=[TEST];seen={}
    while pending:
        source=pending.pop().resolve()
        if source in seen:continue
        seen[source]=sha(source)
        for name in IMPORT.findall(source.read_text(encoding='utf-8')):
            if name.startswith('.'):target=source.parent/name
            else:
                matches=[(prefix,target) for prefix,target in remaps if name.startswith(prefix)]
                if not matches:raise ValueError(f'unresolved import {name}')
                prefix,base=max(matches,key=lambda row:len(row[0]));target=CONTRACTS/base/name[len(prefix):]
            pending.append(target)
    return {p.relative_to(ROOT).as_posix():digest for p,digest in sorted(seen.items())}
def main(stage):
    if stage not in ('smoke','fuzz'):raise ValueError('smoke or fuzz')
    runs,depth=64,64
    snapshot=WORK/'snapshot';pins=HERE/'source-pins.json';archive=HERE/'source-snapshot.tar.gz'
    if not pins.exists():
        originals=closure()
        for name,digest in originals.items():
            target=snapshot/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/name).read_bytes());assert sha(target)==digest
        write(pins,json.dumps(originals,indent=2)+'\n')
    originals=json.loads(pins.read_text())
    # Only our test may evolve during development; every protocol/upstream byte
    # remains frozen even if independent agents promote the mixed router later.
    test_name=TEST.relative_to(ROOT).as_posix()
    # Retain the frozen protocol/upstream bytes, rather than assuming a later
    # checkout still has this pre-mixed-integration source graph. Never use
    # extractall: authenticate the exact member set and bytes before writing.
    frozen={name:digest for name,digest in originals.items() if name!=test_name}
    if archive.exists():
        with tarfile.open(archive,'r:gz') as bundle:
            assert {item.name for item in bundle.getmembers()}==set(frozen)
            for name,digest in frozen.items():
                item=bundle.getmember(name);assert item.isfile()
                payload=bundle.extractfile(item).read();assert hashlib.sha256(payload).hexdigest()==digest
                target=snapshot/name
                if not target.exists():target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(payload)
    else:
        buffer=io.BytesIO()
        with tarfile.open(fileobj=buffer,mode='w',format=tarfile.USTAR_FORMAT) as bundle:
            for name,digest in sorted(frozen.items()):
                payload=(snapshot/name).read_bytes();assert hashlib.sha256(payload).hexdigest()==digest
                item=tarfile.TarInfo(name);item.size=len(payload);item.mode=0o644;bundle.addfile(item,io.BytesIO(payload))
        archive.write_bytes(gzip.compress(buffer.getvalue(),mtime=0))
    (snapshot/test_name).parent.mkdir(parents=True,exist_ok=True);(snapshot/test_name).write_bytes(TEST.read_bytes())
    for name,digest in originals.items():
        if name!=test_name:assert sha(snapshot/name)==digest, f'pinned source changed: {name}'
    remaps=[]
    for line in (CONTRACTS/'remappings.txt').read_text().splitlines():
        if '=' not in line:continue
        prefix,target=line.split('=',1);resolved=(CONTRACTS/target).resolve();remaps.append(prefix+'=snapshot/'+resolved.relative_to(ROOT).as_posix()+'/')
    config_text='[profile.default]\nsrc="snapshot/packages/contracts/src"\ntest="snapshot/packages/contracts/test"\nout="out"\ncache_path="compile-cache"\nlibs=[]\nsolc_version="0.8.30"\noptimizer=true\noptimizer_runs=700\nvia_ir=true\nevm_version="cancun"\nremappings='+json.dumps(remaps)+'\n[profile.ci]\ninvariant.runs=256\ninvariant.depth=128\n[profile.release]\ninvariant.runs=1024\ninvariant.depth=256\n'
    write(WORK/'foundry.toml',config_text)
    env={k:v for k,v in os.environ.items() if not k.startswith(('FOUNDRY_','DAPP_'))}
    env.update(FOUNDRY_PROFILE='default',FOUNDRY_INVARIANT_RUNS=str(runs),FOUNDRY_INVARIANT_DEPTH=str(depth),FOUNDRY_INVARIANT_FAIL_ON_REVERT='true',FOUNDRY_INVARIANT_CALL_OVERRIDE='false')
    env['FOUNDRY_INVARIANT_FAILURE_PERSIST_DIR']='failures'
    env['FOUNDRY_FUZZ_RUNS']='64'
    env['FOUNDRY_FUZZ_FAIL_ON_REVERT']='true'
    config=json.loads(subprocess.check_output(['forge','config','--json'],cwd=WORK,env=env))
    assert config['invariant']['runs']==runs and config['invariant']['depth']==depth
    assert config['invariant']['fail_on_revert'] is True and config['invariant']['call_override'] is False
    assert config['fuzz']['runs']==64 and config['fuzz']['fail_on_revert'] is True
    write(HERE/f'{stage}-config.json',json.dumps(config,indent=2)+'\n')
    inputs={(snapshot/name).relative_to(ROOT).as_posix():sha(snapshot/name) for name in originals}
    for p in [Path(__file__).resolve(),pins,archive,WORK/'foundry.toml',TEST]:
        inputs[p.relative_to(ROOT).as_posix()]=sha(p)
    command=['forge','test','--match-contract','^SharedInventoryTest$','--match-test','^testDeterministic' if stage=='smoke' else '^testFuzz', '--fuzz-seed','0x20260908','--threads','2','--offline','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
    try:
        run=subprocess.run(command,cwd=WORK,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=1800)
        output=run.stdout;status=run.returncode
    except subprocess.TimeoutExpired as error:output=error.stdout or b'';status='timeout'
    (HERE/f'{stage}.txt').write_bytes(output)
    changed=[name for name,digest in inputs.items() if sha(ROOT/name)!=digest]
    copied_paths={p.relative_to(snapshot).as_posix() for p in snapshot.rglob('*.sol')}
    changed += sorted(copied_paths^set(originals))
    artifact=WORK/'out/SharedInventory.t.sol/SharedInventoryTest.json'
    metadata=json.loads(json.loads(artifact.read_text())['rawMetadata']) if artifact.exists() else None
    result={'stage':stage,'started_at':started,'runtime_seconds':time.perf_counter()-clock,'command':command,'fuzz_runs':64 if stage=='fuzz' else 0,'successful_swaps_per_sequence':35,'seed':'0x20260908','exit_status':status,'inputs':inputs,'changed_inputs':changed,'stdout_sha256':sha(HERE/f'{stage}.txt'),'effective_config_sha256':sha(HERE/f'{stage}-config.json'),'forge_version':subprocess.check_output(['forge','--version']).decode().strip(),'artifact_compiler':metadata['compiler'] if metadata else None}
    write(HERE/f'{stage}.json',json.dumps(result,indent=2)+'\n');sys.stdout.buffer.write(output)
    if changed:raise RuntimeError(f'input source closure changed: {changed}')
    return status if isinstance(status,int) else 1
if __name__=='__main__':raise SystemExit(main(sys.argv[1]))
