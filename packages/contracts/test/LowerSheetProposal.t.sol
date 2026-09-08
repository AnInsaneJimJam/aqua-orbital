// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {LowerSheetProposal as L} from "../src/libraries/LowerSheetProposal.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {LowerSheetFixtures as Fixtures} from "./fixtures/LowerSheetFixtures.sol";

contract LowerSheetProposalTest is Test {
    function check(uint256[] memory point,uint8 output,uint256 sigma,uint256 lower,uint256 expected) private pure {
        bytes32 original=keccak256(abi.encode(point));
        (bool found,uint256 capped)=L.cap(point,output,sigma,lower);
        assertTrue(found);assertEq(capped,expected);assertLe(capped,point[output]);assertGe(capped,lower);
        assertEq(keccak256(abi.encode(point)),original,"proposal mutated its frame");
        uint256[] memory afterPoint=new uint256[](point.length);
        for(uint256 k;k<point.length;k++)afterPoint[k]=point[k];
        afterPoint[output]=capped;
        // Orthogonal variance identity: n*rho^2 = sum_{i<j}(Xi-Xj)^2.
        W.Uint512 memory pairVariance;
        for(uint256 i;i<point.length;i++)for(uint256 j=i+1;j<point.length;j++){
            uint256 difference=afterPoint[i]>afterPoint[j]?afterPoint[i]-afterPoint[j]:afterPoint[j]-afterPoint[i];
            pairVariance=W.add(pairVariance,W.mul(difference,difference));
        }
        assertTrue(W.lte(W.scale(W.mul(sigma,sigma),point.length),pairVariance));
    }
    function test47ExactPairDifferenceBisectionOracleCases() public pure {
        for(uint256 k;k<Fixtures.COUNT;k++){
            Fixtures.Case memory c=Fixtures.get(k);
            (bool found,uint256 capped)=L.cap(c.point,c.output,c.sigma,c.lower);
            assertEq(found,c.found,"independent lower-half oracle status");
            if(found){assertEq(capped,c.ceiling);check(c.point,c.output,c.sigma,c.lower,c.ceiling);}
        }
    }
    function propose(uint256[] memory point,uint8 output,uint256 sigma,uint256 lower) external pure returns(bool,uint256){
        return L.cap(point,output,sigma,lower);
    }
    function testInvalidSigmaRejectedAt192BitBoundary() public {
        uint256[] memory x=new uint256[](3);
        vm.expectRevert(L.InvalidSigma.selector);this.propose(x,0,1<<192,0);
    }
    function testExactN3UnequalUntouchedCoordinates() public pure {
        uint256[] memory x=new uint256[](3);x[0]=10;x[1]=11;x[2]=12;
        check(x,0,3,7,7);
        (bool found,)=L.cap(x,0,3,8);assertFalse(found,"lower cap may not be crossed");
    }
    function testHandN2N5N8LowerBranchPoints() public pure {
        uint256[] memory a=new uint256[](2);a[0]=11;a[1]=10;check(a,1,3,0,6);
        uint256[] memory b=new uint256[](5);for(uint256 k;k<5;k++)b[k]=10;check(b,0,2,0,7);
        uint256[] memory c=new uint256[](8);for(uint256 k;k<8;k++)c[k]=10;check(c,7,3,0,6);
    }
    function testNoSheetGapAndNoNonnegativeLowerSideDefer() public pure {
        uint256[] memory x=new uint256[](3);x[0]=10;x[1]=0;x[2]=20;
        (bool noGap,)=L.cap(x,0,1,0);assertFalse(noGap);
        x[1]=0;x[2]=0;(bool negative,)=L.cap(x,0,3,0);assertFalse(negative);
    }
    function testWide192BitDomainCannotOverflowOrChangeOtherCoordinates() public pure {
        uint256[] memory x=new uint256[](8);uint256 base=1<<191;
        for(uint256 k;k<8;k++)x[k]=base;
        uint256 sigma=base/4;
        W.Uint512 memory square=W.scale(W.mul(sigma,sigma),56);
        uint256 delta=W.sqrt(square);W.Uint512 memory rounded=W.mul(delta,delta);
        if(rounded.hi!=square.hi||rounded.lo!=square.lo)++delta;
        check(x,3,sigma,0,(7*base-delta)/7);
    }
    function testFuzzProposedEndpointSatisfiesIndependentPairVariance(uint128 raw,uint8 rawN,uint8 rawOutput) public pure {
        uint256 n=bound(rawN,2,8);uint8 output=uint8(bound(rawOutput,0,n-1));
        uint256 base=bound(raw,16,1<<120);uint256 sigma=base/4;
        uint256[] memory x=new uint256[](n);for(uint256 k;k<n;k++)x[k]=base;
        (bool found,uint256 capped)=L.cap(x,output,sigma,0);assertTrue(found);
        check(x,output,sigma,0,capped);
    }
}
