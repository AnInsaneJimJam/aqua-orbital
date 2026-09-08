// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {FrontierComposition as C} from "../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {FrontierSchedule as F} from "../src/libraries/FrontierSchedule.sol";
import {SlackCertificate as P} from "../src/libraries/SlackCertificate.sol";
import {CurvePrimitiveFixtures as Fixtures} from "./fixtures/CurvePrimitiveFixtures.sol";

/// @notice Measurement harness only: no production helpers are changed.
/// @dev Body gas excludes ABI decode/encode. Caller gas includes the actual
/// external call plus ABI work, but excludes fixture setup and assertions.
contract FrontierCompositionGasTest is Test {
    uint256 constant SCALE=1e40;uint256 constant GRID=1<<32;uint256 constant U=1<<64;
    function decimals(uint256 n) private pure returns(uint8[] memory d){d=new uint8[](n);for(uint256 k;k<n;k++)d[k]=18;}
    function quote(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint256 raw,uint8 limit) external view returns(C.Result memory r,uint256 bodyGas){
        uint256 before=gasleft();r=C.certify(x,ticks,d,0,1,raw,limit);bodyGas=before-gasleft();
    }
    function measure(string memory label,uint256[] memory x,M.Tick[] memory ticks,uint256 raw,uint8 limit) private {
        measureDecimals(label,x,ticks,decimals(x.length),raw,limit);
    }
    function measureDecimals(string memory label,uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint256 raw,uint8 limit) private {
        uint256 before=gasleft();(C.Result memory result,uint256 bodyGas)=this.quote(x,ticks,d,raw,limit);uint256 callGas=before-gasleft();
        assertEq(uint256(result.status),uint256(C.Status.FrontierPathCertified));assertGt(result.endpoint.amountOutRaw,0);
        emit log_string(label);emit log_named_uint("external_call_with_ABI_gas",callGas);emit log_named_uint("helper_body_gas",bodyGas);
        emit log_named_uint("refinement_used",result.refinementUsed);emit log_named_uint("refinement_remaining",result.refinementRemaining);
        emit log_named_uint("first_solve_used",result.firstSolveUsed);emit log_named_uint("resume_used",result.resumeUsed);
        emit log_named_uint("resume_attempted",result.resumeAttempted?1:0);
    }
    function ordinary(uint256 index,string memory label) private {
        (,uint256[] memory x,M.Tick[] memory ticks,,,,)=Fixtures.scalar(index);measure(label,x,ticks,1e18,0);
    }
    function testGasExternalMixedTwoTokens() public {ordinary(0,"n2 mixed");}
    function testGasExternalMixedThreeTokens() public {ordinary(2,"n3 mixed");}
    function testGasExternalMixedEightTokens() public {ordinary(3,"n8 mixed");}
    function pair(bool release) private pure returns(uint256[] memory x,M.Tick[] memory ticks){
        x=new uint256[](2);uint64 key;
        if(release){x[0]=15*SCALE/10;x[1]=3*SCALE/10;key=uint64(7*GRID/8);}
        else {x[0]=2527133520585472095299795479050357292168;x[1]=10306468614415789726245162508561985295187;key=uint64(5*GRID/8);}
        ticks=new M.Tick[](2);ticks[0]=M.Tick(key,uint192(SCALE),G.coefficients(2,key));ticks[1]=M.Tick(type(uint64).max,uint192(SCALE),G.coefficients(2,type(uint64).max));
    }
    function testGasExternalTwoRootPath() public {(uint256[] memory x,M.Tick[] memory ticks)=pair(false);measure("n2 two roots",x,ticks,8*SCALE/10/U,2);}
    function testGasExternalInitialRelease() public {(uint256[] memory x,M.Tick[] memory ticks)=pair(true);measure("n2 release plus outward",x,ticks,35*SCALE/100/U,2);}
    function testGasExternalSuccessfulFallback() public {
        (uint256[] memory x,M.Tick[] memory ticks)=pair(true);uint8[] memory d=decimals(2);d[1]=17;
        measureDecimals("n2 release plus outward, financial stop then order resume",x,ticks,d,125744046821095790489,2);
    }
    function testGasExternalMixedTurn() public {
        uint64 key=uint64(13*GRID/10);M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(SCALE/100),G.coefficients(3,key));ticks[1]=M.Tick(type(uint64).max,uint192(10*SCALE),G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);x[0]=863*SCALE/100;x[1]=999*SCALE/100;x[2]=SCALE/10;
        measure("n3 mixed turn",x,ticks,SCALE/U,0);
    }
    function initialPhase(uint256[] memory x,M.Tick[] memory ticks,uint8 prefix) external view returns(E.Identity memory root,uint256 gasUsed){
        uint256 before=gasleft();root=E.identifyInitial(x,ticks,1,prefix,0);
        (bool valid,)=P.certifyInwardReleaseToGrid(x,ticks,1,root.bracket.hi,prefix);require(root.identified&&valid,"initial phase");gasUsed=before-gasleft();
    }
    function discoveryPhase(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d) external view returns(uint8 prefix,uint256 gasUsed){
        uint256 before=gasleft();bool found;
        for(uint8 count;count<ticks.length;count++){
            E.Result memory r=E.exactInput(x,ticks,d,0,1,1e18,count,0);
            if(r.root.identified){prefix=count;found=true;break;}
        }
        require(found,"discovery phase");gasUsed=before-gasleft();
    }
    function schedulePhase(uint256[] memory x,M.Tick[] memory ticks,uint8 prefix) external view returns(uint256 gasUsed){
        uint256 before=gasleft();F.Result memory r=F.enumerate(x,ticks,0,1,1e18*U,prefix,prefix,0);
        require(r.status==F.Status.OrderingCertified,"schedule phase");gasUsed=before-gasleft();
    }
    function finalPhase(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory d,uint8 prefix) external view returns(E.Result memory r,uint256 gasUsed){
        uint256 before=gasleft();r=E.exactInputForPayout(x,ticks,d,0,1,1e18,prefix,160);require(r.status==E.Status.EndpointCertified,"final phase");gasUsed=before-gasleft();
    }
    function testGasThreeTokenPhasesInFreshExternalFrames() public {
        (,uint256[] memory x,M.Tick[] memory ticks,uint8 prefix,,,)=Fixtures.scalar(2);uint8[] memory d=decimals(3);
        (E.Identity memory initial,uint256 initialGas)=this.initialPhase(x,ticks,prefix);
        (uint8 finalPrefix,uint256 discoveryGas)=this.discoveryPhase(x,ticks,d);
        uint256 scheduleGas=this.schedulePhase(x,ticks,prefix);
        (E.Result memory end,uint256 finalGas)=this.finalPhase(x,ticks,d,finalPrefix);
        assertEq(initial.boundaryCount,finalPrefix);assertGt(end.amountOutRaw,0);
        emit log_named_uint("fresh_initial_identity_and_release_body_gas",initialGas);
        emit log_named_uint("fresh_final_prefix_discovery_body_gas",discoveryGas);
        emit log_named_uint("fresh_schedule_body_gas",scheduleGas);
        emit log_named_uint("fresh_final_solve_and_retention_body_gas",finalGas);
    }
}
