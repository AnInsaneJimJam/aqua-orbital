// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {FrontierEvents as E} from "../src/libraries/FrontierEvents.sol";
import {FrontierSchedule as S} from "../src/libraries/FrontierSchedule.sol";

contract FrontierScheduleTest is Test {
    uint256 constant SCALE=1e40;uint256 constant GRID=1<<32;
    function fixture() private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        x=new uint256[](2);x[0]=2527133520585472095299795479050357292168;x[1]=10306468614415789726245162508561985295187;
        uint64 key=5*(1<<29);ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function testBothHiddenCrossingsAreRetainedDespiteIdenticalEndpointPrefixes() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        S.Result memory r=S.enumerate(x,ticks,0,1,8*SCALE/10,1,1,16);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,2);assertEq(r.remainingCrossings,14);
        assertTrue(r.events[0].candidate.inward);assertFalse(r.events[1].candidate.inward);
        assertEq(r.events[0].key,ticks[0].key);assertEq(r.events[1].key,ticks[0].key);
        assertLe(r.events[0].candidate.inputLo,1785320583495630165674573230691291655457572108493);
        assertGe(r.events[0].candidate.inputHi,1785320583495630165674573230691291655457572108494);
        assertLe(r.events[1].candidate.inputLo,30193858969424478990258992973288832930589074016050);
        assertGe(r.events[1].candidate.inputHi,30193858969424478990258992973288832930589074016051);
        assertLt(r.events[0].candidate.inputHi,r.events[1].candidate.inputLo);
        assertLt(r.events[0].candidate.outputHi,r.events[1].candidate.outputLo);
    }
    function testSingleInwardCrossingChangesTheIdealPrefixOnce() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/10,1,0,1);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,1);assertEq(r.remainingCrossings,0);
        assertTrue(r.events[0].candidate.physical);assertTrue(r.events[0].candidate.inward);
    }
    function testNoInRangeEventNeedsNoCrossingBudget() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/100,1,1,0);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,0);assertEq(r.remainingCrossings,0);
    }
    function testSignedRootsDefinitelyBehindStartAreExcluded() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();x[0]=104*SCALE/100;x[1]=SCALE/4;
        S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/100,1,1,16);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,0);assertEq(r.remainingCrossings,16);
    }
    function testExhaustedCrossingBudgetAndWrongPrefixNeverCertify() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        S.Result memory limited=S.enumerate(x,ticks,0,1,8*SCALE/10,1,1,1);
        assertEq(uint256(limited.status),uint256(S.Status.CrossingLimit));assertEq(limited.remainingCrossings,1);
        S.Result memory wrong=S.enumerate(x,ticks,0,1,SCALE/10,1,1,16);
        assertEq(uint256(wrong.status),uint256(S.Status.InconsistentPrefixes));assertEq(wrong.remainingCrossings,16);
        wrong=S.enumerate(x,ticks,0,1,SCALE/10,0,0,16);
        assertEq(uint256(wrong.status),uint256(S.Status.InconsistentPrefixes));
    }
    function testAnEventEnclosureOverlappingFinalInputRemainsUncertain() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();E.Roots memory roots=E.atKey(x,ticks,0,1,0);
        uint256 net=(uint256(roots.candidates[0].inputLo)+GRID-1)/GRID;
        assertLe(int256(net*GRID),roots.candidates[0].inputHi);
        S.Result memory r=S.enumerate(x,ticks,0,1,net,1,0,16);
        assertEq(uint256(r.status),uint256(S.Status.Uncertain));assertEq(r.remainingCrossings,16);
    }
    function testUnknownDiscriminantCannotBeSkipped() public pure {
        uint64 key=5583457484;M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=7113194749984422563881813530342767602377;x[1]=x[0];x[2]=11793610496305864573774458876814464795246;
        S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/100,1,1,16);
        assertEq(uint256(r.status),uint256(S.Status.Uncertain));
    }
    function testInRangeRootIsDiscardedOnlyAfterStrictNegativePriceProof() public pure {
        uint64 key=uint64(18*GRID/10);M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(3,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=138*SCALE/100;x[1]=199*SCALE/100;x[2]=SCALE/10;
        assertTrue(M.certify(x,ticks));E.Roots memory roots=E.atKey(x,ticks,0,1,0);
        assertEq(uint256(roots.status),uint256(E.Status.Separated));assertFalse(roots.candidates[0].physical);
        assertGt(roots.candidates[0].inputLo,0);assertLt(roots.candidates[0].inputHi,int256(SCALE*GRID/100));
        assertTrue(E.hasCertifiedNegativePrice(x,0,1,roots.candidates[0],roots.sumNumerator,roots.rhoHi,ticks[0]));
        S.Result memory result=S.enumerate(x,ticks,0,1,SCALE/100,0,0,16);
        assertEq(uint256(result.status),uint256(S.Status.OrderingCertified));assertEq(result.events.length,0);
        assertEq(result.remainingCrossings,16);
    }
    function testProvenNegativeDiscriminantAllowsEmptySchedule() public pure {
        uint64 key=uint64(13*GRID/10);M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE/100),G.coefficients(3,key));ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=999*SCALE/100;x[1]=x[0];x[2]=SCALE/10;
        assertEq(uint256(E.atKey(x,ticks,0,1,0).status),uint256(E.Status.NoRoots));
        S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/1000,1,1,0);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,0);
    }
    function testMultipleKeysWalkInwardThenOutwardWithoutSkipping() public pure {
        M.Tick[] memory ticks=new M.Tick[](3);uint64 low=uint64(61*GRID/100);uint64 high=uint64(5*GRID/8);
        ticks[0]=M.Tick(low,uint192(SCALE),G.coefficients(2,low));ticks[1]=M.Tick(high,uint192(SCALE),G.coefficients(2,high));ticks[2]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=2*SCALE/5;x[1]=39*SCALE/25;
        S.Result memory r=S.enumerate(x,ticks,0,1,11*SCALE/10,2,2,4);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,4);assertEq(r.remainingCrossings,0);
        uint8[4] memory keys=[uint8(1),0,0,1];
        for(uint256 i;i<4;i++){assertEq(r.events[i].keyIndex,keys[i]);assertEq(r.events[i].candidate.inward,i<2);}
    }
    function testMaximumFourteenCrossingsAtLargeSupportedLengths() public pure {
        uint256 radius=uint256(1)<<156;M.Tick[] memory ticks=new M.Tick[](8);
        for(uint8 i;i<7;i++){uint64 key=uint64(uint256(59+i)*GRID/100);ticks[i]=M.Tick(key,uint192(radius),G.coefficients(2,key));}
        ticks[7]=M.Tick(type(uint64).max,uint192(radius),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);x[0]=6*radius/5;x[1]=104*radius/25;
        S.Result memory r=S.enumerate(x,ticks,0,1,27*radius/10,7,7,16);
        assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,14);assertEq(r.remainingCrossings,2);
        for(uint8 i;i<14;i++){assertEq(r.events[i].keyIndex,i<7?6-i:i-7);assertEq(r.events[i].candidate.inward,i<7);}
    }
    function tangent(int256 shift) private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        uint64 key=uint64(35*GRID/8);ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(8*SCALE),G.coefficients(7,key));ticks[1]=M.Tick(type(uint64).max,uint192(8*SCALE),G.coefficients(7,type(uint64).max));
        x=new uint256[](7);x[0]=uint256(int256(11*SCALE)+shift);x[1]=uint256(int256(11*SCALE)+(shift<0?-2*shift:shift));
        x[2]=10*SCALE;x[3]=10*SCALE;x[4]=10*SCALE;x[5]=9*SCALE;x[6]=9*SCALE;
        assertTrue(M.certify(x,ticks));assertEq(uint256(E.atKey(x,ticks,0,1,0).status),uint256(E.Status.Touch));
    }
    function testTouchAtInitialInputRemainsExplicitlyUncertain() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=tangent(0);
        assertEq(uint256(S.enumerate(x,ticks,0,1,SCALE/1000,1,1,16).status),uint256(S.Status.Uncertain));
    }
    function testExactTouchDefinitelyOutsideInputRangeCanBeExcluded() public pure {
        for(int256 sign=-1;sign<=1;sign+=2){
            (uint256[] memory x,M.Tick[] memory ticks)=tangent(sign*int256(SCALE/100));
            S.Result memory r=S.enumerate(x,ticks,0,1,SCALE/1000,1,1,0);
            assertEq(uint256(r.status),uint256(S.Status.OrderingCertified));assertEq(r.events.length,0);
        }
    }
    function testCallerStateIsUnchanged() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();bytes32 beforeHash=keccak256(abi.encode(x,ticks));
        S.enumerate(x,ticks,0,1,8*SCALE/10,1,1,16);assertEq(keccak256(abi.encode(x,ticks)),beforeHash);
    }
    function callSchedule(uint256[] memory x,M.Tick[] memory ticks,uint8 i,uint8 j,uint256 net,uint8 initial,uint8 end,uint8 budget) external pure {S.enumerate(x,ticks,i,j,net,initial,end,budget);}
    function testInvalidMetadataInputAndBoundsFailBeforeEnumeration() public {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        vm.expectRevert(S.InvalidPair.selector);this.callSchedule(x,ticks,0,0,SCALE/10,1,0,16);
        vm.expectRevert(S.InvalidPair.selector);this.callSchedule(x,ticks,0,2,SCALE/10,1,0,16);
        vm.expectRevert(S.InvalidInput.selector);this.callSchedule(x,ticks,0,1,0,1,0,16);
        vm.expectRevert(S.InvalidInput.selector);this.callSchedule(x,ticks,0,1,type(uint256).max,1,0,16);
        vm.expectRevert(S.InvalidBound.selector);this.callSchedule(x,ticks,0,1,SCALE/10,2,0,16);
        vm.expectRevert(S.InvalidBound.selector);this.callSchedule(x,ticks,0,1,SCALE/10,1,0,17);
        x[0]=0;x[1]=0;vm.expectRevert(S.InvalidState.selector);this.callSchedule(x,ticks,0,1,SCALE/10,1,0,16);
    }
}
