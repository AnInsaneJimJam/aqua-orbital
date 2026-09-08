// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {FrontierEvents as E} from "./FrontierEvents.sol";

/// @notice Ordered key intersections, not connected traversal certification.
library FrontierSchedule {
    uint256 constant GRID=1<<32;
    enum Status {Uncertain,OrderingCertified,CrossingLimit,InconsistentPrefixes}
    struct Event {uint8 keyIndex;uint64 key;E.Candidate candidate;}
    struct Result {Status status;Event[] events;uint8 remainingCrossings;}
    error InvalidPair();error InvalidInput();error InvalidState();error InvalidBound();
    /// @dev Immutable ticks/coefficient provenance must be authenticated. Both
    /// ideal prefixes must come from identified endpoints in this original X
    /// frame, not the rounded start's canonical prefix. No endpoint connection,
    /// segment/turn proof, token rounding or financial amount is certified here.
    /// A failed result never authorizes its proposed events. The caller carries
    /// remainingCrossings across initial release and all later composition.
    function enumerate(uint256[] memory start,M.Tick[] memory ticks,uint8 input,uint8 output,uint256 netInputInternal,uint8 initialIdealPrefix,uint8 finalIdealPrefix,uint8 remainingCrossings) internal pure returns(Result memory result){
        if(input>=start.length||output>=start.length||input==output)revert InvalidPair();
        if(!M.certify(start,ticks))revert InvalidState();
        if(remainingCrossings>16||initialIdealPrefix>=ticks.length||finalIdealPrefix>=ticks.length)revert InvalidBound();
        uint256 radius;for(uint256 k;k<ticks.length;k++)radius+=ticks[k].radius;
        if(netInputInternal==0||start[input]>radius||netInputInternal>radius-start[input])revert InvalidInput();
        result.remainingCrossings=remainingCrossings;
        int256 limit=int256(netInputInternal*GRID);
        Event[] memory work=new Event[](2*(ticks.length-1));uint256 length;
        for(uint8 k;uint256(k)+1<ticks.length;k++){
            E.Roots memory roots=E.atKey(start,ticks,input,output,k);
            if(roots.status==E.Status.NoRoots)continue;
            if(roots.status==E.Status.Uncertain)return result;
            if(roots.status==E.Status.Touch){
                uint256 untouched;for(uint256 j;j<start.length;j++)if(j!=input&&j!=output)untouched+=start[j]*GRID;
                // The exact doubled position handles half-GRID tangencies
                // without signed division. Touch carries no physical witness.
                int256 doubled=int256(roots.sumNumerator)-int256(untouched)-2*int256(start[input]*GRID);
                if(doubled<0||doubled>2*limit)continue;
                return result;
            }
            for(uint256 branch;branch<2;branch++){
                E.Candidate memory c=roots.candidates[branch];
                // Definite input exclusion is valid even if physical=false.
                if(c.inputHi<0||c.inputLo>limit)continue;
                // A separate strict negative-price proof can exclude this
                // exact root. !physical alone (including zero) never can.
                if(!c.physical&&E.hasCertifiedNegativePrice(start,input,output,c,roots.sumNumerator,roots.rhoHi,ticks[k]))continue;
                if(c.inputLo<=0||c.inputHi>=limit||!c.physical)return result;
                work[length++]=Event(k,roots.key,c);
            }
        }
        // Sorting proposes an order only. Whole intervals must separate in
        // BOTH cumulative input and cumulative released output afterward.
        for(uint256 j=1;j<length;j++){
            Event memory value=work[j];uint256 at=j;
            while(at!=0&&value.candidate.inputLo<work[at-1].candidate.inputLo){work[at]=work[at-1];--at;}
            work[at]=value;
        }
        uint8 prefix=initialIdealPrefix;bool outwardSeen;
        for(uint256 j;j<length;j++){
            Event memory current=work[j];
            if(j!=0){
                E.Candidate memory previous=work[j-1].candidate;
                if(previous.inputHi>=current.candidate.inputLo||previous.outputHi>=current.candidate.outputLo)return result;
            }
            if(current.candidate.inward){
                if(outwardSeen||prefix!=current.keyIndex+1){result.status=Status.InconsistentPrefixes;return result;}
                prefix=current.keyIndex;
            }else{
                if(prefix!=current.keyIndex){result.status=Status.InconsistentPrefixes;return result;}
                prefix=current.keyIndex+1;outwardSeen=true;
            }
        }
        if(prefix!=finalIdealPrefix){result.status=Status.InconsistentPrefixes;return result;}
        if(length>remainingCrossings){result.status=Status.CrossingLimit;return result;}
        result.events=new Event[](length);for(uint256 j;j<length;j++)result.events[j]=work[j];
        result.remainingCrossings=remainingCrossings-uint8(length);
        result.status=Status.OrderingCertified;
    }
}
