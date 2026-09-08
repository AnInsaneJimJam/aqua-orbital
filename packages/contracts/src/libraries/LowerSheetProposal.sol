// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {CurveEvaluation as C} from "./CurveEvaluation.sol";
import {WideMath as W} from "./WideMath.sol";
/// @dev Arithmetic seed proposal only. It never certifies a root or trade.
library LowerSheetProposal {
    error InvalidSigma();
    /// @dev Let m=n-1, T=sum(untouched), B=sum(untouched^2). Then
    /// n*rho^2=m*z^2-2*T*z+n*B-T^2. The lower root of rho=sigmaHi is
    /// (T-sqrt(n*(m*sigmaHi^2-(m*B-T^2))))/m. Round its square root UP
    /// and z DOWN; this proposes a point on/below that lower sheet edge.
    /// All lengths are GRID numerators <2^192; radicand <2^390.
    /// Membership, prices, original-radical signs and connected path still
    /// require their separate certificates. False proves no infeasibility.
    function cap(uint256[] memory point,uint8 output,uint256 sigmaHi,uint256 lower) internal pure returns(bool,uint256){
        if(sigmaHi>=1<<192)revert InvalidSigma();
        C.Vertical memory fixedPoint=C.prepareVertical(point,output);
        uint256 current=point[output];uint256 m=uint256(fixedPoint.n)-1;
        if(lower>current)return(false,current);
        W.Uint512 memory variance=W.sub(W.scale(fixedPoint.untouchedSquares,m),W.mul(fixedPoint.untouchedSum,fixedPoint.untouchedSum));
        W.Uint512 memory threshold=W.scale(W.mul(sigmaHi,sigmaHi),m);
        if(W.lte(threshold,variance))return(false,current);
        W.Uint512 memory radicand=W.scale(W.sub(threshold,variance),fixedPoint.n);
        uint256 delta=W.sqrt(radicand);W.Uint512 memory square=W.mul(delta,delta);
        if(square.hi!=radicand.hi||square.lo!=radicand.lo)++delta;
        if(fixedPoint.untouchedSum<delta)return(false,current);
        uint256 ceiling=(fixedPoint.untouchedSum-delta)/m;
        if(current>ceiling)current=ceiling;
        return(current>=lower,current);
    }
}
