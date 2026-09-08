// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {FrontierComposition as C} from "../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";

/// @dev Independent initialized raw-token sequence, before router integration.
/// Goldens: reference/fixtures/reachable-traversal.json, stable110/160 digits.
contract ReachableCompositionTest is Test {
    uint256 constant GRID=1<<32;uint256 constant U=1<<64;
    uint256 constant INITIAL_X=5457557991956845750465862405150345463304;
    uint256 constant FIRST_NET=349825000;uint256 constant FIRST_OUT=164721797;
    uint256 constant SECOND_NET=499750000;uint256 constant SECOND_OUT=513016094;
    function fixture() private pure returns(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d){
        x=new uint256[](3);for(uint256 i;i<3;i++)x[i]=INITIAL_X;
        ticks=new M.Tick[](3);uint64[3] memory keys=[uint64(3*GRID/2),uint64(7*GRID/4),type(uint64).max];
        for(uint256 i;i<3;i++)ticks[i]=M.Tick(keys[i],uint192((100<<i)*1e18*U),G.coefficients(3,keys[i]));
        d=new uint8[](3);d[0]=6;d[1]=18;d[2]=6;
    }
    function accepted(C.Result memory r,M.Tick[] memory ticks,uint256 expected,uint8 crosses) private pure {
        assertEq(uint256(r.status),uint256(C.Status.FrontierPathCertified));
        assertEq(uint256(r.endpoint.status),uint256(E.Status.EndpointCertified));assertEq(r.endpoint.amountOutRaw,expected);
        assertTrue(M.certify(r.endpoint.reserves,ticks));assertEq(r.endpoint.actualBoundaryCount,1);
        assertLe(r.endpoint.shortfallUpper,1e12*U);assertEq(uint256(r.refinementUsed)+r.refinementRemaining,160);
        assertEq(r.transitions.length,crosses);assertEq(r.crossingRemaining,0);
    }
    function testInitializedFirstOutwardFrontierMatchesIndependentOracle() public pure {
        (uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d)=fixture();
        C.Result memory r=C.certify(x,ticks,d,0,2,FIRST_NET,1);accepted(r,ticks,FIRST_OUT,1);
        assertEq(r.endpoint.reserves[0],INITIAL_X+FIRST_NET*1e12*U);
        assertEq(r.endpoint.reserves[2],INITIAL_X-FIRST_OUT*1e12*U);
        assertEq(r.transitions[0].key,ticks[0].key);assertFalse(r.transitions[0].inward);
        assertFalse(r.transitions[0].initialRelease);assertFalse(r.transitions[0].finalRetention);
    }
    function testActualFirstPaymentThenReverseBothFrontiersMatchesOracle() public pure {
        (uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d)=fixture();
        x[0]+=FIRST_NET*1e12*U;x[2]-=FIRST_OUT*1e12*U;
        C.Result memory r=C.certify(x,ticks,d,2,0,SECOND_NET,2);accepted(r,ticks,SECOND_OUT,2);
        assertEq(r.endpoint.reserves[0],x[0]-SECOND_OUT*1e12*U);
        assertEq(r.endpoint.reserves[2],x[2]+SECOND_NET*1e12*U);
        assertEq(r.transitions[0].key,ticks[0].key);assertTrue(r.transitions[0].inward);
        assertEq(r.transitions[1].key,ticks[0].key);assertFalse(r.transitions[1].inward);
        for(uint256 i;i<2;i++){assertFalse(r.transitions[i].initialRelease);assertFalse(r.transitions[i].finalRetention);}
    }
    function testReachableReverseCannotIgnoreCallerCrossingBudget() public pure {
        (uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d)=fixture();
        x[0]+=FIRST_NET*1e12*U;x[2]-=FIRST_OUT*1e12*U;
        C.Result memory r=C.certify(x,ticks,d,2,0,SECOND_NET,1);
        assertEq(uint256(r.status),uint256(C.Status.TransitionLimit));assertEq(r.transitions.length,0);
    }
    function measured(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint8 input,uint8 output,uint256 net,uint8 maxCrossings) external view returns(C.Result memory result,uint256 used){
        uint256 before=gasleft();result=C.certify(x,ticks,d,input,output,net,maxCrossings);used=before-gasleft();
    }
    function testColdLinkedActualSequenceGasAndCodeSize() public {
        (uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d)=fixture();
        for(uint8 step;step<2;step++){
            vm.cool(address(C));vm.cool(address(E));
            uint256 before=gasleft();
            (C.Result memory r,uint256 used)=this.measured(x,ticks,d,step==0?0:2,step==0?2:0,step==0?FIRST_NET:SECOND_NET,step+1);
            uint256 callGas=before-gasleft();accepted(r,ticks,step==0?FIRST_OUT:SECOND_OUT,step+1);
            emit log_named_uint("sequence_step",step+1);emit log_named_uint("cold_external_call_gas",callGas);emit log_named_uint("linked_body_gas",used);
            emit log_named_uint("refinement_used",r.refinementUsed);emit log_named_uint("refinement_remaining",r.refinementRemaining);
            x=r.endpoint.reserves;
        }
        assertLe(address(C).code.length,24576);assertLe(address(E).code.length,24576);
        emit log_named_uint("composition_runtime_bytes",address(C).code.length);emit log_named_uint("endpoint_runtime_bytes",address(E).code.length);
    }
}
