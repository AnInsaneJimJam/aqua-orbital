// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {SphereStep as S} from "./SphereStep.sol";

/// @notice All-interior/no-crossing exact-input path; not the mixed swap engine.
/// @dev Proof and finite evidence: test/evidence/interior-swap.md. No fees,
/// custody, authorizations, token calls, or settlement are performed here.
library InteriorSwap {
    uint256 constant U=1<<64;
    uint256 constant GRID=1<<32;
    struct Result {
        uint256 amountOutRaw;uint256[] reserves;
        uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;
    }
    error InvalidMetadata();error InvalidPair();error InvalidInput();
    error UncertifiedStart();error UncertifiedEndpoint();error RequiresTraversal();
    /// @notice Solve from the actual possibly slack state with token-bound units.
    /// @dev ticks/decimals must be the strategy's validated immutable metadata;
    /// keys and coefficients must come from TickGeometry at activation, as M
    /// requires. This does not authenticate caller-supplied configuration.
    /// X, netInputInternal, outputQuantum and shortfallUpper use original internal
    /// lengths, NOT the GRID proof-coordinate scale. shortfallUpper bounds both
    /// omitted ideal output and radial slack, at most one raw output quantum.
    /// RequiresTraversal includes non-interior starts and rounded key equality;
    /// it does not assert that an ideal curve crossing necessarily occurred.
    function exactInput(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput) internal pure returns(Result memory result){
        bool requiresTraversal;(requiresTraversal,result)=tryExactInput(x,ticks,decimals,input,output,rawNetInput);
        if(requiresTraversal)revert RequiresTraversal();
    }
    /// @dev A true flag is returned ONLY at the same two strict-cap checks as
    /// exactInput. It authorizes no result. Invalid input, metadata, arithmetic
    /// and uncertain membership keep their original errors; no broad catch.
    function tryExactInput(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput) internal pure returns(bool requiresTraversal,Result memory result){
        uint256 n=x.length;
        if(n<2||n>8||decimals.length!=n)revert InvalidMetadata();
        for(uint256 i;i<n;i++)if(decimals[i]>18)revert InvalidMetadata();
        if(input>=n||output>=n||input==output)revert InvalidPair();
        if(rawNetInput==0)revert InvalidInput();
        // A false certificate includes uncertainty, not just infeasibility.
        if(!M.certify(x,ticks))revert UncertifiedStart();
        uint256 radius;
        for(uint256 i;i<ticks.length;i++)radius+=ticks[i].radius;
        if(!_strictInterior(x,ticks,radius))return(true,result);
        uint256 inputQuantum=10**(18-decimals[input])*U;
        result.outputQuantum=10**(18-decimals[output])*U;
        // Certification plus the strict partition proves x[input]<=radius.
        // Check before multiplying so even a maximal untrusted raw amount cannot
        // overflow or exceed the nonnegative-price branch's input capacity.
        if(rawNetInput>(radius-x[input])/inputQuantum)revert InvalidInput();
        result.netInputInternal=rawNetInput*inputQuantum;
        S.Result memory step=S.step(x,radius,input,output,result.netInputInternal,result.outputQuantum);
        // Exact-start and rounded-end key bounds certify the whole intervening
        // lower sphere arc by its convex pair sum, including actual slack release.
        if(!_strictInterior(step.reserves,ticks,radius))return(true,result);
        if(!M.certify(step.reserves,ticks))revert UncertifiedEndpoint();
        result.amountOutRaw=step.amountOutRaw;result.reserves=step.reserves;
        result.shortfallUpper=step.shortfallUpper;
    }
    function _strictInterior(uint256[] memory x,M.Tick[] memory ticks,uint256 radius) private pure returns(bool){
        if(ticks.length==1)return true;
        uint256 sum;for(uint256 i;i<x.length;i++)sum+=x[i];
        return sum*GRID<radius*ticks[0].key;
    }
}
