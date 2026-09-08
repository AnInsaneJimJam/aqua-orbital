// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {WideMath as W} from "./WideMath.sol";

/// @notice Enclosures of both exact-frontier intersections at one ordinary key.
/// @dev Input/output progress is relative to the actual original integer state,
/// in length numerators with denominator GRID. This is not a traversal engine.
library FrontierEvents {
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    enum Status {NoRoots,Separated,Touch,Uncertain}
    struct Candidate {
        int256 inputLo;int256 inputHi;int256 outputLo;int256 outputHi;
        bool inward;bool physical;
    }
    struct Roots {
        Status status;uint64 key;uint256 sumNumerator;uint256 rhoLo;uint256 rhoHi;
        Candidate[2] candidates;
    }
    error InvalidPair();error InvalidKey();error InvalidState();
    function atKey(uint256[] memory start,M.Tick[] memory ticks,uint8 input,uint8 output,uint8 keyIndex) internal pure returns(Roots memory result){
        uint256 n=start.length;
        if(input>=n||output>=n||input==output)revert InvalidPair();
        if(ticks.length==0||uint256(keyIndex)+1>=ticks.length)revert InvalidKey();
        if(!M.certify(start,ticks))revert InvalidState();
        M.Tick memory tick=ticks[keyIndex];
        result.key=tick.key;
        uint256 R;uint256 Knum;uint256 Slo;uint256 Shi;uint256 V;
        for(uint256 i;i<ticks.length;i++){
            M.Tick memory t=ticks[i];
            V+=W.mulDiv(t.radius,t.coefficients.virtualLo,Q,false);
            if(i<=keyIndex){
                Knum+=uint256(t.radius)*t.key;
                Slo+=W.mulDiv(t.radius,t.coefficients.sigmaLo,Q,false);
                Shi+=W.mulDiv(t.radius,t.coefficients.sigmaHi,Q,true);
            }else R+=t.radius;
        }
        result.sumNumerator=Knum+R*tick.key;
        result.rhoLo=(Slo+W.mulDiv(R,tick.coefficients.sigmaLo,Q,false))*GRID;
        result.rhoHi=(Shi+W.mulDiv(R,tick.coefficients.sigmaHi,Q,true))*GRID;
        uint256 untouchedSum;W.Uint512 memory untouchedSquares;
        for(uint256 i;i<n;i++)if(i!=input&&i!=output){
            uint256 value=start[i]*GRID;untouchedSum+=value;
            untouchedSquares=W.add(untouchedSquares,W.mul(value,value));
        }
        int256 pairSum=int256(result.sumNumerator)-int256(untouchedSum);
        uint256 absoluteSum=uint256(pairSum>=0?pairSum:-pairSum);
        // At the key, pair sum s and difference delta obey:
        // n*delta^2 = 2*Ac^2 + 2*n*rho_c^2 - 2*n*U2 - n*s^2.
        // These are exact wide differences, not cancellation-prone floats.
        W.Uint512 memory common=W.scale(W.mul(result.sumNumerator,result.sumNumerator),2);
        W.Uint512 memory lo=W.add(common,W.scale(W.mul(result.rhoLo,result.rhoLo),2*n));
        W.Uint512 memory hi=W.add(common,W.scale(W.mul(result.rhoHi,result.rhoHi),2*n));
        W.Uint512 memory subtract=W.add(W.scale(untouchedSquares,2*n),W.scale(W.mul(absoluteSum,absoluteSum),n));
        if(!W.lte(subtract,hi)){result.status=Status.NoRoots;return result;}
        if(!W.lte(subtract,lo)){result.status=Status.Uncertain;return result;}
        uint256 deltaLo=W.sqrt(W.divWide(W.sub(lo,subtract),n,false));
        W.Uint512 memory radicandHi=W.divWide(W.sub(hi,subtract),n,true);
        uint256 deltaHi=W.sqrt(radicandHi);
        W.Uint512 memory square=W.mul(deltaHi,deltaHi);
        if(square.hi!=radicandHi.hi||square.lo!=radicandHi.lo)++deltaHi;
        if(deltaHi==0){result.status=Status.Touch;return result;}
        if(deltaLo==0){result.status=Status.Uncertain;return result;}
        result.status=Status.Separated;
        for(uint256 direction;direction<2;direction++){
            bool inward=direction==0;
            int256 inLo=halfDown(pairSum+(inward?-int256(deltaHi):int256(deltaLo)));
            int256 inHi=halfUp(pairSum+(inward?-int256(deltaLo):int256(deltaHi)));
            int256 outLo=halfDown(pairSum+(inward?int256(deltaLo):-int256(deltaHi)));
            int256 outHi=halfUp(pairSum+(inward?int256(deltaHi):-int256(deltaLo)));
            result.candidates[direction]=Candidate({
                inputLo:inLo-int256(start[input]*GRID),inputHi:inHi-int256(start[input]*GRID),
                outputLo:int256(start[output]*GRID)-outHi,outputHi:int256(start[output]*GRID)-outLo,
                inward:inward,
                physical:certifyPhysical(start,input,output,inLo,inHi,outLo,outHi,V*GRID,result.sumNumerator,result.rhoLo,tick)
            });
        }
    }
    /// @dev Conditional event exclusion, NOT the negation of physical. Inputs
    /// must be the unchanged candidate/A/rhoHi and immutable tick from the same
    /// fresh atKey Separated result. False includes exact zero and uncertainty.
    /// All lengths here are GRID numerators; original contribution rounding
    /// remains in atKey. See audits/NEGATIVE_PRICE_EXCLUSION for the sign proof.
    function hasCertifiedNegativePrice(uint256[] memory start,uint8 input,uint8 output,Candidate memory candidate,uint256 A,uint256 rhoHi,M.Tick memory tick) internal pure returns(bool){
        uint256 n=start.length;
        if(n<2||n>8||input>=n||output>=n||input==output||rhoHi==0||tick.key>=n*GRID)return false;
        int256 maximum;
        for(uint256 i;i<n;i++){
            int256 lower=int256(start[i]*GRID);
            if(i==input)lower+=candidate.inputLo;
            // Cumulative output is released, so its UPPER bound gives the
            // lower absolute reserve. Using outputLo would be unsound.
            else if(i==output)lower-=candidate.outputHi;
            if(lower>maximum)maximum=lower;
        }
        if(maximum<=0||n*uint256(maximum)<=A)return false;
        uint256 delta=n*uint256(maximum)-A;
        W.Uint512 memory lhs=W.mul(tick.coefficients.sigmaLo*GRID,delta);
        W.Uint512 memory rhs=W.mul((n*GRID-tick.key)*rhoHi,Q);
        return !W.lte(lhs,rhs);
    }
    function certifyPhysical(uint256[] memory start,uint8 input,uint8 output,int256 inLo,int256 inHi,int256 outLo,int256 outHi,uint256 virtualNumerator,uint256 A,uint256 rhoLo,M.Tick memory tick) private pure returns(bool){
        if(inLo<0||outLo<0||uint256(inLo)<virtualNumerator||uint256(outLo)<virtualNumerator||rhoLo==0)return false;
        uint256 n=start.length;uint256 maximum;
        for(uint256 i;i<n;i++){
            uint256 upper=i==input?uint256(inHi):(i==output?uint256(outHi):start[i]*GRID);
            if(upper>maximum)maximum=upper;
        }
        if(n*maximum<A)return false;
        W.Uint512 memory rhs=W.mul((n*GRID-tick.key)*rhoLo,Q);
        if(!W.lte(W.mul(tick.coefficients.sigmaHi*GRID,n*maximum-A),rhs))return false;
        uint256 outputTimesN=n*uint256(outHi);
        if(outputTimesN<=A)return true;
        W.Uint512 memory outputLhs=W.mul(tick.coefficients.sigmaHi*GRID,outputTimesN-A);
        return W.lte(outputLhs,rhs)&&(outputLhs.hi!=rhs.hi||outputLhs.lo!=rhs.lo);
    }
    function halfDown(int256 value) private pure returns(int256 answer){answer=value/2;if(value<0&&value%2!=0)--answer;}
    function halfUp(int256 value) private pure returns(int256 answer){answer=value/2;if(value>0&&value%2!=0)++answer;}
}
