// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {FrontierEndpoint as E} from "./FrontierEndpoint.sol";
import {SlackCertificate as P} from "./SlackCertificate.sol";
import {FrontierSchedule as F} from "./FrontierSchedule.sol";
import {FrontierEvents as V} from "./FrontierEvents.sol";
import {FrontierTurn as T} from "./FrontierTurn.sol";

/// @notice Closed-input frontier-path certificate; not fees or settlement.
library FrontierComposition {
    uint256 constant GRID=1<<32;
    uint256 constant U=1<<64;
    enum Status {Uncertain,UncertifiedStart,RequiresRepartition,TransitionLimit,FrontierPathCertified}
    struct Transition {uint64 key;bool inward;bool initialRelease;bool finalRetention;}
    struct Result {
        Status status;E.Result endpoint;E.Identity initial;
        Transition[] transitions;uint8 releaseCrossings;uint8 frontierCrossings;uint8 retentionCrossings;
        uint8 refinementUsed;uint8 refinementRemaining;uint8 crossingRemaining;
        // Nested endpoint.bracket.used is phase-local. These fields retain the
        // actual two-phase ledger even when fallback replaces that endpoint.
        uint8 firstSolveUsed;uint8 resumeUsed;bool resumeAttempted;
    }
    // Direction bits: nonpositive=1, nonnegative=2, negative=4, positive=8.
    // These certify the exact input-minus-output reserve difference, not the
    // sign of cumulative output and not a convenient side of an uncertain box.
    struct Node {int256 inputLo;int256 inputHi;int256 outputLo;int256 outputHi;uint8 direction;}
    error InvalidMetadata();error InvalidPair();error InvalidInput();error InvalidBound();
    /// @dev Ticks/decimals must be immutable validated strategy configuration.
    /// Every root, event and curve context is regenerated internally. Only
    /// FrontierPathCertified authorizes endpoint.amountOutRaw. This does not
    /// settle tokens or certify fee accounting, universal liveness or gas.
    /// Equality, unresolved direction/precision and uncertifiable retention
    /// remain explicit deferrals; no failed check proves global infeasibility.
    function certify(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawNetInput,uint8 maxCrossings) public pure returns(Result memory result){
        uint256 n=x.length;
        if(n<2||n>8||decimals.length!=n)revert InvalidMetadata();
        for(uint256 k;k<n;k++)if(decimals[k]>18)revert InvalidMetadata();
        if(input>=n||output>=n||input==output)revert InvalidPair();
        if(maxCrossings>16)revert InvalidBound();
        if(rawNetInput==0)revert InvalidInput();
        result.refinementRemaining=160;result.crossingRemaining=maxCrossings;
        if(!M.certify(x,ticks)){result.status=Status.UncertifiedStart;return result;}
        uint256 radius;for(uint256 k;k<ticks.length;k++)radius+=ticks[k].radius;
        uint256 inputQuantum=10**(18-decimals[input])*U;
        if(x[input]>radius||rawNetInput>(radius-x[input])/inputQuantum)revert InvalidInput();
        uint256 netInput=rawNetInput*inputQuantum;

        uint8 originalPrefix=_canonical(x,ticks);
        // Prefix attempts are bounded and spend zero midpoint evaluations.
        // A certified bracket already identifies a unique exact root even
        // before narrowing; GRID release separately connects actual X to hi.
        for(uint256 attempt=uint256(originalPrefix)+1;attempt!=0;--attempt){
            E.Identity memory initial=E.identifyInitial(x,ticks,output,uint8(attempt-1),0);
            if(!initial.identified)continue;
            (bool valid,uint8 crossed)=P.certifyInwardReleaseToGrid(x,ticks,output,initial.bracket.hi,initial.boundaryCount);
            if(!valid)continue;
            if(crossed!=originalPrefix-initial.boundaryCount)return result;
            result.initial=initial;result.releaseCrossings=crossed;break;
        }
        if(!result.initial.identified)return result;
        if(result.releaseCrossings>maxCrossings){result.status=Status.TransitionLimit;return result;}
        result.crossingRemaining=maxCrossings-result.releaseCrossings;

        bool foundFinal;uint8 finalPrefix;
        for(uint8 count;count<ticks.length;count++){
            E.Result memory proposal=E.exactInput(x,ticks,decimals,input,output,rawNetInput,count,0);
            if(proposal.root.identified){foundFinal=true;finalPrefix=count;break;}
        }
        if(!foundFinal)return result;
        F.Result memory schedule=F.enumerate(x,ticks,input,output,netInput,result.initial.boundaryCount,finalPrefix,result.crossingRemaining);
        if(schedule.status==F.Status.CrossingLimit){result.status=Status.TransitionLimit;return result;}
        if(schedule.status!=F.Status.OrderingCertified)return result;

        // Initial/discovery attempts spent zero midpoints. Stop only at the
        // exact financial gap bound, then still require every final/path check.
        result.endpoint=E.exactInputForPayout(x,ticks,decimals,input,output,rawNetInput,finalPrefix,result.refinementRemaining);
        result.firstSolveUsed=result.endpoint.root.bracket.used;
        result.refinementUsed=result.firstSolveUsed;
        result.refinementRemaining=result.endpoint.root.bracket.remaining;
        bool complete=result.endpoint.status==E.Status.EndpointCertified&&_arcs(x,ticks,input,output,netInput,result.initial,result.endpoint.root,schedule.events);
        if(!complete&&result.endpoint.root.identified&&result.refinementRemaining!=0&&result.endpoint.root.bracket.width>1){
            // At most one ordinary continuation, starting at retained lo/hi.
            // E regenerates the entire frame and rechecks root/domain identity;
            // no initial/path proof is imported through a caller witness flag.
            result.resumeAttempted=true;
            result.endpoint=E.resumeExactInput(x,ticks,decimals,input,output,rawNetInput,finalPrefix,result.endpoint.root.bracket.lo,result.endpoint.root.bracket.hi,result.refinementRemaining);
            result.resumeUsed=result.endpoint.root.bracket.used;
            result.refinementUsed+=result.resumeUsed;
            result.refinementRemaining=result.endpoint.root.bracket.remaining;
            complete=result.endpoint.status==E.Status.EndpointCertified&&_arcs(x,ticks,input,output,netInput,result.initial,result.endpoint.root,schedule.events);
        }
        if(result.endpoint.status==E.Status.RequiresRepartition){result.status=Status.RequiresRepartition;return result;}
        if(!complete)return result;

        result.frontierCrossings=uint8(schedule.events.length);
        result.crossingRemaining=schedule.remainingCrossings;
        result.retentionCrossings=result.endpoint.retentionCrossings;
        if(result.retentionCrossings>result.crossingRemaining){result.status=Status.TransitionLimit;return result;}
        result.crossingRemaining-=result.retentionCrossings;
        result.transitions=new Transition[](uint256(result.releaseCrossings)+result.frontierCrossings+result.retentionCrossings);
        for(uint256 k;k<result.releaseCrossings;k++)result.transitions[k]=Transition(ticks[uint256(originalPrefix)-1-k].key,true,true,false);
        for(uint256 k;k<schedule.events.length;k++)result.transitions[uint256(result.releaseCrossings)+k]=Transition(schedule.events[k].key,schedule.events[k].candidate.inward,false,false);
        for(uint256 k;k<result.retentionCrossings;k++){
            result.transitions[uint256(result.releaseCrossings)+result.frontierCrossings+k]=Transition(ticks[uint256(finalPrefix)+k].key,false,false,true);
        }
        // NUM-11..14: ideal path and final retention are separate phases.
        // Retention keys are accounting seams, not ideal output-progress
        // events. No intermediate raw output is paid or rounded.
        result.status=Status.FrontierPathCertified;
    }
    function _arcs(uint256[] memory x,M.Tick[] memory ticks,uint8 input,uint8 output,uint256 netInput,E.Identity memory initial,E.Identity memory finalRoot,F.Event[] memory events) private pure returns(bool){
        Node memory left=_rootNode(x,input,output,0,initial);
        Node memory finalNode=_rootNode(x,input,output,netInput,finalRoot);
        uint256[] memory untouched=new uint256[](x.length-2);uint256 at;
        for(uint256 k;k<x.length;k++)if(k!=input&&k!=output)untouched[at++]=x[k];
        uint8 prefix=initial.boundaryCount;
        for(uint256 k;k<=events.length;k++){
            Node memory right=k==events.length?finalNode:_eventNode(events[k].candidate);
            // Progress includes initial released slack and remains in the
            // original X frame. Boxes must order in both coordinates.
            if(left.inputHi>=right.inputLo||left.outputHi>=right.outputLo)return false;
            if(!_arc(uint8(x.length),ticks,prefix,untouched,left.direction,right.direction))return false;
            if(k==events.length)return prefix==finalRoot.boundaryCount;
            F.Event memory eventPoint=events[k];
            if(eventPoint.candidate.inward){
                if(prefix!=eventPoint.keyIndex+1)return false;
                prefix=eventPoint.keyIndex;
            }else{
                if(prefix!=eventPoint.keyIndex)return false;
                prefix=eventPoint.keyIndex+1;
            }
            left=right;
        }
        return false;
    }
    function _arc(uint8 n,M.Tick[] memory ticks,uint8 prefix,uint256[] memory untouched,uint8 left,uint8 right) private pure returns(bool){
        // Endpoint identities/prices and this one-sided prefix are supplied by
        // the internal root/schedule chain. FRONTIER_SEGMENT's sphere proof
        // needs no mixed direction or transverse calculation.
        if(prefix==0)return true;
        if((left&1)!=0&&(right&1)!=0)return true;
        if((left&2)!=0&&(right&2)!=0)return true;
        if((left&4)!=0&&(right&8)!=0){
            return T.evaluate(T.prepare(n,ticks,prefix),untouched).status==T.Status.ProvenNonpositive;
        }
        return false;
    }
    function _rootNode(uint256[] memory x,uint8 input,uint8 output,uint256 netInput,E.Identity memory root) private pure returns(Node memory node){
        node.inputLo=int256(netInput*GRID);node.inputHi=node.inputLo;
        node.outputLo=int256(x[output]*GRID)-int256(root.bracket.hi);
        node.outputHi=int256(x[output]*GRID)-int256(root.bracket.lo);
        int256 wLo=int256((x[input]+netInput)*GRID)-int256(root.bracket.hi);
        int256 wHi=int256((x[input]+netInput)*GRID)-int256(root.bracket.lo);
        if(wHi<=0)node.direction|=1;
        if(wLo>=0)node.direction|=2;
        if(wHi<0)node.direction|=4;
        if(wLo>0)node.direction|=8;
    }
    function _eventNode(V.Candidate memory candidate) private pure returns(Node memory node){
        // Only internally generated Separated+physical schedule candidates
        // reach here. Their exact branch sign is stronger than a loose box.
        node=Node(candidate.inputLo,candidate.inputHi,candidate.outputLo,candidate.outputHi,candidate.inward?5:10);
    }
    function _canonical(uint256[] memory x,M.Tick[] memory ticks) private pure returns(uint8 count){
        uint256 sum;uint256 radius;uint256 axial;
        for(uint256 k;k<x.length;k++)sum+=x[k];
        for(uint256 k;k<ticks.length;k++)radius+=ticks[k].radius;
        for(uint256 k;k+1<ticks.length;k++){
            if(sum*GRID<axial+radius*ticks[k].key)break;
            radius-=ticks[k].radius;axial+=uint256(ticks[k].radius)*ticks[k].key;++count;
        }
    }
}
