// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {WideMath as W} from "./WideMath.sol";

/// @notice Certifies output-only segments, including inward key crossings.
/// @dev This is a solver primitive, not a complete swap/path or slack-budget
/// certificate. Tick coefficients must have the same provenance as OrbitalMath.
/// Proof and width bounds: docs/audits/SLACK_SEGMENT.md.
library SlackCertificate {
    uint256 constant GRID=1<<32;
    uint256 constant Q=1<<128;
    /// @notice Certifies release from canonical actual reserves to an exact
    /// GRID-denominator proof endpoint. No token payout or root identity is given.
    /// @dev End prefix is explicit: at equality either side is permitted only
    /// after its own reconstruction passes. Start remains original/canonical.
    /// False includes uncertainty. Contributions retain original rounding.
    function certifyInwardReleaseToGrid(uint256[] memory start,M.Tick[] memory ticks,uint8 output,uint256 endOutputNumerator,uint8 endBoundaryCount) internal pure returns(bool,uint8){
        uint256 n=start.length;
        if(output>=n||!M.certify(start,ticks))return(false,0);
        if(endOutputNumerator>start[output]*GRID||endBoundaryCount>=ticks.length)return(false,0);
        uint256 A;
        uint256[] memory finalPoint=new uint256[](n);
        for(uint256 i;i<n;i++){A+=start[i];finalPoint[i]=start[i]*GRID;}
        finalPoint[output]=endOutputNumerator;
        (uint256 count,uint256 Shi)=partition(A,ticks);
        if(endBoundaryCount>count||!M.certifyGridPoint(finalPoint,ticks,endBoundaryCount))return(false,0);
        return inwardSegments(start,ticks,output,endOutputNumerator,count,endBoundaryCount,Shi,A);
    }
    /// @notice Certifies an output-only release, including inward key crossings.
    /// @dev This does not select the optimum or bound how much slack is released.
    function certifyInwardRelease(uint256[] memory start,M.Tick[] memory ticks,uint8 output,uint256 endOutput) internal pure returns(bool,uint8){
        uint256 n=start.length;
        if(output>=n||endOutput>start[output]||!M.certify(start,ticks))return(false,0);
        uint256[] memory finalPoint=new uint256[](n);
        uint256 A;
        for(uint256 i;i<n;i++){finalPoint[i]=start[i];A+=start[i];}
        finalPoint[output]=endOutput;
        if(!M.certify(finalPoint,ticks))return(false,0);
        (uint256 count,uint256 Shi)=partition(A,ticks);
        (uint256 endCount,)=partition(A-start[output]+endOutput,ticks);
        if(endCount>count)return(false,0);
        return inwardSegments(start,ticks,output,endOutput*GRID,count,endCount,Shi,A);
    }
    /// @dev Both callers have certified the canonical original start and their
    /// exact final endpoint in the selected end prefix. This common loop performs
    /// no coordinate rounding and checks both reconstructions at every seam,
    /// including zero-distance departures at the start or final proof endpoint.
    function inwardSegments(uint256[] memory start,M.Tick[] memory ticks,uint8 output,uint256 finalOutput,uint256 count,uint256 endCount,uint256 Shi,uint256 A) private pure returns(bool,uint8){
        uint256 n=start.length;
        uint8 crossings=uint8(count-endCount);
        uint256 R;uint256 Knum;
        for(uint256 i;i<ticks.length;i++){
            if(i<count)Knum+=uint256(ticks[i].radius)*ticks[i].key;
            else R+=ticks[i].radius;
        }
        // Vertical key planes are rational with denominator GRID. Preserve
        // every fractional crossing internally; only the caller settles tokens.
        uint256[] memory point=new uint256[](n);
        uint256[] memory finalPoint=new uint256[](n);
        for(uint256 i;i<n;i++)point[i]=start[i]*GRID;
        uint256 untouched=(A-start[output])*GRID;
        for(uint256 segment;segment<=crossings;segment++){
            uint256 target=finalOutput;
            if(count>endCount){
                uint256 seamSum=Knum+R*ticks[count-1].key;
                if(seamSum<untouched)return(false,0);
                target=seamSum-untouched;
            }
            if(target>point[output]||target<finalOutput)return(false,0);
            if(!M.certifyGridPoint(point,ticks,count))return(false,0);
            for(uint256 i;i<n;i++)finalPoint[i]=point[i];
            finalPoint[output]=target;
            if(!M.certifyGridPoint(finalPoint,ticks,count))return(false,0);
            if(count!=0&&!criticalPoints(point,output,target,Shi*GRID,ticks[count-1].key))return(false,0);
            if(count==endCount)return(true,crossings);
            point[output]=target;
            M.Tick memory crossed=ticks[count-1];
            R+=crossed.radius;Knum-=uint256(crossed.radius)*crossed.key;
            Shi-=W.mulDiv(crossed.radius,crossed.coefficients.sigmaHi,Q,true);
            --count; // Includes a zero-distance departure; at most seven seams.
        }
        return(false,0);
    }
    function certifyFixedPartition(uint256[] memory start,M.Tick[] memory ticks,uint8 output,uint256 endOutput) internal pure returns(bool){
        uint256 n=start.length;
        if(output>=n||endOutput>start[output]||!M.certify(start,ticks))return false;
        uint256[] memory end=new uint256[](n);
        uint256 A;
        for(uint256 i;i<n;i++){end[i]=start[i];A+=start[i];}
        end[output]=endOutput;
        if(!M.certify(end,ticks))return false;
        (uint256 count,uint256 Shi)=partition(A,ticks);
        (uint256 endCount,)=partition(A-start[output]+endOutput,ticks);
        // At a slack equality plane the two per-tick reconstructions can differ.
        // Crossing that seam is deliberately outside this primitive's contract.
        if(count!=endCount)return false;
        if(count==0)return true; // A ball and coordinate bounds are convex.
        return criticalPoints(start,output,endOutput,Shi,ticks[count-1].key);
    }
    /// @notice Exact extra moment tests for a fixed-partition vertical domain.
    /// @dev Not an endpoint or complete segment certificate. Caller first checks
    /// both endpoints' partition, principal, rho>=S, aggregate/boundary prices;
    /// F<=R^2 is NOT needed for these domain tests. Require 2<=n<=8, output<n,
    /// endOutput<=start[output], all lengths (including Shi) <2^192 in one scale,
    /// and the valid largest ordinary boundary key. GRID-lifted moments and cap
    /// comparisons fit 512 bits; no canonical partition choice is made here.
    function criticalPoints(uint256[] memory start,uint8 output,uint256 endOutput,uint256 Shi,uint256 key) internal pure returns(bool){
        uint256 n=start.length;
        uint256 m=n-1;
        uint256 C;uint256 maximum;
        W.Uint512 memory squares;
        for(uint256 i;i<n;i++)if(i!=output){
            uint256 value=start[i];C+=value;
            squares=W.add(squares,W.mul(value,value));
            if(value>maximum)maximum=value;
        }
        W.Uint512 memory H=W.sub(W.scale(squares,m),W.mul(C,C));
        uint256 D=m*maximum-C;
        uint256 low=m*endOutput;uint256 high=m*start[output];
        // rho is minimized at output = mean(untouched). No rounded division.
        if(low<=C&&C<=high&&!W.lte(W.scale(W.mul(Shi,Shi),m),H))return false;

        // The largest untouched u coordinate can have an interior maximum at
        // T*=-H/D. Check inclusion by signed comparisons without signed casts.
        if(D!=0&&low<=C&&W.lte(H,W.mul(D,C-low))&&(high>=C||W.lte(W.mul(D,C-high),H))){
            W.Uint512 memory DD=W.mul(D,D);
            uint256 distance=n*GRID-key;
            // Exact cap condition at the critical point; sigma^2 cancels.
            W.Uint512 memory lhs=W.scale(W.add(W.scale(DD,n),H),GRID*GRID);
            W.Uint512 memory rhs=W.scale(W.add(DD,H),distance*distance);
            if(!W.lte(lhs,rhs))return false;
        }
        return true;
    }
    function partition(uint256 A,M.Tick[] memory ticks) private pure returns(uint256 count,uint256 Shi){
        uint256 R;uint256 Knum;
        for(uint256 i;i<ticks.length;i++)R+=ticks[i].radius;
        for(uint256 i;i+1<ticks.length;i++){
            M.Tick memory tick=ticks[i];
            if(A*GRID-Knum<R*tick.key)break;
            R-=tick.radius;Knum+=uint256(tick.radius)*tick.key;
            Shi+=W.mulDiv(tick.radius,tick.coefficients.sigmaHi,Q,true);
            ++count;
        }
    }
}
