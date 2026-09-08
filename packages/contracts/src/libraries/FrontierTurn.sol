// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {IntervalMath as I} from "./IntervalMath.sol";
import {CurveEvaluation as C} from "./CurveEvaluation.sol";
import {TickGeometry as G} from "./TickGeometry.sol";
import {WideMath as W} from "./WideMath.sol";
import {SignedWide as S} from "./SignedWide.sol";

/// @notice Directed lower-key turn discriminant; not a frontier/path certificate.
library FrontierTurn {
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    enum Status {Uncertain,ProvenNonpositive,ProvenPositive}
    /// @dev sumNumerator is exact A*GRID, not floor(A)*GRID. Radius bounds
    /// include the original per-tick contribution rounding before GRID lifting.
    struct Context {uint8 n;uint64 key;uint256 sumNumerator;uint256 rhoLo;uint256 rhoHi;}
    /// @dev Discriminant endpoints enclose n*GRID^2*D, not D or sqrt(D).
    /// The default status is deliberately Uncertain.
    struct Result {Status status;I.WideInterval discriminant;}
    error InvalidContext();error InvalidPoint();
    /// @notice Prepare the largest boundary key of a canonical mixed prefix.
    /// @dev Recomputes authenticated key geometry through CurveEvaluation;
    /// coefficients supplied in Tick structs are not trusted. This selects
    /// boundaryCount-1, never the next interior key or the first boundary key.
    function prepare(uint8 n,M.Tick[] memory ticks,uint8 boundaryCount) internal pure returns(Context memory ctx){
        if(boundaryCount==0)revert InvalidContext();
        C.Context memory curve=C.prepare(n,ticks,boundaryCount);
        uint256 radius=curve.radius/GRID; // exact: prepare lifts an integer sum
        G.Coefficients memory coefficient=G.coefficients(n,curve.outerKey);
        ctx.n=n;ctx.key=curve.outerKey;
        ctx.sumNumerator=curve.axial+radius*ctx.key;
        ctx.rhoLo=curve.sigmaLo+W.mulDiv(radius,coefficient.sigmaLo,Q,false)*GRID;
        ctx.rhoHi=curve.sigmaHi+W.mulDiv(radius,coefficient.sigmaHi,Q,true)*GRID;
    }
    /// @notice Enclose the largest-boundary discriminant for fixed untouched reserves.
    /// @dev ctx must be an unmodified prepare result. Untouched coordinates use
    /// ORIGINAL integer lengths, unlike the GRID-denominator context fields.
    /// This proves only a discriminant sign. Callers must separately establish
    /// exact-frontier endpoint identity, partition, price/principal domain and
    /// traversal direction before applying the FRONTIER_SEGMENT turn theorem.
    /// An uncertain result proves neither acceptance nor exclusion.
    function evaluate(Context memory ctx,uint256[] memory untouched) internal pure returns(Result memory result){
        uint256 n=ctx.n;
        if(n<2||n>8||ctx.key==type(uint64).max||ctx.rhoLo>ctx.rhoHi)revert InvalidContext();
        if(untouched.length!=n-2)revert InvalidPoint();
        uint256 sum;W.Uint512 memory squares;
        for(uint256 i;i<untouched.length;i++){
            if(untouched[i]>=(uint256(1)<<160))revert InvalidPoint();
            uint256 coordinate=untouched[i]*GRID;
            sum+=coordinate;squares=W.add(squares,W.mul(coordinate,coordinate));
        }
        // Pair sum can be negative. Its absolute value is used only for the
        // exact square; a real/physical traded pair is not asserted here.
        uint256 pairMagnitude=ctx.sumNumerator>=sum?ctx.sumNumerator-sum:sum-ctx.sumNumerator;
        W.Uint512 memory common=W.scale(W.mul(ctx.sumNumerator,ctx.sumNumerator),2);
        W.Uint512 memory subtract=W.add(W.scale(squares,2*n),W.scale(W.mul(pairMagnitude,pairMagnitude),n));
        result.discriminant=I.wideBounds(
            S.sub(S.fromParts(false,W.add(common,W.scale(W.mul(ctx.rhoLo,ctx.rhoLo),2*n))),S.fromParts(false,subtract)),
            S.sub(S.fromParts(false,W.add(common,W.scale(W.mul(ctx.rhoHi,ctx.rhoHi),2*n))),S.fromParts(false,subtract))
        );
        if(S.compare(result.discriminant.hi,S.fromUint(0))<=0)result.status=Status.ProvenNonpositive;
        else if(S.compare(result.discriminant.lo,S.fromUint(0))>0)result.status=Status.ProvenPositive;
    }
}
