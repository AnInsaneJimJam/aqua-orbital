// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {OrbitalPayments as Payments} from "../src/OrbitalPayments.sol";

contract PaymentDollar is ERC20 {
    constructor() ERC20("Payment test dollar","TEST") {}
    function decimals() public pure override returns(uint8){return 6;}
    function mint(address to,uint256 amount) external { _mint(to,amount); }
}

contract PaymentsTest is Test {
    PaymentDollar dollar;
    Payments adapter;
    address merchant=address(0xA11CE);
    address payer=address(0xB0B);
    address treasury=address(0xCAFE);
    function setUp() public {
        dollar=new PaymentDollar();
        address[] memory tokens=new address[](1);tokens[0]=address(dollar);
        adapter=new Payments(address(dollar),address(0x1234),tokens);
        dollar.mint(payer,20e6);
        vm.prank(payer);dollar.approve(address(adapter),20e6);
    }
    function invoice() internal returns(bytes32 id) {
        address[] memory recipients=new address[](2);recipients[0]=merchant;recipients[1]=treasury;
        uint16[] memory bps=new uint16[](2);bps[0]=9000;bps[1]=1000;
        vm.prank(merchant);return adapter.createInvoice(5e6,uint40(block.timestamp+3600),recipients,bps,bytes32(0));
    }
    function testDirectSplitAndDonationIsolation() public {
        bytes32 id=invoice();dollar.mint(address(adapter),123);
        vm.prank(payer);adapter.payWithUSDC(id);
        assertEq(dollar.balanceOf(merchant),45e5);assertEq(dollar.balanceOf(treasury),5e5);
        assertEq(dollar.balanceOf(address(adapter)),123);assertEq(dollar.balanceOf(payer),15e6);
        assertEq(uint8(adapter.getInvoice(id).status),uint8(Payments.Status.Paid));
    }
    function testReplayAndCancellation() public {
        bytes32 id=invoice();vm.prank(payer);adapter.payWithUSDC(id);
        vm.expectRevert();vm.prank(payer);adapter.payWithUSDC(id);
        bytes32 cancelled=invoice();vm.prank(merchant);adapter.cancelInvoice(cancelled);
        vm.expectRevert();vm.prank(payer);adapter.payWithUSDC(cancelled);
    }
    function testExpiredAndInsufficientFunding() public {
        bytes32 id=invoice();vm.warp(block.timestamp+3600);
        vm.expectRevert();vm.prank(payer);adapter.payWithUSDC(id);
        bytes32 fresh=invoice();vm.prank(payer);dollar.approve(address(adapter),0);
        vm.expectRevert();vm.prank(payer);adapter.payWithUSDC(fresh);
        assertEq(uint8(adapter.getInvoice(fresh).status),uint8(Payments.Status.Unpaid));
    }
    function testUnauthorizedCancellation() public {
        bytes32 id=invoice();vm.expectRevert();vm.prank(payer);adapter.cancelInvoice(id);
    }
    function testInvalidSplit() public {
        address[] memory r=new address[](2);r[0]=merchant;r[1]=merchant;
        uint16[] memory b=new uint16[](2);b[0]=9000;b[1]=1000;
        vm.expectRevert();adapter.createInvoice(5e6,uint40(block.timestamp+3600),r,b,0);
    }
}
