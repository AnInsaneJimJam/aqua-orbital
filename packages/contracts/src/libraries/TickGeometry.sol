// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "./WideMath.sol";

library TickGeometry {
    uint256 internal constant Q=1<<128;
    uint256 internal constant GRID=1<<32;
    struct Coefficients { uint256 sigmaLo; uint256 sigmaHi; uint256 virtualLo; uint256 equalLo; uint256 equalHi; }
    error InvalidTick();
    function coefficients(uint8 n,uint64 key) internal pure returns(Coefficients memory c) {
        if(n<2 || n>8) revert InvalidTick();
        (uint256 invLo,uint256 invHi)=rootRatio(1,n);
        c.equalLo=Q-invHi; c.equalHi=Q-invLo;
        if(key==type(uint64).max) return c;
        if(key>=uint256(n-1)*GRID) revert InvalidTick();
        uint256 distance=uint256(n)*GRID-key;
        uint256 denominator=uint256(n)*GRID*GRID;
        if(distance*distance>=denominator) revert InvalidTick();
        uint256 numerator=denominator-distance*distance;
        if(numerator*GRID<denominator) revert InvalidTick();
        (c.sigmaLo,c.sigmaHi)=rootRatio(numerator,denominator);
        (,uint256 transverseHi)=rootRatio(n-1,n);
        uint256 centerLo=uint256(key)*(Q/GRID)/n;
        uint256 offsetHi=W.mulDiv(c.sigmaHi,transverseHi,Q,true);
        // True minimum is nonnegative on the admitted cap domain.
        c.virtualLo=centerLo>offsetHi?centerLo-offsetHi:0;
    }
    function rootRatio(uint256 numerator,uint256 denominator) internal pure returns(uint256 lo,uint256 hi) {
        // Caller supplies 0 <= numerator < denominator. Q^2 = 2^256.
        (uint256 scaled,uint256 remainder)=W.div(W.Uint512(numerator,0),denominator);
        lo=W.sqrt(W.Uint512(0,scaled));
        hi=lo;
        if(remainder!=0 || lo*lo!=scaled) ++hi;
    }
}
