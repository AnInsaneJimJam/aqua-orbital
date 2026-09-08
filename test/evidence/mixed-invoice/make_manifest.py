"""Check exact final Forge and mined-receipt evidence, then record its scope."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    run=json.loads((HERE/'forge.json').read_text());receipt=json.loads((HERE/'receipts.json').read_text())
    assert run['exit_status']==0 and run['changed_inputs']==[] and receipt['status']=='passed' and receipt['chainStopped'] is True
    assert all(sha(ROOT/name)==digest for name,digest in run['inputs'].items())
    assert all(sha(ROOT/name)==digest for name,digest in receipt['sourceHashes'].items())
    assert sha(HERE/'forge.txt')==run['stdout_sha256'] and sha(HERE/'config.json')==run['config_sha256']
    assert '2 passed; 0 failed; 0 skipped' in (HERE/'forge.txt').read_text()
    failed=receipt['cases'][0];assert failed['receipt']['status']=='0x0' and failed['receipt']['logs']==[] and failed['before']['digest']==failed['after']['digest']
    assert receipt['recovery']['receipt']['status']=='0x1' and len(receipt['transactions'])==30
    subprocess.run(['python',str(HERE/'freeze.py'),'verify'],cwd=ROOT,check=True)
    inputs=dict(run['inputs']);inputs.update(receipt['sourceHashes'])
    paths=[HERE/name for name in ['forge.txt','forge.json','config.json','source-pins.json','source-snapshot.tar.gz','receipts.json','freeze.py','run.py']]+[Path(__file__).resolve()]
    manifest={
      'schema_version':1,'claim_id':'REAL-MIXED-SWAP-INVOICE-ATOMICITY-ONE-OUTWARD-PATH',
      'repository':{'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT))},
      'command':'python test/evidence/mixed-invoice/run.py; pnpm --filter @orbital/sdk exec tsx ../contracts/test/mixed-invoice-receipts.mts; python test/evidence/mixed-invoice/make_manifest.py',
      'environment':{'software':[run['forge_version'],'Solc0.8.30+73712a01;optimizer700;viaIR;Cancun','Node22.18.0;tsx4.23.13',receipt['chain']['binaryVersion']],'hardware':'Windows local machine; owned Anvil local EVM, not an Arc benchmark'},
      'mathematics':{
        'assertion_tested':'One actual initialized mixed outward swap atomically funds a 90/10 USDC invoice; exact second-recipient rejection reverts full financial state and leaves no logs in the genuinely mined failed receipt; restored identical calldata succeeds.',
        'coefficient_domain':'Exact Solidity integers/Uint512; raw6/18/6 units; independently generated110/160-digit reachable-traversal fixture supplies initial and first-payout golden literals.',
        'conventions':'Actual address-sorted6/18/6 tokens, radii100/200/400whole, keys1.5/1.75/full-range,500ppm fee. Adapter is swap taker/recipient; invoice payer remains original external user. Gross includes LP fee; principal receives net.',
        'inputs':[{'path':name,'sha256':digest} for name,digest in inputs.items()],
        'bounds':{'tokens':3,'ticks':3,'directed_pairs':1,'crossings':1,'gross_input_raw':350000000,'fee_raw':175000,'output_raw':164721797,'invoice_raw':150000000,'refund_raw':14721797,'foundry_tests':2,'mined_setup_action_transactions':30,'anvil_run_deadline_seconds':300,'rpc_timeout_seconds':15,'block_gas_limit':30000000},
        'non_claims':['No full G3/PAY/G8 or release campaign.','No Privy wallet flow or Arc deployment.','No universal traversal or independent wide-arithmetic proof.','No full pair/configuration/recipient alias Cartesian coverage.','No persistent deployment manifest or frontend execution authorization.','Foundry recordLogs is not treated as a failed transaction receipt.','Isolated local compilation/runtime identity does not establish main-artifact or target-network identity.']},
      'randomness':{'used':True,'generator':'Anvil disposable random account generation; deterministic amounts and bounded CREATE2 address search','seed':None},
      'run':{'started_at':run['started_at'],'runtime_seconds':run['runtime_seconds'],'exit_status':0},
      'outputs':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in paths],
      'checks':['Original metadata source names and pinned compiler settings; all98 source-unit bytes authenticated.','Official Aqua source pin and full declared artifact/link closure authenticated before deployment.','Exact nonce constructor simulation, linked runtime/immutable values and canonical transaction/receipt/block identities checked.','All financial-state snapshots pinned to their block hash; failed snapshot digests equal.','Actual failed receipt status0/logs[] and exact second-recipient error/transfer trace.','Recovered receipt exact outward crossing and InvoicePaid event ordering and values.','Exact maker/payer/adapter/router/Aqua token conservation, split/refund, donations and cleared approvals.','Final source/artifact equality and owned Anvil process cleanup.','Archive100 members hashes and exact membership validated.'],
      'result':'Finite current implementation assertion verified: two Foundry integration tests and one separately mined rejection/restoration campaign on the authenticated isolated graph.',
      'mined_run':{'started_at':receipt['startedAt'],'completed_at':receipt['completedAt'],'failed_receipt_gas':int(failed['receipt']['gasUsed'],16),'successful_receipt_gas':int(receipt['recovery']['receipt']['gasUsed'],16),'transactions':30,'chain_stopped':True},
      'residual_risks':['One seeded initialization family and0→2 outward route. Other mixed paths, fee tiers, reentrancy modes, invoice aliases and recipient counts have separate evidence.','Local Anvil semantics and compiler honesty remain trusted; paper fixtures establish bounded independent numerical agreement, not a general proof.','Gas numbers are observed local transaction receipts; Arc-specific transaction acceptance is separate.']
    }
    (HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('Verified2 Foundry tests,30 canonical local transactions, failed empty receipt and successful mixed invoice recovery.')
if __name__=='__main__':main()
