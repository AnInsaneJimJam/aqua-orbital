// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Checked unsigned 512-bit arithmetic. hi * 2**256 + lo.
library WideMath {
    struct Uint512 { uint256 hi; uint256 lo; }
    error Overflow();
    error Underflow();
    error DivisionByZero();
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
        // Greedy binary digits. Invariant: result^2 <= a; no narrowed radicand.
        for(uint256 bit=uint256(1)<<255;bit!=0;bit>>=1) {
            uint256 candidate=result|bit;
            if(lte(mul(candidate,candidate),a)) result=candidate;
        }
    }
    function div(Uint512 memory a, uint256 denominator) internal pure returns (uint256 q, uint256 remainder) {
        if(denominator==0) revert DivisionByZero();
        if(a.hi>=denominator) revert Overflow();
        if(a.hi==0) return (a.lo/denominator,a.lo%denominator);
        remainder=a.hi;
        // Long division; remainder < denominator after every step.
        for(uint256 bit=uint256(1)<<255;bit!=0;bit>>=1) {
            bool carry=remainder>>255!=0;
            unchecked {
                remainder=(remainder<<1)|((a.lo&bit)!=0?1:0);
                if(carry || remainder>=denominator) { remainder-=denominator; q|=bit; }
            }
        }
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
