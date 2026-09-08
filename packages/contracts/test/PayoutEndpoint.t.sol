// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {RootBracket as B} from "../src/libraries/RootBracket.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

contract PayoutEndpointTest is Test {
    uint256 constant G=1<<32;
    function decimals(uint256 n) private pure returns(uint8[] memory d){d=new uint8[](n);for(uint256 i;i<n;i++)d[i]=18;}
    function ordinary(uint256 index) private pure {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 prefix,,,)=F.scalar(index);uint8[] memory d=decimals(x.length);
        E.Result memory target=E.exactInputForPayout(x,ticks,d,0,1,1e18,prefix,160);
        E.Result memory full=E.exactInput(x,ticks,d,0,1,1e18,prefix,160);
        assertEq(uint256(target.status),uint256(E.Status.EndpointCertified));assertEq(uint256(target.root.bracket.status),uint256(B.Status.PayoutBounded));
        assertEq(target.amountOutRaw,full.amountOutRaw);assertGe(target.root.bracket.lo,0);assertLe(target.root.bracket.lo,full.root.bracket.lo);assertGe(target.root.bracket.hi,full.root.bracket.hi);
        assertLt(target.root.bracket.used,full.root.bracket.used);assertLe(target.shortfallUpper,target.outputQuantum);
        E.Result memory resumed=E.resumeExactInput(x,ticks,d,0,1,1e18,prefix,target.root.bracket.lo,target.root.bracket.hi,target.root.bracket.remaining);
        assertEq(uint256(resumed.status),uint256(E.Status.EndpointCertified));assertEq(resumed.amountOutRaw,full.amountOutRaw);
        assertGe(resumed.root.bracket.lo,target.root.bracket.lo);assertLe(resumed.root.bracket.hi,target.root.bracket.hi);
        assertEq(uint256(target.root.bracket.used)+resumed.root.bracket.used+resumed.root.bracket.remaining,160);
    }
    function testPayoutAndResumeN2() public pure {ordinary(0);}
    function testPayoutAndResumeN3() public pure {ordinary(2);}
    function testPayoutAndResumeN8() public pure {ordinary(3);}
    function testZeroBudgetAndResumeExhaustionCannotInventWork() public pure {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 prefix,,,)=F.scalar(2);uint8[] memory d=decimals(3);
        E.Result memory r=E.exactInputForPayout(x,ticks,d,0,1,1e18,prefix,0);
        assertTrue(r.root.identified);assertEq(r.root.bracket.used,0);assertEq(r.root.bracket.remaining,0);assertEq(uint256(r.status),uint256(E.Status.Uncertain));
        E.Result memory resumed=E.resumeExactInput(x,ticks,d,0,1,1e18,prefix,r.root.bracket.lo,r.root.bracket.hi,0);
        assertTrue(resumed.root.identified);assertEq(resumed.root.bracket.lo,r.root.bracket.lo);assertEq(resumed.root.bracket.hi,r.root.bracket.hi);assertEq(resumed.root.bracket.used,0);
    }
    function testResumeTreatsPriorBoundsOnlyAsRecheckedProposals() public pure {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 prefix,,,)=F.scalar(2);uint8[] memory d=decimals(3);
        E.Result memory full=E.exactInput(x,ticks,d,0,1,1e18,prefix,160);
        // Change input but replay the old root. Regenerated signs must fail.
        E.Result memory forged=E.resumeExactInput(x,ticks,d,0,1,2e18,prefix,full.root.bracket.lo,full.root.bracket.hi,160);
        assertFalse(forged.root.identified);assertEq(uint256(forged.status),uint256(E.Status.Uncertain));
        x[0]=0;forged=E.resumeExactInput(x,ticks,d,0,1,1e18,prefix,full.root.bracket.lo,full.root.bracket.hi,160);
        assertEq(uint256(forged.status),uint256(E.Status.UncertifiedStart));
    }
    function testResumeRejectsBoundsBeyondOriginalOutputAndWrongMetadata() public {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 prefix,,,)=F.scalar(2);uint8[] memory d=decimals(3);
        vm.expectRevert(B.InvalidBounds.selector);this.resumeCall(x,ticks,d,prefix,0,x[1]*G+1,160);
        vm.expectRevert(B.InvalidBounds.selector);this.resumeCall(x,ticks,d,prefix,2,1,160);
        vm.expectRevert(E.InvalidBudget.selector);this.resumeCall(x,ticks,d,prefix,0,x[1]*G,161);
        d[0]=19;vm.expectRevert(E.InvalidMetadata.selector);this.resumeCall(x,ticks,d,prefix,0,x[1]*G,160);
    }
    function resumeCall(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint8 prefix,uint256 lo,uint256 hi,uint8 budget) external pure returns(E.Result memory){return E.resumeExactInput(x,ticks,d,0,1,1e18,prefix,lo,hi,budget);}
}
