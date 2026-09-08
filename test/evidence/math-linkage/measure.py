"""Isolated visibility-only linkage experiment; does not edit production sources.

Run from root: python test/evidence/math-linkage/measure.py a|b|c
Generated source/test/out/cache live only in .cache/math-linkage/<variant>.
No changed arithmetic, forged witnesses, range cuts, gas clamps or compiler
settings: variants change only the named internal visibility to public.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import datetime

ROOT=Path(__file__).resolve().parents[3]
CORE=ROOT/'packages/contracts/src/libraries'
VARIANTS={
    'a': {'FrontierComposition':['certify']},
    'b': {'FrontierComposition':['certify'], 'FrontierEndpoint':['exactInput','exactInputForPayout','resumeExactInput','identifyInitial']},
    'c': {'FrontierComposition':['certify'], 'FrontierEndpoint':['exactInput','exactInputForPayout','resumeExactInput','identifyInitial'], 'SlackCertificate':['certifyInwardReleaseToGrid'], 'FrontierSchedule':['enumerate']},
}
NORMALIZED_FUNCTIONS=VARIANTS['b']

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main(variant):
    changes=VARIANTS[variant]
    work=ROOT/'.cache/math-linkage'/variant
    (work/'src/libraries').mkdir(parents=True,exist_ok=True)
    (work/'baseline/libraries').mkdir(parents=True,exist_ok=True)
    (work/'test/fixtures').mkdir(parents=True,exist_ok=True)
    pins_path=Path(__file__).with_name('source-pins.json')
    pins=json.loads(pins_path.read_text())
    inputs=[{'path':p.relative_to(ROOT).as_posix(),'sha256':digest(p)} for p in [Path(__file__).resolve(),pins_path,ROOT/'packages/contracts/foundry.toml',ROOT/'packages/contracts/remappings.txt']]
    pending=['FrontierComposition.sol'];seen=set()
    while pending:
        name=pending.pop()
        if name in seen: continue
        seen.add(name)
        source=CORE/name
        inputs.append({'path':source.relative_to(ROOT).as_posix(),'sha256':digest(source)})
        text=source.read_text()
        # The only allowed future source delta is promotion of these five
        # visibilities. Normalize them for the historical internal baseline,
        # then require pinned normalized source identity for the whole closure.
        for function in NORMALIZED_FUNCTIONS.get(source.stem,[]):
            text,count=re.subn(rf'(function {function}\([^\n]*\)) (?:internal|public) pure',r'\1 internal pure',text)
            if count!=1: raise RuntimeError(('baseline visibility',name,function,count))
        if hashlib.sha256(text.encode()).hexdigest()!=pins[name]:
            raise RuntimeError(('unreviewed source body change; historical comparison refused',name))
        (work/'baseline/libraries'/name).write_text(text,encoding='utf-8')
        for imported in re.findall(r'from "\./([^\"]+)"',text): pending.append(imported)
        for function in changes.get(source.stem,[]):
            pattern=rf'(function {function}\([^\n]*\)) internal pure'
            text,count=re.subn(pattern,r'\1 public pure',text)
            if count!=1: raise RuntimeError((name,function,count))
        (work/'src/libraries'/name).write_text(text,encoding='utf-8')
    fixture=ROOT/'packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol'
    inputs.append({'path':fixture.relative_to(ROOT).as_posix(),'sha256':digest(fixture)})
    (work/'test/fixtures'/fixture.name).write_bytes(fixture.read_bytes())
    template=Path(__file__).with_name('Prototype.t.sol.in')
    inputs.append({'path':template.relative_to(ROOT).as_posix(),'sha256':digest(template)})
    text=template.read_text()
    aliases={'FrontierComposition':'C','FrontierEndpoint':'E','SlackCertificate':'P','FrontierSchedule':'F'}
    text=text.replace('__COOL__',''.join(f'vm.cool(address({aliases[name]}));' for name in changes))
    text=text.replace('__SIZE__',''.join(f'emit log_named_uint("{name}_runtime_bytes",address({aliases[name]}).code.length);assertLe(address({aliases[name]}).code.length,24576,"{name} EIP170");' for name in changes))
    (work/'test/Prototype.t.sol').write_text(text,encoding='utf-8')
    env=dict(os.environ)
    for key,value in {'FOUNDRY_SRC':work/'src','FOUNDRY_TEST':work/'test','FOUNDRY_OUT':work/'out','FOUNDRY_CACHE_PATH':work/'cache'}.items():env[key]=Path(os.path.relpath(value,ROOT/'packages/contracts')).as_posix()
    command=['forge','test','--match-contract','^LinkedMathPrototypeTest$','--fuzz-seed','0x20260908','--threads','2','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
    run=subprocess.run(command,cwd=ROOT/'packages/contracts',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
    elapsed=time.perf_counter()-clock
    (work/'run.txt').write_bytes(run.stdout)
    artifacts=[]
    for name in ['FrontierComposition','FrontierEndpoint','SlackCertificate','FrontierSchedule','LinkedMathQuote']:
        files=list((work/'out').rglob(name+'.json'))
        if not files: continue
        chosen=max(files,key=lambda path:len(json.loads(path.read_text())['deployedBytecode']['object']))
        artifact=json.loads(chosen.read_text())
        artifacts.append({'contract':name,'path':chosen.relative_to(ROOT).as_posix(),'runtime_bytes':len(artifact['deployedBytecode']['object'].removeprefix('0x'))//2,'initcode_bytes':len(artifact['bytecode']['object'].removeprefix('0x'))//2,'links':artifact['deployedBytecode'].get('linkReferences',{}),'sha256':digest(chosen)})
    changed=[i['path'] for i in inputs if digest(ROOT/i['path'])!=i['sha256']]
    if changed: raise RuntimeError(('inputs changed during run',changed))
    generated=[{'path':p.relative_to(ROOT).as_posix(),'sha256':digest(p)} for area in ['src','baseline','test'] for p in sorted((work/area).rglob('*.sol'))]
    result={'variant':variant,'visibility_changes':changes,'command':command,'environment_overrides':{k:env[k] for k in ['FOUNDRY_SRC','FOUNDRY_TEST','FOUNDRY_OUT','FOUNDRY_CACHE_PATH']},'started_at':started,'runtime_seconds':elapsed,'returncode':run.returncode,'inputs':inputs,'generated_sources':generated,'artifacts':artifacts,'stdout_sha256':digest(work/'run.txt')}
    (work/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(run.stdout.decode(errors='replace'));print(json.dumps(artifacts,indent=2));print('Measured run:',work/'result.json')
    return run.returncode

if __name__=='__main__': raise SystemExit(main(sys.argv[1]))
