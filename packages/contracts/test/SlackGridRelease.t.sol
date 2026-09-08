// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {SlackCertificate as P} from "../src/libraries/SlackCertificate.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

contract SlackGridReleaseTest is Test {
    uint256 constant GRID=1<<32;
    uint256 constant SCALE=1e40;
    function pairTicks(bool fractional) private pure returns(M.Tick[] memory ticks){
        uint64 key=uint64(7*GRID/8+(fractional?1:0));
        ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE+(fractional?1:0)),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function pairStart() private pure returns(uint256[] memory x){x=new uint256[](2);x[0]=15*SCALE/10;x[1]=3*SCALE/10;}
    function point(uint256[] memory x,uint8 output,uint256 end) private pure returns(uint256[] memory p){p=new uint256[](x.length);for(uint256 i;i<x.length;i++)p[i]=x[i]*GRID;p[output]=end;}
    function testFractionalEndpointCrossesFractionalSeamWithoutMutation() public pure {
        M.Tick[] memory ticks=pairTicks(true);uint256[] memory x=pairStart();bytes32 original=keccak256(abi.encode(x));
        uint256 end=SCALE/5*GRID+1;
        assertTrue(M.certifyGridPoint(point(x,1,end),ticks,0));
        (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,end,0);
        assertTrue(valid);assertEq(crossed,1);assertEq(keccak256(abi.encode(x)),original);
    }
    function testFinalExactSeamCanStopBeforeOrAfterOneDeparture() public pure {
        M.Tick[] memory ticks=pairTicks(true);uint256[] memory x=pairStart();
        uint256 seam=(2*SCALE+1)*ticks[0].key-x[0]*GRID;assertGt(seam%GRID,0);
        for(uint8 endCount;endCount<2;endCount++){
            assertTrue(M.certifyGridPoint(point(x,1,seam),ticks,endCount));
            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,seam,endCount);
            assertTrue(valid);assertEq(crossed,1-endCount);
        }
    }
    function testFractionalEndMustNotBeFlooredIntoAnotherPartition() public pure {
        M.Tick[] memory ticks=pairTicks(true);uint256[] memory x=pairStart();
        uint256 end=(2*SCALE+1)*ticks[0].key-x[0]*GRID+1;
        (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,end,1);
        assertTrue(valid);assertEq(crossed,0);
        (valid,crossed)=P.certifyInwardRelease(x,ticks,1,end/GRID);
        assertTrue(valid);assertEq(crossed,1); // A forbidden extra floor changes the path.
    }
    function testStartAndFinalZeroDistanceDeparturesEachCountOnce() public pure {
        M.Tick[] memory ticks=new M.Tick[](3);
        ticks[0]=M.Tick(uint64(3*GRID/4),uint192(SCALE),G.coefficients(2,uint64(3*GRID/4)));
        ticks[1]=M.Tick(uint64(7*GRID/8),uint192(SCALE),G.coefficients(2,uint64(7*GRID/8)));
        ticks[2]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=21*SCALE/10;x[1]=4*SCALE/10;
        uint256 end=15*SCALE/100*GRID;
        (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,end,0);
        assertTrue(valid);assertEq(crossed,2);
        (valid,crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,end,1);
        assertTrue(valid);assertEq(crossed,1);
        (valid,crossed)=P.certifyInwardRelease(x,ticks,1,end/GRID);
        assertTrue(valid);assertEq(crossed,1); // Legacy final equality stays canonical.
    }
    function testSevenSeamsAndFractionalFinalCoordinate() public pure {
        M.Tick[] memory ticks=new M.Tick[](8);
        for(uint256 i;i<7;i++){uint64 key=uint64((980+i)*GRID/1000);ticks[i]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));}
        ticks[7]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=74*SCALE/10;x[1]=SCALE/2;
        (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,4*SCALE/10*GRID+1,0);
        assertTrue(valid);assertEq(crossed,7);
    }
    function testThreeTokenTwoSeamsAtWideOriginalLengths() public pure {
        uint256 scale=uint256(1)<<156;M.Tick[] memory ticks=new M.Tick[](3);
        ticks[0]=M.Tick(6012954214,uint192(scale/100+1),G.coefficients(3,6012954214));
        ticks[1]=M.Tick(uint64(3*GRID/2),uint192(scale/100+3),G.coefficients(3,uint64(3*GRID/2)));
        ticks[2]=M.Tick(type(uint64).max,uint192(10*scale),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=61*scale/10;x[1]=6*scale;x[2]=61*scale/10;
        (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,2,19*scale/10*GRID+GRID-1,0);
        assertTrue(valid);assertEq(crossed,2);
    }
    function testInitialTwoThreeEightTokenIdentitiesConnectToTheirExactHighs() public pure {
        uint256[3] memory indices=[uint256(0),2,3];
        for(uint256 k;k<3;k++){
            (,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=F.scalar(indices[k]);
            E.Identity memory root=E.identifyInitial(x,ticks,1,count,160);assertTrue(root.identified);
            assertGt(root.bracket.hi%GRID,0);
            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,root.bracket.hi,root.boundaryCount);
            assertTrue(valid);assertEq(crossed,0);
        }
    }
    function testVarianceAndHiddenBoundaryMaximumAreStillRejected() public pure {
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(8589934594,1e34,G.coefficients(4,8589934594));
        ticks[1]=M.Tick(type(uint64).max,2e40,G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);
        x[0]=10000005002677032735432878647444639154049;x[1]=10000005002434266888024259856480263135016;
        x[2]=x[1];x[3]=10000005003013538801076603618066816768323;
        uint256 end=10000005002016838873244328622203293514398*GRID+1;
        assertTrue(M.certify(x,ticks));assertTrue(M.certifyGridPoint(point(x,3,end),ticks,1));
        (bool valid,)=P.certifyInwardReleaseToGrid(x,ticks,3,end,1);assertFalse(valid);
        ticks[0]=M.Tick(uint64(7*GRID/4),uint192(SCALE/100),G.coefficients(3,uint64(7*GRID/4)));
        ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        x=new uint256[](3);x[0]=61*SCALE/10;x[1]=6*SCALE;x[2]=61*SCALE/10;end=56*SCALE/10*GRID+1;
        assertTrue(M.certify(x,ticks));assertTrue(M.certifyGridPoint(point(x,2,end),ticks,1));
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,2,end,1);assertFalse(valid);
    }
    function testInvalidEndPrefixRangeAndDirectionReturnUncertified() public pure {
        M.Tick[] memory ticks=pairTicks(false);uint256[] memory x=pairStart();bool valid;
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,SCALE/5*GRID,type(uint8).max);assertFalse(valid);
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,type(uint256).max,0);assertFalse(valid);
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,x[1]*GRID+1,1);assertFalse(valid);
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,x[1]*GRID,0);assertFalse(valid);
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,2,0,0);assertFalse(valid);
        (valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,0,0);assertFalse(valid);
    }
    function testLegacyAndGridCanonicalIntegralEndsAgree() public pure {
        M.Tick[] memory ticks=pairTicks(false);uint256[] memory x=pairStart();
        uint256[3] memory ends=[SCALE/5,SCALE/4,3*SCALE/10];
        for(uint256 i;i<3;i++){
            uint8 count=ends[i]<SCALE/4?0:1;
            (bool oldValid,uint8 oldCrossed)=P.certifyInwardRelease(x,ticks,1,ends[i]);
            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,1,ends[i]*GRID,count);
            assertTrue(oldValid);assertTrue(valid);assertEq(crossed,oldCrossed);
        }
    }
}
