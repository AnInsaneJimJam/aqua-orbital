// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {RootBracket as B} from "../src/libraries/RootBracket.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as T} from "../src/libraries/TickGeometry.sol";

contract PayoutBracketTest is Test {
    uint256 constant G=1<<32;
    function fixture() private pure returns(uint256[] memory x,C.Context memory ctx){
        M.Tick[] memory ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,10,T.coefficients(4,type(uint64).max));
        ctx=C.prepare(4,ticks,0);x=new uint256[](4);x[0]=5*G;x[1]=5*G;x[2]=6*G;x[3]=6*G;
    }
    function verify(B.Bracket memory b) private pure {
        assertTrue(b.certified);assertLe((10*G-b.hi)**2,34*G*G);assertGe((10*G-b.lo)**2,34*G*G);
        uint256 raw=(6*G-b.hi)/G;assertGt(raw,0);assertLe(6*G-raw*G-b.lo,G);
    }
    function testPayoutStopsBeforeGridAdjacencyWithExactGapBound() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();
        B.Bracket memory b=B.refineForPayout(x,ctx,3,3*G,6*G,1,160);
        assertEq(uint256(b.status),uint256(B.Status.PayoutBounded));assertEq(b.used,3);assertEq(b.remaining,157);
        assertEq(b.lo,33*G/8);assertEq(b.hi,9*G/2);assertGt(b.width,1);verify(b);
    }
    function testZeroAndInsufficientBudgetRetainRootWithoutPayoutClaim() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();
        for(uint8 budget;budget<3;budget++){
            B.Bracket memory b=B.refineForPayout(x,ctx,3,3*G,6*G,1,budget);
            assertTrue(b.certified);assertEq(uint256(b.status),uint256(B.Status.BudgetExhausted));assertEq(b.used,budget);assertEq(b.remaining,0);
        }
    }
    function testAlreadyBoundedProposalNeedsNoNewMidpoints() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();x[3]=9*G/2;
        B.Bracket memory b=B.refineForPayout(x,ctx,3,33*G/8,6*G,1,0);
        assertEq(uint256(b.status),uint256(B.Status.PayoutBounded));assertEq(b.used,0);verify(b);
    }
    function testExactQuantumGapBoundaryIsIncluded() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();x[3]=9*G/2;
        B.Bracket memory b=B.refineForPayout(x,ctx,3,4*G,6*G,1,0);
        assertEq(uint256(b.status),uint256(B.Status.PayoutBounded));assertEq(6*G-((6*G-b.hi)/G)*G-b.lo,G);verify(b);
    }
    function testFuzzScaledPayoutCertificateAndWideSquares(uint104 seed) public pure {
        uint256 scale=uint256(seed)+1;
        M.Tick[] memory ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,uint192(10*scale),T.coefficients(4,type(uint64).max));
        C.Context memory ctx=C.prepare(4,ticks,0);uint256[] memory x=new uint256[](4);
        x[0]=5*scale*G;x[1]=5*scale*G;x[2]=6*scale*G;x[3]=6*scale*G;
        B.Bracket memory b=B.refineForPayout(x,ctx,3,3*scale*G,6*scale*G,scale,160);
        assertEq(uint256(b.status),uint256(B.Status.PayoutBounded));assertEq(b.used,3);
        assertEq(b.lo,33*scale*G/8);assertEq(b.hi,9*scale*G/2);assertEq(b.used+b.remaining,160);
        assertLe(6*scale*G-((6*scale*G-b.hi)/(scale*G))*scale*G-b.lo,scale*G);
    }
    function testWidthAloneDoesNotAuthorizePayout() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();x[3]=9*G/2;
        // width=.75G, but retained output reserve5G minus low3.75G >G.
        B.Bracket memory b=B.refineForPayout(x,ctx,3,15*G/4,6*G,1,0);
        assertTrue(b.certified);assertLt(b.width,G);assertEq(uint256(b.status),uint256(B.Status.BudgetExhausted));
    }
    function testRawBoundaryAllowsExactlyOneQuantumWithoutChangingExactStatus() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();x[2]=5*G;x[3]=8*G;
        B.Bracket memory b=B.refineForPayout(x,ctx,3,5*G,8*G,1,0);
        assertEq(uint256(b.status),uint256(B.Status.Exact));assertEq(b.lo,5*G);
        // Exact ideal raw3; retaining6 instead of5 loses exactly one quantum.
        uint256 retained=6*G;assertEq(retained-b.lo,G);
        x[3]=retained;assertTrue(C.certifiesMembership(C.evaluate(x,ctx,3)));
    }
    function testOrdinaryRefinementResumesWithSharedRemainingBudget() public pure {
        (uint256[] memory x,C.Context memory ctx)=fixture();B.Bracket memory first=B.refineForPayout(x,ctx,3,3*G,6*G,1,160);
        x[3]=first.hi;B.Bracket memory second=B.refine(x,ctx,3,first.lo,first.remaining);
        assertEq(uint256(second.status),uint256(B.Status.Adjacent));assertEq(uint256(first.used)+second.used+second.remaining,160);
        assertGe(second.lo,first.lo);assertLe(second.hi,first.hi);verify(second);
    }
    function testInvalidPayoutFrameAndQuantumReject() public {
        (uint256[] memory x,C.Context memory ctx)=fixture();
        vm.expectRevert(B.InvalidBounds.selector);this.callTarget(x,ctx,6*G,0,160);
        vm.expectRevert(B.InvalidBounds.selector);this.callTarget(x,ctx,5*G,1,160);
        vm.expectRevert(B.InvalidBounds.selector);this.callTarget(x,ctx,1<<192,1,160);
        vm.expectRevert(B.InvalidBounds.selector);this.callTarget(x,ctx,6*G,1<<224,160);
        vm.expectRevert(B.InvalidBudget.selector);this.callTarget(x,ctx,6*G,1,161);
    }
    function callTarget(uint256[] memory x,C.Context memory ctx,uint256 origin,uint256 q,uint8 budget) external pure returns(B.Bracket memory){return B.refineForPayout(x,ctx,3,3*G,origin,q,budget);}
}
