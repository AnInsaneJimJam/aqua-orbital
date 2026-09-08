// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/*
 * Exact-division inverse steps adapted from OpenZeppelin Contracts v4.9.6,
 * contracts/utils/math/Math.sol (MIT), which credits Remco Bloemen and Uniswap
 * Labs for the original mulDiv algorithm. The arbitrary-numerator remainder,
 * 512-bit Newton root, and its range/postcondition checks are local adaptations.
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/math/Math.sol
 *
 * Copyright (c) 2016-2023 zOS Global Limited and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// @notice Checked unsigned 512-bit arithmetic. hi * 2**256 + lo.
library WideMath {
    struct Uint512 { uint256 hi; uint256 lo; }
    error Overflow();
    error Underflow();
    error DivisionByZero();
    /// @notice Checked 512-by-256 product, rejecting any discarded upper limb.
    function scale(Uint512 memory a,uint256 b) internal pure returns(Uint512 memory){
        Uint512 memory upper=mul(a.hi,b);
        if(upper.hi!=0)revert Overflow();
        return add(mul(a.lo,b),Uint512(upper.lo,0));
    }
    function mul(uint256 a, uint256 b) internal pure returns (Uint512 memory c) {
        uint256 lo; uint256 hi;
        assembly ("memory-safe") {
            let mm := mulmod(a, b, not(0))
            lo := mul(a, b)
            hi := sub(sub(mm, lo), lt(mm, lo))
        }
        c = Uint512(hi,lo);
    }
    function add(Uint512 memory a, Uint512 memory b) internal pure returns (Uint512 memory c) {
        unchecked {
            c.lo=a.lo+b.lo;
            uint256 hi=a.hi+b.hi;
            if(hi<a.hi) revert Overflow();
            c.hi=hi+(c.lo<a.lo?1:0);
            if(c.hi<hi) revert Overflow();
        }
    }
    function sub(Uint512 memory a, Uint512 memory b) internal pure returns (Uint512 memory c) {
        if(!lte(b,a)) revert Underflow();
        unchecked { c.lo=a.lo-b.lo; c.hi=a.hi-b.hi-(a.lo<b.lo?1:0); }
    }
    function lte(Uint512 memory a, Uint512 memory b) internal pure returns (bool) {
        return a.hi<b.hi || (a.hi==b.hi && a.lo<=b.lo);
    }
    function sqrt(Uint512 memory a) internal pure returns (uint256 result) {
        uint256 maximum=type(uint256).max;
        if(a.hi!=0||a.lo!=0){
            // maxUint^2 = (2^256-2)*2^256+1. Its entire upper region has
            // floor root maxUint, although the real root can exceed maxUint.
            if(lte(Uint512(maximum-1,1),a))result=maximum;
            else{
                uint256 msb=a.hi!=0?256+_log2(a.hi):_log2(a.lo);
                uint256 exponent=(msb+2)>>1;
                // Where 2^256 would be the initial bound, the preceding exact
                // threshold ensures maxUint is still above the real root.
                result=exponent==256?maximum:uint256(1)<<exponent;
                for(uint256 iteration;iteration<9;iteration++){
                    if(lte(mul(result,result),a))break;
                    // result^2>a implies a.hi<result, so this quotient fits.
                    (uint256 quotient,)=div(a,result);
                    // floor((result+quotient)/2), without an overflowing sum.
                    result=(result & quotient)+((result^quotient)>>1);
                }
            }
        }
        // Mandatory exact postconditions. At maxUint the next square is 2^512,
        // strictly above every representable radicand, without evaluating it.
        assert(lte(mul(result,result),a));
        assert(result==maximum||!lte(mul(result+1,result+1),a));
    }
    function div(Uint512 memory a, uint256 denominator) internal pure returns (uint256 q, uint256 remainder) {
        if(denominator==0) revert DivisionByZero();
        if(a.hi>=denominator) revert Overflow();
        if(a.hi==0) return (a.lo/denominator,a.lo%denominator);
        // Unlike a product-only mulDiv, arbitrary hi/lo inputs need this full
        // remainder. addmod computes 2^256 mod d without overflowing MAX+1.
        uint256 radix=addmod(type(uint256).max%denominator,1,denominator);
        remainder=addmod(mulmod(a.hi,radix,denominator),a.lo%denominator,denominator);
        unchecked{
            uint256 hi=a.hi;uint256 lo=a.lo;
            hi-=remainder>lo?1:0;
            lo-=remainder;
            uint256 twos=denominator&(~denominator+1);
            denominator/=twos;
            lo/=twos;
            // Intentional modular arithmetic: zero encodes 2^256 when twos=1.
            twos=(0-twos)/twos+1;
            lo|=hi*twos;
            uint256 inverse=(3*denominator)^2;
            inverse*=2-denominator*inverse; // 8 correct low bits
            inverse*=2-denominator*inverse; // 16
            inverse*=2-denominator*inverse; // 32
            inverse*=2-denominator*inverse; // 64
            inverse*=2-denominator*inverse; // 128
            inverse*=2-denominator*inverse; // 256
            // The exact quotient is <2^256 by the original hi<denominator test.
            q=lo*inverse;
        }
    }
    function _log2(uint256 value) private pure returns(uint256 result){
        if(value>>128!=0){value>>=128;result+=128;}
        if(value>>64!=0){value>>=64;result+=64;}
        if(value>>32!=0){value>>=32;result+=32;}
        if(value>>16!=0){value>>=16;result+=16;}
        if(value>>8!=0){value>>=8;result+=8;}
        if(value>>4!=0){value>>=4;result+=4;}
        if(value>>2!=0){value>>=2;result+=2;}
        if(value>>1!=0)result+=1;
    }
    function mulDiv(uint256 a,uint256 b,uint256 d,bool roundUp) internal pure returns(uint256 q) {
        uint256 r; (q,r)=div(mul(a,b),d);
        if(roundUp && r!=0) { if(q==type(uint256).max) revert Overflow(); ++q; }
    }
    function divWide(Uint512 memory a,uint256 d,bool roundUp) internal pure returns(Uint512 memory q) {
        if(d==0)revert DivisionByZero();
        q.hi=a.hi/d;
        uint256 remainder;
        (q.lo,remainder)=div(Uint512(a.hi%d,a.lo),d);
        if(roundUp&&remainder!=0)q=add(q,Uint512(0,1));
    }
}
