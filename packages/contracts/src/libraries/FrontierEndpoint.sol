// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {RootBracket as B} from "./RootBracket.sol";
import {CurveEvaluation as C} from "./CurveEvaluation.sol";
import {SlackCertificate as P} from "./SlackCertificate.sol";
import {WideMath as W} from "./WideMath.sol";
import {SignedWide as S} from "./SignedWide.sol";
import {LowerSheetProposal as L} from "./LowerSheetProposal.sol";

/// @notice Exact-frontier endpoint/payout certificate, not a path or swap engine.
library FrontierEndpoint {
    uint256 constant GRID=1<<32;
    uint256 constant U=1<<64;
    enum Status {Uncertain,UncertifiedStart,RequiresRepartition,EndpointCertified}
    struct Identity {bool identified;uint8 boundaryCount;B.Bracket bracket;}
    struct Result {
        Status status;Identity root;uint256 amountOutRaw;uint256[] reserves;
        uint256 netInputInternal;uint256 outputQuantum;uint256 shortfallUpper;
        uint8 actualBoundaryCount;uint8 retentionCrossings;
    }
    error InvalidMetadata();error InvalidPair();error InvalidInput();error InvalidBudget();
    /// @notice Payout-targeted alternative; every ordinary final check remains.
    /// @dev A caller needing narrower direction/event boxes may resume the
    /// retained root using its remaining budget, without restarting the seed.
    function exactInputForPayout(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput,uint8 count,uint8 budget) public pure returns(Result memory result){
        uint256[] memory fixedPoint;(result,fixedPoint)=_prepareInput(x,ticks,decimals,input,output,rawNetInput,budget);
        if(result.status==Status.UncertifiedStart)return result;
        C.Context memory ctx;(result.root,ctx)=_identify(fixedPoint,ticks,output,count,budget,result.outputQuantum);
        return _finalize(x,ticks,output,count,fixedPoint,ctx,result);
    }
    /// @notice Recheck and ordinarily refine a retained output-root proposal.
    /// @dev No caller context or prior certificate flag is trusted. The original
    /// start, raw-input frame, prefix geometry, endpoint signs and whole domain
    /// are regenerated/rechecked. lo/hi alone authorize no earlier-phase proof.
    /// `budget` must be the shared remaining budget; this pure helper cannot
    /// enforce cross-call accounting. Returned used is local to this invocation.
    function resumeExactInput(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput,uint8 count,uint256 lo,uint256 hi,uint8 budget) public pure returns(Result memory result){
        uint256[] memory fixedPoint;(result,fixedPoint)=_prepareInput(x,ticks,decimals,input,output,rawNetInput,budget);
        if(result.status==Status.UncertifiedStart)return result;
        if(lo>hi||hi>x[output]*GRID)revert B.InvalidBounds();
        C.Context memory ctx=C.prepare(uint8(x.length),ticks,count);
        uint256[] memory high=new uint256[](x.length);
        for(uint256 k;k<x.length;k++)high[k]=fixedPoint[k]*GRID;
        high[output]=hi;result.root.boundaryCount=count;
        result.root.bracket=B.refine(high,ctx,output,lo,budget);
        result.root.identified=result.root.bracket.certified;
        return _finalize(x,ticks,output,count,fixedPoint,ctx,result);
    }
    /// @notice Identify a final ideal root and certify one actual raw payout.
    /// @dev Caller supplies validated immutable strategy ticks/decimals. M's
    /// coefficient-provenance requirement remains mandatory. EndpointCertified
    /// proves endpoint feasibility/optimal-output shortfall, NOT a path from X.
    /// Initial release, events, transition order, fees and settlement are absent.
    /// All stored/returned lengths use original internal units except bracket.
    /// Non-EndpointCertified results never authorize their proposed raw amount.
    function exactInput(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput,uint8 count,uint8 budget) public pure returns(Result memory result){
        uint256[] memory fixedPoint;(result,fixedPoint)=_prepareInput(x,ticks,decimals,input,output,rawNetInput,budget);
        if(result.status==Status.UncertifiedStart)return result;
        C.Context memory ctx;(result.root,ctx)=_identify(fixedPoint,ticks,output,count,budget,0);
        return _finalize(x,ticks,output,count,fixedPoint,ctx,result);
    }
    function _prepareInput(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput,uint8 budget) private pure returns(Result memory result,uint256[] memory fixedPoint){
        uint256 n=x.length;
        if(n<2||n>8||decimals.length!=n)revert InvalidMetadata();
        for(uint256 i;i<n;i++)if(decimals[i]>18)revert InvalidMetadata();
        if(input>=n||output>=n||input==output)revert InvalidPair();
        if(budget>160)revert InvalidBudget();
        if(rawNetInput==0)revert InvalidInput();
        result.root.bracket.remaining=budget;
        if(!M.certify(x,ticks)){result.status=Status.UncertifiedStart;return(result,fixedPoint);}
        uint256 radius;for(uint256 i;i<ticks.length;i++)radius+=ticks[i].radius;
        uint256 inputQuantum=10**(18-decimals[input])*U;
        result.outputQuantum=10**(18-decimals[output])*U;
        if(x[input]>radius||rawNetInput>(radius-x[input])/inputQuantum)revert InvalidInput();
        result.netInputInternal=rawNetInput*inputQuantum;
        fixedPoint=new uint256[](n);
        for(uint256 i;i<n;i++)fixedPoint[i]=x[i];
        fixedPoint[input]+=result.netInputInternal;
    }
    function _finalize(uint256[] memory x,M.Tick[] memory ticks,uint8 output,uint8 count,uint256[] memory fixedPoint,C.Context memory ctx,Result memory result) private pure returns(Result memory){
        uint256 n=x.length;
        if(!result.root.identified)return result;
        result.amountOutRaw=(x[output]*GRID-result.root.bracket.hi)/(result.outputQuantum*GRID);
        if(result.amountOutRaw==0)return result;
        result.reserves=fixedPoint;
        result.reserves[output]=x[output]-result.amountOutRaw*result.outputQuantum;
        uint256 gapNumerator=result.reserves[output]*GRID-result.root.bracket.lo;
        result.shortfallUpper=gapNumerator/GRID+(gapNumerator%GRID==0?0:1);
        if(result.shortfallUpper>result.outputQuantum)return result;
        // The actual raw payment may leave more ordinary ticks boundary
        // than the ideal root. Return actual metadata separately. NUM-12..14
        // retain exactly the one output floor and combined gap above.
        result.actualBoundaryCount=_canonical(result.reserves,ticks);
        if(result.actualBoundaryCount<count){result.status=Status.RequiresRepartition;return result;}
        if(!M.certify(result.reserves,ticks))return result;
        if(result.actualBoundaryCount>count){
            // RootBracket already proves the feasible same-prefix segment
            // root->hi. Reverse release certifies hi->actual using FINAL
            // fixed-input reserves, with both one-sided seam domains.
            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(result.reserves,ticks,output,result.root.bracket.hi,count);
            if(!valid||crossed!=result.actualBoundaryCount-count){result.status=Status.RequiresRepartition;return result;}
            // T is 1-Lipschitz in each prefix; at an outward seam
            // T_old=T_new+r(c,s), ||(c,s)||=1, so radial defect cannot
            // jump upward. Final actual-prefix slack is <= total gap.
            result.retentionCrossings=crossed;
            result.status=Status.EndpointCertified;return result;
        }
        uint256[] memory high=new uint256[](n);
        for(uint256 i;i<n;i++)high[i]=result.reserves[i]*GRID;
        if(!C.certifiesMembership(C.evaluate(high,ctx,output)))return result;
        // The paid output reserve can lie ABOVE the root bracket's old high.
        // Re-certify the entire extended domain, including hidden extrema.
        if(count!=0&&!P.criticalPoints(high,output,result.root.bracket.lo,ctx.sigmaHi,ctx.outerKey))return result;
        uint256[] memory low=new uint256[](n);for(uint256 i;i<n;i++)low[i]=high[i];
        low[output]=result.root.bracket.lo;
        C.Evaluation memory lowEvaluation=C.evaluate(low,ctx,output);
        if(lowEvaluation.status!=C.Status.Evaluated||!lowEvaluation.priceDomain)return result;
        result.status=Status.EndpointCertified;
        return result;
    }
    /// @notice Identify the zero-input ideal root from actual rounded reserves.
    /// @dev Identity only: it neither certifies release from X to bracket.hi nor
    /// returns a financial payout. A GRID initial-release path is still needed.
    function identifyInitial(uint256[] memory x,M.Tick[] memory ticks,uint8 output,uint8 count,uint8 budget) public pure returns(Identity memory root){
        if(budget>160)revert InvalidBudget();
        if(output>=x.length)revert InvalidPair();
        root.bracket.remaining=budget;
        if(!M.certify(x,ticks))return root;
        (root,)=_identify(x,ticks,output,count,budget,0);
    }
    function _identify(uint256[] memory fixedPoint,M.Tick[] memory ticks,uint8 output,uint8 count,uint8 budget,uint256 payoutQuantum) private pure returns(Identity memory root,C.Context memory ctx){
        uint256 n=fixedPoint.length;
        root.boundaryCount=count;root.bracket.remaining=budget;
        ctx=C.prepare(uint8(n),ticks,count);
        uint256[] memory high=new uint256[](n);uint256 fixedSum;
        for(uint256 i;i<n;i++){high[i]=fixedPoint[i]*GRID;if(i!=output)fixedSum+=high[i];}
        // The seam sums are exact GRID numerators, not rounded original lengths.
        uint256 lower=ctx.virtualCredit;
        if(count!=0){
            uint256 lowerSum=ctx.axial+(ctx.radius/GRID)*ctx.outerKey;
            if(lowerSum>fixedSum&&lowerSum-fixedSum>lower)lower=lowerSum-fixedSum;
        }
        uint256 upperKey=ctx.nextKey==type(uint64).max?(n-1)*GRID:ctx.nextKey;
        uint256 upperSum=ctx.axial+(ctx.radius/GRID)*upperKey;
        if(upperSum<fixedSum)return(root,ctx);
        if(high[output]>upperSum-fixedSum)high[output]=upperSum-fixedSum;
        if(high[output]<lower)return(root,ctx);
        if(n==2&&count!=0&&high[1-output]>high[output]){
            (bool proposal,uint256 clipped)=_capN2High(high[1-output],high[output],ctx.sigmaHi,lower);
            if(!proposal)return(root,ctx);
            high[output]=clipped;
        }
        C.Evaluation memory feasible=C.evaluate(high,ctx,output);
        if(n>2&&(feasible.status==C.Status.BelowSheet||feasible.status==C.Status.UncertainSheet)){
            // The cap-sum high proposal can lie inside the rho<sigma hole.
            // One exact variance-based proposal replaces it; no failed sign
            // chooses a root or discards an event. Recheck every certificate.
            (bool proposal,uint256 clipped)=L.cap(high,output,ctx.sigmaHi,lower);
            if(!proposal)return(root,ctx);
            high[output]=clipped;feasible=C.evaluate(high,ctx,output);
        }
        if(!C.certifiesMembership(feasible)||!feasible.strictOutputPrice)return(root,ctx);
        // Proposal only. Its strong-convexity implication requires the full
        // domain, so ordinary RootBracket rechecks both signs and every domain
        // condition. Clipping this seed is never treated as a lower-side proof.
        uint256 gamma=uint256(feasible.normals[output].lo);
        uint256 center=n*gamma;
        W.Uint512 memory radicand=W.add(W.mul(center,center),W.scale(feasible.residual.lo.magnitude,n));
        uint256 radical=W.sqrt(radicand);
        W.Uint512 memory square=W.mul(radical,radical);
        if(square.hi!=radicand.hi||square.lo!=radicand.lo)++radical;
        uint256 distance=radical-center;
        uint256 probe=distance<high[output]-lower?high[output]-distance:lower;
        root.bracket=payoutQuantum==0?B.refine(high,ctx,output,probe,budget):B.refineForPayout(high,ctx,output,probe,fixedPoint[output]*GRID,payoutQuantum,budget);
        root.identified=root.bracket.certified;
    }
    /// @dev Arithmetic proposal only, for n2 outward high points. The caller
    /// retains every original membership, price, bracket and path check.
    /// Inputs inherit <2^192 GRID lengths; squared work remains below 2^385.
    function _capN2High(uint256 other,uint256 current,uint256 sigmaHi,uint256 lower) internal pure returns(bool,uint256){
        W.Uint512 memory square=W.scale(W.mul(sigmaHi,sigmaHi),2);
        uint256 delta=W.sqrt(square);W.Uint512 memory rounded=W.mul(delta,delta);
        if(rounded.hi!=square.hi||rounded.lo!=square.lo)++delta;
        if(other<delta)return(false,current);
        uint256 ceiling=other-delta;
        if(current>ceiling)current=ceiling;
        return(current>=lower,current);
    }
    function _canonical(uint256[] memory x,M.Tick[] memory ticks) private pure returns(uint8 count){
        uint256 sum;uint256 radius;uint256 axial;
        for(uint256 i;i<x.length;i++)sum+=x[i];
        for(uint256 i;i<ticks.length;i++)radius+=ticks[i].radius;
        for(uint256 i;i+1<ticks.length;i++){
            uint256 seam=axial+radius*ticks[i].key;
            if(sum*GRID<seam)break;
            radius-=ticks[i].radius;axial+=uint256(ticks[i].radius)*ticks[i].key;++count;
        }
    }
}
