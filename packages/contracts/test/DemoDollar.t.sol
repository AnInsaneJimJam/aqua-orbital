// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalDemoDollar as Dollar} from "../src/OrbitalDemoDollar.sol";

contract DemoDollarTest is Test {
    address alice=address(0xA11CE);address bob=address(0xB0B);
    function testExactDemoMetadataAndAmountsAtBothPrecisions() public {
        for(uint8 i;i<2;i++){
            uint8 d=i==0?6:18;Dollar token=new Dollar(d);
            assertEq(token.name(),i==0?"Orbital Demo Dollar 6":"Orbital Demo Dollar 18");
            assertEq(token.symbol(),i==0?"oUSD6":"oUSD18");assertEq(token.decimals(),d);
            assertEq(token.FAUCET_AMOUNT(),1000*10**d);assertEq(token.CHAIN_ID(),31337);
            vm.prank(alice);token.faucet();
            assertEq(token.balanceOf(alice),1000*10**d);assertEq(token.totalSupply(),1000*10**d);
            assertEq(token.balanceOf(address(this)),0);assertEq(token.balanceOf(address(token)),0);
        }
    }
    function testOnlyLocalAndArcTestnetDeploymentIsAllowed() public {
        vm.chainId(5042002);Dollar token=new Dollar(6);assertEq(token.CHAIN_ID(),5042002);
        vm.prank(alice);token.faucet();assertEq(token.balanceOf(alice),1000e6);
        vm.chainId(1);vm.expectRevert(Dollar.UnsupportedChain.selector);new Dollar(6);
        vm.chainId(5042003);vm.expectRevert(Dollar.UnsupportedChain.selector);new Dollar(18);
    }
    function testRejectUnexpectedDecimals() public {
        vm.expectRevert(Dollar.InvalidDecimals.selector);new Dollar(0);
        vm.expectRevert(Dollar.InvalidDecimals.selector);new Dollar(8);
        vm.expectRevert(Dollar.InvalidDecimals.selector);new Dollar(19);
        vm.expectRevert(Dollar.InvalidDecimals.selector);new Dollar(255);
    }
    function testCooldownIncludesTimestampZeroAndExactDailyBoundary() public {
        vm.warp(0);Dollar token=new Dollar(6);vm.prank(alice);token.faucet();
        assertEq(token.nextMintAt(alice),1 days);
        vm.expectRevert(abi.encodeWithSelector(Dollar.FaucetCooldown.selector,1 days));vm.prank(alice);token.faucet();
        vm.warp(1 days-1);
        vm.expectRevert(abi.encodeWithSelector(Dollar.FaucetCooldown.selector,1 days));vm.prank(alice);token.faucet();
        assertEq(token.balanceOf(alice),1000e6);assertEq(token.nextMintAt(alice),1 days);
        vm.warp(1 days);vm.prank(alice);token.faucet();
        assertEq(token.balanceOf(alice),2000e6);assertEq(token.nextMintAt(alice),2 days);
    }
    function testCooldownBelongsToAddressAndDoesNotResetOnTransfer() public {
        vm.warp(20 days);Dollar token=new Dollar(18);vm.prank(alice);token.faucet();
        vm.prank(alice);token.transfer(bob,1000e18);vm.prank(bob);token.faucet();
        assertEq(token.balanceOf(bob),2000e18);assertEq(token.balanceOf(alice),0);
        vm.expectRevert(abi.encodeWithSelector(Dollar.FaucetCooldown.selector,21 days));vm.prank(alice);token.faucet();
        vm.prank(bob);token.approve(alice,3e18);vm.prank(alice);token.transferFrom(bob,alice,3e18);
        assertEq(token.allowance(bob,alice),0);assertEq(token.balanceOf(alice),3e18);
    }
    function testChangedRuntimeChainCannotReuseFaucet() public {
        Dollar token=new Dollar(6);vm.chainId(5042002);
        vm.expectRevert(Dollar.WrongChain.selector);vm.prank(alice);token.faucet();
        assertEq(token.nextMintAt(alice),0);assertEq(token.totalSupply(),0);
    }
    function testFuzzDailyLimitCannotBeBypassedByEarlyRetry(uint32 rawElapsed,uint8 profile) public {
        uint256 elapsed=bound(uint256(rawElapsed),0,1 days-1);uint8 d=profile%2==0?6:18;
        vm.warp(100 days);Dollar token=new Dollar(d);vm.prank(alice);token.faucet();
        vm.warp(100 days+elapsed);
        vm.expectRevert(abi.encodeWithSelector(Dollar.FaucetCooldown.selector,101 days));vm.prank(alice);token.faucet();
        assertEq(token.balanceOf(alice),1000*10**d);assertEq(token.totalSupply(),1000*10**d);
        assertEq(token.nextMintAt(alice),101 days);
    }
}
