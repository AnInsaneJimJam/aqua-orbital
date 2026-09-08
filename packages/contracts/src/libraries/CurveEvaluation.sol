// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {IntervalMath as I} from "./IntervalMath.sol";
import {TickGeometry as G} from "./TickGeometry.sol";
import {WideMath as W} from "./WideMath.sol";
import {SignedWide as S} from "./SignedWide.sol";

/// @notice Fixed-partition radical enclosures; not a root or path solver.
library CurveEvaluation {
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    enum Status {OutsideDomain,BelowSheet,UncertainSheet,Evaluated}
    struct Context {
        uint8 n;uint8 boundaryCount;uint64 outerKey;uint64 nextKey;
        uint256 radius;uint256 axial;uint256 sigmaLo;uint256 sigmaHi;
        uint256 virtualCredit;uint256 outerSigmaHi;
    }
    /// @dev rhoLo/rhoHi are used only for mixed partitions; sphere results leave
    /// them zero and do not claim that the actual transverse radius is zero.
    struct Evaluation {
        Status status;bool priceDomain;bool strictOutputPrice;
        uint256 rhoLo;uint256 rhoHi;
        I.WideInterval residual;I.Interval[] normals;
    }
    struct Vertical {uint8 n;uint256 untouchedSum;W.Uint512 untouchedSquares;}
    /// @dev Deliberately cannot be passed to certifiesMembership: no price proof.
    /// As in Evaluation, sphere rhoLo/rhoHi are unused zero fields.
    struct ResidualEvaluation {Status status;uint256 rhoLo;uint256 rhoHi;I.WideInterval residual;}
    error InvalidContext();error InvalidPoint();
    /// @notice Cache exact untouched moments for repeated output-only evaluation.
    /// @dev GRID-denominator coordinates; the output coordinate is not cached.
    function prepareVertical(uint256[] memory x,uint8 output) internal pure returns(Vertical memory v){
        uint256 n=x.length;
        if(n<2||n>8||output>=n)revert InvalidPoint();
        v.n=uint8(n);
        for(uint256 i;i<n;i++){
            if(x[i]>=(uint256(1)<<192))revert InvalidPoint();
            if(i!=output){v.untouchedSum+=x[i];v.untouchedSquares=W.add(v.untouchedSquares,W.mul(x[i],x[i]));}
        }
    }
    /// @notice Enclose only the original radical, reusing fixed untouched moments.
    /// @dev v and ctx must be unmodified prepareVertical/prepare results for the
    /// same fixed coordinates/partition. Caller separately certifies the entire
    /// domain before using signs in a root bracket: partition, principal, sheet,
    /// aggregate and boundary prices. This path checks the radical's axial/sheet
    /// requirements, NOT those other obligations. Evaluated is not membership.
    /// Non-Evaluated results have no valid residual bounds and prove no exclusion.
    function evaluateResidual(Vertical memory v,Context memory ctx,uint256 z) internal pure returns(ResidualEvaluation memory e){
        uint256 n=ctx.n;
        if(n<2||n>8||v.n!=n||z>=(uint256(1)<<192))revert InvalidPoint();
        uint256 A=v.untouchedSum+z;
        if(A<ctx.axial||A-ctx.axial>n*ctx.radius)return e;
        W.Uint512 memory B=W.add(v.untouchedSquares,W.mul(z,z));
        if(ctx.boundaryCount!=0)return _mixedResidual(A,B,ctx);
        // Exact sphere reduction: F-R^2 = B+(n-1)*R^2-2*R*A.
        // All cancellation is wide; no variance or division by rho is needed.
        S.Int512 memory residual=S.sub(
            S.fromParts(false,W.add(B,W.scale(W.mul(ctx.radius,ctx.radius),n-1))),
            S.fromParts(false,W.mul(2*ctx.radius,A))
        );
        e.status=Status.Evaluated;e.residual=I.wideBounds(residual,residual);
    }
    /// @notice Build once per partition. All lengths use GRID-denominator units.
    /// @dev Recomputes coefficients from exact keys. Existing represented sigma
    /// contributions and virtual credit are rounded BEFORE lifting by GRID.
    function prepare(uint8 n,M.Tick[] memory ticks,uint8 boundaryCount) internal pure returns(Context memory ctx){
        if(n<2||n>8||ticks.length==0||ticks.length>8||boundaryCount>=ticks.length||ticks[ticks.length-1].key!=type(uint64).max)revert InvalidContext();
        ctx.n=n;ctx.boundaryCount=boundaryCount;ctx.nextKey=ticks[boundaryCount].key;
        uint256 totalRadius;
        for(uint256 i;i<ticks.length;i++){
            M.Tick memory tick=ticks[i];
            if(tick.radius==0||(i!=0&&tick.key<=ticks[i-1].key))revert InvalidContext();
            totalRadius+=tick.radius;
            G.Coefficients memory c=G.coefficients(n,tick.key);
            ctx.virtualCredit+=W.mulDiv(tick.radius,c.virtualLo,Q,false)*GRID;
            if(i<boundaryCount){
                ctx.axial+=uint256(tick.radius)*tick.key;
                ctx.sigmaLo+=W.mulDiv(tick.radius,c.sigmaLo,Q,false)*GRID;
                ctx.sigmaHi+=W.mulDiv(tick.radius,c.sigmaHi,Q,true)*GRID;
                ctx.outerKey=tick.key;ctx.outerSigmaHi=c.sigmaHi;
            }else ctx.radius+=uint256(tick.radius)*GRID;
        }
        if(totalRadius>=(uint256(1)<<160))revert InvalidContext();
    }
    /// @notice Encloses the original radical F-R^2 and every normal component.
    /// @dev ctx must be returned by prepare without modification. A non-Evaluated
    /// result has no valid radical/normal bounds. This method does not certify a
    /// segment, a root bracket, global exclusion, or the output error budget.
    function evaluate(uint256[] memory x,Context memory ctx,uint8 output) internal pure returns(Evaluation memory e){
        uint256 n=ctx.n;
        if(n<2||n>8||x.length!=n||output>=n)revert InvalidPoint();
        uint256 A;uint256 maximum;W.Uint512 memory B;
        bool principal=true;
        for(uint256 i;i<n;i++){
            if(x[i]>=(uint256(1)<<192))revert InvalidPoint();
            if(x[i]<ctx.virtualCredit)principal=false;
            A+=x[i];B=W.add(B,W.mul(x[i],x[i]));
            if(x[i]>maximum)maximum=x[i];
        }
        if(!principal||A<ctx.axial||A-ctx.axial>n*ctx.radius)return e;
        uint256 curveSum=A-ctx.axial;
        // Adjacent affine key planes suffice for a sorted prefix. Equality is
        // valid on either side; the caller chooses the departure partition.
        if(ctx.boundaryCount!=0&&curveSum*GRID<ctx.radius*ctx.outerKey)return e;
        if(ctx.nextKey!=type(uint64).max&&curveSum*GRID>ctx.radius*ctx.nextKey)return e;
        if(ctx.boundaryCount==0)return sphere(x,ctx,output);
        ResidualEvaluation memory radical=_mixedResidual(A,B,ctx);
        e.status=radical.status;e.rhoLo=radical.rhoLo;e.rhoHi=radical.rhoHi;e.residual=radical.residual;
        if(e.status!=Status.Evaluated)return e;
        uint256 centered=n*ctx.radius-curveSum;
        uint256 transverseLo=e.rhoLo-ctx.sigmaHi;
        uint256 transverseHi=e.rhoHi-ctx.sigmaLo;
        I.Interval memory center=I.bounds(int256(centered/n),int256(centered/n+(centered%n==0?0:1)));
        I.Interval memory transverse=I.bounds(int256(transverseLo),int256(transverseHi));
        I.Interval memory denominator=I.bounds(int256(n*e.rhoLo),int256(n*e.rhoHi));
        e.normals=new I.Interval[](n);e.priceDomain=true;
        for(uint256 i;i<n;i++){
            int256 deviation=int256(n*x[i])-int256(A);
            I.Interval memory adjustment=I.quotient(transverse,denominator,uint256(deviation<0?-deviation:deviation));
            if(deviation<0)adjustment=I.neg(adjustment);
            e.normals[i]=I.sub(center,adjustment);
            if(e.normals[i].lo<0)e.priceDomain=false;
        }
        // Reconstructed boundary baskets have their own price restriction.
        // Aggregate normals alone do not imply this inequality in slack states.
        if(!W.lte(W.mul(ctx.outerSigmaHi*GRID,n*maximum-A),W.mul((n*GRID-ctx.outerKey)*e.rhoLo,Q)))e.priceDomain=false;
        e.strictOutputPrice=e.normals[output].lo>0;
    }
    function _mixedResidual(uint256 A,W.Uint512 memory B,Context memory ctx) private pure returns(ResidualEvaluation memory e){
        uint256 n=ctx.n;
        W.Uint512 memory variance=W.sub(W.scale(B,n),W.mul(A,A));
        e.rhoLo=W.sqrt(W.divWide(variance,n,false));e.rhoHi=e.rhoLo;
        W.Uint512 memory rootSquare=W.scale(W.mul(e.rhoLo,e.rhoLo),n);
        if(rootSquare.hi!=variance.hi||rootSquare.lo!=variance.lo)++e.rhoHi;
        if(e.rhoHi<ctx.sigmaLo){e.status=Status.BelowSheet;return e;}
        if(e.rhoLo==0||e.rhoLo<ctx.sigmaHi){e.status=Status.UncertainSheet;return e;}
        e.status=Status.Evaluated;
        uint256 centered=n*ctx.radius-(A-ctx.axial);
        uint256 transverseLo=e.rhoLo-ctx.sigmaHi;
        uint256 transverseHi=e.rhoHi-ctx.sigmaLo;
        W.Uint512 memory axialSquare=W.mul(centered,centered);
        W.Uint512 memory radiusSquare=W.mul(ctx.radius,ctx.radius);
        e.residual=I.wideBounds(
            S.sub(S.fromParts(false,W.add(W.divWide(axialSquare,n,false),W.mul(transverseLo,transverseLo))),S.fromParts(false,radiusSquare)),
            S.sub(S.fromParts(false,W.add(W.divWide(axialSquare,n,true),W.mul(transverseHi,transverseHi))),S.fromParts(false,radiusSquare))
        );
    }
    function sphere(uint256[] memory x,Context memory ctx,uint8 output) private pure returns(Evaluation memory e){
        e.status=Status.Evaluated;e.priceDomain=true;e.normals=new I.Interval[](x.length);
        W.Uint512 memory square;
        for(uint256 i;i<x.length;i++){
            int256 normal=int256(ctx.radius)-int256(x[i]);
            e.normals[i]=I.point(normal);if(normal<0)e.priceDomain=false;
            uint256 magnitude=uint256(normal<0?-normal:normal);
            square=W.add(square,W.mul(magnitude,magnitude));
        }
        S.Int512 memory residual=S.sub(S.fromParts(false,square),S.fromParts(false,W.mul(ctx.radius,ctx.radius)));
        e.residual=I.wideBounds(residual,residual);e.strictOutputPrice=e.normals[output].lo>0;
    }
    /// @dev False includes uncertainty; it must not be used as global exclusion.
    function certifiesMembership(Evaluation memory e) internal pure returns(bool){
        return e.status==Status.Evaluated&&e.priceDomain&&S.compare(e.residual.hi,S.fromInt(0))<=0;
    }
}
