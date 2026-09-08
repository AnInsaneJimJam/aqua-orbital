"""Snapshot only this test's imports, preserving compiler source-unit names.

No main Forge output/cache writes. The independently generated paper fixture
binds the initialized state and first mixed payout before a behavioral check.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
import time

ROOT=Path(__file__).resolve().parents[3]
CONTRACTS=ROOT/'packages/contracts'
HERE=Path(__file__).resolve().parent
WORK=ROOT/'.cache/mixed-invoice/project'
TEST='test/MixedInvoice.t.sol'
IMPORT=re.compile(r'\bimport\s+(?:[^;]*?\sfrom\s+)?["\']([^"\']+)["\']\s*;')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(value,encoding='utf-8',newline='\n')
def bind():
    fixture=ROOT/'packages/reference/fixtures/reachable-traversal.json'
    j=json.loads(fixture.read_text());initial=j['initial'];first=j['swaps'][0]
    text=(CONTRACTS/TEST).read_text()
    constants=dict(re.findall(r'uint256 constant (\w+)=(\d+);',text))
    assert initial['decimals']==[6,18,6] and list(map(int,initial['keys']))==[3*(1<<32)//2,7*(1<<32)//4,(1<<64)-1]
    assert list(map(int,initial['radii']))==[r*10**18*(1<<64) for r in [100,200,400]]
    assert int(constants['INITIAL_X'])==int(initial['coordinate'])
    assert [int(constants['INITIAL_6']),int(constants['INITIAL_18']),int(constants['INITIAL_6'])]==list(map(int,initial['raw']))
    assert int(constants['GROSS'])==int(first['gross_input_raw']) and int(constants['FEE'])==int(first['fee_raw'])
    assert int(constants['OUTPUT'])==int(first['witness']['output_raw'])
    assert int(first['witness']['input'])==0 and int(first['witness']['output'])==2
    assert int(constants['OUTPUT'])-int(constants['DUE'])==int(constants['REFUND'])
    return fixture
def snapshot():
    remaps=[tuple(line.strip().split('=',1)) for line in (CONTRACTS/'remappings.txt').read_text().splitlines() if '=' in line]
    pending=[TEST];seen={}
    while pending:
        name=pending.pop()
        assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
        if name in seen:continue
        source=CONTRACTS/name;seen[name]={'source':source.resolve().relative_to(ROOT).as_posix(),'sha256':sha(source)}
        for imported in IMPORT.findall(source.read_text(encoding='utf-8')):
            if imported.startswith('.'):target=posixpath.normpath(posixpath.join(posixpath.dirname(name),imported))
            else:
                candidates=[(prefix,path) for prefix,path in remaps if imported.startswith(prefix)]
                if not candidates:raise ValueError(f'unresolved import {imported}')
                prefix,path=max(candidates,key=lambda row:len(row[0]));target=path+imported[len(prefix):]
            pending.append(target)
    for name,item in seen.items():
        target=WORK/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/item['source']).read_bytes());assert sha(target)==item['sha256']
    for name in ['foundry.toml','remappings.txt']:(WORK/name).write_bytes((CONTRACTS/name).read_bytes())
    # The unused stock SwapVM directory is deliberately absent from this
    # import-only snapshot. Preserve its main-build auto-remapping explicitly
    # so metadata settings remain exactly compatible with artifact integrity.
    with (WORK/'remappings.txt').open('a',encoding='utf-8',newline='\n') as stream:stream.write('\nswap-vm/=vendor/swap-vm/src/\n')
    write(HERE/'source-pins.json',json.dumps(seen,indent=2)+'\n')
    return seen
def main():
    fixture=bind();seen=snapshot()
    env={k:v for k,v in os.environ.items() if not k.startswith(('FOUNDRY_','DAPP_'))};env['FOUNDRY_PROFILE']='default'
    config=json.loads(subprocess.check_output(['forge','config','--json'],cwd=WORK,env=env))
    assert config['src']=='src' and config['out']=='out' and config['optimizer_runs']==700 and config['via_ir'] is True and config['evm_version']=='cancun'
    write(HERE/'config.json',json.dumps(config,indent=2)+'\n')
    paths=[WORK/name for name in seen]+[CONTRACTS/TEST,fixture,Path(__file__).resolve(),HERE/'source-pins.json',WORK/'foundry.toml',WORK/'remappings.txt']
    inputs={p.relative_to(ROOT).as_posix():sha(p) for p in paths}
    command=['forge','test','--match-contract','^MixedInvoiceTest$','--threads','2','--offline','--force','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
    run=subprocess.run(command,cwd=WORK,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=900)
    (HERE/'forge.txt').write_bytes(run.stdout)
    changed=[name for name,digest in inputs.items() if sha(ROOT/name)!=digest]
    result={'started_at':started,'runtime_seconds':time.perf_counter()-clock,'command':command,'exit_status':run.returncode,'inputs':inputs,'changed_inputs':changed,'stdout_sha256':sha(HERE/'forge.txt'),'config_sha256':sha(HERE/'config.json'),'forge_version':subprocess.check_output(['forge','--version']).decode().strip()}
    write(HERE/'forge.json',json.dumps(result,indent=2)+'\n');print(run.stdout.decode(),end='')
    assert not changed
    return run.returncode
if __name__=='__main__':raise SystemExit(main())
