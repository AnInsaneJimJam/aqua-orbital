// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {SlackCertificate as S} from "../src/libraries/SlackCertificate.sol";

contract SlackCertificateTest is Test {
    uint256 constant SCALE=1e40;
    function testInwardReleaseAcrossFractionalKeyPlane() public pure {
        uint64 key=7*(1<<29)+1;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE+1),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=15*SCALE/10;x[1]=3*SCALE/10;
        (bool valid,uint8 crossings)=S.certifyInwardRelease(x,ticks,1,SCALE/5);
        assertTrue(valid);assertEq(crossings,1);assertEq(x[1],3*SCALE/10,"must not mutate caller reserves");
        assertFalse(S.certifyFixedPartition(x,ticks,1,SCALE/5));
    }
    function testInwardReleaseCountsZeroDistanceDeparture() public pure {
        uint64 key=7*(1<<29);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=15*SCALE/10;x[1]=SCALE/4;
        (bool valid,uint8 crossings)=S.certifyInwardRelease(x,ticks,1,SCALE/4-1);
        assertTrue(valid);assertEq(crossings,1);
        (valid,crossings)=S.certifyInwardRelease(x,ticks,1,x[1]);
        assertTrue(valid);assertEq(crossings,0);
    }
    function testInwardReleaseTraversesTwoKeysInOrder() public pure {
        M.Tick[] memory ticks=new M.Tick[](3);
        ticks[0]=M.Tick(3*(1<<30),uint192(SCALE),G.coefficients(2,3*(1<<30)));
        ticks[1]=M.Tick(7*(1<<29),uint192(SCALE),G.coefficients(2,7*(1<<29)));
        ticks[2]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=21*SCALE/10;x[1]=SCALE/2;
        (bool valid,uint8 crossings)=S.certifyInwardRelease(x,ticks,1,14*SCALE/100);
        assertTrue(valid);assertEq(crossings,2);
    }
    function testInwardReleaseSupportsSevenDistinctSeams() public pure {
        M.Tick[] memory ticks=new M.Tick[](8);
        for(uint256 i;i<7;i++){
            uint64 key=uint64(((980+i)*(1<<32))/1000);
            ticks[i]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));
        }
        ticks[7]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=74*SCALE/10;x[1]=SCALE/2;
        (bool valid,uint8 crossings)=S.certifyInwardRelease(x,ticks,1,4*SCALE/10);
        // Geometry fixture only; it does not assert a reachable one-raw-unit history.
        assertTrue(valid);assertEq(crossings,7);
    }
    function testThreeTokenReleaseCrossesTwoKeysWithWideProofCoordinates() public pure {
        // First scale independently checked with explicit per-tick MATH-7 baskets.
        // The second exercises lifted coordinates above 2^160 without enlarging storage.
        for(uint256 run;run<2;run++){
            uint256 scale=run==0?SCALE:uint256(1)<<156;
            M.Tick[] memory ticks=new M.Tick[](3);
            uint64 inner=6012954214;uint64 outer=3*(1<<31);
            ticks[0]=M.Tick(inner,uint192(scale/100+1),G.coefficients(3,inner));
            ticks[1]=M.Tick(outer,uint192(scale/100+3),G.coefficients(3,outer));
            ticks[2]=M.Tick(type(uint64).max,uint192(10*scale),G.coefficients(3,type(uint64).max));
            uint256[] memory x=new uint256[](3);x[0]=61*scale/10;x[1]=6*scale;x[2]=61*scale/10;
            (bool valid,uint8 crossings)=S.certifyInwardRelease(x,ticks,2,19*scale/10);
            assertTrue(valid);assertEq(crossings,2);
        }
    }
    function testAllInteriorVerticalSegment() public pure {
        M.Tick[] memory ticks=new M.Tick[](1);
        ticks[0]=M.Tick(type(uint64).max,uint192(2*SCALE),G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);
        for(uint256 i;i<4;i++)x[i]=SCALE;
        x[1]+=SCALE/1000;
        assertTrue(S.certifyFixedPartition(x,ticks,1,SCALE));
        assertFalse(S.certifyFixedPartition(x,ticks,1,SCALE-1));
        assertFalse(S.certifyFixedPartition(x,ticks,1,x[1]+1));
    }
    function testValidMixedBoundaryRelease() public pure {
        uint64 key=3*(1<<31);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);
        x[0]=17244669164959010447296955565943832839392;
        x[1]=10891143583162567711396362223261049950605;
        x[2]=2419752807433977396862237766350672765557;
        assertTrue(S.certifyFixedPartition(x,ticks,1,x[1]-SCALE/2e6));
    }
    function testBoundaryCoordinateCanPeakBetweenValidEndpoints() public pure {
        uint64 key=7*(1<<30);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE/100),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=61*SCALE/10;x[1]=6*SCALE;x[2]=61*SCALE/10;
        assertTrue(M.certify(x,ticks));
        uint256[] memory end=new uint256[](3);end[0]=x[0];end[1]=x[1];end[2]=56*SCALE/10;
        assertTrue(M.certify(end,ticks));
        // The largest untouched coordinate has its direction maximum at z=6.
        assertFalse(S.certifyFixedPartition(x,ticks,2,end[2]));
        (bool valid,)=S.certifyInwardRelease(x,ticks,2,end[2]);assertFalse(valid);
    }
    function testCheckedWideScale() public pure {
        W.Uint512 memory scaled=W.scale(W.Uint512(1,type(uint256).max),3);
        assertEq(scaled.hi,5);assertEq(scaled.lo,type(uint256).max-2);
    }
    function testBoundaryPeakWithBothEndpointsBelowUntouchedMean() public pure {
        uint64 key=7086696038; // floor(1.65 * 2^32).
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE/100),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=61*SCALE/10;x[1]=6*SCALE;x[2]=6049*SCALE/1000;
        assertTrue(M.certify(x,ticks));
        uint256[] memory end=new uint256[](3);end[0]=x[0];end[1]=x[1];end[2]=56*SCALE/10;
        assertTrue(M.certify(end,ticks));
        // Both z endpoints are below mean 6.05; the hidden maximum is at z=6.
        assertFalse(S.certifyFixedPartition(x,ticks,2,end[2]));
    }
    function testTwoTokenDegenerateMomentsAndCanonicalEquality() public pure {
        uint64 key=7*(1<<29); // 7/8.
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=15*SCALE/10;x[1]=3*SCALE/10;
        // One untouched coordinate has D=H=0. The key equality belongs to the
        // boundary partition, so a segment ending exactly there is admissible.
        assertTrue(S.certifyFixedPartition(x,ticks,1,SCALE/4));
        uint256[] memory across=new uint256[](2);across[0]=x[0];across[1]=SCALE/4-1;
        assertTrue(M.certify(across,ticks));
        // The endpoint stays feasible but crosses the primitive's partition scope.
        assertFalse(S.certifyFixedPartition(x,ticks,1,across[1]));
    }
    function testVarianceMinimumBetweenValidIntegerEndpoints() public pure {
        // Generated at 160 digits by packages/reference/fixtures_slack.py.
        // Integer coordinates, not an asserted reachable raw-token history.
        uint64 key=8589934594;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,1e34,G.coefficients(4,key));
        ticks[1]=M.Tick(type(uint64).max,2e40,G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);
        x[0]=10000005002677032735432878647444639154049;
        x[1]=10000005002434266888024259856480263135016;
        x[2]=10000005002434266888024259856480263135016;
        x[3]=10000005003013538801076603618066816768323;
        uint256 target=10000005002016838873244328622203293514398;
        assertTrue(M.certify(x,ticks));
        uint256[] memory end=new uint256[](4);for(uint256 i;i<4;i++)end[i]=x[i];end[3]=target;
        assertTrue(M.certify(end,ticks));
        assertFalse(S.certifyFixedPartition(x,ticks,3,target));
        (bool valid,)=S.certifyInwardRelease(x,ticks,3,target);assertFalse(valid);
    }
    function scaleExternal(W.Uint512 memory a,uint256 b) external pure {W.scale(a,b);}
    function testWideScaleOverflow() public {
        vm.expectRevert(W.Overflow.selector);this.scaleExternal(W.Uint512(type(uint256).max,0),2);
    }
    function testWideScaleOverflowFromLowProductCarry() public {
        vm.expectRevert(W.Overflow.selector);
        this.scaleExternal(W.Uint512(type(uint256).max/3,type(uint256).max),3);
    }
}
