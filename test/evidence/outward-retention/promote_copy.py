"""Apply the reviewed retention proposal to the isolated, shape-only snapshot.

This modifies no production source. Run only after retaining the RED result.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'.cache/outward-retention'


def replace(text, old, new):
    assert text.count(old)==1, (old[:80], text.count(old))
    return text.replace(old,new)


def main():
    assert (WORK/'red.json').exists(), 'Retain tests-first RED before behavior.'
    path=WORK/'src/libraries/FrontierEndpoint.sol'
    text=path.read_text()
    text=replace(text,
        '        // Classification is exact. A different rounded prefix is deliberately\n'
        '        // deferred even when the ideal root itself did not cross a key.\n'
        '        if(_canonical(result.reserves,ticks)!=count){result.status=Status.RequiresRepartition;return result;}\n'
        '        if(!M.certify(result.reserves,ticks))return result;',
        '        // The actual raw payment may leave more ordinary ticks boundary\n'
        '        // than the ideal root. Return actual metadata separately. NUM-12..14\n'
        '        // retain exactly the one output floor and combined gap above.\n'
        '        result.actualBoundaryCount=_canonical(result.reserves,ticks);\n'
        '        if(result.actualBoundaryCount<count){result.status=Status.RequiresRepartition;return result;}\n'
        '        if(!M.certify(result.reserves,ticks))return result;\n'
        '        if(result.actualBoundaryCount>count){\n'
        '            // RootBracket already proves the feasible same-prefix segment\n'
        '            // root->hi. Reverse release certifies hi->actual using FINAL\n'
        '            // fixed-input reserves, with both one-sided seam domains.\n'
        '            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(result.reserves,ticks,output,result.root.bracket.hi,count);\n'
        '            if(!valid||crossed!=result.actualBoundaryCount-count){result.status=Status.RequiresRepartition;return result;}\n'
        '            // T is 1-Lipschitz in each prefix; at an outward seam\n'
        '            // T_old=T_new+r(c,s), ||(c,s)||=1, so radial defect cannot\n'
        '            // jump upward. Final actual-prefix slack is <= total gap.\n'
        '            result.retentionCrossings=crossed;\n'
        '            result.status=Status.EndpointCertified;return result;\n'
        '        }')
    path.write_bytes(text.encode())
    path=WORK/'src/libraries/FrontierComposition.sol'
    text=path.read_text()
    text=replace(text,
        '        result.crossingRemaining=schedule.remainingCrossings;\n'
        '        result.transitions=new Transition[](uint256(result.releaseCrossings)+result.frontierCrossings);',
        '        result.crossingRemaining=schedule.remainingCrossings;\n'
        '        result.retentionCrossings=result.endpoint.retentionCrossings;\n'
        '        if(result.retentionCrossings>result.crossingRemaining){result.status=Status.TransitionLimit;return result;}\n'
        '        result.crossingRemaining-=result.retentionCrossings;\n'
        '        result.transitions=new Transition[](uint256(result.releaseCrossings)+result.frontierCrossings+result.retentionCrossings);')
    text=replace(text,
        '        // NUM-11..14: exact ideal path plus the independently certified final\n'
        '        // same-prefix retention interval. No intermediate raw output is paid.',
        '        for(uint256 k;k<result.retentionCrossings;k++){\n'
        '            result.transitions[uint256(result.releaseCrossings)+result.frontierCrossings+k]=Transition(ticks[uint256(finalPrefix)+k].key,false,false,true);\n'
        '        }\n'
        '        // NUM-11..14: ideal path and final retention are separate phases.\n'
        '        // Retention keys are accounting seams, not ideal output-progress\n'
        '        // events. No intermediate raw output is paid or rounded.')
    text=replace(text,
        '    /// Equality, unresolved direction/precision and final repartition remain\n'
        '    /// explicit deferrals; no failed check proves global infeasibility.',
        '    /// Equality, unresolved direction/precision and uncertifiable retention\n'
        '    /// remain explicit deferrals; no failed check proves global infeasibility.')
    path.write_bytes(text.encode())


if __name__=='__main__':
    main()
