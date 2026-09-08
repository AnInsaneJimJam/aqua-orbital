// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";

contract SignedWideTest is Test {
    function asInt(S.Int512 memory value) private pure returns(int256){return S.toInt256(value);}
    function castExternal(S.Int512 memory value) external pure returns(int256){return S.toInt256(value);}
    function addExternal(S.Int512 memory a,S.Int512 memory b) external pure {S.add(a,b);}
    function multiplyExternal(S.Int512 memory a,uint256 b) external pure {S.mulUint(a,b);}
    function divideExternal(S.Int512 memory a,uint256 b) external pure {S.divDown(a,b);}

    function testCanonicalZeroAndMixedSignCancellation() public pure {
        S.Int512 memory a=S.fromParts(true,W.Uint512(1,0));
        S.Int512 memory zero=S.add(a,S.neg(a));
        assertFalse(zero.negative);assertEq(zero.magnitude.hi,0);assertEq(zero.magnitude.lo,0);
        zero=S.fromParts(true,W.Uint512(0,0));assertFalse(zero.negative);
        zero=S.neg(zero);assertFalse(zero.negative);
        assertEq(asInt(S.add(a,S.fromUint(type(uint256).max))),-1);
        assertEq(asInt(S.sub(S.fromInt(-9),S.fromInt(-14))),5);
        S.Int512 memory rawNegativeZero=S.Int512(true,W.Uint512(0,0));
        assertEq(int256(S.compare(rawNegativeZero,S.fromInt(0))),0);
        assertFalse(S.add(rawNegativeZero,S.fromInt(0)).negative);
    }
    function testSignedCastBoundaries() public {
        assertEq(asInt(S.fromInt(type(int256).min)),type(int256).min);
        assertEq(asInt(S.fromInt(type(int256).max)),type(int256).max);
        assertEq(asInt(S.fromParts(true,W.Uint512(0,uint256(1)<<255))),type(int256).min);
        vm.expectRevert(S.Overflow.selector);this.castExternal(S.fromUint(uint256(1)<<255));
        vm.expectRevert(S.Overflow.selector);this.castExternal(S.fromParts(true,W.Uint512(0,(uint256(1)<<255)+1)));
        vm.expectRevert(S.Overflow.selector);this.castExternal(S.fromParts(false,W.Uint512(1,0)));
    }
    function testWideProductsAndSignChanges() public pure {
        S.Int512 memory p=S.product(type(int256).min,type(int256).max);
        assertTrue(p.negative);assertEq(p.magnitude.hi,(uint256(1)<<254)-1);assertEq(p.magnitude.lo,uint256(1)<<255);
        p=S.mulInt(S.fromParts(true,W.Uint512(uint256(1)<<44,0)),-3);
        assertFalse(p.negative);assertEq(p.magnitude.hi,3*(uint256(1)<<44));assertEq(p.magnitude.lo,0);
        assertEq(asInt(S.mulUint(S.fromInt(-7),9)),-63);
        assertEq(asInt(S.mulInt(S.fromInt(7),-9)),-63);
        assertFalse(S.mulInt(S.fromInt(-1),0).negative);
    }
    function testDirectedNegativeAndPositiveDivision() public pure {
        assertEq(asInt(S.divDown(S.fromInt(-7),3)),-3);
        assertEq(asInt(S.divUp(S.fromInt(-7),3)),-2);
        assertEq(asInt(S.divDown(S.fromInt(7),3)),2);
        assertEq(asInt(S.divUp(S.fromInt(7),3)),3);
        assertEq(asInt(S.divDown(S.fromInt(-6),3)),-2);
        assertEq(asInt(S.divUp(S.fromInt(-6),3)),-2);
        assertFalse(S.divUp(S.fromInt(-1),3).negative);
        S.Int512 memory a=S.fromParts(true,W.Uint512(1,0));
        uint256 q=type(uint256).max/3;
        assertEq(S.divDownToInt256(a,3),-int256(q)-1);
        assertEq(S.divUpToInt256(a,3),-int256(q));
    }
    function testPythonBigintDirectedDivisionGolden() public pure {
        S.Int512 memory a=S.fromParts(true,W.Uint512(
            19807040628566084398385987584,
            13658973376201417342106677784899882121438725447153739223518485));
        uint256 d=1329227995784915872903807060280356921;
        assertEq(S.divDownToInt256(a,d),-1725436586697640946858688965569240338386597600206697553270682985579868);
        assertEq(S.divUpToInt256(a,d),-1725436586697640946858688965569240338386597600206697553270682985579867);
        a=S.neg(a);
        assertEq(S.divDownToInt256(a,d),1725436586697640946858688965569240338386597600206697553270682985579867);
        assertEq(S.divUpToInt256(a,d),1725436586697640946858688965569240338386597600206697553270682985579868);
    }
    function testWideLimitsAndTypedFailures() public {
        S.Int512 memory maximum=S.fromParts(false,W.Uint512(type(uint256).max,type(uint256).max));
        S.Int512 memory same=S.divDown(maximum,1);
        assertEq(int256(S.compare(same,maximum)),0);
        S.Int512 memory half=S.divDown(maximum,2);
        assertEq(half.magnitude.hi,(uint256(1)<<255)-1);assertEq(half.magnitude.lo,type(uint256).max);
        half=S.divUp(maximum,2);
        assertEq(half.magnitude.hi,uint256(1)<<255);assertEq(half.magnitude.lo,0);
        half=S.divDown(S.neg(maximum),2);
        assertTrue(half.negative);assertEq(half.magnitude.hi,uint256(1)<<255);assertEq(half.magnitude.lo,0);
        half=S.divUp(S.neg(maximum),2);
        assertTrue(half.negative);assertEq(half.magnitude.hi,(uint256(1)<<255)-1);assertEq(half.magnitude.lo,type(uint256).max);
        assertEq(int256(S.compare(S.neg(maximum),S.fromInt(type(int256).min))),-1);
        vm.expectRevert(W.Overflow.selector);this.addExternal(maximum,S.fromInt(1));
        vm.expectRevert(W.Overflow.selector);this.multiplyExternal(maximum,2);
        vm.expectRevert(S.NonPositiveDenominator.selector);this.divideExternal(S.fromInt(1),0);
    }
    function testFuzzBoundedArithmetic(int128 a,int128 b,uint64 factor) public pure {
        assertEq(asInt(S.add(S.fromInt(a),S.fromInt(b))),int256(a)+int256(b));
        assertEq(asInt(S.sub(S.fromInt(a),S.fromInt(b))),int256(a)-int256(b));
        assertEq(asInt(S.product(a,b)),int256(a)*int256(b));
        assertEq(asInt(S.mulUint(S.fromInt(a),factor)),int256(a)*int256(uint256(factor)));
    }
    function testFuzzDirectedDivision(int128 value,uint64 denominatorSeed) public pure {
        uint256 d=uint256(denominatorSeed)+1;
        int256 truncated=int256(value)/int256(d);int256 rem=int256(value)%int256(d);
        int256 down=truncated-(value<0&&rem!=0?int256(1):int256(0));
        int256 up=truncated+(value>0&&rem!=0?int256(1):int256(0));
        assertEq(S.divDownToInt256(S.fromInt(value),d),down);
        assertEq(S.divUpToInt256(S.fromInt(value),d),up);
    }
    function testFuzzComparison(int256 a,int256 b) public pure {
        assertEq(int256(S.compare(S.fromInt(a),S.fromInt(b))),a<b?int256(-1):a>b?int256(1):int256(0));
    }
}
