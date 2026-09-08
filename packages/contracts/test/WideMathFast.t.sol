// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

/// @dev Independent legacy algorithms retained only in this test file. They do
/// not call production division or sqrt. mul/lte remain the unchanged primitives.
library LegacyWideOracle {
    function divide(W.Uint512 memory a,uint256 denominator) internal pure returns(uint256 q,uint256 remainder){
        require(denominator!=0&&a.hi<denominator,"oracle domain");
        if(a.hi==0)return(a.lo/denominator,a.lo%denominator);
        remainder=a.hi;
        for(uint256 bit=uint256(1)<<255;bit!=0;bit>>=1){
            bool carry=remainder>>255!=0;
            unchecked{
                remainder=(remainder<<1)|((a.lo&bit)!=0?1:0);
                if(carry||remainder>=denominator){remainder-=denominator;q|=bit;}
            }
        }
    }
    function root(W.Uint512 memory a) internal pure returns(uint256 result){
        for(uint256 bit=uint256(1)<<255;bit!=0;bit>>=1){
            uint256 candidate=result|bit;
            if(W.lte(W.mul(candidate,candidate),a))result=candidate;
        }
    }
}

contract WideMathFastTest is Test {
    function currentDiv(W.Uint512 memory a,uint256 d) external pure returns(uint256,uint256){return W.div(a,d);}
    function legacyDiv(W.Uint512 memory a,uint256 d) external pure returns(uint256,uint256){return LegacyWideOracle.divide(a,d);}
    function currentSqrt(W.Uint512 memory a) external pure returns(uint256){return W.sqrt(a);}
    function legacySqrt(W.Uint512 memory a) external pure returns(uint256){return LegacyWideOracle.root(a);}

    function checkDivision(W.Uint512 memory a,uint256 d) private pure {
        (uint256 q,uint256 remainder)=W.div(a,d);
        (uint256 expected,uint256 expectedRemainder)=LegacyWideOracle.divide(a,d);
        assertEq(q,expected);assertEq(remainder,expectedRemainder);assertLt(remainder,d);
        W.Uint512 memory reconstructed=W.add(W.mul(q,d),W.Uint512(0,remainder));
        assertEq(reconstructed.hi,a.hi);assertEq(reconstructed.lo,a.lo);
    }
    function checkRoot(W.Uint512 memory a,uint256 root) private pure {
        assertTrue(W.lte(W.mul(root,root),a));
        if(root!=type(uint256).max)assertFalse(W.lte(W.mul(root+1,root+1),a));
        // At maxUint, the next square is 2^512, above every Uint512 input.
    }
    function testArbitraryNumeratorPythonGolden() public pure {
        W.Uint512 memory a=W.Uint512(
            1606938044258990275541962092341162602673318721234621482151993,
            1809251394333065553493296640760748560207343511034459113230639450871994253319);
        uint256 denominator=57896044618658097711785492504343953926634992332820282019728792003956564819949;
        (uint256 q,uint256 remainder)=W.div(a,denominator);
        assertEq(q,3213876088517980551083924184682325205346637442469242964303986);
        assertEq(remainder,1809251394333126617138978482391219154766852475213360699342046366488316029053);
        checkDivision(a,denominator);
    }
    function testDivisionBorrowOddAndMaximumDenominators() public pure {
        checkDivision(W.Uint512(1,0),3);
        checkDivision(W.Uint512(8,0),9);
        checkDivision(W.Uint512(2,1),3);
        checkDivision(W.Uint512(type(uint256).max-1,0),type(uint256).max);
        checkDivision(W.Uint512(type(uint256).max-1,type(uint256).max),type(uint256).max);
        checkDivision(W.Uint512(0,type(uint256).max),1);
    }
    function testEveryPowerOfTwoDenominator() public pure {
        for(uint256 bit;bit<256;bit++){
            uint256 denominator=uint256(1)<<bit;
            W.Uint512 memory a=W.Uint512(denominator-1,type(uint256).max);
            (uint256 q,uint256 remainder)=W.div(a,denominator);
            assertEq(q,type(uint256).max);assertEq(remainder,denominator-1);
        }
    }
    function testDivisionErrorsPreserved() public {
        vm.expectRevert(W.DivisionByZero.selector);this.currentDiv(W.Uint512(0,0),0);
        vm.expectRevert(W.Overflow.selector);this.currentDiv(W.Uint512(3,0),3);
        vm.expectRevert(W.Overflow.selector);this.currentDiv(W.Uint512(type(uint256).max,0),type(uint256).max);
    }
    function testRootMaximumAndLastPerfectSquareNeighbors() public pure {
        uint256 maximum=type(uint256).max;
        W.Uint512 memory square=W.mul(maximum,maximum);
        assertEq(W.sqrt(square),maximum);
        assertEq(W.sqrt(W.sub(square,W.Uint512(0,1))),maximum-1);
        assertEq(W.sqrt(W.add(square,W.Uint512(0,1))),maximum);
        assertEq(W.sqrt(W.Uint512(maximum,maximum)),maximum);
        assertEq(W.sqrt(W.Uint512(0,0)),0);
        assertEq(W.sqrt(W.Uint512(0,1)),1);
        assertEq(W.sqrt(W.Uint512(0,2)),1);
        assertEq(W.sqrt(W.Uint512(0,3)),1);
    }
    function rootBitSpans(uint256 first,uint256 last) private pure {
        for(uint256 bit=first;bit<=last;bit++){
            W.Uint512 memory value=bit<256?W.Uint512(0,uint256(1)<<bit):W.Uint512(uint256(1)<<(bit-256),0);
            uint256 root=W.sqrt(value);
            checkRoot(value,root);
            if(bit%2==0)assertEq(root,uint256(1)<<(bit/2));
            if(bit!=0)checkRoot(W.sub(value,W.Uint512(0,1)),W.sqrt(W.sub(value,W.Uint512(0,1))));
        }
    }
    // Separate calls bound legacy-oracle memory growth while preserving all spans.
    function testRootBitSpans000_031() public pure {rootBitSpans(0,31);}
    function testRootBitSpans032_063() public pure {rootBitSpans(32,63);}
    function testRootBitSpans064_095() public pure {rootBitSpans(64,95);}
    function testRootBitSpans096_127() public pure {rootBitSpans(96,127);}
    function testRootBitSpans128_159() public pure {rootBitSpans(128,159);}
    function testRootBitSpans160_191() public pure {rootBitSpans(160,191);}
    function testRootBitSpans192_223() public pure {rootBitSpans(192,223);}
    function testRootBitSpans224_255() public pure {rootBitSpans(224,255);}
    function testRootBitSpans256_287() public pure {rootBitSpans(256,287);}
    function testRootBitSpans288_319() public pure {rootBitSpans(288,319);}
    function testRootBitSpans320_351() public pure {rootBitSpans(320,351);}
    function testRootBitSpans352_383() public pure {rootBitSpans(352,383);}
    function testRootBitSpans384_415() public pure {rootBitSpans(384,415);}
    function testRootBitSpans416_447() public pure {rootBitSpans(416,447);}
    function testRootBitSpans448_479() public pure {rootBitSpans(448,479);}
    function testRootBitSpans480_511() public pure {rootBitSpans(480,511);}
    function testFuzzArbitraryDivision(uint256 highSeed,uint256 low,uint256 denominatorSeed) public pure {
        uint256 denominator=denominatorSeed==0?1:denominatorSeed;
        checkDivision(W.Uint512(highSeed%denominator,low),denominator);
    }
    function testFuzzPerfectSquareNeighbors(uint256 root) public pure {
        W.Uint512 memory square=W.mul(root,root);
        assertEq(W.sqrt(square),root);
        if(root!=0)assertEq(W.sqrt(W.sub(square,W.Uint512(0,1))),root-1);
        assertEq(W.sqrt(W.add(square,W.Uint512(0,1))),root==0?1:root);
    }
    function testFuzzRootAcrossBitSpans(uint256 high,uint256 low,uint16 spanSeed) public pure {
        uint256 bits=1+uint256(spanSeed)%512;
        W.Uint512 memory value;
        if(bits<=256){
            uint256 mask=bits==256?type(uint256).max:(uint256(1)<<bits)-1;
            value=W.Uint512(0,(low&mask)|(uint256(1)<<(bits-1)));
        }else{
            uint256 upperBits=bits-256;
            uint256 mask=upperBits==256?type(uint256).max:(uint256(1)<<upperBits)-1;
            value=W.Uint512((high&mask)|(uint256(1)<<(upperBits-1)),low);
        }
        uint256 actual=W.sqrt(value);
        assertEq(actual,LegacyWideOracle.root(value));checkRoot(value,actual);
    }
    function testGasDivision() public {
        W.Uint512 memory a=W.Uint512((uint256(1)<<150)+17,type(uint256).max-123);
        uint256 denominator=(uint256(1)<<200)+19;
        uint256 before=gasleft();(uint256 q,uint256 r)=this.currentDiv(a,denominator);uint256 currentCost=before-gasleft();
        before=gasleft();(uint256 oldQ,uint256 oldR)=this.legacyDiv(a,denominator);uint256 oldCost=before-gasleft();
        assertEq(q,oldQ);assertEq(r,oldR);
        emit log_named_uint("current arbitrary 512/256 division gas",currentCost);
        emit log_named_uint("legacy arbitrary 512/256 division gas",oldCost);
    }
    function testGasSquareRoot() public {
        W.Uint512 memory a=W.Uint512((uint256(1)<<120)+17,type(uint256).max-123);
        uint256 before=gasleft();uint256 root=this.currentSqrt(a);uint256 currentCost=before-gasleft();
        before=gasleft();uint256 oldRoot=this.legacySqrt(a);uint256 oldCost=before-gasleft();
        assertEq(root,oldRoot);
        emit log_named_uint("current 377-bit square root gas",currentCost);
        emit log_named_uint("legacy 377-bit square root gas",oldCost);
    }
}
