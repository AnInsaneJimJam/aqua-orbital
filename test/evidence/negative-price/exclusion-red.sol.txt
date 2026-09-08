// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {FrontierEvents as V} from "../src/libraries/FrontierEvents.sol";
import {FrontierSchedule as F} from "../src/libraries/FrontierSchedule.sol";

contract FrontierPriceExclusionTest is Test {
    uint256 constant GRID=1<<32;
    uint256 constant ZERO_PRICE_OUTPUT=5717143142914300004001200377265469442468;
    function pairTicks(uint8 n,uint256 r,uint64 key) private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](2);ticks[0]=M.Tick(key,uint192(r),G.coefficients(n,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(r),G.coefficients(n,type(uint64).max));
    }
    function excluded(uint256[] memory x,M.Tick[] memory ticks,uint8 input,uint8 output,uint8 key,V.Roots memory roots,uint256 branch) private pure returns(bool){
        return V.hasCertifiedNegativePrice(x,input,output,roots.candidates[branch],roots.sumNumerator,roots.rhoHi,ticks[key]);
    }
    function reachable() private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        uint256 u=1<<64;uint256 initial=5457557991956845750465862405150345463304;
        x=new uint256[](3);x[0]=initial+349825000*1e12*u;x[1]=initial;x[2]=initial-164721797*1e12*u;
        ticks=new M.Tick[](3);uint64[3] memory keys=[uint64(3*GRID/2),uint64(7*GRID/4),type(uint64).max];
        for(uint256 i;i<3;i++)ticks[i]=M.Tick(keys[i],uint192((100<<i)*1e18*u),G.coefficients(3,keys[i]));
    }
    function testReachableUpperKeyBothRootsHaveStrictlyNegativePrice() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=reachable();V.Roots memory roots=V.atKey(x,ticks,2,0,1);
        assertEq(uint256(roots.status),uint256(V.Status.Separated));
        for(uint256 i;i<2;i++){assertFalse(roots.candidates[i].physical);assertTrue(excluded(x,ticks,2,0,1,roots,i));}
    }
    function testReachableLowerKeyBothPhysicalDirectionsRemain() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=reachable();V.Roots memory roots=V.atKey(x,ticks,2,0,0);
        for(uint256 i;i<2;i++){assertTrue(roots.candidates[i].physical);assertFalse(excluded(x,ticks,2,0,0,roots,i));}
    }
    function testOutputUpperBoundIsRequiredWhenRecoveringLowerReserve() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=reachable();V.Roots memory roots=V.atKey(x,ticks,2,0,1);
        assertTrue(excluded(x,ticks,2,0,1,roots,0));
        // This wider box still encloses the exact event. Its absolute output
        // lower bound is now zero, so it no longer proves a negative price.
        roots.candidates[0].outputHi=int256(x[0]*GRID);
        assertFalse(excluded(x,ticks,2,0,1,roots,0));
    }
    function testWideStrictNegativeBothRootsUse512BitProducts() public pure {
        uint256 r=uint256(1)<<158;M.Tick[] memory ticks=pairTicks(3,r,uint64(18*GRID/10));
        uint256[] memory x=new uint256[](3);x[0]=138*r/100;x[1]=199*r/100;x[2]=r/10;
        assertTrue(M.certify(x,ticks));V.Roots memory roots=V.atKey(x,ticks,0,1,0);
        assertEq(uint256(roots.status),uint256(V.Status.Separated));
        for(uint256 i;i<2;i++){assertFalse(roots.candidates[i].physical);assertTrue(excluded(x,ticks,0,1,0,roots,i));}
    }
    function testWideN2PositivePricesCannotBeExcluded() public pure {
        uint256 r=uint256(1)<<158;M.Tick[] memory ticks=pairTicks(2,r,uint64(5*GRID/8));
        uint256[] memory x=new uint256[](2);x[0]=r/4;x[1]=104*r/100;
        V.Roots memory roots=V.atKey(x,ticks,0,1,0);
        for(uint256 i;i<2;i++){assertTrue(roots.candidates[i].physical);assertFalse(excluded(x,ticks,0,1,0,roots,i));}
    }
    function zeroPrice() private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        uint256 s=1e40; x=new uint256[](6);
        x[0]=2*s;x[1]=9*s/10;x[2]=ZERO_PRICE_OUTPUT;
        x[3]=3*s/2;x[4]=3*s/2;x[5]=3*s/2;
        ticks=pairTicks(6,s,uint64(4*GRID));
    }
    function testExactZeroUntouchedPriceOnBothRootsIsNotNegative() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=zeroPrice();assertTrue(M.certify(x,ticks));
        V.Roots memory roots=V.atKey(x,ticks,1,2,0);assertEq(uint256(roots.status),uint256(V.Status.Separated));
        for(uint256 i;i<2;i++){
            assertFalse(roots.candidates[i].physical);assertFalse(excluded(x,ticks,1,2,0,roots,i));
            int256 inExact=int256((i==0?1e40/2:1e40)*GRID)-int256(x[1]*GRID);
            int256 outExact=int256(x[2]*GRID)-int256((i==0?1e40:1e40/2)*GRID);
            assertLe(roots.candidates[i].inputLo,inExact);assertGe(roots.candidates[i].inputHi,inExact);
            assertLe(roots.candidates[i].outputLo,outExact);assertGe(roots.candidates[i].outputHi,outExact);
        }
    }
    function testInWindowUnknownZeroPriceRootStillDefersSchedule() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=zeroPrice();uint256 s=1e40;
        V.Roots memory roots=V.atKey(x,ticks,1,2,0);
        assertGt(roots.candidates[1].inputLo,0);assertLt(roots.candidates[1].inputHi,int256((s/5)*GRID));
        F.Result memory result=F.enumerate(x,ticks,1,2,s/5,0,1,16);
        assertEq(uint256(result.status),uint256(F.Status.Uncertain));assertEq(result.events.length,0);
    }
    function testProvenNegativeExtraKeyLeavesExactlyTwoReachableEvents() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=reachable();
        F.Result memory result=F.enumerate(x,ticks,2,0,499750000*1e12*(uint256(1)<<64),1,1,2);
        assertEq(uint256(result.status),uint256(F.Status.OrderingCertified));assertEq(result.events.length,2);
        assertEq(result.events[0].key,ticks[0].key);assertTrue(result.events[0].candidate.inward);
        assertEq(result.events[1].key,ticks[0].key);assertFalse(result.events[1].candidate.inward);
        assertEq(result.remainingCrossings,0);
        result=F.enumerate(x,ticks,2,0,499750000*1e12*(uint256(1)<<64),1,1,1);
        assertEq(uint256(result.status),uint256(F.Status.CrossingLimit));assertEq(result.events.length,0);
    }
}
