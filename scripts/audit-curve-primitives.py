"""Record bounded scalar/event assertions and exact input/output provenance."""
import datetime
import hashlib
import json
import platform
import subprocess
import time
from pathlib import Path
import mpmath

root=Path(__file__).resolve().parents[1]
out=root/'test/evidence'
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
clock=time.perf_counter()
names=['CurveEvaluation','FrontierEvents','OrbitalMath','TickGeometry','WideMath','SignedWide','IntervalMath']
paths=[root/f'packages/contracts/src/libraries/{name}.sol' for name in names]+[
    root/'packages/contracts/test/CurveEvaluation.t.sol',root/'packages/contracts/test/FrontierEvents.t.sol',
    root/'packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol',root/'packages/contracts/foundry.toml',
    root/'packages/reference/orbital.py',root/'packages/reference/fixtures_curve_primitives.py',
    root/'packages/reference/fixtures/curve-primitives.json',root/'packages/reference/tests/test_curve_primitives.py',
    root/'docs/audits/CURVE_EVALUATION.md',root/'docs/audits/FRONTIER_EVENTS.md',Path(__file__).resolve()]
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
inputs=[{'path':p.relative_to(root).as_posix(),'sha256':digest(p)} for p in paths]
commands=[['forge','test','--root','packages/contracts','--match-contract','^(CurveEvaluationTest|FrontierEventsTest)$','--fuzz-seed','0x20260908','-vv'],
          ['python','-m','unittest','discover','-s','packages/reference/tests','-p','test_curve_primitives.py','-v']]
output_names=['curve-primitives-green.txt','curve-primitives-reference.txt']
codes=[]
for command,name in zip(commands,output_names):
    run=subprocess.run(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
    (out/name).write_bytes(run.stdout)
    print(run.stdout.decode(errors='replace'))
    codes.append(run.returncode)
if any(digest(root/item['path'])!=item['sha256'] for item in inputs):
    raise RuntimeError('Inputs changed during assertion run; rerun after source is stable.')
status=0 if not any(codes) else 1
manifest={
    'schema_version':1,'claim_id':'orbital-scalar-event-primitives-v1',
    'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
                  'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True))},
    'command':'python scripts/audit-curve-primitives.py',
    'environment':{'software':[f'Python {platform.python_version()}',f'mpmath {mpmath.__version__}',
                               subprocess.check_output(['forge','--version'],cwd=root,text=True).splitlines()[0],
                               'Solidity 0.8.30; Cancun; optimizer700; viaIR'],
                   'hardware':f'{platform.system()} {platform.machine()}'},
    'mathematics':{
        'assertion_tested':'Finite outward scalar/normal/root enclosures against precision-stable independent vectors/baskets; explicit physical, partition, zero-price, variance-hole and uncertainty regressions.',
        'coefficient_domain':'Exact checked Solidity integer arithmetic; mpmath real numerical fixtures at 110/160 digits',
        'conventions':'Proof lengths use denominator 2^32; stored length/radius domain remains below 2^160; residuals are signed wide squared proof lengths.',
        'inputs':inputs,
        'bounds':{'dimensions':[2,3,8],'maximum_onchain_dimension':8,'scalar_fixture_count':4,'event_goldens':2,
                  'tests_include_three_ticks':True,'timeout_seconds_per_command':180},
        'non_claims':['No complete swap/traversal or settlement','No universal theorem from finite numerical results',
                      'No complete differential/fuzz/invariant/mutation campaign','No whole-swap gas or one-raw-unit output claim']},
    'randomness':{'used':False,'generator':'','seed':None},
    'run':{'started_at':started,'runtime_seconds':time.perf_counter()-clock,'exit_status':status},
    'outputs':[{'path':(out/name).relative_to(root).as_posix(),'sha256':digest(out/name)} for name in output_names],
    'checks':['110/160-digit integer fixture stability','Exact generated Solidity fixture regeneration',
              'Explicit per-tick reconstructed sphere/cap/principal constraints','Both physical event directions',
              'Real nonphysical roots and uncertain discriminant retained','Exact fractional one-sided partitions',
              'Signed wide residual and normal enclosures','Boundary failure despite positive aggregate normals'],
    'result':'Passed within the recorded finite scope' if status==0 else 'Failed; inspect recorded outputs',
    'residual_risks':['General root/traversal liveness is not established','Independent numerical values are not interval proofs',
                      'Complete output budget and reachable economic-cycle evidence remain outstanding']}
(out/'curve-primitives.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
raise SystemExit(status)
