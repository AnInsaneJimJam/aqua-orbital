// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {RootBracket as B} from "../src/libraries/RootBracket.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

contract RootBracketTest is Test {
    uint256 constant GRID=1<<32;
    uint256 constant SCALE=1e40;
    uint256 constant MIXED_ROOT_FLOOR=44500767304604138371755601356080263154504059660318;
    function sphere(uint256 radius) private pure returns(C.Context memory){
        M.Tick[] memory ticks=new M.Tick[](1);
        ticks[0]=M.Tick(type(uint64).max,uint192(radius),G.coefficients(2,type(uint64).max));
        return C.prepare(2,ticks,0);
    }
    function mixed() private pure returns(C.Context memory){
        M.Tick[] memory ticks=new M.Tick[](2);uint64 key=5*(1<<29);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        return C.prepare(2,ticks,1);
    }
    function pair(uint256 a,uint256 z) private pure returns(uint256[] memory x){
        x=new uint256[](2);x[0]=a;x[1]=z;
    }
    function assertBracket(B.Bracket memory b,uint256[] memory x,C.Context memory ctx,uint8 output) private pure {
        assertTrue(b.certified);assertLe(b.lo,b.hi);assertEq(b.width,b.hi-b.lo);
        uint256[] memory point=new uint256[](x.length);for(uint256 i;i<x.length;i++)point[i]=x[i];
        point[output]=b.lo;C.Evaluation memory low=C.evaluate(point,ctx,output);
        point[output]=b.hi;C.Evaluation memory high=C.evaluate(point,ctx,output);
        assertEq(uint256(low.status),uint256(C.Status.Evaluated));assertTrue(low.priceDomain);
        assertGe(S.compare(low.residual.lo,S.fromInt(0)),0);
        assertTrue(C.certifiesMembership(high));assertTrue(high.strictOutputPrice);
    }
    function testExactSphereRootAndCallerReservesArePreserved() public pure {
        uint256 a=uint256(1)<<150;C.Context memory ctx=sphere(5*a);
        uint256[] memory x=pair(2*a*GRID,2*a*GRID);
        B.Bracket memory b=B.refine(x,ctx,1,0,160);
        assertEq(uint256(b.status),uint256(B.Status.Exact));assertEq(b.lo,a*GRID);assertEq(b.hi,b.lo);
        assertEq(b.used,1);assertEq(b.remaining,159);assertEq(x[1],2*a*GRID);assertBracket(b,x,ctx,1);
    }
    function testEndpointEqualityCollapsesWithoutSpendingBudget() public pure {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(2*GRID,2*GRID);
        B.Bracket memory b=B.refine(x,ctx,1,GRID,0);
        assertEq(uint256(b.status),uint256(B.Status.Exact));assertEq(b.lo,GRID);assertEq(b.width,0);assertEq(b.used,0);
        x[1]=GRID;b=B.refine(x,ctx,1,0,0);
        assertEq(uint256(b.status),uint256(B.Status.Exact));assertEq(b.lo,GRID);
        b=B.refine(x,ctx,1,GRID,0);
        assertEq(uint256(b.status),uint256(B.Status.Exact));assertBracket(b,x,ctx,1);
    }
    function testIrrationalSphereRootMatchesIndependentBigintGolden() public pure {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(3*GRID,GRID);
        B.Bracket memory b=B.refine(x,ctx,1,0,160);
        // Python isqrt: floor(5*GRID-sqrt(21*GRID^2)) = 1792823738.
        assertEq(uint256(b.status),uint256(B.Status.Adjacent));assertEq(b.lo,1792823738);assertEq(b.hi,b.lo+1);
        assertEq(b.used,32);assertEq(b.remaining,128);assertBracket(b,x,ctx,1);
    }
    function testMixedRootEnclosesIndependent110And160DigitGolden() public pure {
        C.Context memory ctx=mixed();uint256[] memory x=pair(SCALE/4*GRID,104*SCALE/100*GRID);
        B.Bracket memory b=B.refine(x,ctx,1,103*SCALE/100*GRID,160);
        assertEq(uint256(b.status),uint256(B.Status.Uncertain));assertLe(b.lo,MIXED_ROOT_FLOOR);
        assertGe(b.hi,MIXED_ROOT_FLOOR+1);assertGt(b.used,1);assertLe(b.used,160);
        assertEq(uint256(b.used)+b.remaining,160);assertBracket(b,x,ctx,1);
    }
    function testUncertainMidpointPreservesPreviousOutwardBracket() public pure {
        C.Context memory ctx=mixed();uint256 delta=1e15;
        uint256[] memory x=pair(SCALE/4*GRID,MIXED_ROOT_FLOOR+delta);uint256 low=MIXED_ROOT_FLOOR-delta;
        B.Bracket memory b=B.refine(x,ctx,1,low,7);
        assertEq(uint256(b.status),uint256(B.Status.Uncertain));assertEq(b.lo,low);assertEq(b.hi,x[1]);
        assertEq(b.used,1);assertEq(b.remaining,6);assertBracket(b,x,ctx,1);
    }
    function checkHigherDimensionalGolden(uint256 index,uint256 rootFloor) private pure {
        (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(index);
        for(uint256 i;i<n;i++)x[i]*=GRID;
        C.Context memory ctx=C.prepare(n,ticks,count);
        B.Bracket memory b=B.refine(x,ctx,1,x[1]-1e28*GRID,160);
        assertEq(uint256(b.status),uint256(B.Status.Uncertain));assertLe(b.lo,rootFloor);assertGe(b.hi,rootFloor+1);
        assertEq(uint256(b.used)+b.remaining,160);assertBracket(b,x,ctx,1);
    }
    function testThreeTokenTwoBoundaryRootMatchesIndependentGolden() public pure {
        checkHigherDimensionalGolden(2,118110706132445067948266727102904585864375072737707);
    }
    function testEightTokenTwoBoundaryRootMatchesIndependentGolden() public pure {
        checkHigherDimensionalGolden(3,468195371646119086619158565181678623455543623944581);
    }
    function testZeroBudgetAndOneStepExposeRemainingWidth() public pure {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(3*GRID,GRID);
        B.Bracket memory b=B.refine(x,ctx,1,0,0);
        assertEq(uint256(b.status),uint256(B.Status.BudgetExhausted));assertEq(b.width,GRID);assertEq(b.used,0);
        assertBracket(b,x,ctx,1);b=B.refine(x,ctx,1,0,1);
        assertEq(uint256(b.status),uint256(B.Status.BudgetExhausted));assertEq(b.width,GRID/2);
        assertEq(b.used,1);assertEq(b.remaining,0);assertBracket(b,x,ctx,1);
    }
    function testSharedBudgetDoesNotClaimGridAdjacencyAtMaximumLengths() public pure {
        C.Context memory small=sphere(5);uint256[] memory first=pair(2*GRID,2*GRID);
        B.Bracket memory a=B.refine(first,small,1,0,160);assertEq(a.remaining,159);
        uint256 scale=uint256(1)<<156;C.Context memory ctx=sphere(5*scale);
        uint256[] memory x=pair(3*scale*GRID,scale*GRID);
        B.Bracket memory b=B.refine(x,ctx,1,0,a.remaining);
        assertEq(uint256(b.status),uint256(B.Status.BudgetExhausted));assertEq(b.width,uint256(1)<<29);
        assertEq(uint256(a.used)+b.used,160);assertEq(b.remaining,0);assertBracket(b,x,ctx,1);
    }
    function testEndpointsWithSameResidualSignDoNotCertifyABracket() public pure {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(3*GRID,GRID);
        B.Bracket memory b=B.refine(x,ctx,1,9*GRID/10,160);
        assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedSigns));assertEq(b.used,0);
        x[1]=GRID/10;b=B.refine(x,ctx,1,0,160);
        assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedSigns));
    }
    function testZeroOutputPriceAndWrongPartitionDoNotCertifyDomain() public pure {
        B.Bracket memory b=B.refine(pair(3*GRID,5*GRID),sphere(5),1,0,160);
        assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedDomain));
        b=B.refine(pair(SCALE/4*GRID,104*SCALE/100*GRID),mixed(),1,9*SCALE/10*GRID,160);
        assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedDomain));assertEq(b.used,0);
    }
    function testVarianceHoleCannotBeBisectedBetweenValidEndpoints() public pure {
        uint64 key=8589934594;M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,1e34,G.coefficients(4,key));
        ticks[1]=M.Tick(type(uint64).max,2e40,G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);
        x[0]=10000005002677032735432878647444639154049*GRID;
        x[1]=10000005002434266888024259856480263135016*GRID;x[2]=x[1];
        x[3]=10000005003013538801076603618066816768323*GRID;
        uint256 low=10000005002016838873244328622203293514398*GRID;
        C.Context memory ctx=C.prepare(4,ticks,1);
        assertTrue(C.certifiesMembership(C.evaluate(x,ctx,3)));
        uint256[] memory end=new uint256[](4);for(uint256 i;i<4;i++)end[i]=x[i];end[3]=low;
        assertTrue(C.certifiesMembership(C.evaluate(end,ctx,3)));
        B.Bracket memory b=B.refine(x,ctx,3,low,160);
        assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedDomain));assertEq(b.used,0);
    }
    function testHiddenBoundaryMaximumRejectsDomainAtBothWidthScales() public pure {
        for(uint256 run;run<2;run++){
            uint256 scale=run==0?SCALE:uint256(1)<<156;
            uint64 key=7*(1<<30);M.Tick[] memory ticks=new M.Tick[](2);
            ticks[0]=M.Tick(key,uint192(scale/100),G.coefficients(3,key));
            ticks[1]=M.Tick(type(uint64).max,uint192(10*scale),G.coefficients(3,type(uint64).max));
            uint256[] memory x=new uint256[](3);x[0]=61*scale/10*GRID;x[1]=6*scale*GRID;x[2]=x[0];
            uint256 low=56*scale/10*GRID;C.Context memory ctx=C.prepare(3,ticks,1);
            assertTrue(C.certifiesMembership(C.evaluate(x,ctx,2)));
            uint256[] memory end=new uint256[](3);for(uint256 i;i<3;i++)end[i]=x[i];end[2]=low;
            assertTrue(C.certifiesMembership(C.evaluate(end,ctx,2)));
            B.Bracket memory b=B.refine(x,ctx,2,low,160);
            assertFalse(b.certified);assertEq(uint256(b.status),uint256(B.Status.UncertifiedDomain));assertEq(b.used,0);
        }
    }
    function callRefine(uint256[] memory x,C.Context memory ctx,uint8 output,uint256 low,uint8 budget) external pure {
        B.refine(x,ctx,output,low,budget);
    }
    function assertSameResidual(uint256[] memory x,C.Context memory ctx,uint8 output,C.Vertical memory fixedPoint) private pure {
        C.Evaluation memory full=C.evaluate(x,ctx,output);
        C.ResidualEvaluation memory residual=C.evaluateResidual(fixedPoint,ctx,x[output]);
        assertEq(uint256(residual.status),uint256(full.status));
        if(full.status==C.Status.Evaluated){
            assertEq(residual.rhoLo,full.rhoLo);assertEq(residual.rhoHi,full.rhoHi);
            assertEq(S.compare(residual.residual.lo,full.residual.lo),0);
            assertEq(S.compare(residual.residual.hi,full.residual.hi),0);
        }
    }
    function testResidualOnlyMatchesFullEvaluationAcrossDimensionsAndChangedOutput() public pure {
        for(uint256 index;index<4;index++){
            (uint8 n,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(index);
            for(uint256 i;i<n;i++)x[i]*=GRID;
            C.Context memory ctx=C.prepare(n,ticks,count);C.Vertical memory fixedPoint=C.prepareVertical(x,1);
            assertSameResidual(x,ctx,1,fixedPoint);x[1]-=1e20*GRID;assertSameResidual(x,ctx,1,fixedPoint);
        }
        uint256[] memory spherePoint=pair(3*GRID,GRID);C.Vertical memory fixedSphere=C.prepareVertical(spherePoint,1);
        assertSameResidual(spherePoint,sphere(5),1,fixedSphere);spherePoint[1]=0;
        assertSameResidual(spherePoint,sphere(5),1,fixedSphere);
    }
    function testResidualOnlyRetainsSheetStatusesWithoutInventingSigns() public pure {
        C.Context memory ctx=mixed();uint256[] memory x=pair(63*SCALE/100*GRID,63*SCALE/100*GRID);
        assertSameResidual(x,ctx,1,C.prepareVertical(x,1));
        x[0]=4846405430584630880936490153975462233931*GRID;
        x[1]=8153594569415369119063509846024537766069*GRID;
        assertSameResidual(x,ctx,1,C.prepareVertical(x,1));
        x[0]=0;x[1]=0;assertSameResidual(x,ctx,1,C.prepareVertical(x,1));
    }
    function testResidualOnlyCannotSubstituteForMembership() public pure {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(6*GRID,GRID);
        C.Evaluation memory full=C.evaluate(x,ctx,1);
        C.ResidualEvaluation memory residual=C.evaluateResidual(C.prepareVertical(x,1),ctx,x[1]);
        assertEq(uint256(residual.status),uint256(C.Status.Evaluated));assertFalse(full.priceDomain);
        assertFalse(C.certifiesMembership(full));assertLt(S.compare(residual.residual.hi,S.fromInt(0)),0);
    }
    function callVertical(uint256[] memory x,uint8 output) external pure {C.prepareVertical(x,output);}
    function callResidual(C.Vertical memory fixedPoint,C.Context memory ctx,uint256 z) external pure {C.evaluateResidual(fixedPoint,ctx,z);}
    function testResidualPreparationRejectsShapeAndCoordinateRange() public {
        uint256[] memory x=pair(3*GRID,GRID);C.Context memory ctx=sphere(5);
        vm.expectRevert(C.InvalidPoint.selector);this.callVertical(x,2);
        C.Vertical memory fixedPoint=C.prepareVertical(x,1);
        vm.expectRevert(C.InvalidPoint.selector);this.callResidual(fixedPoint,ctx,uint256(1)<<192);
        fixedPoint.n=3;
        vm.expectRevert(C.InvalidPoint.selector);this.callResidual(fixedPoint,ctx,GRID);
        x[0]=uint256(1)<<192;
        vm.expectRevert(C.InvalidPoint.selector);this.callVertical(x,1);
    }
    function testRejectMalformedBoundsAndOversizedBudget() public {
        C.Context memory ctx=sphere(5);uint256[] memory x=pair(3*GRID,GRID);
        vm.expectRevert(B.InvalidBounds.selector);this.callRefine(x,ctx,1,GRID+1,160);
        vm.expectRevert(B.InvalidBounds.selector);this.callRefine(x,ctx,2,0,160);
        vm.expectRevert(B.InvalidBudget.selector);this.callRefine(x,ctx,1,0,161);
    }
    function testFuzzSphereRootBracketHasIndependentSquareInequalities(uint128 seed) public pure {
        uint256 a=uint256(seed)+1;C.Context memory ctx=sphere(5*a);
        uint256[] memory x=pair(3*a*GRID,a*GRID);B.Bracket memory b=B.refine(x,ctx,1,0,160);
        assertTrue(b.certified);assertEq(uint256(b.status),uint256(B.Status.Adjacent));assertEq(b.width,1);
        uint256 radius=5*a*GRID;W.Uint512 memory target=W.mul(radius,radius);
        W.Uint512 memory fixedSquare=W.mul(2*a*GRID,2*a*GRID);
        assertTrue(W.lte(target,W.add(fixedSquare,W.mul(radius-b.lo,radius-b.lo))));
        assertTrue(W.lte(W.add(fixedSquare,W.mul(radius-b.hi,radius-b.hi)),target));
        assertLe(b.used,160);assertEq(uint256(b.used)+b.remaining,160);
    }
}
