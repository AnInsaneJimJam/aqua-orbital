"""Isolated tests-first n2 endpoint high-sheet proposal; never edits main sources."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'.cache/seed-discovery'
HERE=Path(__file__).resolve().parent
STUB='''    function _capN2High(uint256,uint256 current,uint256,uint256) internal pure returns(bool,uint256){return(false,current);}
'''
HELPER='''    /// @dev Arithmetic proposal only, for n2 outward high points. The caller
    /// retains every original membership, price, bracket and path check.
    /// Inputs inherit <2^192 GRID lengths; squared work remains below 2^385.
    function _capN2High(uint256 other,uint256 current,uint256 sigmaHi,uint256 lower) internal pure returns(bool,uint256){
        W.Uint512 memory square=W.scale(W.mul(sigmaHi,sigmaHi),2);
        uint256 delta=W.sqrt(square);W.Uint512 memory rounded=W.mul(delta,delta);
        if(rounded.hi!=square.hi||rounded.lo!=square.lo)++delta;
        if(other<delta)return(false,current);
        uint256 ceiling=other-delta;
        if(current>ceiling)current=ceiling;
        return(current>=lower,current);
    }
'''
INSERT='''        if(n==2&&count!=0&&high[1-output]>high[output]){
            (bool proposal,uint256 clipped)=_capN2High(high[1-output],high[output],ctx.sigmaHi,lower);
            if(!proposal)return(root,ctx);
            high[output]=clipped;
        }
'''
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,text):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8',newline='\n')
def main(stage):
    if stage not in ('red','green'):raise ValueError('red or green')
    snapshot=WORK/'input-snapshot.json'
    if not snapshot.exists():
        pending=['FrontierComposition.sol'];seen=set();inputs=[]
        while pending:
            name=pending.pop()
            if name in seen:continue
            seen.add(name);source=ROOT/'packages/contracts/src/libraries'/name
            inputs.append({'path':source.relative_to(ROOT).as_posix(),'sha256':sha(source)})
            raw=source.read_bytes();target=WORK/'baseline'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
            pending.extend(re.findall(r'from "\./([^\"]+)"',raw.decode()))
        source=ROOT/'packages/contracts/test/fixtures/CurvePrimitiveFixtures.sol'
        inputs.append({'path':source.relative_to(ROOT).as_posix(),'sha256':sha(source)})
        target=WORK/'test/fixtures'/source.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
        write(snapshot,json.dumps(inputs,indent=2)+'\n')
    for source in (WORK/'baseline').glob('*.sol'):
        text=source.read_text()
        if source.name=='FrontierEndpoint.sol':
            marker='    function _canonical('
            if text.count(marker)!=1:raise RuntimeError('helper insertion mismatch')
            text=text.replace(marker,(HELPER if stage=='green' else STUB)+marker)
            if stage=='green':
                marker='        C.Evaluation memory feasible=C.evaluate(high,ctx,output);'
                if text.count(marker)!=1:raise RuntimeError('proposal insertion mismatch')
                text=text.replace(marker,INSERT+marker)
        write(WORK/'src/libraries'/source.name,text)
    write(WORK/'test/SeedProposal.t.sol',(HERE/'SeedProposal.t.sol.in').read_text())
    env=dict(os.environ,FOUNDRY_PROFILE='default')
    for k,d in [('SRC','src'),('TEST','test'),('OUT','out'),('CACHE_PATH','compile-cache')]:
        env['FOUNDRY_'+k]=Path(os.path.relpath(WORK/d,ROOT/'packages/contracts')).as_posix()
    command=['forge','test','--match-contract','^SeedProposalTest$','--fuzz-runs','256','--fuzz-seed','0x20260908','--threads','2','--offline','-vv']
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.perf_counter()
    run=subprocess.run(command,cwd=ROOT/'packages/contracts',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
    output=HERE/f'{stage}.txt';output.write_bytes(run.stdout)
    result={'stage':stage,'started_at':started,'runtime_seconds':time.perf_counter()-clock,'command':command,'exit_status':run.returncode,
            'input_snapshot':json.loads(snapshot.read_text()),'script_sha256':sha(Path(__file__)),'test_template_sha256':sha(HERE/'SeedProposal.t.sol.in'),
            'generated_sources':{p.relative_to(WORK).as_posix():sha(p) for p in sorted((WORK/'src/libraries').glob('*.sol'))},'stdout_sha256':sha(output)}
    write(HERE/f'{stage}.json',json.dumps(result,indent=2)+'\n');sys.stdout.buffer.write(run.stdout);return run.returncode
if __name__=='__main__':raise SystemExit(main(sys.argv[1]))
