// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {InteriorSwap as I} from "../../src/libraries/InteriorSwap.sol";
import {FrontierComposition as C} from "../../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../../src/libraries/FrontierEndpoint.sol";
import {OrbitalMath as M} from "../../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../../src/libraries/TickGeometry.sol";

/// @dev Local diagnostic boundary around the actual I -> C engine dispatch.
/// No financial custody, stored state, oracle output, tolerance or solver bypass.
/// Failed calls are observations, never accepted financial results.
contract MixedPilotHarness {
    struct Input {
        uint256[] x;uint64[] keys;uint192[] radii;uint8[] decimals;
        uint8 input;uint8 output;uint256 netInputRaw;uint8 maxCrossings;
    }
    struct Observation {
        bool reverted;bytes revertData;bool mixed;bool accepted;
        uint256 amountOutRaw;uint256[] reserves;uint256 shortfallUpper;
        uint256 innerCallGas;C.Result composition;
    }
    constructor(){require(block.chainid==31337,"local diagnostic only");}
    function observe(Input memory p) external view returns(Observation memory result){
        require(gasleft()>300000,"diagnostic gas reserve");
        uint256 before=gasleft();
        try this.solve{gas:gasleft()-250000}(p) returns(Observation memory answer){result=answer;}
        catch(bytes memory reason){result.reverted=true;result.revertData=reason;}
        result.innerCallGas=before-gasleft();
    }
    function solve(Input memory p) external view returns(Observation memory result){
        uint256 n=p.x.length;
        require(n>=2&&n<=8&&p.decimals.length==n,"dimensions");
        require(p.keys.length>0&&p.keys.length<=8&&p.radii.length==p.keys.length,"ticks");
        require(p.keys[p.keys.length-1]==type(uint64).max,"anchor");
        M.Tick[] memory ticks=new M.Tick[](p.keys.length);uint256 radius;
        for(uint256 k;k<ticks.length;k++){
            require(p.radii[k]!=0&&(k==0||p.keys[k]>p.keys[k-1]),"tick order/radius");
            radius+=p.radii[k];ticks[k]=M.Tick(p.keys[k],p.radii[k],G.coefficients(uint8(n),p.keys[k]));
        }
        require(radius<1<<160,"radius limit");
        I.Result memory interior;
        (result.mixed,interior)=I.tryExactInput(p.x,ticks,p.decimals,p.input,p.output,p.netInputRaw);
        if(!result.mixed){
            result.accepted=true;result.amountOutRaw=interior.amountOutRaw;
            result.reserves=interior.reserves;result.shortfallUpper=interior.shortfallUpper;return result;
        }
        result.composition=C.certify(p.x,ticks,p.decimals,p.input,p.output,p.netInputRaw,p.maxCrossings);
        result.accepted=result.composition.status==C.Status.FrontierPathCertified;
        if(result.accepted){
            require(result.composition.endpoint.status==E.Status.EndpointCertified,"inconsistent endpoint certificate");
            result.amountOutRaw=result.composition.endpoint.amountOutRaw;
            result.reserves=result.composition.endpoint.reserves;
            result.shortfallUpper=result.composition.endpoint.shortfallUpper;
        }
    }
}
