// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {InteriorSwap as I} from "../src/libraries/InteriorSwap.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";

contract InteriorProbeTest is Test {
    uint256 constant GRID=1<<32;uint256 constant U=1<<64;
    function fixture() private pure returns(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d){
        uint256 initial=5457557991956845750465862405150345463304;x=new uint256[](3);for(uint256 i;i<3;i++)x[i]=initial;
        ticks=new M.Tick[](3);uint64[3] memory keys=[uint64(3*GRID/2),uint64(7*GRID/4),type(uint64).max];
        for(uint256 i;i<3;i++)ticks[i]=M.Tick(keys[i],uint192((100<<i)*1e18*U),G.coefficients(3,keys[i]));
        d=new uint8[](3);d[0]=6;d[1]=18;d[2]=6;
    }
    function testStrictInteriorProbeMatchesLegacyResultExactly() public pure {
        (uint256[] memory x,M.Tick[] memory t,uint8[] memory d)=fixture();I.Result memory old=I.exactInput(x,t,d,0,2,999500);
        (bool traversal,I.Result memory result)=I.tryExactInput(x,t,d,0,2,999500);assertFalse(traversal);assertEq(abi.encode(result),abi.encode(old));
    }
    function testEndCapDefersWithoutAuthorizingSphereOutput() public pure {
        (uint256[] memory x,M.Tick[] memory t,uint8[] memory d)=fixture();(bool traversal,I.Result memory result)=I.tryExactInput(x,t,d,0,2,349825000);
        assertTrue(traversal);assertEq(result.amountOutRaw,0);
    }
    function testCertifiedMixedStartDefersToTraversal() public pure {
        (uint256[] memory x,M.Tick[] memory t,uint8[] memory d)=fixture();x[0]+=349825000*1e12*U;x[2]-=164721797*1e12*U;
        assertTrue(M.certify(x,t));(bool traversal,I.Result memory result)=I.tryExactInput(x,t,d,2,0,499750000);
        assertTrue(traversal);assertEq(result.amountOutRaw,0);
    }
    function callProbe(uint256[] memory x,M.Tick[] memory t,uint8[] memory d,uint8 input,uint8 output,uint256 raw) external pure {I.tryExactInput(x,t,d,input,output,raw);}
    function testProbePreservesInvalidInputMetadataAndStartErrors() public {
        (uint256[] memory x,M.Tick[] memory t,uint8[] memory d)=fixture();
        vm.expectRevert(I.InvalidPair.selector);this.callProbe(x,t,d,0,0,1);
        vm.expectRevert(I.InvalidInput.selector);this.callProbe(x,t,d,0,2,0);
        vm.expectRevert(I.InvalidInput.selector);this.callProbe(x,t,d,0,2,type(uint256).max);
        d[0]=19;vm.expectRevert(I.InvalidMetadata.selector);this.callProbe(x,t,d,0,2,1);d[0]=6;
        x[0]=0;vm.expectRevert(I.UncertifiedStart.selector);this.callProbe(x,t,d,0,2,1);
    }
}
