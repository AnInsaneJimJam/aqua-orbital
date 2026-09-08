// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {SlackCertificate as P} from "../src/libraries/SlackCertificate.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {RootBracket as B} from "../src/libraries/RootBracket.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

contract FrontierEndpointTest is Test {
    uint256 constant GRID=1<<32;
    uint256 constant U=1<<64;
    uint256 constant SCALE=1e40;
    function decimals(uint8 n,uint8 d) private pure returns(uint8[] memory result){result=new uint8[](n);for(uint256 i;i<n;i++)result[i]=d;}
    function assertEndpoint(uint256[] memory start,M.Tick[] memory ticks,E.Result memory r,uint8 input,uint8 output,uint8 budget) private pure {
        assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));assertTrue(r.root.identified);
        assertGt(r.amountOutRaw,0);assertLe(r.shortfallUpper,r.outputQuantum);assertTrue(M.certify(r.reserves,ticks));
        assertEq(r.reserves[input],start[input]+r.netInputInternal);
        assertEq(r.reserves[output],start[output]-r.amountOutRaw*r.outputQuantum);
        assertEq(uint256(r.root.bracket.used)+r.root.bracket.remaining,budget);
        assertLe(r.root.bracket.lo,r.root.bracket.hi);assertLe(r.root.bracket.hi,r.reserves[output]*GRID);
        assertEq(r.shortfallUpper,(r.reserves[output]*GRID-r.root.bracket.lo+GRID-1)/GRID);
        uint256[] memory extended=new uint256[](start.length);
        for(uint256 i;i<start.length;i++){extended[i]=r.reserves[i]*GRID;if(i!=input&&i!=output)assertEq(r.reserves[i],start[i]);}
        C.Context memory ctx=C.prepare(uint8(start.length),ticks,r.root.boundaryCount);
        assertTrue(C.certifiesMembership(C.evaluate(extended,ctx,output)));
        if(ctx.boundaryCount!=0)assertTrue(P.criticalPoints(extended,output,r.root.bracket.lo,ctx.sigmaHi,ctx.outerKey));
    }
    function testOrdinaryMixedTwoThreeEightTokenEndpointsExecute() public pure {
        uint256[3] memory indices=[uint256(0),2,3];
        for(uint256 k;k<3;k++){
            (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(indices[k]);
            E.Result memory r=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,160);
            assertEndpoint(x,ticks,r,0,1,160);assertEq(r.netInputInternal,1e18*U);assertEq(r.outputQuantum,U);
        }
    }
    function testMixedDecimalsPreserveSameNetInputAndSingleOutputFloor() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(2);
        uint8[] memory d=decimals(n,18);d[0]=6;d[1]=6;
        E.Result memory r=E.exactInput(x,ticks,d,0,1,1e6,count,160);
        assertEndpoint(x,ticks,r,0,1,160);assertEq(r.netInputInternal,1e18*U);assertEq(r.outputQuantum,1e12*U);
    }
    function testInitialRootIdentityRetainsActualSlackWithoutFinancialOutput() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        E.Identity memory r=E.identifyInitial(x,ticks,1,count,160);
        assertTrue(r.identified);assertEq(r.boundaryCount,count);
        assertLt(r.bracket.hi,x[1]*GRID);
        assertLe(r.bracket.lo,44500767304604138371755601356080263154504059660318);
        assertGe(r.bracket.hi,44500767304604138371755601356080263154504059660319);
        assertEq(uint256(r.bracket.used)+r.bracket.remaining,160);assertEq(n,2);
    }
    function testZeroAndTinyBudgetsPreserveIdentityButDoNotInventQuantumAccuracy() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        E.Result memory zero=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,0);
        assertTrue(zero.root.identified);assertEq(uint256(zero.status),uint256(E.Status.Uncertain));
        assertEq(zero.root.bracket.used,0);assertEq(zero.root.bracket.remaining,0);
        E.Result memory one=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,1);
        assertTrue(one.root.identified);assertEq(uint256(one.status),uint256(E.Status.Uncertain));
        assertEq(uint256(one.root.bracket.used)+one.root.bracket.remaining,1);
    }
    function testUncertifiedStartAndWrongPartitionDoNotBecomeGlobalExclusions() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        E.Result memory wrong=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,0,160);
        assertEq(uint256(wrong.status),uint256(E.Status.Uncertain));assertFalse(wrong.root.identified);
        x[0]=0;x[1]=0;
        E.Result memory bad=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,160);
        assertEq(uint256(bad.status),uint256(E.Status.UncertifiedStart));assertFalse(bad.root.identified);
    }
    function testRoundedKeyArrivalCertifiesActualRetentionPrefix() public pure {
        uint256 whole=1e18*U;uint8 n=3;
        M.Tick[] memory t=new M.Tick[](3);
        t[0]=M.Tick(uint64(3*GRID/2),uint192(100*whole),G.coefficients(n,uint64(3*GRID/2)));
        t[1]=M.Tick(uint64(7*GRID/4),uint192(200*whole),G.coefficients(n,uint64(7*GRID/4)));
        t[2]=M.Tick(type(uint64).max,uint192(400*whole),G.coefficients(n,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=500*whole;x[1]=400*whole;x[2]=100*whole;
        E.Result memory r=E.exactInput(x,t,decimals(n,6),0,2,68669858,0,160);
        assertTrue(r.root.identified);assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));
        assertEq(r.root.boundaryCount,0);assertEq(r.actualBoundaryCount,1);assertEq(r.retentionCrossings,1);
        assertEq(r.amountOutRaw,18669858);assertTrue(M.certify(r.reserves,t));assertLe(r.shortfallUpper,r.outputQuantum);
    }
    function testCallerReservesRemainUnmodified() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        bytes32 before=keccak256(abi.encode(x));
        E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,160);
        assertEq(keccak256(abi.encode(x)),before);
    }
    function testIndependentGoldenTwoTokens() public pure {_assertGolden(0);}
    function testIndependentGoldenThreeTokens() public pure {_assertGolden(1);}
    function testIndependentGoldenEightTokens() public pure {_assertGolden(2);}
    function testIndependentGoldenMixedDecimals() public pure {_assertGolden(3);}
    function _assertGolden(uint8 index) private pure {
        uint256[4] memory outputs=[uint256(4126770776962595252),333207013780241401,499288825743866812,333207];
        uint256[4] memory floors=[uint256(44340703412623690595350829985285122856085410428353),118084306753006480165245949185059670947237519748186,468155813909892268425727901700349720754977690259405,118084306753006480165245949185059670947237519748186];
        uint256[4] memory idealShortfalls=[uint256(15883576254408445846),6040614287645789571,4040979190518749037,254200586404224373115595443587];
        uint256 fixtureIndex=index==0?0:index==2?3:2;
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(fixtureIndex);
        uint8[] memory d=decimals(n,18);uint256 raw=1e18;
        if(index==3){d[0]=6;d[1]=6;raw=1e6;}
        E.Result memory r=E.exactInput(x,ticks,d,0,1,raw,count,160);
        assertEndpoint(x,ticks,r,0,1,160);assertEq(r.amountOutRaw,outputs[index]);
        assertLe(r.root.bracket.lo,floors[index]);assertGe(r.root.bracket.hi,floors[index]+1);
        assertGe(r.shortfallUpper,idealShortfalls[index]);
    }
    function testSharedBudgetBetweenInitialAndFinalIdentityNeverResets() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        E.Identity memory initial=E.identifyInitial(x,ticks,1,count,160);
        assertTrue(initial.identified);
        E.Result memory finalPoint=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,initial.bracket.remaining);
        assertTrue(finalPoint.root.identified);
        assertEq(uint256(initial.bracket.used)+finalPoint.root.bracket.used+finalPoint.root.bracket.remaining,160);
        // This assertion claims identity/budget preservation only. A narrow raw
        // floor is not inferred from spending the remaining work allowance.
        if(finalPoint.status==E.Status.EndpointCertified)assertLe(finalPoint.shortfallUpper,finalPoint.outputQuantum);
        else assertEq(uint256(finalPoint.status),uint256(E.Status.Uncertain));
    }
    function testEightTokenNearMaximumOriginalLength() public pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(3);
        for(uint256 i;i<n;i++)x[i]*=1e7;
        for(uint256 i;i<ticks.length;i++)ticks[i].radius*=1e7;
        E.Result memory r=E.exactInput(x,ticks,decimals(n,18),0,1,1e18,count,160);
        assertEndpoint(x,ticks,r,0,1,160);
    }
    function call(uint256[] memory x,M.Tick[] memory t,uint8[] memory d,uint8 i,uint8 j,uint256 raw,uint8 count,uint8 budget) external pure {E.exactInput(x,t,d,i,j,raw,count,budget);}
    function testInvalidMetadataPairBudgetAndCapacityRejectBeforeLifting() public {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(0);
        uint8[] memory d=decimals(n,18);
        vm.expectRevert(E.InvalidPair.selector);this.call(x,ticks,d,0,0,1,count,160);
        vm.expectRevert(E.InvalidInput.selector);this.call(x,ticks,d,0,1,0,count,160);
        vm.expectRevert(E.InvalidInput.selector);this.call(x,ticks,d,0,1,type(uint256).max,count,160);
        vm.expectRevert(E.InvalidBudget.selector);this.call(x,ticks,d,0,1,1,count,161);
        d[1]=19;vm.expectRevert(E.InvalidMetadata.selector);this.call(x,ticks,d,0,1,1,count,160);
    }
}
