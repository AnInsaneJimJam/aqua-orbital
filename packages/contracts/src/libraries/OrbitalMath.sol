// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "./WideMath.sol";
import {TickGeometry as G} from "./TickGeometry.sol";

/// @notice Endpoint geometry certificate. This is not yet a complete swap solver.
library OrbitalMath {
    struct Tick {uint64 key;uint192 radius;G.Coefficients coefficients;}
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    /// @notice Proof-only evaluation at exact GRID-denominator coordinates.
    /// @dev Radii and contributions keep their original units. `boundaryCount`
    /// selects a one-sided partition, accepting equality on either side.
    function certifyGridPoint(uint256[] memory xNumerators,Tick[] memory ticks,uint256 boundaryCount) internal pure returns(bool){
        if(boundaryCount>=ticks.length)return false;
        return certifyAtScale(xNumerators,ticks,GRID,boundaryCount);
    }
    /// @dev Coefficients must come from G.coefficients at activation, not caller data.
    /// A false result includes interval uncertainty. This does not certify a swap path
    /// or bound the shortfall from the optimum; those are separate solver obligations.
    function certify(uint256[] memory x,Tick[] memory ticks) internal pure returns(bool){
        return certifyAtScale(x,ticks,1,type(uint256).max);
    }
    function certifyAtScale(uint256[] memory x,Tick[] memory ticks,uint256 scale,uint256 selectedCount) private pure returns(bool){
        uint256 n=x.length;
        if(n<2||n>8||ticks.length==0||ticks.length>8||ticks[ticks.length-1].key!=type(uint64).max)return false;
        bool canonical=selectedCount==type(uint256).max;
        if(!canonical&&selectedCount>=ticks.length)return false;
        uint256 A;uint256 maximum;uint256 R;uint256 V;W.Uint512 memory B;
        for(uint256 i;i<n;++i){
            if(x[i]>=(uint256(1)<<160)*scale)return false;
            A+=x[i];B=W.add(B,W.mul(x[i],x[i]));if(x[i]>maximum)maximum=x[i];
        }
        for(uint256 i;i<ticks.length;++i){
            if(ticks[i].radius==0||(i!=0&&ticks[i].key<=ticks[i-1].key))return false;
            R+=ticks[i].radius;
            V+=W.mulDiv(ticks[i].radius,ticks[i].coefficients.virtualLo,Q,false);
        }
        if(R>=(uint256(1)<<160))return false;
        // Scale the existing represented virtual credit and sigma contributions,
        // not a newly rounded radius. This does not change NUM-6 accounting.
        R*=scale;V*=scale;
        for(uint256 i;i<n;++i)if(x[i]<V)return false;
        uint256 Knum;uint256 Slo;uint256 Shi;uint256 boundaries;
        for(uint256 i;i+1<ticks.length;++i){
            Tick memory tick=ticks[i];
            if(A*GRID<Knum)return false;
            uint256 lhs=A*GRID-Knum;uint256 rhs=R*tick.key;
            if(canonical){if(lhs<rhs)break;}
            else if(i==selectedCount){if(lhs>rhs)return false;break;}
            else if(lhs<rhs)return false;
            uint256 scaledRadius=uint256(tick.radius)*scale;
            R-=scaledRadius;Knum+=scaledRadius*tick.key;
            Slo+=W.mulDiv(tick.radius,tick.coefficients.sigmaLo,Q,false)*scale;
            Shi+=W.mulDiv(tick.radius,tick.coefficients.sigmaHi,Q,true)*scale;
            ++boundaries;
        }
        if(R==0||A*GRID<Knum)return false;
        if(boundaries==0){
            // Exact sphere reduction avoids division at the equal-price point.
            W.Uint512 memory square;
            for(uint256 i;i<n;++i){if(x[i]>R)return false;uint256 delta=R-x[i];square=W.add(square,W.mul(delta,delta));}
            return W.lte(square,W.mul(R,R));
        }
        uint256 Cnum=A*GRID-Knum;
        if(Cnum>n*R*GRID)return false;
        W.Uint512 memory nB=W.scale(B,n);
        W.Uint512 memory AA=W.mul(A,A);
        if(!W.lte(AA,nB))return false;
        W.Uint512 memory varianceNumerator=W.sub(nB,AA);
        W.Uint512 memory varianceFloor=W.divWide(varianceNumerator,n,false);
        uint256 rhoLo=W.sqrt(varianceFloor);
        W.Uint512 memory rootSquare=W.mul(rhoLo,rhoLo);
        W.Uint512 memory nRootSquare=W.scale(rootSquare,n);
        uint256 rhoHi=rhoLo;
        if(nRootSquare.hi!=varianceNumerator.hi||nRootSquare.lo!=varianceNumerator.lo)++rhoHi;
        if(rhoLo==0||rhoLo<Shi)return false;
        uint256 centered=n*R*GRID-Cnum;
        W.Uint512 memory axial=W.divWide(W.mul(centered,centered),n*GRID*GRID,true);
        uint256 transverseHi=rhoHi-Slo;
        if(!W.lte(W.add(axial,W.mul(transverseHi,transverseHi)),W.mul(R,R)))return false;
        uint256 maximumDeviation=n*maximum-A;
        // Lower bound on interior price at the largest reserve.
        if(!W.lte(W.mul(transverseHi*GRID,maximumDeviation),W.mul(centered,rhoLo)))return false;
        // Boundary positive-price check omitted by an aggregate-g-only certificate.
        Tick memory outer=ticks[boundaries-1];
        if(!W.lte(W.mul(outer.coefficients.sigmaHi*GRID,maximumDeviation),W.mul((n*GRID-outer.key)*rhoLo,Q)))return false;
        return true;
    }
}
