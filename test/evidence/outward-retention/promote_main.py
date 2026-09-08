"""Authorized, tests-first promotion of the already reviewed isolated bodies.

The RED action changes result shape and tests only. GREEN accepts only that
exact shape before copying the independently reviewed isolated C/E bodies.
"""
import hashlib
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'.cache/outward-retention'
CORE=ROOT/'packages/contracts/src/libraries'
TEST=ROOT/'packages/contracts/test'


def shape(name):
    text=(WORK/'baseline/libraries'/name).read_text()
    if name=='FrontierEndpoint.sol':
        return text.replace('uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;',
            'uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;\n'
            '        uint8 actualBoundaryCount;uint8 retentionCrossings;')
    return (text.replace('bool initialRelease;}','bool initialRelease;bool finalRetention;}')
        .replace('uint8 releaseCrossings;uint8 frontierCrossings;',
                 'uint8 releaseCrossings;uint8 frontierCrossings;uint8 retentionCrossings;')
        .replace('.key,true,true);','.key,true,true,false);')
        .replace('.candidate.inward,false);','.candidate.inward,false,false);'))


def replace(text,old,new):
    assert text.count(old)==1,(old[:70],text.count(old))
    return text.replace(old,new)


def main(stage):
    names=['FrontierEndpoint.sol','FrontierComposition.sol']
    if stage=='red':
        for name in names:
            assert (CORE/name).read_bytes()==(WORK/'baseline/libraries'/name).read_bytes(),name
        for name in names:(CORE/name).write_bytes(shape(name).encode())
        text=(WORK/'test/OutwardRetentionPrototype.t.sol').read_text()
        text=text.replace('RetentionClient','RetentionTestClient').replace('OutwardRetentionPrototypeTest','OutwardRetentionTest')
        (TEST/'OutwardRetention.t.sol').write_bytes(text.encode())
        path=TEST/'FrontierEndpoint.t.sol';text=path.read_text()
        text=replace(text,'function testRoundedKeyArrivalRequiresRepartition()',
                     'function testRoundedKeyArrivalCertifiesActualRetentionPrefix()')
        text=replace(text,
            '        assertTrue(r.root.identified);assertEq(uint256(r.status),uint256(E.Status.RequiresRepartition));',
            '        assertTrue(r.root.identified);assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));\n'
            '        assertEq(r.root.boundaryCount,0);assertEq(r.actualBoundaryCount,1);assertEq(r.retentionCrossings,1);\n'
            '        assertEq(r.amountOutRaw,18669858);assertTrue(M.certify(r.reserves,t));assertLe(r.shortfallUpper,r.outputQuantum);')
        path.write_bytes(text.encode())
        path=TEST/'FrontierComposition.t.sol';text=path.read_text()
        text=replace(text,'function testRoundedCanonicalPrefixMismatchRemainsExplicitlyDeferred()',
                     'function testRoundedCanonicalPrefixHasCertifiedRetentionPhaseAndBudget()')
        text=replace(text,
            '        assertEq(uint256(r.status),uint256(C.Status.RequiresRepartition));assertTrue(r.endpoint.root.identified);',
            '        assertEq(uint256(r.status),uint256(C.Status.FrontierPathCertified));assertTrue(r.endpoint.root.identified);\n'
            '        assertEq(r.endpoint.root.boundaryCount,0);assertEq(r.endpoint.actualBoundaryCount,1);\n'
            '        assertEq(r.endpoint.amountOutRaw,18669858);assertTrue(M.certify(r.endpoint.reserves,ticks));\n'
            '        assertEq(r.releaseCrossings,0);assertEq(r.frontierCrossings,0);assertEq(r.retentionCrossings,1);\n'
            '        assertEq(r.transitions.length,1);assertEq(r.crossingRemaining,15);\n'
            '        assertEq(r.transitions[0].key,ticks[0].key);assertFalse(r.transitions[0].inward);\n'
            '        assertFalse(r.transitions[0].initialRelease);assertTrue(r.transitions[0].finalRetention);')
        path.write_bytes(text.encode())
    elif stage=='green':
        for name in names:assert (CORE/name).read_text()==shape(name),name
        for name in names:
            body=(WORK/'src/libraries'/name).read_bytes()
            # Frozen bodies reviewed independently by root and backend agents.
            expected={'FrontierEndpoint.sol':'ecb7eb1206cd1fc3fe03341f31d1442b2aabd4eeba0eaf629faba5807a0335fd',
                      'FrontierComposition.sol':'2b0cced7ca334b9eb814d821edbdcd4ebb40b4fc9219dd9beddf7bc07599069f'}
            assert hashlib.sha256(body).hexdigest()==expected[name],name
            (CORE/name).write_bytes(body)
    else:raise ValueError(stage)


if __name__=='__main__':main(sys.argv[1])
