// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {RouterLifecycleTest,LifecycleDollar} from "./RouterLifecycle.t.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {OrbitalStrategyStatus} from "../src/interfaces/IOrbitalLifecycle.sol";

/// @dev SDK profile vectors: first two-token 10-unit case for each preset in
/// test/evidence/selected-token-profiles/initializer.json. Regenerate with
/// packages/sdk/scripts/selected-profile-smoke.ts; sizes 2–8 are checked there.
contract SelectedTokensTest is RouterLifecycleTest {
    function selectedConfig(uint8 omitted,uint8 profile) internal view returns (OrbitalConfigV1 memory c) {
        c=config(router.nextMakerNonce(maker));
        c.tokens=new address[](2);c.decimals=new uint8[](2);
        uint256 cursor;
        for(uint256 i;i<3;i++)if(i!=omitted){c.tokens[cursor]=tokens[i];c.decimals[cursor]=precisions[i];cursor++;}
        uint64[3] memory keys;uint192[3] memory radii;
        if (profile == 0) { keys=[uint64(2516010281),2524328899,type(uint64).max]; radii=[uint192(10409135887052130081691567619850740693766),1529269377034318063869710005969315031228,314905618990423338283495718062525083688]; }
        else if (profile == 1) { keys=[uint64(2516010281),2517929322,type(uint64).max]; radii=[uint192(31227407661156390245074702859552222083556),3092901919669289613955984266761192496917,62981123798084667656699143612505016737]; }
        else if (profile == 2) { keys=[uint64(2515934353),2516010281,type(uint64).max]; radii=[uint192(364909571302144014772402399295251947902859),10409135887052130081691567619850740693766,62981123798084667656699143612505016737]; }
        for(uint256 i;i<3;i++){c.tickKeys[i]=keys[i];c.radiiInternal[i]=radii[i];}
        c.initialAmountsRaw=funding(c);
    }
    function testSelectedPairsPublishTradeBothDirectionsAndRetire() public {
        for(uint8 omitted;omitted<3;omitted++)for(uint8 profile;profile<3;profile++){
            OrbitalConfigV1 memory c=selectedConfig(omitted,profile);
            uint256 untouched=assets[omitted].balanceOf(maker);
            ISwapVM.Order memory order=orderFor(c);
            bytes32 h=ship(c,order);
            vm.prank(maker);assertEq(router.activateStrategy(c,order),h);
            assertEq(router.getStrategyState(h).X.length,2);
            assertEq(router.getStrategyAvailability(h).length,2);
            for(uint8 input;input<2;input++){
                uint8 output=1-input;
                LifecycleDollar paid=LifecycleDollar(c.tokens[input]);LifecycleDollar received=LifecycleDollar(c.tokens[output]);
                uint256 gross=10**c.decimals[input];paid.mint(taker,gross);
                uint256 beforeIn=paid.balanceOf(maker);uint256 beforeOut=received.balanceOf(taker);
                bytes memory data=takerData(input,output);
                vm.startPrank(taker);paid.approve(address(router),gross);
                (uint256 quotedIn,uint256 quotedOut,)=router.quote(order,gross,data);
                (uint256 actualIn,uint256 actualOut,)=router.swap(order,gross,data);vm.stopPrank();
                assertEq(actualIn,quotedIn);assertEq(actualOut,quotedOut);assertGt(actualOut,0);
                assertEq(paid.balanceOf(maker)-beforeIn,gross);
                assertEq(received.balanceOf(taker)-beforeOut,actualOut);
                assertEq(router.getStrategyState(h).cumulativeFeeRaw[input],(gross*500+999999)/1000000);
            }
            assertEq(assets[omitted].balanceOf(maker),untouched);
            vm.prank(maker);router.retireStrategy(h);
            vm.prank(maker);aqua.dock(address(router),h,c.tokens);
            assertEq(uint8(router.getStrategyState(h).status),uint8(OrbitalStrategyStatus.Retired));
        }
    }
}
