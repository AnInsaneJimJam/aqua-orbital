// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {DualCertificate as D} from "../src/libraries/DualCertificate.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract DualCertificateTest is Test {
    uint256 constant SCALE=1e30;
    uint256 constant GRID=1<<32;
    function full(uint8 n,uint192 radius) private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,radius,G.coefficients(n,type(uint64).max));
    }
    function mixed() private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](3);
        ticks[0]=M.Tick(6012954214,uint192(SCALE),G.coefficients(3,6012954214));
        ticks[1]=M.Tick(6871947673,uint192(SCALE),G.coefficients(3,6871947673));
        ticks[2]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
    }
    function testExactSupportAndOneUnitShortfall() public pure {
        M.Tick[] memory ticks=full(2,uint192(5*SCALE));
        uint256[] memory x=new uint256[](2);x[0]=2*SCALE;x[1]=SCALE;
        uint256[] memory p=new uint256[](2);p[0]=3;p[1]=4;
        D.Evaluation memory result=D.evaluate(x,ticks,p,1);
        assertEq(result.supportLower.hi,0);assertEq(result.supportLower.lo,10*SCALE);
        assertEq(result.dotCost.lo,10*SCALE);assertEq(result.gapUpper.lo,0);assertFalse(result.excluded);
        x[1]+=1;assertTrue(M.certify(x,ticks));
        result=D.evaluate(x,ticks,p,1);assertEq(result.gapUpper.lo,4);
        assertTrue(D.certifiesQuantum(x,ticks,p,1,1));
        x[1]+=1;assertFalse(D.certifiesQuantum(x,ticks,p,1,1));
    }
    function testFuzzExactPythagoreanSupport(uint96 radiusSeed,uint120 priceSeed,uint64 retainedSeed) public pure {
        uint256 k=uint256(radiusSeed)+1;uint256 priceScale=uint256(priceSeed)+1;uint256 retained=uint256(retainedSeed)+1;
        M.Tick[] memory ticks=full(2,uint192(5*k));
        uint256[] memory x=new uint256[](2);x[0]=2*k;x[1]=k+retained;
        uint256[] memory p=new uint256[](2);p[0]=3*priceScale;p[1]=4*priceScale;
        D.Evaluation memory result=D.evaluate(x,ticks,p,1);
        assertEq(result.supportLower.hi,0);assertEq(result.supportLower.lo,10*k*priceScale);
        assertEq(result.gapUpper.hi,0);assertEq(result.gapUpper.lo,4*priceScale*retained);
        assertTrue(D.certifiesQuantum(x,ticks,p,1,retained));
        // This identity checks the support bound; large retained values need
        // not satisfy geometric feasibility, which remains a separate check.
    }
    function testSupportWitnessExcludesCandidateWithoutTreatingCertificateFailureAsInfeasible() public pure {
        M.Tick[] memory ticks=full(2,uint192(5*SCALE));
        uint256[] memory x=new uint256[](2);x[0]=2*SCALE;x[1]=SCALE-1;
        uint256[] memory p=new uint256[](2);p[0]=3;p[1]=4;
        D.Evaluation memory result=D.evaluate(x,ticks,p,1);
        assertTrue(result.excluded);assertFalse(D.certifiesQuantum(x,ticks,p,1,100));
        assertTrue(W.lte(result.dotCost,result.supportLower));
    }
    function testThreeTokenMixedSupportMatchesIndependentWitness() public pure {
        M.Tick[] memory ticks=mixed();uint256[] memory x=new uint256[](3);
        x[0]=2019991169421260683343228254242;x[1]=x[0];x[2]=344904215286710149383874970554;
        uint256[] memory p=new uint256[](3);p[0]=1;p[1]=1;p[2]=3;
        assertTrue(M.certify(x,ticks));
        D.Evaluation memory result=D.evaluate(x,ticks,p,2);
        assertEq(result.boundaryCount,1);assertFalse(result.excluded);
        uint256 oracleFloor=5074694984702651814838081419642;
        assertEq(result.supportLower.hi,0);assertLe(result.supportLower.lo,oracleFloor);assertLe(oracleFloor-result.supportLower.lo,4);
        assertTrue(D.certifiesQuantum(x,ticks,p,2,1<<64));
        assertFalse(D.certifiesQuantum(x,ticks,p,2,1));
    }
    function testZeroOtherPricesUseBoundarySupportAndEqualPricesNeverDo() public pure {
        M.Tick[] memory ticks=mixed();uint256[] memory x=new uint256[](3);
        for(uint256 i;i<3;i++)x[i]=3*SCALE;
        uint256[] memory p=new uint256[](3);p[2]=1<<128;
        D.Evaluation memory result=D.evaluate(x,ticks,p,2);assertEq(result.boundaryCount,2);assertFalse(result.excluded);
        assertGt(result.supportLower.lo,0);
        p[0]=p[2];p[1]=p[2];
        result=D.evaluate(x,ticks,p,2);assertEq(result.boundaryCount,0);
    }
    function testPriceScalingPreservesSupportWithinDirectedRoundingBound() public pure {
        M.Tick[] memory ticks=mixed();uint256[] memory x=new uint256[](3);
        for(uint256 i;i<3;i++)x[i]=3*SCALE;
        uint256[] memory p=new uint256[](3);p[0]=1;p[1]=2;p[2]=4;
        D.Evaluation memory beforeScale=D.evaluate(x,ticks,p,2);
        for(uint256 i;i<3;i++)p[i]*=17;
        D.Evaluation memory afterScale=D.evaluate(x,ticks,p,2);
        assertTrue(W.lte(W.scale(beforeScale.supportLower,17),afterScale.supportLower));
        assertTrue(W.lte(afterScale.supportLower,W.add(W.scale(beforeScale.supportLower,17),W.Uint512(0,153))));
        assertEq(afterScale.dotCost.lo,beforeScale.dotCost.lo*17);
    }
    function testPersistedPartitionWouldGiveAnUnsafeUpperOutputBound() public pure {
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(uint64(3*GRID/4),uint192(SCALE),G.coefficients(2,uint64(3*GRID/4)));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=1246078370824610735719052953808;x[1]=253921629175389264280947046193;
        uint256[] memory p=new uint256[](2);p[0]=459640543058463088;p[1]=790359456941536911;
        assertTrue(M.certify(x,ticks));
        D.Evaluation memory result=D.evaluate(x,ticks,p,1);
        // The actual persisted geometry has a boundary tick, but BOTH support
        // minimizers for this particular p are interior. Copying its partition
        // would overestimate minimum cost and understate additional output.
        assertEq(result.boundaryCount,0);
        uint256 released=SCALE/10;
        uint256 wrongGapCeil=78358677395487091002801524053966413286849289234;
        assertLt(wrongGapCeil,p[1]*released);
        assertTrue(W.lte(W.mul(p[1],released),result.gapUpper));
        x[1]-=released;assertTrue(M.certify(x,ticks));
    }
    function testWideEightTokenEightTickBounds() public pure {
        uint256 r=(1<<159)/8;
        M.Tick[] memory ticks=new M.Tick[](8);
        for(uint256 i;i<7;i++){
            uint64 key=uint64((530+20*i)*GRID/100);
            ticks[i]=M.Tick(key,uint192(r),G.coefficients(8,key));
        }
        ticks[7]=M.Tick(type(uint64).max,uint192(r),G.coefficients(8,type(uint64).max));
        uint256[] memory x=new uint256[](8);uint256[] memory p=new uint256[](8);
        for(uint256 i;i<8;i++){x[i]=1<<159;p[i]=(1<<128)-i;}
        D.Evaluation memory result=D.evaluate(x,ticks,p,7);
        assertTrue(result.dotCost.hi!=0);assertTrue(result.supportLower.hi!=0);assertFalse(result.excluded);
        assertTrue(W.lte(result.supportLower,result.dotCost));
        // Wide transverse branch as well as the equal-price-like free branch.
        for(uint256 i;i<7;i++)p[i]=0;
        p[7]=1<<128;result=D.evaluate(x,ticks,p,7);
        assertEq(result.boundaryCount,7);assertTrue(result.supportLower.hi!=0);
    }
    function evaluateExternal(uint256[] memory x,M.Tick[] memory ticks,uint256[] memory p,uint8 output) external pure {D.evaluate(x,ticks,p,output);}
    function quantumExternal(uint256[] memory x,M.Tick[] memory ticks,uint256[] memory p,uint8 output,uint256 quantum) external pure {D.certifiesQuantum(x,ticks,p,output,quantum);}
    function testInvalidDomainAndZeroOutputPriceFailExplicitly() public {
        M.Tick[] memory ticks=full(2,uint192(SCALE));
        uint256[] memory x=new uint256[](2);x[0]=SCALE;x[1]=SCALE;
        uint256[] memory p=new uint256[](2);p[0]=1;
        vm.expectRevert(D.InvalidDomain.selector);this.evaluateExternal(x,ticks,p,1);
        p[1]=1;p[0]=(1<<128)+1;
        vm.expectRevert(D.InvalidDomain.selector);this.evaluateExternal(x,ticks,p,1);
        p[0]=1;x[0]=1<<160;
        vm.expectRevert(D.InvalidDomain.selector);this.evaluateExternal(x,ticks,p,1);
        x[0]=SCALE;
        vm.expectRevert(D.InvalidDomain.selector);this.quantumExternal(x,ticks,p,1,0);
        ticks[0].key=0;
        vm.expectRevert(D.InvalidDomain.selector);this.evaluateExternal(x,ticks,p,1);
    }
}
