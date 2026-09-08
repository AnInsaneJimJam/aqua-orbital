"""Validate and summarize the recorded complete-sequence fuzz campaign."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent/'mixed'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    run=json.loads((HERE/'fuzz.json').read_text())
    assert run['exit_status']==0 and run['changed_inputs']==[]
    assert all(sha(ROOT/name)==digest for name,digest in run['inputs'].items())
    assert sha(HERE/'fuzz.txt')==run['stdout_sha256']
    assert sha(HERE/'fuzz-config.json')==run['effective_config_sha256']
    output=(HERE/'fuzz.txt').read_text(encoding='utf-8')
    assert re.search(r'\[PASS\] testFuzzSharedWalletFailuresRecoveryAndIndependentClosure\(uint32,uint8\) \(runs: 64,',output)
    assert '1 passed; 0 failed; 0 skipped' in output
    manifest={
        'schema_version':1,'claim_id':'MIXED-GRAPH-SHARED-INVENTORY-64-SEQUENCES',
        'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT))},
        'command':'python test/evidence/shared-inventory/run-mixed.py fuzz',
        'environment':{'software':[run['forge_version'],run['artifact_compiler']['version'],'Cancun EVM; optimizer700; viaIR; Python runner on Windows'],'hardware':'AMD Ryzen 5 7520U, 4 physical/8 logical cores; concurrent work, not a gas or performance benchmark'},
        'mathematics':{
            'assertion_tested':'Shared maker wallet truth with independent strategy principal/fees/allocations, cross-maker isolation, exact funding failure snapshots/recovery, and independent maker retirement/docking.',
            'coefficient_domain':'Exact uint256 and shared tested Uint512 arithmetic; normalized internal lengths use10^(18-decimals)*2^64.',
            'conventions':'A0/A1 share maker A; B0 maker B; two6-decimal tokens and one18-decimal token sorted by deployed address; fees100/500/1000ppm; each three-tick strategy starts at its genuine directed equal point. Physical balances are per maker, allocations are per strategy.',
            'inputs':[{'path':name,'sha256':digest} for name,digest in run['inputs'].items()],
            'bounds':{'complete_fuzz_sequences':64,'successful_swaps_per_sequence':35,'successful_quotes_per_sequence':43,'expected_funding_quote_failures_per_sequence':4,'expected_funding_swap_failures_per_sequence':4,'strategies_per_sequence':3,'makers_per_sequence':2,'all_directed_pairs_per_strategy':6,'gross_whole_interval':['0.001','0.01'],'coordinate_whole_interval_exclusive':[294,297],'timeout_seconds':1800},
            'non_claims':['No mixed-boundary shared-inventory sequence: the replayed swaps stay all-interior.','No full G3/G8 or release campaign.','No universal/exhaustive shared liquidity theorem.','No escrowed combined allocation promise.','No independent initializer/wide-arithmetic implementation.','Funding failures stop at preflight; no post-transfer failure or receipt-log claim.','No Arc deployment/signing/gas measurement.']
        },
        'randomness':{'used':True,'generator':'Foundry1.5.1 ordinary fuzz runner; modulo-bounded uint32 seed/uint8 pair; no assume or discarded proposal','seed':run['seed']},
        'run':{'started_at':run['started_at'],'runtime_seconds':run['runtime_seconds'],'exit_status':0},
        'outputs':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in [HERE/'fuzz.txt',HERE/'fuzz.json',HERE/'fuzz-config.json',HERE/'source-pins.json',HERE/'source-snapshot.tar.gz',Path(__file__).resolve()]],
        'checks':['97-source closure and runner inputs unchanged before/after run.','All six pairs execute on each strategy regardless of selected depletion pair.','A0 fill reduces A1 physical ceiling by exact output while A1 state/allocation is unchanged.','Wallet spend and allowance reduction give exact failures; full snapshots unchanged and same quote recovers after restoration.','B0 remains usable during A funding depletion.','A1/B0 execute all six pairs after A0 retirement/docking.','Maker authority and terminal closure preserve physical wallets.','Exact per-strategy ghosts and global per-maker balances checked after every action.'],
        'result':'Implementation and finite assertion verified on the frozen mixed-capable graph with all-interior swap sequences for64 complete seeded sequences, conditional on Foundry semantics and shared wide arithmetic.',
        'derived_operations':{'successful_swaps':2240,'successful_quotes':2752,'expected_funding_quote_failures':256,'expected_funding_swap_failures':256,'retire_and_dock':192,'basis':'64 observed successful complete sequences times exact per-sequence assertions, not independent test counts'},
        'residual_risks':['One finite three-strategy/two-maker family; not every selected depletion pair is independently counted across fuzz inputs.','Ordinary well-funded input wallet; invoices/adversarial tokens/mixed paths/arbitrary lifecycle interleavings are separate.','Frozen source-unit names differ from the main build and do not establish deployment identity.']
    }
    (HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('Verified64 complete sequences and recorded the exact frozen manifest.')
if __name__=='__main__':main()
