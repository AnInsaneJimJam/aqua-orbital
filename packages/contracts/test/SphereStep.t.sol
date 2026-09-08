// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {SphereStep as S} from "../src/libraries/SphereStep.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract SphereStepTest is Test {
    function equal(uint256 n,uint256 value) private pure returns(uint256[] memory x){
        x=new uint256[](n);for(uint256 i;i<n;i++)x[i]=value;
    }
    function callStep(uint256[] memory x,uint256 radius,uint8 input,uint8 output,uint256 amount,uint256 quantum) external pure returns(S.Result memory){
        return S.step(x,radius,input,output,amount,quantum);
    }
    function testExactFourTokenSphere() public pure {
        uint256[] memory x=equal(4,65);
        S.Result memory result=S.step(x,130,0,1,52,1);
        assertEq(result.amountOutRaw,26);
        assertEq(result.reserves[0],117);assertEq(result.reserves[1],39);
        assertEq(result.reserves[2],65);assertEq(result.reserves[3],65);
        assertEq(result.shortfallUpper,0);
        assertEq(x[0],65);assertEq(x[1],65); // Caller memory is not mutated.
    }
    function testIrrationalRootAndOneInternalUnitBound() public pure {
        S.Result memory result=S.step(equal(4,500),1000,0,1,100,1);
        // The exact output is sqrt(340000)-500, strictly between 83 and 84.
        assertEq(result.amountOutRaw,83);assertEq(result.reserves[1],417);
        assertEq(result.shortfallUpper,1);
    }
    function testActualStartingSlackIsReleased() public pure {
        uint256[] memory x=equal(4,65);x[1]=69;
        S.Result memory result=S.step(x,130,0,1,52,1);
        // The unchanged coordinates determine the same final deficit 91.
        // Starting output deficit is 61 rather than 65: four funded units release.
        assertEq(result.amountOutRaw,30);assertEq(result.reserves[1],39);
        assertEq(result.shortfallUpper,0);
    }
    function testIntegerQuantumDoesNotRoundTheRootTwice() public pure {
        S.Result memory result=S.step(equal(4,500),1000,0,1,100,17);
        assertEq(result.amountOutRaw,4);assertEq(result.reserves[1],432);
        assertEq(result.shortfallUpper,16);
        result=S.step(equal(4,65),130,0,1,52,10);
        assertEq(result.amountOutRaw,2);assertEq(result.reserves[1],45);
        assertEq(result.shortfallUpper,6);
    }
    function testSixAndEighteenDecimalOutputScales() public pure {
        uint256 unit=1e18*(uint256(1)<<64);
        uint256[] memory x=equal(4,65*unit);
        S.Result memory six=S.step(x,130*unit,0,1,52*unit,1e12*(uint256(1)<<64));
        S.Result memory eighteen=S.step(x,130*unit,0,1,52*unit,uint256(1)<<64);
        assertEq(six.amountOutRaw,26e6);assertEq(eighteen.amountOutRaw,26e18);
        assertEq(six.reserves[1],39*unit);assertEq(eighteen.reserves[1],39*unit);
        assertEq(six.shortfallUpper,0);assertEq(eighteen.shortfallUpper,0);
    }
    function testRejectInvalidDimensions() public {
        vm.expectRevert(S.InvalidDimension.selector);this.callStep(equal(0,0),130,0,1,1,1);
        vm.expectRevert(S.InvalidDimension.selector);this.callStep(equal(1,65),130,0,0,1,1);
        vm.expectRevert(S.InvalidDimension.selector);this.callStep(equal(9,100),130,0,1,1,1);
    }
    function testRejectInvalidRadius() public {
        vm.expectRevert(S.InvalidRadius.selector);this.callStep(equal(4,0),0,0,1,1,1);
        vm.expectRevert(S.InvalidRadius.selector);this.callStep(equal(4,65),uint256(1)<<160,0,1,1,1);
    }
    function testRejectInvalidPair() public {
        vm.expectRevert(S.InvalidPair.selector);this.callStep(equal(4,65),130,1,1,1,1);
        vm.expectRevert(S.InvalidPair.selector);this.callStep(equal(4,65),130,4,1,1,1);
        vm.expectRevert(S.InvalidPair.selector);this.callStep(equal(4,65),130,0,4,1,1);
    }
    function testRejectInvalidStartingSphereAndPriceBranch() public {
        vm.expectRevert(S.InvalidState.selector);this.callStep(equal(4,0),130,0,1,1,1);
        uint256[] memory x=equal(4,65);x[3]=131;
        vm.expectRevert(S.InvalidState.selector);this.callStep(x,130,0,1,1,1);
    }
    function testRejectInvalidInputBeforeOverflow() public {
        vm.expectRevert(S.InvalidInput.selector);this.callStep(equal(4,65),130,0,1,0,1);
        vm.expectRevert(S.InvalidInput.selector);this.callStep(equal(4,65),130,0,1,66,1);
        vm.expectRevert(S.InvalidInput.selector);this.callStep(equal(4,65),130,0,1,type(uint256).max,1);
    }
    function testRejectZeroScaleAndZeroRawOutput() public {
        vm.expectRevert(S.InvalidScale.selector);this.callStep(equal(4,65),130,0,1,1,0);
        vm.expectRevert(S.NoOutput.selector);this.callStep(equal(4,65),130,0,1,1,1000);
        vm.expectRevert(S.NoOutput.selector);this.callStep(equal(4,65),130,0,1,1,type(uint256).max);
    }
    function testWideRadicandNearLengthLimit() public pure {
        uint256 radius=(uint256(1)<<160)-1;
        uint256[] memory x=equal(8,radius-radius/8);
        S.Result memory result=S.step(x,radius,0,7,radius/16,1<<64);
        checkSquareCertificate(x,radius,0,7,radius/16,1<<64,result);
    }
    function testFuzzConservativeSquareBrackets(uint160 radiusSeed,uint160 amountSeed,uint160 scaleSeed,uint8 dimensions) public pure {
        uint256 radius=32+uint256(radiusSeed)%((uint256(1)<<160)-32);
        uint256 n=2+uint256(dimensions)%7;
        uint256 deficit=radius/n;
        uint256[] memory x=new uint256[](n);
        // Every deficit is <=radius/n: the complete starting sphere is feasible.
        for(uint256 i;i<n;i++)x[i]=radius-deficit/(i%3+1);
        uint256 amount=1+uint256(amountSeed)%deficit;
        uint256 quantum=1+uint256(scaleSeed)%(radius/(2*n));
        S.Result memory result=S.step(x,radius,0,uint8(n-1),amount,quantum);
        checkSquareCertificate(x,radius,0,uint8(n-1),amount,quantum,result);
    }
    function checkSquareCertificate(uint256[] memory x,uint256 radius,uint8 input,uint8 output,uint256 amount,uint256 quantum,S.Result memory result) private pure {
        assertGt(result.amountOutRaw,0);
        assertEq(result.reserves.length,x.length);
        assertEq(result.reserves[input],x[input]+amount);
        assertEq(result.reserves[output],x[output]-result.amountOutRaw*quantum);
        W.Uint512 memory fixedSquares;
        for(uint256 i;i<x.length;i++){
            assertLe(result.reserves[i],radius);
            if(i!=input&&i!=output)assertEq(result.reserves[i],x[i]);
            if(i!=output){uint256 delta=radius-result.reserves[i];fixedSquares=W.add(fixedSquares,W.mul(delta,delta));}
        }
        uint256 paidDeficit=radius-result.reserves[output];
        W.Uint512 memory radiusSquared=W.mul(radius,radius);
        // Orthogonal assertions use squares, never another invocation of sqrt.
        assertTrue(W.lte(W.add(fixedSquares,W.mul(paidDeficit,paidDeficit)),radiusSquared));
        uint256 nextDeficit=paidDeficit+quantum;
        assertFalse(W.lte(W.add(fixedSquares,W.mul(nextDeficit,nextDeficit)),radiusSquared));
        assertLe(result.shortfallUpper,quantum);
        uint256 ceiling=paidDeficit+result.shortfallUpper;
        assertTrue(W.lte(radiusSquared,W.add(fixedSquares,W.mul(ceiling,ceiling))));
        assertGt(ceiling,0);
        assertFalse(W.lte(radiusSquared,W.add(fixedSquares,W.mul(ceiling-1,ceiling-1))));
    }
}
