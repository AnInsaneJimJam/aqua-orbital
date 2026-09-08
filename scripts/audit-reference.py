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
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
# Hash actual inputs before execution, including Solidity literals read by tests.
paths=sorted((root/'packages/reference').rglob('*.py'))+sorted((root/'packages/reference/fixtures').glob('*.json'))+sorted((root/'packages/contracts/test/fixtures').glob('*.sol'))+[root/f'packages/contracts/test/{name}.t.sol' for name in ['RootBracket','InteriorSwap','InteriorExecution','FrontierTurn','FrontierEndpoint','FrontierEvents','FrontierComposition','SeedProposal','OutwardRetention','FrontierPriceExclusion','MixedExecution','ReachableComposition']]+[Path(__file__).resolve(),root/'packages/reference/requirements.txt',root/'docs/MATH.md',root/'docs/NUMERICS.md']
inputs=[{'path':p.relative_to(root).as_posix(),'sha256':digest(p)} for p in paths]
command=[sys.executable,'-m','unittest','discover','-s','packages/reference/tests','-v']
run=subprocess.run(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
runtime=time.perf_counter()-clock
log=out/'tests.txt';log.write_bytes(run.stdout)
changed=[entry['path'] for entry in inputs if digest(root/entry['path'])!=entry['sha256']]
if changed:
    raise SystemExit(f'Inputs changed during the reference run; rerun required: {changed}')
manifest={
 'schema_version':1,'claim_id':'orbital-reference-bounded-regressions-v1',
 'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True))},
 'command':'python scripts/audit-reference.py (runs python -m unittest discover -s packages/reference/tests -v)',
 'environment':{'software':[f'Python {platform.python_version()}',f'mpmath {mpmath.__version__}'],'hardware':f'{platform.system()} {platform.machine()} {platform.processor()}'},
 'mathematics':{
  'assertion_tested':'Explicit per-tick primal/dual feasibility on named fixtures; analytic sphere/cap/initialization benchmarks; both crossing roots, bounded crossing schedules, GRID inward releases and fixed-frontier paths; scalar/support certificates; identified fixed-input endpoint raw-output/shortfall goldens; precision stability; retained failures of unconditional rounding/path simplifications.',
  'coefficient_domain':'mpmath arbitrary-precision real numerical arithmetic, generally 110 digits; selected checks repeated at 160 digits; Fraction/isqrt exact rational zero-price witnesses',
  'conventions':'MATH reserve-sum keys b, normalized real radii; output price normalized to one for dual solve; positive output is received amount.',
  'inputs':inputs,
  'bounds':{'dimensions':[2,3,4,5,8,16,32],'onchain_profile_max_dimension':8,'flagship_directed_pairs':6,'fixed_input_endpoint_dimensions':[2,3,8],'exact_zero_price_dimension':6,'dual_newton_maxsteps':150,'dual_initial_guesses':[0,-0.5,0.5,-2],'timeout_seconds':180,'precision_stability_absolute_relative_threshold':'1e-90','scope':'Dimension sweep covers per-tick feasibility only; connected reference swaps use named 2/3/4-token fixtures, including six-pair all-interior raw-unit checks. Identified fixed-input endpoint support/raw-output/shortfall goldens cover n2/n3/n8 without a full mixed traversal claim; other named scalar, initialization and frontier samples use n<=8.'},
  'non_claims':['No universal theorem or production interval proof','No integer reachable history for retained exact-real counterexamples','No complete traversal connectivity proof','No differential campaign against a complete Solidity engine','No release supported-range or economic-cycle guarantee']},
 'randomness':{'used':False,'generator':'','seed':None},
 'run':{'started_at':started,'runtime_seconds':runtime,'exit_status':run.returncode},
 'outputs':[{'path':log.relative_to(root).as_posix(),'sha256':digest(log)}],
 'checks':['Analytic sphere and cap formulas','Explicit sphere/cap/principal inequalities','Aggregate reconstruction and independent analytic dual objective','Six directed pair symmetry','Both inward/outward roots validated against per-tick dual oracle','110/160-digit stability for named fixtures','Scalar/normal/support-cost and initializer oracle fixtures','Identified fixed-input n2/n3/n8 endpoint support roots and raw-output/shortfall goldens','Fixed-frontier segment samples and hidden-crossing counterexample','Up to fourteen price-space key events and original-frame schedule order','Rational GRID endpoints, one-sided seam baskets and retained release failures','Rounded endpoint and slack-path counterexamples retained'],
 'result':'conditional on numerical arithmetic and the recorded finite input family' if run.returncode==0 else 'regression failure: inspect tests.txt',
 'residual_risks':['Optimizer convergence is not mathematical certification','Current solver uses positive dual prices and may reject zero-price endpoints','Named connected paths do not prove liveness for all supported inputs; zero/equality and discovery deferrals remain']}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(run.stdout.decode(errors='replace'));print(f'Manifest: {out / "manifest.json"}')
raise SystemExit(run.returncode)
