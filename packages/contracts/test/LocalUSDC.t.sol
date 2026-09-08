// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {LocalUSDC} from "./fixtures/LocalUSDC.sol";
import {OrbitalDemoDollar} from "../src/OrbitalDemoDollar.sol";

contract LocalUSDCTest is Test {
    function testLocalFixtureHasExplicitIdentityAndCallerOnlyBoundedFaucet() public {
        LocalUSDC token=new LocalUSDC();
        assertEq(token.name(),"Local USDC Fixture");assertEq(token.symbol(),"USDC.fixture");
        assertEq(token.decimals(),6);assertEq(token.CHAIN_ID(),31337);
        address alice=address(0xA11CE);vm.prank(alice);token.faucet();
        assertEq(token.balanceOf(alice),1000e6);assertEq(token.balanceOf(address(this)),0);
        assertEq(token.totalSupply(),1000e6);assertEq(token.FAUCET_AMOUNT(),1000e6);
        vm.expectRevert(abi.encodeWithSelector(OrbitalDemoDollar.FaucetCooldown.selector,block.timestamp+1 days));
        vm.prank(alice);token.faucet();
        (bool minted,)=address(token).call(abi.encodeWithSignature("mint(address,uint256)",alice,1));
        assertFalse(minted);assertEq(token.totalSupply(),1000e6);
    }
    function testFixtureCannotDeployOnArcEvenThoughDemoTokenCan() public {
        vm.chainId(5042002);vm.expectRevert(OrbitalDemoDollar.UnsupportedChain.selector);new LocalUSDC();
    }
}
