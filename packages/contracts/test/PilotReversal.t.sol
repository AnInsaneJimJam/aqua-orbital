// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {FrontierComposition as C} from "../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {FrontierSchedule as F} from "../src/libraries/FrontierSchedule.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";

/// @dev n3-t8-moderate-step2, independent mixed-pilot.json at110/160 digits.
/// The start is the previous two actual token-quantized payouts, not an ideal root.
contract PilotReversalTest is Test {
    uint256 constant U=1<<64;
    function fixture() private pure returns(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals){
        x=new uint256[](3);
        x[0]=331200043032813957614468352264874909541311;
        x[1]=280674411014923495738244352264874909541311;
        x[2]=236072846084332540915358438869674909541311;
        ticks=new M.Tick[](8);
        for(uint256 k;k<8;k++){
            uint64 key=k==7?type(uint64).max:uint64(5479354748+k*33554432);
            ticks[k]=M.Tick(key,uint192(1000*(k+1)*1e18*U),G.coefficients(3,key));
        }
        decimals=new uint8[](3);decimals[0]=0;decimals[1]=6;decimals[2]=8;
    }
    function testEightTickReversalMatchesIndependentActualHistory() public {
        (uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d)=fixture();
        E.Identity memory initial=E.identifyInitial(x,ticks,0,1,0);
        E.Result memory endpoint=E.exactInput(x,ticks,d,2,0,870092451394,7,0);
        F.Result memory schedule=F.enumerate(x,ticks,2,0,870092451394*1e10*U,1,7,16);
        assertTrue(initial.identified);assertTrue(endpoint.root.identified);
        assertEq(uint256(schedule.status),uint256(F.Status.OrderingCertified));
        assertEq(schedule.events.length,8);
        C.Result memory r=C.certify(x,ticks,d,2,0,870092451394,16);
        assertEq(uint256(r.status),uint256(C.Status.FrontierPathCertified));
        assertEq(r.endpoint.amountOutRaw,7478);
        assertEq(r.endpoint.reserves[0],x[0]-7478*1e18*U);
        assertEq(r.endpoint.reserves[1],x[1]);
        assertEq(r.endpoint.reserves[2],x[2]+870092451394*1e10*U);
        assertEq(r.initial.boundaryCount,1);assertEq(r.endpoint.root.boundaryCount,7);
        assertEq(r.endpoint.actualBoundaryCount,7);assertEq(r.frontierCrossings,8);
        assertEq(r.releaseCrossings,0);assertEq(r.retentionCrossings,0);
        assertEq(r.transitions.length,8);assertTrue(r.transitions[0].inward);
        assertEq(r.transitions[0].key,ticks[0].key);
        for(uint256 k=1;k<8;k++){
            assertFalse(r.transitions[k].inward);assertFalse(r.transitions[k].initialRelease);assertFalse(r.transitions[k].finalRetention);
            assertEq(r.transitions[k].key,ticks[k-1].key);
        }
        assertEq(uint256(r.refinementUsed)+r.refinementRemaining,160);
        assertLe(r.endpoint.shortfallUpper,1e18*U);assertTrue(M.certify(r.endpoint.reserves,ticks));
    }
}
