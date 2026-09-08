"""Run the bounded mathematical assertion and retain reproducible provenance."""
import datetime
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path
import mpmath

root=Path(__file__).resolve().parents[1]
out=root/'test/evidence/reference-audit';out.mkdir(parents=True,exist_ok=True)
started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
command=[sys.executable,'-m','unittest','discover','-s','packages/reference/tests','-v']
run=subprocess.run(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
runtime=time.perf_counter()-clock
log=out/'tests.txt';log.write_bytes(run.stdout)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
paths=sorted((root/'packages/reference').rglob('*.py'))+[root/'packages/reference/requirements.txt',root/'docs/MATH.md',root/'docs/NUMERICS.md']
inputs=[{'path':p.relative_to(root).as_posix(),'sha256':digest(p)} for p in paths]
manifest={
 'schema_version':1,'claim_id':'orbital-reference-bounded-regressions-v1',
 'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True))},
 'command':'python scripts/audit-reference.py (runs python -m unittest discover -s packages/reference/tests -v)',
 'environment':{'software':[f'Python {platform.python_version()}',f'mpmath {mpmath.__version__}'],'hardware':f'{platform.system()} {platform.machine()} {platform.processor()}'},
 'mathematics':{
  'assertion_tested':'Explicit per-tick primal/dual feasibility on the named fixtures; analytic sphere/cap benchmarks; both global crossing roots; precision stability; retained failures of unconditional rounding/path simplifications.',
  'coefficient_domain':'mpmath arbitrary-precision real numerical arithmetic, generally 110 digits; selected checks repeated at 160 digits',
  'conventions':'MATH reserve-sum keys b, normalized real radii; output price normalized to one for dual solve; positive output is received amount.',
  'inputs':inputs,
  'bounds':{'dimensions':[2,3,4,8,16,32],'onchain_profile_max_dimension':8,'flagship_directed_pairs':6,'dual_newton_maxsteps':150,'dual_initial_guesses':[0,-0.5,0.5,-2],'timeout_seconds':180,'precision_stability_absolute_relative_threshold':'1e-90','scope':'Dimension sweep covers per-tick feasibility only; swaps use named 2/3/4-token fixtures.'},
  'non_claims':['No universal theorem or production interval proof','No integer reachable history for retained exact-real counterexamples','No complete traversal connectivity proof','No differential campaign against a complete Solidity engine','No release supported-range or economic-cycle guarantee']},
 'randomness':{'used':False,'generator':'','seed':None},
 'run':{'started_at':started,'runtime_seconds':runtime,'exit_status':run.returncode},
 'outputs':[{'path':log.relative_to(root).as_posix(),'sha256':digest(log)}],
 'checks':['Analytic sphere and cap formulas','Explicit sphere/cap/principal inequalities','Aggregate reconstruction and independent analytic dual objective','Six directed pair symmetry','Both inward/outward roots validated against per-tick dual oracle','110/160-digit stability for named fixtures','Rounded endpoint and slack-path counterexamples retained'],
 'result':'conditional on numerical arithmetic and the recorded finite input family' if run.returncode==0 else 'regression failure: inspect tests.txt',
 'residual_risks':['Optimizer convergence is not mathematical certification','Current solver uses positive dual prices and may reject zero-price endpoints','Rounded-start connected-branch semantics remain unresolved']}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(run.stdout.decode(errors='replace'));print(f'Manifest: {out / "manifest.json"}')
raise SystemExit(run.returncode)
