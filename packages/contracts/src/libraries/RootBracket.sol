// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {CurveEvaluation as C} from "./CurveEvaluation.sol";
import {SlackCertificate as P} from "./SlackCertificate.sol";
import {SignedWide as S} from "./SignedWide.sol";

/// @notice Fixed-partition root enclosure; not a complete swap solver.
/// @dev Proof: test/evidence/root-bracket.md and docs/audits/ROOT_CERTIFICATE.md.
library RootBracket {
    enum Status {UncertifiedDomain,UncertifiedSigns,Exact,Adjacent,Uncertain,BudgetExhausted,PayoutBounded}
    struct Bracket {Status status;bool certified;uint256 lo;uint256 hi;uint256 width;uint8 used;uint8 remaining;}
    error InvalidBounds();error InvalidBudget();
    /// @notice Stop at a certified raw-output shortfall bound when possible.
    /// @dev Coordinates and originalOutputGrid use GRID-denominator lengths;
    /// quantum uses original internal lengths. Caller binds quantum to immutable
    /// token decimals. PayoutBounded is neither Exact nor Adjacent, and proves no
    /// final membership, canonical prefix, event order or path by itself.
    function refineForPayout(uint256[] memory xHi,C.Context memory ctx,uint8 output,uint256 zLo,uint256 originalOutputGrid,uint256 quantum,uint8 budget) internal pure returns(Bracket memory){
        if(budget>160)revert InvalidBudget();
        if(output>=xHi.length||originalOutputGrid>=1<<192||originalOutputGrid<xHi[output]||quantum==0||quantum>=1<<224)revert InvalidBounds();
        return _refine(xHi,ctx,output,zLo,budget,originalOutputGrid,quantum*(1<<32));
    }
    /// @notice Certifies and narrows the unique root while only output decreases.
    /// @dev All coordinates/bounds are GRID-denominator lengths. ctx must be an
    /// unmodified C.prepare result. This never changes the caller's vector.
    /// `budget` is the caller's remaining shared midpoint-evaluation budget,
    /// bounded by 160; carry `remaining` across segments and resumptions. Endpoint
    /// and domain certification is fixed work, not an uncounted refinement loop.
    /// Uncertified results prove no exclusion. Certified results enclose the
    /// root, including Uncertain/BudgetExhausted; neither width nor adjacency is
    /// a raw payout, total slack bound, event certificate, or full path proof.
    function refine(uint256[] memory xHi,C.Context memory ctx,uint8 output,uint256 zLo,uint8 budget) internal pure returns(Bracket memory b){
        return _refine(xHi,ctx,output,zLo,budget,0,0);
    }
    function _refine(uint256[] memory xHi,C.Context memory ctx,uint8 output,uint256 zLo,uint8 budget,uint256 origin,uint256 quantumGrid) private pure returns(Bracket memory b){
        if(budget>160)revert InvalidBudget();
        if(output>=xHi.length||zLo>xHi[output])revert InvalidBounds();
        b.lo=zLo;b.hi=xHi[output];b.width=b.hi-b.lo;b.remaining=budget;
        C.Evaluation memory high=C.evaluate(xHi,ctx,output);
        if(!_domain(high)||!high.strictOutputPrice)return b;
        uint256[] memory point=new uint256[](xHi.length);
        for(uint256 i;i<xHi.length;i++)point[i]=xHi[i];
        point[output]=zLo;
        C.Evaluation memory low=C.evaluate(point,ctx,output);
        if(!_domain(low))return b;
        // Endpoint-validity alone cannot rule out a variance hole or a hidden
        // boundary-coordinate maximum. Reuse the exact fixed-domain theorem.
        if(ctx.boundaryCount!=0&&!P.criticalPoints(xHi,output,zLo,ctx.sigmaHi,ctx.outerKey))return b;
        S.Int512 memory zero=S.fromInt(0);
        if(S.compare(low.residual.lo,zero)<0||S.compare(high.residual.hi,zero)>0){
            b.status=Status.UncertifiedSigns;return b;
        }
        b.certified=true;
        // A single one-sided zero bound is not equality. The opposite bound
        // must certify zero too before collapsing an endpoint to an exact root.
        if(S.compare(low.residual.hi,zero)<=0)return _exact(b,b.lo);
        if(S.compare(high.residual.lo,zero)>=0)return _exact(b,b.hi);
        if(_payoutBounded(b,origin,quantumGrid)){b.status=Status.PayoutBounded;return b;}
        C.Vertical memory fixedPoint=C.prepareVertical(xHi,output);
        while(b.remaining!=0&&b.width>1){
            uint256 midpoint=b.lo+b.width/2;
            C.ResidualEvaluation memory middle=C.evaluateResidual(fixedPoint,ctx,midpoint);
            ++b.used;--b.remaining;
            // Endpoint + critical tests already certify prices on the entire
            // fixed interval. Only the original radical needs refinement here.
            if(middle.status!=C.Status.Evaluated){b.status=Status.Uncertain;return b;}
            int256 signLo=S.compare(middle.residual.lo,zero);
            int256 signHi=S.compare(middle.residual.hi,zero);
            if(signLo>=0&&signHi<=0)return _exact(b,midpoint);
            if(signLo>=0)b.lo=midpoint;
            else if(signHi<=0)b.hi=midpoint;
            else {b.status=Status.Uncertain;return b;}
            b.width=b.hi-b.lo;
            if(_payoutBounded(b,origin,quantumGrid)){b.status=Status.PayoutBounded;return b;}
        }
        b.status=b.width<=1?Status.Adjacent:Status.BudgetExhausted;
    }
    function _payoutBounded(Bracket memory b,uint256 origin,uint256 quantumGrid) private pure returns(bool){
        if(quantumGrid==0)return false;
        uint256 raw=(origin-b.hi)/quantumGrid;
        if(raw==0)return false;
        // Retained reserve A >= hi >= root >= lo. A-lo <= q*GRID
        // therefore bounds the whole ideal-output shortfall, not only width.
        // At an exact next raw boundary, one unit below its floor is allowed.
        return origin-raw*quantumGrid-b.lo<=quantumGrid;
    }
    function _domain(C.Evaluation memory e) private pure returns(bool){
        return e.status==C.Status.Evaluated&&e.priceDomain;
    }
    function _exact(Bracket memory b,uint256 root) private pure returns(Bracket memory){
        b.status=Status.Exact;b.lo=root;b.hi=root;b.width=0;return b;
    }
}
