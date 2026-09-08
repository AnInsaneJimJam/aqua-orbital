// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "./WideMath.sol";

/// @notice Exact sign-and-magnitude integers in [-(2^512-1), 2^512-1].
/// @dev Zero is always returned with negative=false. This is not an int256 or
/// a two's-complement int512 encoding. Units are supplied by the caller.
library SignedWide {
    struct Int512 {bool negative;W.Uint512 magnitude;}
    error Overflow();
    error NonPositiveDenominator();
    function fromParts(bool negative,W.Uint512 memory magnitude) internal pure returns(Int512 memory){
        return Int512(negative&&(magnitude.hi!=0||magnitude.lo!=0),W.Uint512(magnitude.hi,magnitude.lo));
    }
    function fromInt(int256 value) internal pure returns(Int512 memory){
        return fromParts(value<0,W.Uint512(0,_abs(value)));
    }
    function fromUint(uint256 value) internal pure returns(Int512 memory){return fromParts(false,W.Uint512(0,value));}
    function add(Int512 memory a,Int512 memory b) internal pure returns(Int512 memory){
        bool aNegative=_negative(a);bool bNegative=_negative(b);
        if(aNegative==bNegative)return fromParts(aNegative,W.add(a.magnitude,b.magnitude));
        if(W.lte(b.magnitude,a.magnitude))return fromParts(aNegative,W.sub(a.magnitude,b.magnitude));
        return fromParts(bNegative,W.sub(b.magnitude,a.magnitude));
    }
    function sub(Int512 memory a,Int512 memory b) internal pure returns(Int512 memory){return add(a,neg(b));}
    function neg(Int512 memory a) internal pure returns(Int512 memory){return fromParts(!_negative(a),a.magnitude);}
    function compare(Int512 memory a,Int512 memory b) internal pure returns(int8){
        bool aNegative=_negative(a);bool bNegative=_negative(b);
        if(aNegative!=bNegative)return aNegative?int8(-1):int8(1);
        if(a.magnitude.hi==b.magnitude.hi&&a.magnitude.lo==b.magnitude.lo)return 0;
        bool smaller=W.lte(a.magnitude,b.magnitude);
        return smaller!=aNegative?int8(-1):int8(1);
    }
    /// @notice Exact 256-bit signed product with a full 512-bit magnitude.
    function product(int256 a,int256 b) internal pure returns(Int512 memory){
        return fromParts((a<0)!=(b<0),W.mul(_abs(a),_abs(b)));
    }
    /// @notice Checked 512-by-256 multiplication. Any discarded upper limb reverts.
    function mulInt(Int512 memory a,int256 b) internal pure returns(Int512 memory){
        return fromParts(_negative(a)!=(b<0),W.scale(a.magnitude,_abs(b)));
    }
    function mulUint(Int512 memory a,uint256 b) internal pure returns(Int512 memory){
        return fromParts(_negative(a),W.scale(a.magnitude,b));
    }
    /// @notice Floor toward negative infinity, with a strictly positive divisor.
    function divDown(Int512 memory a,uint256 denominator) internal pure returns(Int512 memory){
        if(denominator==0)revert NonPositiveDenominator();
        bool negative=_negative(a);
        return fromParts(negative,W.divWide(a.magnitude,denominator,negative));
    }
    /// @notice Ceiling toward positive infinity, with a strictly positive divisor.
    function divUp(Int512 memory a,uint256 denominator) internal pure returns(Int512 memory){
        if(denominator==0)revert NonPositiveDenominator();
        bool negative=_negative(a);
        return fromParts(negative,W.divWide(a.magnitude,denominator,!negative));
    }
    function divDownToInt256(Int512 memory a,uint256 denominator) internal pure returns(int256){return toInt256(divDown(a,denominator));}
    function divUpToInt256(Int512 memory a,uint256 denominator) internal pure returns(int256){return toInt256(divUp(a,denominator));}
    /// @notice Checked conversion; never narrows a discarded magnitude limb.
    function toInt256(Int512 memory a) internal pure returns(int256){
        bool negative=_negative(a);
        uint256 limit=negative?uint256(1)<<255:uint256(type(int256).max);
        if(a.magnitude.hi!=0||a.magnitude.lo>limit)revert Overflow();
        if(negative&&a.magnitude.lo==uint256(1)<<255)return type(int256).min;
        return negative?-int256(a.magnitude.lo):int256(a.magnitude.lo);
    }
    function _negative(Int512 memory a) private pure returns(bool){return a.negative&&(a.magnitude.hi!=0||a.magnitude.lo!=0);}
    function _abs(int256 value) private pure returns(uint256){
        // -(minInt+1) fits int256; the final +1 takes place in uint256.
        return value<0?uint256(-(value+1))+1:uint256(value);
    }
}
