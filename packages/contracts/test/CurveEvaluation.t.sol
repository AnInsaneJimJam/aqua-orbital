// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

contract CurveEvaluationTest is Test {
    uint256 constant SCALE=1e40;
    uint256 constant GRID=1<<32;
    function mixed() private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](2);uint64 key=5*(1<<29);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function testExactWideSphereSignsAndNormals() public pure {
        uint256 a=uint256(1)<<150;
        M.Tick[] memory ticks=new M.Tick[](1);
        ticks[0]=M.Tick(type(uint64).max,uint192(5*a),G.coefficients(2,type(uint64).max));
        C.Context memory ctx=C.prepare(2,ticks,0);
        uint256[] memory x=new uint256[](2);x[0]=2*a*GRID;x[1]=a*GRID;
        C.Evaluation memory e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.Evaluated));
        assertEq(S.compare(e.residual.lo,S.fromInt(0)),0);
        assertEq(S.compare(e.residual.hi,S.fromInt(0)),0);
        assertTrue(C.certifiesMembership(e));assertTrue(e.strictOutputPrice);
        assertEq(e.normals[0].lo,int256(3*a*GRID));
        assertEq(e.normals[1].hi,int256(4*a*GRID));
        x[1]=0;e=C.evaluate(x,ctx,1);
        S.Int512 memory expected=S.fromParts(false,W.mul(3*a*GRID,3*a*GRID));
        assertEq(S.compare(e.residual.lo,expected),0);
        assertEq(S.compare(e.residual.hi,expected),0);
        assertFalse(C.certifiesMembership(e));
        x[1]=2*a*GRID;e=C.evaluate(x,ctx,1);
        expected=S.fromParts(true,W.scale(W.mul(a*GRID,a*GRID),7));
        assertEq(S.compare(e.residual.lo,expected),0);
        assertEq(S.compare(e.residual.hi,expected),0);
        assertTrue(C.certifiesMembership(e));
    }
    function testMixedOriginalRadicalSignsAndIndependentNormalGoldens() public pure {
        C.Context memory ctx=C.prepare(2,mixed(),1);
        uint256[] memory x=new uint256[](2);x[0]=SCALE/4*GRID;x[1]=104*SCALE/100*GRID;
        C.Evaluation memory e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.Evaluated));
        assertTrue(C.certifiesMembership(e));assertTrue(e.priceDomain);
        assertLt(S.compare(e.residual.hi,S.fromInt(0)),0);
        // Independent 110/160-digit explicit vector-normal calculation.
        enclose(e.normals[0].lo,e.normals[0].hi,38531892923517787793853895064350614681217124523110);
        enclose(e.normals[1].lo,e.normals[1].hi,18805920478082212206146104935649385318782875476889);
        x[1]=103*SCALE/100*GRID;e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.Evaluated));
        assertTrue(e.priceDomain);assertTrue(e.strictOutputPrice);
        assertGt(S.compare(e.residual.lo,S.fromInt(0)),0);
        assertFalse(C.certifiesMembership(e));
        enclose(e.normals[1].lo,e.normals[1].hi,19235417207682212206146104935649385318782875476889);
    }
    function enclose(int256 lo,int256 hi,int256 floor) private pure {
        assertLe(lo,floor);assertGe(hi,floor+1);assertLt(hi-lo,int256(uint256(1)<<96));
    }
    function testIndependentVectorAndBasketCorpusAcrossDimensions() public pure {
        for(uint256 index;index<4;index++){
            (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,int256[] memory normals,S.Int512 memory floor,bool feasible)=F.scalar(index);
            for(uint256 i;i<n;i++)x[i]*=GRID;
            C.Evaluation memory e=C.evaluate(x,C.prepare(n,ticks,count),1);
            assertEq(uint256(e.status),uint256(C.Status.Evaluated));
            assertEq(C.certifiesMembership(e),feasible);
            for(uint256 i;i<n;i++)enclose(e.normals[i].lo,e.normals[i].hi,normals[i]);
            assertLe(S.compare(e.residual.lo,floor),0);
            assertGe(S.compare(e.residual.hi,S.add(floor,S.fromInt(1))),0);
        }
    }
    function testSheetHoleIsExplicitAndNeverUsedAsARadicalBracket() public pure {
        C.Context memory ctx=C.prepare(2,mixed(),1);
        uint256[] memory x=new uint256[](2);x[0]=63*SCALE/100*GRID;x[1]=x[0];
        C.Evaluation memory e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.BelowSheet));
        assertFalse(C.certifiesMembership(e));assertEq(e.normals.length,0);
    }
    function testNearSheetEqualityRemainsUncertain() public pure {
        C.Context memory ctx=C.prepare(2,mixed(),1);
        uint256[] memory x=new uint256[](2);
        x[0]=4846405430584630880936490153975462233931*GRID;
        x[1]=8153594569415369119063509846024537766069*GRID;
        C.Evaluation memory e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.UncertainSheet));
        assertFalse(C.certifiesMembership(e));assertEq(e.normals.length,0);
    }
    function testWrongPartitionAndPrincipalFloorAreSeparateFromResidualSigns() public pure {
        C.Context memory ctx=C.prepare(2,mixed(),1);
        uint256[] memory x=new uint256[](2);x[0]=SCALE/4*GRID;x[1]=9*SCALE/10*GRID;
        C.Evaluation memory e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.OutsideDomain));assertFalse(C.certifiesMembership(e));
        x[0]=0;x[1]=13*SCALE/10*GRID;e=C.evaluate(x,ctx,1);
        assertEq(uint256(e.status),uint256(C.Status.OutsideDomain));
    }
    function testExactFractionalKeyEqualityAcceptsBothOneSidedPartitions() public pure {
        uint64 key=7*(1<<29)+1;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE+1),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        C.Context memory left=C.prepare(2,ticks,0);C.Context memory right=C.prepare(2,ticks,1);
        uint256[] memory x=new uint256[](2);x[0]=15*SCALE/10*GRID;x[1]=(2*SCALE+1)*key-x[0];
        assertNotEq(x[1]%GRID,0);
        assertTrue(C.certifiesMembership(C.evaluate(x,left,1)));
        assertTrue(C.certifiesMembership(C.evaluate(x,right,1)));
        x[1]--;
        assertEq(uint256(C.evaluate(x,right,1).status),uint256(C.Status.OutsideDomain));
        x[1]+=2;
        assertEq(uint256(C.evaluate(x,left,1).status),uint256(C.Status.OutsideDomain));
    }
    function testPositiveAggregateNormalsDoNotBypassBoundaryPriceFailure() public pure {
        uint64 key=7*(1<<30);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256 root=W.sqrt(W.mul(7*SCALE,SCALE));
        uint256[] memory x=new uint256[](3);
        x[0]=2*SCALE*GRID;x[1]=((3*SCALE-root)/4+SCALE/1e6)*GRID;x[2]=(3*SCALE+root)/4*GRID;
        C.Evaluation memory e=C.evaluate(x,C.prepare(3,ticks,1),1);
        assertEq(uint256(e.status),uint256(C.Status.Evaluated));
        for(uint256 i;i<3;i++)assertGt(e.normals[i].lo,0);
        assertLt(S.compare(e.residual.hi,S.fromInt(0)),0);
        assertFalse(e.priceDomain);assertFalse(C.certifiesMembership(e));
    }
    function testZeroOutputNormalDoesNotBecomeAStrictPrice() public pure {
        M.Tick[] memory ticks=new M.Tick[](1);
        ticks[0]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=0;x[1]=SCALE*GRID;
        C.Evaluation memory e=C.evaluate(x,C.prepare(2,ticks,0),1);
        assertTrue(C.certifiesMembership(e));assertFalse(e.strictOutputPrice);
        assertEq(e.normals[1].lo,0);assertEq(e.normals[1].hi,0);
    }
    function callPrepare(uint8 n,M.Tick[] memory ticks,uint8 count) external pure {C.prepare(n,ticks,count);}
    function callEvaluate(uint256[] memory x,C.Context memory ctx,uint8 output) external pure {C.evaluate(x,ctx,output);}
    function testRejectInvalidShapeAndRange() public {
        M.Tick[] memory ticks=mixed();
        vm.expectRevert(C.InvalidContext.selector);this.callPrepare(1,ticks,0);
        vm.expectRevert(C.InvalidContext.selector);this.callPrepare(2,ticks,2);
        C.Context memory ctx=C.prepare(2,ticks,1);
        uint256[] memory x=new uint256[](2);x[0]=(uint256(1)<<192);
        vm.expectRevert(C.InvalidPoint.selector);this.callEvaluate(x,ctx,1);
        x[0]=0;vm.expectRevert(C.InvalidPoint.selector);this.callEvaluate(x,ctx,2);
    }
}
