// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {FrontierTurn as T} from "../src/libraries/FrontierTurn.sol";

contract FrontierTurnTest is Test {
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    uint256 constant SCALE=1e40;
    function ticks(uint8 n,uint64 key,uint256 first,uint256 full) private pure returns(M.Tick[] memory t){
        t=new M.Tick[](2);
        t[0]=M.Tick(key,uint192(first),G.coefficients(n,key));
        t[1]=M.Tick(type(uint64).max,uint192(full),G.coefficients(n,type(uint64).max));
    }
    function assertWideEq(S.Int512 memory a,S.Int512 memory b) private pure {assertEq(S.compare(a,b),0);}
    function testTwoTokenCounterexampleSevenSixteenths() public pure {
        T.Context memory ctx=T.prepare(2,ticks(2,uint64(5*GRID/8),SCALE,SCALE),1);
        T.Result memory r=T.evaluate(ctx,new uint256[](0));
        assertEq(uint256(r.status),uint256(T.Status.ProvenPositive));
        // Exact D=7*SCALE^2/16; returned bounds enclose n*GRID^2*D.
        S.Int512 memory exact=S.fromParts(false,W.scale(W.mul(SCALE*GRID,SCALE*GRID),7));
        exact=S.divDown(exact,8);
        assertLe(S.compare(r.discriminant.lo,exact),0);assertGe(S.compare(r.discriminant.hi,exact),0);
    }
    function testFractionalSeamIsNeverRoundedToOriginalLength() public pure {
        uint256 s=SCALE+1;
        T.Context memory ctx=T.prepare(2,ticks(2,uint64(5*GRID/8),s,s),1);
        assertEq(ctx.sumNumerator,5*s*GRID/4);assertEq(ctx.sumNumerator%GRID,GRID/4);
        assertEq(uint256(T.evaluate(ctx,new uint256[](0)).status),uint256(T.Status.ProvenPositive));
    }
    function testStrictPositiveRequiresPositiveLowerBound() public pure {
        T.Result memory r=T.evaluate(T.prepare(2,ticks(2,uint64(5*GRID/8),1,1),1),new uint256[](0));
        assertWideEq(r.discriminant.lo,S.fromUint(0));assertGt(S.compare(r.discriminant.hi,S.fromUint(0)),0);
        assertEq(uint256(r.status),uint256(T.Status.Uncertain));
    }
    function tangent7(uint256 s) private pure returns(T.Context memory ctx,uint256[] memory untouched){
        ctx=T.prepare(7,ticks(7,uint64(35*GRID/8),8*s,8*s),1);
        untouched=new uint256[](5);
        untouched[0]=10*s;untouched[1]=10*s;untouched[2]=10*s;untouched[3]=9*s;untouched[4]=9*s;
    }
    function testExactPhysicalTangentIsProvenNonpositive() public pure {
        (T.Context memory ctx,uint256[] memory u)=tangent7(SCALE);
        assertEq(ctx.sumNumerator,70*SCALE*GRID);assertEq(ctx.rhoLo,2*SCALE*GRID);assertEq(ctx.rhoHi,ctx.rhoLo);
        T.Result memory r=T.evaluate(ctx,u);
        assertEq(uint256(r.status),uint256(T.Status.ProvenNonpositive));
        assertWideEq(r.discriminant.lo,S.fromUint(0));assertWideEq(r.discriminant.hi,S.fromUint(0));
    }
    function tangent8(uint256 s,int256 epsilon) private pure returns(T.Context memory ctx,uint256[] memory u){
        ctx=T.prepare(8,ticks(8,uint64(11*GRID/2),s,3*s),1);
        u=new uint256[](6);for(uint256 i;i<5;i++)u[i]=3*s;
        u[5]=uint256(int256(s)+epsilon);
    }
    function testExactAndBothNearTangentSignsPreserveUncertainty() public pure {
        for(int256 e=-1;e<=1;e++){
            (T.Context memory ctx,uint256[] memory u)=tangent8(SCALE,e);
            T.Result memory r=T.evaluate(ctx,u);
            assertEq(uint256(r.status),uint256(T.Status.Uncertain));
            // Exact n*D=64*SCALE*epsilon-24*epsilon^2, all scaled by GRID^2.
            S.Int512 memory exact=S.mulUint(S.fromInt(64*int256(SCALE)*e-24*e*e),GRID*GRID);
            assertLe(S.compare(r.discriminant.lo,exact),0);assertGe(S.compare(r.discriminant.hi,exact),0);
            assertLt(S.compare(r.discriminant.lo,S.fromUint(0)),0);assertGt(S.compare(r.discriminant.hi,S.fromUint(0)),0);
        }
    }
    function testThreeTokenExactSignsAndNegativePairSum() public pure {
        T.Context memory ctx=T.prepare(3,ticks(3,uint64(3*GRID/2),SCALE,SCALE),1);
        uint256[] memory u=new uint256[](1);
        u[0]=SCALE;
        T.Result memory r=T.evaluate(ctx,u);
        S.Int512 memory exact=S.fromParts(false,W.scale(W.mul(SCALE*GRID,SCALE*GRID),6));
        assertWideEq(r.discriminant.lo,exact);assertWideEq(r.discriminant.hi,exact);
        assertEq(uint256(r.status),uint256(T.Status.ProvenPositive));
        u[0]=10*SCALE;r=T.evaluate(ctx,u);
        exact=S.fromParts(true,W.scale(W.mul(SCALE*GRID,SCALE*GRID),723));
        assertWideEq(r.discriminant.lo,exact);assertWideEq(r.discriminant.hi,exact);
        assertEq(uint256(r.status),uint256(T.Status.ProvenNonpositive));
        // This is only a discriminant sign: these untouched reserves do not
        // assert any physical root, feasible endpoint or reachable path.
    }
    function testLargestBoundaryAndOriginalContributionRounding() public pure {
        uint64 first=uint64(14*GRID/10);uint64 outer=uint64(3*GRID/2);
        M.Tick[] memory t=new M.Tick[](3);
        t[0]=M.Tick(first,uint192(SCALE+1),G.coefficients(3,first));
        t[1]=M.Tick(outer,uint192(2*SCALE+3),G.coefficients(3,outer));
        t[2]=M.Tick(type(uint64).max,uint192(3*SCALE+7),G.coefficients(3,type(uint64).max));
        T.Context memory ctx=T.prepare(3,t,2);
        assertEq(ctx.key,outer);
        assertEq(ctx.sumNumerator,(SCALE+1)*first+(5*SCALE+10)*outer);
        assertEq(ctx.rhoLo,(W.mulDiv(SCALE+1,t[0].coefficients.sigmaLo,Q,false)+(2*SCALE+3)/2+(3*SCALE+7)/2)*GRID);
        assertEq(ctx.rhoHi,(W.mulDiv(SCALE+1,t[0].coefficients.sigmaHi,Q,true)+(2*SCALE+4)/2+(3*SCALE+8)/2)*GRID);
        assertEq(ctx.rhoLo%GRID,0);assertEq(ctx.rhoHi%GRID,0);
    }
    function testMaximumWidthsTwoThreeSevenEight() public pure {
        uint256 s=uint256(1)<<158;
        assertEq(uint256(T.evaluate(T.prepare(2,ticks(2,uint64(5*GRID/8),s,s),1),new uint256[](0)).status),uint256(T.Status.ProvenPositive));
        uint256[] memory u3=new uint256[](1);u3[0]=s;
        assertEq(uint256(T.evaluate(T.prepare(3,ticks(3,uint64(3*GRID/2),s,s),1),u3).status),uint256(T.Status.ProvenPositive));
        (T.Context memory c7,uint256[] memory u7)=tangent7(uint256(1)<<155);
        assertEq(uint256(T.evaluate(c7,u7).status),uint256(T.Status.ProvenNonpositive));
        (T.Context memory c8,uint256[] memory u8)=tangent8(uint256(1)<<157,0);
        assertEq(uint256(T.evaluate(c8,u8).status),uint256(T.Status.Uncertain));
    }
    function testIndependentSignedEndpointGoldens() public pure {
        // Ordered independent Python cases: n3_robust_negative,
        // n8_robust_negative, n3_two_boundary_prefix. Signed magnitudes.
        uint256[3] memory lowerHigh=[uint256(2223579495177772313131702),105781302899194831194717,239905706877321520293825];
        uint256[3] memory lowerLow=[uint256(82348187924949074286299824391802730442676982153745401026780599625747636682752),76238875128890827515342866375607111766586066632114969731694674618406443941888,11538774593452462204546136422609628550751234420834555578451160424740393488220];
        uint256[3] memory upperHigh=[uint256(2223579495177772313131702),105781302899194831194717,239905706877321520293825];
        uint256[3] memory upperLow=[uint256(82348187924947818364869512598167918181486498600127516039699433521798661013504),76238875128889513347958736211009353405755111815492316512534702016575907561472,11538774593452672802990373077610880383032450015865354889963176340284294467420];
        for(uint8 i;i<3;i++){
            (T.Context memory ctx,uint256[] memory u)=goldenContext(i);
            T.Result memory r=T.evaluate(ctx,u);
            assertWideEq(r.discriminant.lo,S.fromParts(i<2,W.Uint512(lowerHigh[i],lowerLow[i])));
            assertWideEq(r.discriminant.hi,S.fromParts(i<2,W.Uint512(upperHigh[i],upperLow[i])));
            assertEq(uint256(r.status),uint256(i<2?T.Status.ProvenNonpositive:T.Status.ProvenPositive));
        }
    }
    function goldenContext(uint8 index) private pure returns(T.Context memory ctx,uint256[] memory u){
        if(index==1)return tangent8(SCALE,-int256(SCALE/10));
        u=new uint256[](1);
        if(index==0){
            ctx=T.prepare(3,ticks(3,uint64(13*GRID/10),SCALE/100,10*SCALE),1);
            u[0]=SCALE/10;return(ctx,u);
        }
        uint64 first=uint64(14*GRID/10);uint64 outer=uint64(3*GRID/2);
        M.Tick[] memory t=new M.Tick[](3);
        t[0]=M.Tick(first,uint192(SCALE+1),G.coefficients(3,first));
        t[1]=M.Tick(outer,uint192(2*SCALE+3),G.coefficients(3,outer));
        t[2]=M.Tick(type(uint64).max,uint192(3*SCALE+7),G.coefficients(3,type(uint64).max));
        ctx=T.prepare(3,t,2);u[0]=SCALE;
    }
    function testPreparationRecomputesUntrustedTickCoefficients() public pure {
        M.Tick[] memory t=ticks(3,uint64(3*GRID/2),SCALE,SCALE);
        t[0].coefficients.sigmaLo=0;t[0].coefficients.sigmaHi=type(uint256).max;
        t[0].coefficients.virtualLo=type(uint256).max;
        T.Context memory ctx=T.prepare(3,t,1);
        assertEq(ctx.rhoLo,SCALE*GRID);assertEq(ctx.rhoHi,SCALE*GRID);
    }
    function testFuzzExactThreeTokenAgainstIntegerPolynomial(uint128 seed,uint8 ratio) public pure {
        uint256 s=uint256(seed)+1;uint256 c=uint256(ratio)*s;
        T.Context memory ctx=T.prepare(3,ticks(3,uint64(3*GRID/2),2*s,2*s),1);
        uint256[] memory u=new uint256[](1);u[0]=c;
        T.Result memory r=T.evaluate(ctx,u);
        // For radius 2s+2s and b=3/2, nD=-12s²+36sc-9c².
        S.Int512 memory exact=S.sub(S.fromParts(false,W.scale(W.mul(s,c),36)),
            S.fromParts(false,W.add(W.scale(W.mul(s,s),12),W.scale(W.mul(c,c),9))));
        exact=S.mulUint(exact,GRID*GRID);
        assertWideEq(r.discriminant.lo,exact);assertWideEq(r.discriminant.hi,exact);
        assertEq(uint256(r.status),uint256(S.compare(exact,S.fromUint(0))<=0?T.Status.ProvenNonpositive:T.Status.ProvenPositive));
    }
    function prepareCall(uint8 n,M.Tick[] memory t,uint8 count) external pure {T.prepare(n,t,count);}
    function evaluateCall(T.Context memory ctx,uint256[] memory u) external pure {T.evaluate(ctx,u);}
    function testRejectDefaultSphereAndMalformedPoints() public {
        T.Context memory empty;
        vm.expectRevert(T.InvalidContext.selector);this.evaluateCall(empty,new uint256[](0));
        M.Tick[] memory t=ticks(3,uint64(3*GRID/2),SCALE,SCALE);
        vm.expectRevert(T.InvalidContext.selector);this.prepareCall(3,t,0);
        vm.expectRevert(C.InvalidContext.selector);this.prepareCall(3,t,2);
        T.Context memory ctx=T.prepare(3,t,1);
        vm.expectRevert(T.InvalidPoint.selector);this.evaluateCall(ctx,new uint256[](0));
        uint256[] memory u=new uint256[](1);u[0]=uint256(1)<<160;
        vm.expectRevert(T.InvalidPoint.selector);this.evaluateCall(ctx,u);
    }
}
