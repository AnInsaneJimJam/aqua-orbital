// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {IntervalMath as I} from "../src/libraries/IntervalMath.sol";

contract IntervalMathTest is Test {
    function assertInterval(I.Interval memory value,int256 lo,int256 hi) private pure {
        assertEq(value.lo,lo);assertEq(value.hi,hi);
    }
    function pointWide(S.Int512 memory value) private pure returns(I.WideInterval memory){return I.wideBounds(value,value);}
    function addExternal(I.Interval memory a,I.Interval memory b) external pure {I.add(a,b);}
    function subExternal(I.Interval memory a,I.Interval memory b) external pure {I.sub(a,b);}
    function negExternal(I.Interval memory a) external pure {I.neg(a);}
    function mulDivExternal(I.Interval memory a,I.Interval memory b,uint256 d) external pure {I.mulDiv(a,b,d);}
    function quotientExternal(I.Interval memory a,I.Interval memory b,uint256 scale) external pure {I.quotient(a,b,scale);}
    function sqrtExternal(I.WideInterval memory a) external pure {I.sqrt(a);}
    function wideAddExternal(I.WideInterval memory a,I.WideInterval memory b) external pure {I.wideAdd(a,b);}

    function testExactIntervalArithmetic() public pure {
        assertInterval(I.add(I.bounds(-3,5),I.bounds(-7,11)),-10,16);
        assertInterval(I.sub(I.bounds(-3,5),I.bounds(-7,11)),-14,12);
        assertInterval(I.neg(I.bounds(-3,5)),-5,3);
        assertInterval(I.mulDiv(I.bounds(-3,5),I.bounds(-7,11),2),-18,28);
        assertInterval(I.mulDiv(I.bounds(-9,-5),I.bounds(2,4),7),-6,-1);
    }
    function testQuotientWithStrictlyPositiveInterval() public pure {
        assertInterval(I.quotient(I.bounds(-7,11),I.bounds(2,5),3),-11,17);
        assertInterval(I.quotient(I.bounds(-9,-5),I.bounds(2,4),1),-5,-1);
        assertInterval(I.quotient(I.bounds(5,9),I.bounds(2,4),1),1,5);
        assertInterval(I.quotient(I.bounds(-7,11),I.bounds(2,5),0),0,0);
        assertInterval(I.quotient(I.point(type(int256).min),I.bounds(1,2),1),type(int256).min,type(int256).min/2);
        assertInterval(I.mulDiv(I.point(type(int256).min),I.point(1),1),type(int256).min,type(int256).min);
    }
    function testPythonBigintWideMulDivGolden() public pure {
        I.Interval memory result=I.mulDiv(
            I.point(-1606938044258990275541962092341162602522202993782792958758165),
            I.point(1532495540865888858358347027150309183618739123171256497),
            1427247692705959881058285969449495136382746641);
        assertInterval(result,
            -1725436586697640946858688965569256363112777223602857745909267952566273,
            -1725436586697640946858688965569256363112777223602857745909267952566272);
    }
    function testWideProductSquareAndCancellation() public pure {
        I.WideInterval memory product=I.wideProduct(I.bounds(-3,5),I.bounds(-7,11));
        assertEq(S.toInt256(product.lo),-35);assertEq(S.toInt256(product.hi),55);
        I.WideInterval memory square=I.wideSquare(I.bounds(-3,5));
        assertEq(S.toInt256(square.lo),0);assertEq(S.toInt256(square.hi),25);
        square=I.wideSquare(I.bounds(-9,-5));
        assertEq(S.toInt256(square.lo),25);assertEq(S.toInt256(square.hi),81);
        S.Int512 memory huge=S.fromParts(false,W.Uint512(uint256(1)<<80,17));
        product=I.wideSub(pointWide(huge),pointWide(huge));
        assertEq(S.toInt256(product.lo),0);assertFalse(product.lo.negative);
        product=I.wideAdd(pointWide(S.neg(huge)),pointWide(S.add(huge,S.fromInt(7))));
        assertEq(S.toInt256(product.lo),7);assertEq(S.toInt256(product.hi),7);
    }
    function testRootEnclosuresAndZero() public pure {
        assertInterval(I.sqrt(I.wideBounds(S.fromInt(15),S.fromInt(25))),3,5);
        assertInterval(I.sqrt(I.wideBounds(S.fromInt(16),S.fromInt(26))),4,6);
        assertInterval(I.sqrt(pointWide(S.fromInt(0))),0,0);
        I.WideInterval memory square=I.wideSquare(I.point(type(int256).min));
        assertFalse(square.lo.negative);assertEq(square.lo.magnitude.hi,uint256(1)<<254);assertEq(square.lo.magnitude.lo,0);
        I.WideInterval memory root=I.sqrtWide(square);
        assertEq(root.lo.magnitude.lo,uint256(1)<<255);assertEq(root.hi.magnitude.lo,uint256(1)<<255);
    }
    function testFull512BitRootCeilingKeepsTheExtraBit() public pure {
        S.Int512 memory maximum=S.fromParts(false,W.Uint512(type(uint256).max,type(uint256).max));
        I.WideInterval memory root=I.sqrtWide(pointWide(maximum));
        assertFalse(root.lo.negative);assertEq(root.lo.magnitude.hi,0);assertEq(root.lo.magnitude.lo,type(uint256).max);
        assertFalse(root.hi.negative);assertEq(root.hi.magnitude.hi,1);assertEq(root.hi.magnitude.lo,0);
    }
    function testInvalidIntervalsAndDenominatorsReject() public {
        vm.expectRevert(I.InvalidInterval.selector);this.addExternal(I.Interval(3,2),I.point(0));
        vm.expectRevert(I.NonPositiveDenominator.selector);this.mulDivExternal(I.point(0),I.point(0),0);
        vm.expectRevert(I.NonPositiveDenominator.selector);this.quotientExternal(I.point(1),I.bounds(-1,1),1);
        vm.expectRevert(I.NonPositiveDenominator.selector);this.quotientExternal(I.point(1),I.bounds(0,2),1);
        vm.expectRevert(I.NonPositiveDenominator.selector);this.quotientExternal(I.point(1),I.bounds(-3,-1),1);
        vm.expectRevert(I.InvalidWideInterval.selector);this.sqrtExternal(I.WideInterval(S.fromInt(2),S.fromInt(1)));
        vm.expectRevert(I.NegativeRadicand.selector);this.sqrtExternal(I.wideBounds(S.fromInt(-1),S.fromInt(4)));
    }
    function testOutputAndWideOverflowReject() public {
        vm.expectRevert(S.Overflow.selector);this.addExternal(I.point(type(int256).max),I.point(1));
        vm.expectRevert(S.Overflow.selector);this.subExternal(I.point(type(int256).min),I.point(1));
        vm.expectRevert(S.Overflow.selector);this.negExternal(I.point(type(int256).min));
        vm.expectRevert(S.Overflow.selector);this.mulDivExternal(I.point(type(int256).min),I.point(-1),1);
        vm.expectRevert(S.Overflow.selector);this.quotientExternal(I.point(type(int256).max),I.point(1),2);
        vm.expectRevert(S.Overflow.selector);this.sqrtExternal(I.wideSquare(I.point(type(int256).min)));
        S.Int512 memory maximum=S.fromParts(false,W.Uint512(type(uint256).max,type(uint256).max));
        vm.expectRevert(W.Overflow.selector);this.wideAddExternal(pointWide(maximum),pointWide(S.fromInt(1)));
    }
    function testFuzzMulDivEnclosure(int64 a,int64 b,int64 c,int64 d,uint64 denominatorSeed) public pure {
        I.Interval memory left=I.Interval(a<b?a:b,a<b?b:a);I.Interval memory right=I.Interval(c<d?c:d,c<d?d:c);
        uint256 denominator=uint256(denominatorSeed)+1;
        I.Interval memory result=I.mulDiv(left,right,denominator);
        int256[3] memory aa=[left.lo,(left.lo+left.hi)/2,left.hi];
        int256[3] memory bb=[right.lo,(right.lo+right.hi)/2,right.hi];
        bool lowerTight;bool upperTight;
        for(uint256 i;i<3;i++)for(uint256 j;j<3;j++){
            int256 exact=aa[i]*bb[j];
            assertLe(result.lo*int256(denominator),exact);
            assertGe(result.hi*int256(denominator),exact);
            if((result.lo+1)*int256(denominator)>exact)lowerTight=true;
            if((result.hi-1)*int256(denominator)<exact)upperTight=true;
        }
        assertTrue(lowerTight);assertTrue(upperTight);
    }
    function testFuzzScaledQuotientEnclosure(int64 a,int64 b,uint64 lowSeed,uint64 highSeed,uint64 scale) public pure {
        I.Interval memory numerator=I.Interval(a<b?a:b,a<b?b:a);
        int256 low=int256(uint256(lowSeed))+1;int256 high=int256(uint256(highSeed))+1;
        I.Interval memory denominator=I.Interval(low<high?low:high,low<high?high:low);
        I.Interval memory result=I.quotient(numerator,denominator,scale);
        int256[3] memory aa=[numerator.lo,(numerator.lo+numerator.hi)/2,numerator.hi];
        int256[3] memory bb=[denominator.lo,(denominator.lo+denominator.hi)/2,denominator.hi];
        bool lowerTight;bool upperTight;
        for(uint256 i;i<3;i++)for(uint256 j;j<3;j++){
            int256 exact=aa[i]*int256(uint256(scale));
            assertLe(result.lo*bb[j],exact);assertGe(result.hi*bb[j],exact);
            if((result.lo+1)*bb[j]>exact)lowerTight=true;
            if((result.hi-1)*bb[j]<exact)upperTight=true;
        }
        assertTrue(lowerTight);assertTrue(upperTight);
    }
    function testFuzzWideRootEnclosure(uint128 high,uint256 low) public pure {
        W.Uint512 memory value=W.Uint512(high,low);
        I.Interval memory root=I.sqrt(pointWide(S.fromParts(false,value)));
        uint256 lo=uint256(root.lo);uint256 hi=uint256(root.hi);
        assertTrue(W.lte(W.mul(lo,lo),value));
        assertFalse(W.lte(W.mul(lo+1,lo+1),value));
        assertTrue(W.lte(value,W.mul(hi,hi)));
        if(hi!=0)assertFalse(W.lte(value,W.mul(hi-1,hi-1)));
        assertLe(hi-lo,1);
    }
}
