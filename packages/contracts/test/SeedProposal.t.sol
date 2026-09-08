// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {CurveEvaluation as C} from "../src/libraries/CurveEvaluation.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {FrontierComposition as F} from "../src/libraries/FrontierComposition.sol";
import {RootBracket as B} from "../src/libraries/RootBracket.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {SignedWide as S} from "../src/libraries/SignedWide.sol";
import {CurvePrimitiveFixtures as Fixtures} from "./fixtures/CurvePrimitiveFixtures.sol";

contract SeedLinkedProbe {
    function quote(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint256 raw) external view returns(F.Result memory r,uint256 bodyGas){
        uint256 before=gasleft();r=F.certify(x,ticks,d,0,1,raw,2);bodyGas=before-gasleft();
    }
}
contract SeedProposalTest is Test {
    uint256 constant SCALE=1e40;uint256 constant GRID=1<<32;uint256 constant U=1<<64;
    uint256 constant RAW=381100078699772177738;
    function fixture() private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        x=new uint256[](2);x[0]=2527133520585472095299795479050357292168;x[1]=10306468614415789726245162508561985295187;
        ticks=new M.Tick[](2);uint64 key=uint64(5*GRID/8);
        ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function decimals() private pure returns(uint8[] memory d){d=new uint8[](2);d[0]=18;d[1]=18;}
    function highPoint() private pure returns(uint256[] memory high,C.Context memory ctx,uint256 lower){
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();ctx=C.prepare(2,ticks,1);
        high=new uint256[](2);high[0]=(x[0]+RAW*U)*GRID;high[1]=ctx.axial+ctx.radius-high[0];
        lower=ctx.axial+(ctx.radius/GRID)*ctx.outerKey-high[0];
    }
    function testOldHighIsStrictlyBelowSheetBeforeAnyRootIteration() public pure {
        (uint256[] memory high,C.Context memory ctx,)=highPoint();C.Evaluation memory e=C.evaluate(high,ctx,1);
        assertEq(high[1],28745403767035575587661918325688063669185286242304);
        assertEq(uint256(e.status),uint256(C.Status.BelowSheet));assertLt(e.rhoHi,ctx.sigmaLo);
    }
    function endpoint(E.Result memory r) private pure {
        assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));assertTrue(r.root.identified);
        assertEq(r.amountOutRaw,399184686675480708007);
        uint256 floor=12639276407035575587679706336065267487035352665727;
        assertLe(r.root.bracket.lo,floor);assertGe(r.root.bracket.hi,floor+1);
        assertGe(r.shortfallUpper,11709071672542645455);assertLe(r.shortfallUpper,U);
    }
    function testExactAndTargetedEndpointRecoverIndependentGolden() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        endpoint(E.exactInput(x,ticks,decimals(),0,1,RAW,1,160));
        endpoint(E.exactInputForPayout(x,ticks,decimals(),0,1,RAW,1,160));
    }
    function testFullCompositionRecoversBothEventsAndSharedLedger() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();F.Result memory r=F.certify(x,ticks,decimals(),0,1,RAW,2);
        assertEq(uint256(r.status),uint256(F.Status.FrontierPathCertified));endpoint(r.endpoint);
        assertEq(r.transitions.length,2);assertTrue(r.transitions[0].inward);assertFalse(r.transitions[1].inward);
        assertEq(r.initial.boundaryCount,1);assertEq(r.endpoint.root.boundaryCount,1);
        assertEq(uint256(r.refinementUsed)+r.refinementRemaining,160);assertEq(r.crossingRemaining,0);
        assertTrue(M.certify(r.endpoint.reserves,ticks));
    }
    function testExistingInwardMixedGoldenIsUnchanged() public pure {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 count,,,)=Fixtures.scalar(0);
        E.Result memory r=E.exactInputForPayout(x,ticks,decimals(),0,1,1e18,count,160);
        assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));assertEq(r.amountOutRaw,4126770776962595252);
        assertLe(r.root.bracket.lo,44340703412623690595350829985285122856085410428353);
        assertGe(r.root.bracket.hi,44340703412623690595350829985285122856085410428354);
    }
    function testAllInteriorStillUsesTheSeparateSphereDomain() public pure {
        uint256[] memory x=new uint256[](2);x[0]=SCALE/2;x[1]=SCALE/5;
        M.Tick[] memory ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
        E.Result memory r=E.exactInput(x,ticks,decimals(),0,1,SCALE/100/U,0,160);
        assertEq(uint256(r.status),uint256(E.Status.EndpointCertified));assertEq(r.root.boundaryCount,0);assertTrue(M.certify(r.reserves,ticks));
    }
    function testZeroBudgetStillDefersTheFinancialPayout() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();
        E.Result memory r=E.exactInputForPayout(x,ticks,decimals(),0,1,RAW,1,0);
        assertTrue(r.root.identified);assertEq(uint256(r.status),uint256(E.Status.Uncertain));
        assertEq(r.root.bracket.used,0);assertEq(r.root.bracket.remaining,0);assertGt(r.shortfallUpper,U);
    }
    function testRecoveredPathStillRequiresBothCrossingAllowances() public pure {
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();F.Result memory r=F.certify(x,ticks,decimals(),0,1,RAW,1);
        assertEq(uint256(r.status),uint256(F.Status.TransitionLimit));
    }
    function testLinkedRuntimeSizeAndColdRecoveredPathGas() public {
        SeedLinkedProbe probe=new SeedLinkedProbe();
        (uint256[] memory x,M.Tick[] memory ticks)=fixture();uint8[] memory d=decimals();
        vm.cool(address(F));vm.cool(address(E));vm.cool(address(probe));
        uint256 before=gasleft();(F.Result memory r,uint256 bodyGas)=probe.quote(x,ticks,d,RAW);uint256 totalGas=before-gasleft();
        assertEq(uint256(r.status),uint256(F.Status.FrontierPathCertified));endpoint(r.endpoint);
        emit log_named_uint("cold_external_with_ABI_gas",totalGas);emit log_named_uint("linked_body_gas",bodyGas);
        emit log_named_uint("FrontierComposition_runtime_bytes",address(F).code.length);
        emit log_named_uint("FrontierEndpoint_runtime_bytes",address(E).code.length);
        emit log_named_uint("SeedLinkedProbe_runtime_bytes",address(probe).code.length);
        assertGt(address(F).code.length,0);assertLe(address(F).code.length,24576);
        assertGt(address(E).code.length,0);assertLe(address(E).code.length,24576);assertLe(address(probe).code.length,24576);
        emit log_named_uint("first_solve_used",r.firstSolveUsed);emit log_named_uint("resume_used",r.resumeUsed);emit log_named_uint("remaining",r.refinementRemaining);
    }
    function testProposedHighHasFullMembershipAndAnOrdinaryCertifiedBracket() public pure {
        (uint256[] memory high,C.Context memory ctx,uint256 lower)=highPoint();
        (bool valid,uint256 clipped)=E._capN2High(high[0],high[1],ctx.sigmaHi,lower);assertTrue(valid);
        assertEq(clipped,26843545600000000000045871803013165693130594979710);high[1]=clipped;
        C.Evaluation memory e=C.evaluate(high,ctx,1);assertTrue(C.certifiesMembership(e));assertTrue(e.strictOutputPrice);assertGe(e.rhoLo,ctx.sigmaHi);
        B.Bracket memory bracket=B.refine(high,ctx,1,lower,0);assertTrue(bracket.certified);assertEq(bracket.used,0);assertEq(bracket.remaining,0);
    }
    function testArithmeticProposalRejectsUnderflowAndEmptyWindow() public pure {
        (bool valid,)=E._capN2High(4,1,4,0);assertFalse(valid);
        (valid,)=E._capN2High(8,6,4,3);assertFalse(valid);
        (valid,)=E._capN2High((uint256(1)<<192)-1,0,(uint256(1)<<192)-1,0);assertFalse(valid);
        uint256 z;(valid,z)=E._capN2High(8,6,4,2);assertTrue(valid);assertEq(z,2);
    }
    function testFuzzClipHasExactDirectedSheetInequalities(uint192 seed) public pure {
        uint256 sigma=1+uint256(seed)%((uint256(1)<<191)-1);uint256 other=(uint256(1)<<192)-1;
        (bool valid,uint256 z)=E._capN2High(other,other-1,sigma,0);assertTrue(valid);
        uint256 delta=other-z;W.Uint512 memory squared=W.scale(W.mul(sigma,sigma),2);
        assertTrue(W.lte(squared,W.mul(delta,delta)));assertFalse(W.lte(squared,W.mul(delta-1,delta-1)));
    }
}
