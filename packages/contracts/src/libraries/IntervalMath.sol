// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {SignedWide as S} from "./SignedWide.sol";
import {WideMath as W} from "./WideMath.sol";

/// @notice Closed integer endpoint enclosures with directed outward rounding.
/// @dev Interval endpoints are signed 256-bit scaled lengths/coefficients; their
/// products need not fit 256 bits. WideInterval retains exact signed 512-bit
/// products. Units and scaling are explicit caller responsibilities, never Q128
/// assumptions. Invalid domains and unrepresentable outputs revert; no clamps.
library IntervalMath {
    struct Interval {int256 lo;int256 hi;}
    struct WideInterval {S.Int512 lo;S.Int512 hi;}
    error InvalidInterval();error InvalidWideInterval();error NonPositiveDenominator();error NegativeRadicand();
    function point(int256 value) internal pure returns(Interval memory){return Interval(value,value);}
    function bounds(int256 lo,int256 hi) internal pure returns(Interval memory){
        if(lo>hi)revert InvalidInterval();
        return Interval(lo,hi);
    }
    function wideBounds(S.Int512 memory lo,S.Int512 memory hi) internal pure returns(WideInterval memory){
        if(S.compare(lo,hi)>0)revert InvalidWideInterval();
        return WideInterval(S.fromParts(lo.negative,lo.magnitude),S.fromParts(hi.negative,hi.magnitude));
    }
    function add(Interval memory a,Interval memory b) internal pure returns(Interval memory){
        _check(a);_check(b);
        return bounds(S.toInt256(S.add(S.fromInt(a.lo),S.fromInt(b.lo))),
                      S.toInt256(S.add(S.fromInt(a.hi),S.fromInt(b.hi))));
    }
    function sub(Interval memory a,Interval memory b) internal pure returns(Interval memory){
        _check(a);_check(b);
        return bounds(S.toInt256(S.sub(S.fromInt(a.lo),S.fromInt(b.hi))),
                      S.toInt256(S.sub(S.fromInt(a.hi),S.fromInt(b.lo))));
    }
    function neg(Interval memory a) internal pure returns(Interval memory){
        _check(a);
        return bounds(S.toInt256(S.neg(S.fromInt(a.hi))),S.toInt256(S.neg(S.fromInt(a.lo))));
    }
    /// @notice Encloses a*b/denominator; only the final endpoints are rounded.
    function mulDiv(Interval memory a,Interval memory b,uint256 denominator) internal pure returns(Interval memory){
        if(denominator==0)revert NonPositiveDenominator();
        WideInterval memory product=wideProduct(a,b);
        return bounds(S.divDownToInt256(product.lo,denominator),S.divUpToInt256(product.hi,denominator));
    }
    /// @notice Encloses numerator*scale/denominator; denominator.lo must be >0.
    /// @dev Scale is an exact unsigned integer, including zero. A denominator
    /// interval touching or crossing zero is rejected even when scale is zero.
    function quotient(Interval memory numerator,Interval memory denominator,uint256 scale) internal pure returns(Interval memory result){
        _check(numerator);_check(denominator);
        if(denominator.lo<=0)revert NonPositiveDenominator();
        int256[2] memory endpoints=[numerator.lo,numerator.hi];
        uint256[2] memory divisors=[uint256(denominator.lo),uint256(denominator.hi)];
        for(uint256 i;i<2;i++){
            S.Int512 memory scaled=S.mulUint(S.fromInt(endpoints[i]),scale);
            for(uint256 j;j<2;j++){
                int256 down=S.divDownToInt256(scaled,divisors[j]);
                int256 up=S.divUpToInt256(scaled,divisors[j]);
                if(i==0&&j==0){result.lo=down;result.hi=up;}
                else {if(down<result.lo)result.lo=down;if(up>result.hi)result.hi=up;}
            }
        }
    }
    /// @notice Exact range of the product over the independent endpoint rectangle.
    function wideProduct(Interval memory a,Interval memory b) internal pure returns(WideInterval memory result){
        _check(a);_check(b);
        S.Int512[4] memory candidates;
        candidates[0]=S.product(a.lo,b.lo);candidates[1]=S.product(a.lo,b.hi);
        candidates[2]=S.product(a.hi,b.lo);candidates[3]=S.product(a.hi,b.hi);
        result.lo=candidates[0];result.hi=candidates[0];
        for(uint256 i=1;i<4;i++){
            if(S.compare(candidates[i],result.lo)<0)result.lo=candidates[i];
            if(S.compare(candidates[i],result.hi)>0)result.hi=candidates[i];
        }
    }
    /// @notice Exact squared range, retaining correlation and a zero minimum
    /// when the input interval contains zero. This is tighter than wideProduct(a,a).
    function wideSquare(Interval memory a) internal pure returns(WideInterval memory){
        _check(a);
        S.Int512 memory left=S.product(a.lo,a.lo);S.Int512 memory right=S.product(a.hi,a.hi);
        bool leftSmaller=S.compare(left,right)<=0;
        S.Int512 memory lo=(a.lo<=0&&a.hi>=0)?S.fromInt(0):(leftSmaller?left:right);
        return wideBounds(lo,leftSmaller?right:left);
    }
    function wideAdd(WideInterval memory a,WideInterval memory b) internal pure returns(WideInterval memory){
        _wideCheck(a);_wideCheck(b);
        return wideBounds(S.add(a.lo,b.lo),S.add(a.hi,b.hi));
    }
    function wideSub(WideInterval memory a,WideInterval memory b) internal pure returns(WideInterval memory){
        _wideCheck(a);_wideCheck(b);
        return wideBounds(S.sub(a.lo,b.hi),S.sub(a.hi,b.lo));
    }
    /// @notice Directed floor/ceil root bounds, checked to fit signed endpoints.
    function sqrt(WideInterval memory a) internal pure returns(Interval memory){
        WideInterval memory result=sqrtWide(a);
        return bounds(S.toInt256(result.lo),S.toInt256(result.hi));
    }
    /// @notice Full 512-bit radicand support. The ceiling may equal 2^256 and
    /// is preserved in the wide endpoint instead of wrapping to zero.
    function sqrtWide(WideInterval memory a) internal pure returns(WideInterval memory){
        _wideCheck(a);
        if(S.compare(a.lo,S.fromInt(0))<0)revert NegativeRadicand();
        uint256 lower=W.sqrt(a.lo.magnitude);uint256 upper=W.sqrt(a.hi.magnitude);
        W.Uint512 memory ceiling=W.Uint512(0,upper);
        W.Uint512 memory square=W.mul(upper,upper);
        if(square.hi!=a.hi.magnitude.hi||square.lo!=a.hi.magnitude.lo)
            ceiling=W.add(ceiling,W.Uint512(0,1));
        return wideBounds(S.fromUint(lower),S.fromParts(false,ceiling));
    }
    function _check(Interval memory a) private pure {if(a.lo>a.hi)revert InvalidInterval();}
    function _wideCheck(WideInterval memory a) private pure {if(S.compare(a.lo,a.hi)>0)revert InvalidWideInterval();}
}
