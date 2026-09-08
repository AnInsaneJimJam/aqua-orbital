// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "./WideMath.sol";
import {OrbitalMath as M} from "./OrbitalMath.sol";

/// @notice Global endpoint output bound from independent per-tick support costs.
/// @dev Does NOT certify candidate feasibility, a swap path, input/fee accounting,
/// or that a caller-supplied quantum is its token's raw unit. See ROOT_CERTIFICATE.
library DualCertificate {
    error InvalidDomain();
    uint256 constant GRID=1<<32;
    uint256 constant PRICE_MAX=1<<128;
    uint256 constant FREE_SCALE=1<<112;
    uint256 constant CAP_SCALE=1<<80;
    /// @dev gapUpper is meaningful only when excluded is false. boundaryCount
    /// counts price-selected support branches, not the persisted tick partition.
    struct Evaluation { W.Uint512 dotCost; W.Uint512 supportLower; W.Uint512 gapUpper; bool excluded; uint8 boundaryCount; }
    /// @param x Actual geometric candidate coordinates, including virtual offsets.
    /// @param ticks Immutable radii and keys; stored approximate coefficients are
    /// deliberately unused. Activation's minimum-radius rule is a caller concern.
    /// @param prices Arbitrary exact nonnegative weights, each at most 2^128.
    function evaluate(uint256[] memory x,M.Tick[] memory ticks,uint256[] memory prices,uint8 output) internal pure returns(Evaluation memory e){
        uint256 n=x.length;
        if(n<2||n>8||prices.length!=n||output>=n||ticks.length==0||ticks.length>8||ticks[ticks.length-1].key!=type(uint64).max)revert InvalidDomain();
        if(prices[output]==0)revert InvalidDomain();
        uint256 p1;W.Uint512 memory p2;
        for(uint256 i;i<n;i++){
            if(x[i]>=(uint256(1)<<160)||prices[i]>PRICE_MAX)revert InvalidDomain();
            p1+=prices[i];p2=W.add(p2,W.mul(prices[i],prices[i]));
            e.dotCost=W.add(e.dotCost,W.mul(prices[i],x[i]));
        }
        W.Uint512 memory p1Square=W.mul(p1,p1);
        W.Uint512 memory variance=W.sub(W.scale(p2,n),p1Square);
        // sqrt(P2)*2^112 upper enclosure. Radicand <=2^483, root <2^242.
        uint256 freeRootHi=sqrtUp(W.scale(p2,FREE_SCALE*FREE_SCALE));
        uint256 freeCenter=p1*FREE_SCALE;
        if(freeRootHi>freeCenter)revert InvalidDomain();
        uint256 radiusSum;
        for(uint256 i;i<ticks.length;i++){
            M.Tick memory tick=ticks[i];
            if(tick.radius==0||(i!=0&&tick.key<=ticks[i-1].key))revert InvalidDomain();
            radiusSum+=tick.radius;
            if(radiusSum>=(uint256(1)<<160))revert InvalidDomain();
            bool free=i+1==ticks.length;
            uint256 distance;uint256 sphereNumerator;
            if(!free){
                if(tick.key>=(n-1)*GRID)revert InvalidDomain();
                distance=n*GRID-tick.key;
                uint256 denominator=n*GRID*GRID;
                if(distance*distance>=denominator)revert InvalidDomain();
                sphereNumerator=denominator-distance*distance;
                if(sphereNumerator*GRID<denominator)revert InvalidDomain();
                // Both sides are nonnegative: compare the unsquared free-cap
                // condition P1/sqrt(P2)>=n-b exactly, with no price rounding.
                free=W.lte(W.scale(p2,distance*distance),W.scale(p1Square,GRID*GRID));
            }
            W.Uint512 memory lower;
            if(free){
                lower=W.divWide(W.mul(tick.radius,freeCenter-freeRootHi),FREE_SCALE,false);
            }else{
                // sigma*||p_perp|| = sqrt(E*(n*P2-P1^2))/(n*GRID).
                // Scaling by 2^160 gives a radicand <2^489 and root <2^245.
                W.Uint512 memory radicand=W.scale(W.scale(variance,sphereNumerator),CAP_SCALE*CAP_SCALE);
                uint256 capRootHi=sqrtUp(radicand);
                uint256 capCenter=uint256(tick.key)*p1*CAP_SCALE;
                // C(r,b) has nonnegative coordinates for the admitted b. Hence
                // exact support is nonnegative; ceil(root)<=integer capCenter.
                // Reject an inconsistent calculation instead of clamping it.
                if(capRootHi>capCenter)revert InvalidDomain();
                lower=W.divWide(W.mul(tick.radius,capCenter-capRootHi),n*GRID*CAP_SCALE,false);
                ++e.boundaryCount;
            }
            e.supportLower=W.add(e.supportLower,lower);
        }
        if(!W.lte(e.supportLower,e.dotCost)){e.excluded=true;return e;}
        e.gapUpper=W.sub(e.dotCost,e.supportLower);
    }
    /// @notice Bounds extra endpoint output by quantum; does not assert feasibility.
    /// @dev Pair with a separate endpoint/path certificate and bind quantum to
    /// 10^(18-outputDecimals)*2^64 to claim the one-raw-unit acceptance requirement.
    function certifiesQuantum(uint256[] memory x,M.Tick[] memory ticks,uint256[] memory prices,uint8 output,uint256 quantum) internal pure returns(bool){
        if(quantum==0||quantum>=(uint256(1)<<160))revert InvalidDomain();
        Evaluation memory e=evaluate(x,ticks,prices,output);
        return !e.excluded&&W.lte(e.gapUpper,W.mul(prices[output],quantum));
    }
    function sqrtUp(W.Uint512 memory value) private pure returns(uint256 result){
        result=W.sqrt(value);
        W.Uint512 memory square=W.mul(result,result);
        if(square.hi!=value.hi||square.lo!=value.lo)++result;
    }
}
