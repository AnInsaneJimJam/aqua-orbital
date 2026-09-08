// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "./WideMath.sol";

/// @notice Exact-input primitive for a certified all-interior sphere segment.
/// @dev NOT an Orbital engine: the caller must independently certify tick caps,
/// no crossings, principal floors, and the protocol's token-derived output scale.
/// X, radius, inputAmount, outputScale and shortfallUpper use integer internal
/// lengths. amountOutRaw counts outputScale quanta. Existing slack in X is real.
library SphereStep {
    struct Result {uint256 amountOutRaw;uint256[] reserves;uint256 shortfallUpper;}
    error InvalidDimension();
    error InvalidRadius();
    error InvalidPair();
    error InvalidInput();
    error InvalidScale();
    error InvalidState();
    error NoOutput();
    /// @dev shortfallUpper bounds both omitted ideal output length and radial
    /// sphere slack; it is at most one outputScale. Caller memory is not mutated.
    function step(uint256[] memory x,uint256 radius,uint8 input,uint8 output,uint256 inputAmount,uint256 outputScale) internal pure returns(Result memory result){
        uint256 n=x.length;
        if(n<2||n>8)revert InvalidDimension();
        if(radius==0||radius>=(uint256(1)<<160))revert InvalidRadius();
        if(input>=n||output>=n||input==output)revert InvalidPair();
        if(outputScale==0)revert InvalidScale();

        W.Uint512 memory radiusSquared=W.mul(radius,radius);
        W.Uint512 memory startingSquares;
        for(uint256 i;i<n;i++){
            if(x[i]>radius)revert InvalidState();
            uint256 deficit=radius-x[i];
            startingSquares=W.add(startingSquares,W.mul(deficit,deficit));
        }
        if(!W.lte(startingSquares,radiusSquared))revert InvalidState();
        // Compare before addition so an untrusted large input cannot wrap.
        if(inputAmount==0||inputAmount>radius-x[input])revert InvalidInput();

        result.reserves=new uint256[](n);
        W.Uint512 memory fixedSquares;
        for(uint256 i;i<n;i++){
            uint256 candidate=x[i]+(i==input?inputAmount:0);
            result.reserves[i]=candidate;
            if(i!=output){
                uint256 deficit=radius-candidate;
                fixedSquares=W.add(fixedSquares,W.mul(deficit,deficit));
            }
        }
        // Input decreases its nonnegative deficit. Starting feasibility implies
        // this subtraction is defined even when the actual start has slack.
        W.Uint512 memory radicand=W.sub(radiusSquared,fixedSquares);
        uint256 root=W.sqrt(radicand);
        uint256 startingDeficit=radius-x[output];
        if(root<=startingDeficit)revert NoOutput();
        result.amountOutRaw=(root-startingDeficit)/outputScale;
        if(result.amountOutRaw==0)revert NoOutput();
        // The product is bounded by root-startingDeficit <= x[output].
        uint256 paid=result.amountOutRaw*outputScale;
        result.reserves[output]=x[output]-paid;

        W.Uint512 memory rootSquared=W.mul(root,root);
        uint256 ceiling=root;
        if(rootSquared.hi!=radicand.hi||rootSquared.lo!=radicand.lo)++ceiling;
        result.shortfallUpper=ceiling-(startingDeficit+paid);
    }
}
