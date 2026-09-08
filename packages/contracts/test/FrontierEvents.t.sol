// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {FrontierEvents as E} from "../src/libraries/FrontierEvents.sol";

contract FrontierEventsTest is Test {
    uint256 constant SCALE=1e40;
    function ticks2(uint256 r) private pure returns(M.Tick[] memory ticks){
        uint64 key=5*(1<<29);
        ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(r),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(r),G.coefficients(2,type(uint64).max));
    }
    function testBothRootsEncloseIndependentPerTickOracle() public pure {
        uint256[] memory x=new uint256[](2);
        x[0]=2527133520585472095299795479050357292168;
        x[1]=10306468614415789726245162508561985295187;
        E.Roots memory roots=E.atKey(x,ticks2(SCALE),0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Separated));
        assertTrue(roots.candidates[0].inward);assertFalse(roots.candidates[1].inward);
        assertTrue(roots.candidates[0].physical);assertTrue(roots.candidates[1].physical);
        // 160-digit explicit-tick frontier_events from the actual integer start.
        encloses(roots.candidates[0],1785320583495630165674573230691291655457572108493,3218130843201826607943555981180276194095320250573);
        encloses(roots.candidates[1],30193858969424478990258992973288832930589074016050,31626669229130675432527975723777817469226822158130);
        assertLt(roots.candidates[0].inputHi,roots.candidates[1].inputLo);
    }
    function encloses(E.Candidate memory candidate,int256 inputFloor,int256 outputFloor) private pure {
        assertLe(candidate.inputLo,inputFloor);assertGe(candidate.inputHi,inputFloor+1);
        assertLe(candidate.outputLo,outputFloor);assertGe(candidate.outputHi,outputFloor+1);
        // Work coordinates are much finer than an 18-decimal raw unit times GRID.
        assertLt(candidate.inputHi-candidate.inputLo,int256(uint256(1)<<96));
    }
    function testNoRealKeyIntersectionIsNotClampedToATangent() public pure {
        uint64 key=uint64(13*(uint256(1)<<32)/10);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE/100),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=999*SCALE/100;x[1]=x[0];x[2]=SCALE/10;
        assertTrue(M.certify(x,ticks));
        E.Roots memory roots=E.atKey(x,ticks,0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.NoRoots));
    }
    function testWideEventCoordinatesPreserveBothDirections() public pure {
        uint256 r=uint256(1)<<158;
        uint256[] memory x=new uint256[](2);x[0]=r/4;x[1]=104*r/100;
        E.Roots memory roots=E.atKey(x,ticks2(r),0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Separated));
        assertTrue(roots.candidates[0].physical);assertTrue(roots.candidates[1].physical);
        assertGt(roots.candidates[0].inputLo,0);
        assertLt(roots.candidates[0].inputHi,roots.candidates[1].inputLo);
    }
    function testNearTangentDiscriminantRemainsExplicitlyUncertain() public pure {
        uint64 key=5583457484;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);
        // c=floor(Ac/3+sqrt(2/3)*rho_c), pair raised by SCALE/1000.
        // The actual event discriminant is too close to zero for Q128 sigma
        // contributions to distinguish crossing from tangency safely.
        x[0]=7113194749984422563881813530342767602377;x[1]=x[0];
        x[2]=11793610496305864573774458876814464795246;
        assertTrue(M.certify(x,ticks));
        E.Roots memory roots=E.atKey(x,ticks,0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Uncertain));
    }
    function testSignedCandidatesBehindTheStartAreNotSilentlyLost() public pure {
        uint256[] memory x=new uint256[](2);x[0]=104*SCALE/100;x[1]=SCALE/4;
        E.Roots memory roots=E.atKey(x,ticks2(SCALE),0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Separated));
        assertLt(roots.candidates[0].inputHi,0);assertLt(roots.candidates[1].inputHi,0);
        assertLt(roots.candidates[0].outputHi,0);assertLt(roots.candidates[1].outputHi,0);
        assertTrue(roots.candidates[0].physical);assertTrue(roots.candidates[1].physical);
    }
    function testRealRootsCanFailThePerTickPhysicalCertificate() public pure {
        uint64 key=uint64(18*(uint256(1)<<32)/10);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=189*SCALE/100;x[1]=x[0];x[2]=SCALE/10;
        assertTrue(M.certify(x,ticks));
        E.Roots memory roots=E.atKey(x,ticks,0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Separated));
        // Each root has a traded reserve >2*SCALE, exceeding the sum of
        // per-tick price-branch upper bounds. Existence is not physicality.
        assertFalse(roots.candidates[0].physical);assertFalse(roots.candidates[1].physical);
    }
    function callKey(uint256[] memory x,M.Tick[] memory ticks,uint8 input,uint8 output,uint8 key) external pure {E.atKey(x,ticks,input,output,key);}
    function testRejectInvalidPairKeyAndStartingState() public {
        uint256[] memory x=new uint256[](2);x[0]=SCALE/4;x[1]=104*SCALE/100;
        M.Tick[] memory ticks=ticks2(SCALE);
        vm.expectRevert(E.InvalidPair.selector);this.callKey(x,ticks,0,0,0);
        vm.expectRevert(E.InvalidPair.selector);this.callKey(x,ticks,0,2,0);
        vm.expectRevert(E.InvalidKey.selector);this.callKey(x,ticks,0,1,1);
        x[0]=0;x[1]=0;
        vm.expectRevert(E.InvalidState.selector);this.callKey(x,ticks,0,1,0);
    }
}
