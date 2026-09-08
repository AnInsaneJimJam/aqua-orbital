"""Summarize, never rerun or silently widen, the recorded frozen campaign."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    result=json.loads((HERE/'ci.json').read_text())
    transcript=(HERE/'ci.txt').read_text(encoding='utf-8')
    assert result['exit_status']==0 and result['changed_inputs']==[]
    assert sha(HERE/'ci.txt')==result['stdout_sha256']
    assert sha(HERE/'ci-config.json')==result['effective_config_sha256']
    assert all(sha(ROOT/name)==digest for name,digest in result['inputs'].items())
    matches=re.findall(r'\(runs: (\d+), calls: (\d+), reverts: (\d+)\)',transcript)
    assert matches==[('256','32768','0')]
    assert re.search(r'InteriorStatefulHandler\s*\|\s*step\s*\|\s*32768\s*\|\s*0\s*\|\s*0\s*\|',transcript)
    for name,count in [('successful_swaps',128),('successful_quotes',224),('expected_failed_transfers',32),('router_donations',32),('aqua_donations',32),('unique_directed_pairs',6)]:
        assert re.search(rf'\b{name}: {count}\b',transcript)
    obj={
        'schema_version':1,'claim_id':'FROZEN-INTERIOR-STATEFUL-256x128',
        'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT))},
        'command':'python test/evidence/interior-stateful/run.py ci',
        'environment':{'software':[result['forge_version'],result['artifact_compiler']['version'],'Windows / PowerShell / Python runner; Cancun EVM, optimizer700, viaIR'],'hardware':'AMD Ryzen 5 7520U, 4 physical / 8 logical cores; concurrent work, not a performance benchmark'},
        'mathematics':{
            'assertion_tested':'Exact ghost principal/fee/version/Aqua and physical conservation, inert surplus, read-only quotes, expected-error rollback and recovery, and retirement/docking across non-vacuous all-interior histories.',
            'coefficient_domain':'Exact Solidity uint256 and existing Uint512 arithmetic; normalized lengths 10^(18-decimals)*2^64 per raw token unit.',
            'conventions':'One actual initialized three-token state; two6-decimal tokens and one18-decimal token sorted by deployed address; ticks1.5GRID/1.75GRID/sentinel; radii100/200/400 whole; fee500ppm; canonical principal excludes fees and donations.',
            'inputs':[{'path':name,'sha256':digest} for name,digest in result['inputs'].items()],
            'bounds':{'runs':256,'depth':128,'handler_calls':32768,'handler_reverts':0,'discards':0,'maximum_supported_handler_steps':256,'gross_whole_interval':['0.001','0.01'],'donation_whole_interval':['0.000001','1'],'coordinate_bootstrap_whole':[288,300],'radial_slack_max_whole':'0.000001','deadline_seconds':1800,'threads':2},
            'non_claims':['No mixed traversal or post-integration Router validation.','No exhaustive uint32/uint8 input coverage or universal theorem.','No G8/full multi-maker/shared-strategy/invoice/release campaign.','No Arc deployment, gas budget, live receipt, or signer claim.','Initializer fixture coefficients and wide products use production libraries; independent math oracles are separate.']
        },
        'randomness':{'used':True,'generator':'Foundry1.5.1 invariant fuzzer; retained effective config and command','seed':result['seed']},
        'run':{'started_at':result['started_at'],'runtime_seconds':result['runtime_seconds'],'exit_status':0},
        'outputs':[{'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path)} for path in [HERE/'ci.txt',HERE/'ci.json',HERE/'ci-config.json',HERE/'pilot.txt',HERE/'pilot.json',HERE/'smoke.txt',HERE/'smoke.json',HERE/'source-pins.json',HERE/'source-snapshot.tar.gz',Path(__file__).resolve()]],
        'checks':['All87 copied Solidity inputs and runner/archive/config/test unchanged during run.','One successful real swap per handler call, allsix pairs per run, no discarded actions.','Every fourth action expects the exact SafeTransferFromFailed wrapper and proves full financial rollback then recovery.','One canonical execution event per successful swap; no recordLogs-as-receipt claim.','End-of-run hook retires and docks the maker-owned allocation without token withdrawal.','Exact sphere bounds and finite drift induction keep every tested endpoint strictly all-interior.'],
        'result':'Implementation and finite assertion verified on the frozen source graph in the stated seeded range; conditional on Foundry execution semantics and shared wide arithmetic.',
        'derived_operation_counts':{'successful_swaps':32768,'successful_quotes':57344,'expected_failed_transfer_attempts':8192,'router_donations':8192,'aqua_pushes':8192,'retire_and_dock_sequences':256,'basis':'reported runs/calls and deterministic handler cycles; these are executions, not independent test definitions'},
        'residual_risks':['One seeded finite randomized family with deliberately ample balances/allowances.','Expected failed-transfer mode covers three directed pairs, not the full pair/mode Cartesian product.','Frozen source-unit names differ from the main build; bytecode/deployment identity is not inferred.','Main graph may advance after this historical all-interior snapshot.']
    }
    (HERE/'manifest.json').write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('Recorded 256 runs / 32768 calls / zero reverts and discards; manifest written.')
if __name__=='__main__':main()
