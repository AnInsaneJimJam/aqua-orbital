// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {FrontierComposition as C} from "../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {CurvePrimitiveFixtures as F} from "./fixtures/CurvePrimitiveFixtures.sol";

/// @dev Deployed consumer of the real compiler-linked production entries.
/// No certificate/witness input, dynamic delegate target or storage reference.
contract LinkedMathClient {
    uint256 public marker=0xdecaf;
    function quote(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 raw,uint8 limit) external view returns(C.Result memory r,uint256 usedGas){
        uint256 before=gasleft();r=C.certify(x,ticks,decimals,input,output,raw,limit);usedGas=before-gasleft();
    }
}
contract LinkedMathTest is Test {
    uint256 constant SCALE=1e40;uint256 constant GRID=1<<32;uint256 constant U=1<<64;
    // Documented provisional 80% of EIP7825 cap, for THIS named helper call.
    // This assertion cannot close full transaction or worst-eight-tick gas.
    uint256 constant PROVISIONAL_HELPER_CEILING=13_421_772;
    LinkedMathClient client;
    function setUp() public {client=new LinkedMathClient();}
    function decimals(uint256 n) private pure returns(uint8[] memory d){d=new uint8[](n);for(uint256 k;k<n;k++)d[k]=18;}
    function sizes() private view {
        assertGt(address(C).code.length,0);assertLe(address(C).code.length,24576);
        assertGt(address(E).code.length,0);assertLe(address(E).code.length,24576);
        assertGt(address(client).code.length,0);assertLe(address(client).code.length,24576);
    }
    function measure(string memory label,uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint256 raw,uint8 limit,uint256 expected) private returns(C.Result memory r){
        sizes();bytes32 original=keccak256(abi.encode(x,ticks,d));
        // Expect actual compiler-linked calls; no hand-built library selector.
        vm.expectCall(address(C),bytes(""));vm.expectCall(address(E),bytes(""));
        vm.cool(address(C));vm.cool(address(E));vm.cool(address(client));
        uint256 before=gasleft();uint256 body;(r,body)=client.quote(x,ticks,d,0,1,raw,limit);uint256 externalGas=before-gasleft();
        assertEq(uint256(r.status),uint256(C.Status.FrontierPathCertified));assertEq(r.endpoint.amountOutRaw,expected);
        assertEq(uint256(r.refinementUsed)+r.refinementRemaining,160);assertEq(uint256(r.firstSolveUsed)+r.resumeUsed,r.refinementUsed);
        assertLe(r.endpoint.shortfallUpper,r.endpoint.outputQuantum);assertTrue(M.certify(r.endpoint.reserves,ticks));
        assertEq(keccak256(abi.encode(x,ticks,d)),original);assertEq(client.marker(),0xdecaf);
        assertLe(externalGas,PROVISIONAL_HELPER_CEILING,"named helper provisional planning ceiling");
        emit log_string(label);emit log_named_uint("cold_external_call_gas",externalGas);emit log_named_uint("linked_body_gas",body);
        emit log_named_uint("first_used",r.firstSolveUsed);emit log_named_uint("resume_used",r.resumeUsed);emit log_named_uint("remaining",r.refinementRemaining);
    }
    function ordinary(uint256 index,string memory label,uint256 amount) private {
        (,uint256[] memory x,M.Tick[] memory ticks,,,,)=F.scalar(index);measure(label,x,ticks,decimals(x.length),1e18,0,amount);
    }
    function testActualLinkedEntryN2() public {ordinary(0,"n2 real linked",4126770776962595252);}
    function testActualLinkedEntryN3() public {ordinary(2,"n3 real linked",333207013780241401);}
    function testActualLinkedEntryN8() public {ordinary(3,"n8 real linked",499288825743866812);}
    function pair(bool release) private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        x=new uint256[](2);uint64 key;
        if(release){x[0]=15*SCALE/10;x[1]=3*SCALE/10;key=uint64(7*GRID/8);}
        else {x[0]=2527133520585472095299795479050357292168;x[1]=10306468614415789726245162508561985295187;key=uint64(5*GRID/8);}
        ticks=new M.Tick[](2);ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function testActualLinkedTwoRoots() public {
        (uint256[] memory x,M.Tick[] memory ticks)=pair(false);
        C.Result memory r=measure("two linked roots",x,ticks,decimals(2),8*SCALE/10/U,2,427517751760020282527);
        assertEq(r.transitions.length,2);assertTrue(r.transitions[0].inward);assertFalse(r.transitions[1].inward);
    }
    function testActualLinkedResumePreservesBudgetAndEventOrder() public {
        (uint256[] memory x,M.Tick[] memory ticks)=pair(true);uint8[] memory d=decimals(2);d[1]=17;
        C.Result memory r=measure("real linked order resume",x,ticks,d,125744046821095790489,2,15284910113323340133);
        assertTrue(r.resumeAttempted);assertEq(r.firstSolveUsed,63);assertEq(r.resumeUsed,62);assertEq(r.refinementRemaining,35);
        assertEq(r.transitions.length,2);assertTrue(r.transitions[0].initialRelease);assertFalse(r.transitions[1].initialRelease);
    }
    function testPureLibraryFramesDoNotWriteCallerStorage() public {
        (,uint256[] memory x,M.Tick[] memory ticks,,,,)=F.scalar(2);uint8[] memory d=decimals(3);
        vm.record();(C.Result memory first,)=client.quote(x,ticks,d,0,1,1e18,0);
        (,bytes32[] memory writes)=vm.accesses(address(client));assertEq(writes.length,0);assertEq(client.marker(),0xdecaf);
        (C.Result memory second,)=client.quote(x,ticks,d,0,1,1e18,0);assertEq(abi.encode(first),abi.encode(second));
    }
    function testExternalLinkedErrorsAndUncertifiedStatusRemainDistinct() public {
        (,uint256[] memory x,M.Tick[] memory ticks,,,,)=F.scalar(2);uint8[] memory d=decimals(3);
        vm.expectRevert(C.InvalidPair.selector);client.quote(x,ticks,d,0,0,1e18,0);
        vm.expectRevert(C.InvalidBound.selector);client.quote(x,ticks,d,0,1,1e18,17);
        vm.expectRevert(C.InvalidInput.selector);client.quote(x,ticks,d,0,1,0,0);
        x=new uint256[](3);(C.Result memory r,)=client.quote(x,ticks,d,0,1,1e18,0);
        assertEq(uint256(r.status),uint256(C.Status.UncertifiedStart));assertEq(r.endpoint.amountOutRaw,0);
        assertEq(r.refinementUsed,0);assertEq(r.refinementRemaining,160);
    }
    function testActualRuntimeSizesBelowEIP170() public {
        sizes();emit log_named_uint("composition_runtime_bytes",address(C).code.length);
        emit log_named_uint("endpoint_runtime_bytes",address(E).code.length);emit log_named_uint("client_runtime_bytes",address(client).code.length);
    }
}
