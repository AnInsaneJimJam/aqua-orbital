// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaymentDollar} from "./Payments.t.sol";
import {OrbitalPayments as P} from "../src/OrbitalPayments.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraits} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";

/// @dev Only tests adapter atomic accounting; this is not an Orbital curve.
contract PaymentRouterDouble {
    PaymentDollar public input; PaymentDollar public usdc;
    uint256 public output=6e6;
    constructor(PaymentDollar i,PaymentDollar u){input=i;usdc=u;}
    function setOutput(uint256 value) external { output=value; }
    function getStrategyConfig(bytes32) external view returns(OrbitalConfigV1 memory c){
        c.maker=address(0xA);c.chainId=block.chainid;c.router=address(this);c.tokens=new address[](2);c.tokens[0]=address(input);c.tokens[1]=address(usdc);
    }
    function swap(ISwapVM.Order calldata order,uint256 amount,bytes calldata) external returns(uint256,uint256,bytes32){
        input.transferFrom(msg.sender,order.maker,amount);usdc.transfer(msg.sender,output);return(amount,output,keccak256(abi.encode(order)));
    }
}
contract PaymentSwapTest is Test {
    function testSwapRefundDonationAndAllowance() public {
        (P p,PaymentDollar input,PaymentDollar usdc,PaymentRouterDouble router,bytes32 id)=fixture();
        input.mint(address(this),10e6);input.approve(address(p),10e6);usdc.mint(address(router),20e6);usdc.mint(address(p),77);
        p.payWithSwap(id,ISwapVM.Order(address(0xA),MakerTraits.wrap(0),""),0,7e6,5e6,uint40(block.timestamp+600),16);
        assertEq(usdc.balanceOf(address(0xB)),45e5);assertEq(usdc.balanceOf(address(0xC)),5e5);assertEq(usdc.balanceOf(address(this)),1e6);assertEq(usdc.balanceOf(address(p)),77);
        assertEq(input.balanceOf(address(0xA)),7e6);assertEq(input.allowance(address(p),address(router)),0);assertEq(uint8(p.getInvoice(id).status),uint8(P.Status.Paid));
    }
    function testInsufficientSwapRollsEverythingBack() public {
        (P p,PaymentDollar input,PaymentDollar usdc,PaymentRouterDouble router,bytes32 id)=fixture();
        input.mint(address(this),10e6);input.approve(address(p),10e6);usdc.mint(address(router),20e6);router.setOutput(4e6);
        vm.expectRevert();p.payWithSwap(id,ISwapVM.Order(address(0xA),MakerTraits.wrap(0),""),0,7e6,5e6,uint40(block.timestamp+600),16);
        assertEq(input.balanceOf(address(this)),10e6);assertEq(input.balanceOf(address(0xA)),0);assertEq(usdc.balanceOf(address(router)),20e6);assertEq(uint8(p.getInvoice(id).status),uint8(P.Status.Unpaid));
    }
    function fixture() private returns(P p,PaymentDollar input,PaymentDollar usdc,PaymentRouterDouble router,bytes32 id){
        input=new PaymentDollar();usdc=new PaymentDollar();router=new PaymentRouterDouble(input,usdc);
        address[] memory tokens=new address[](2);tokens[0]=address(input);tokens[1]=address(usdc);p=new P(address(usdc),address(router),tokens);
        address[] memory recipients=new address[](2);recipients[0]=address(0xB);recipients[1]=address(0xC);uint16[] memory bps=new uint16[](2);bps[0]=9000;bps[1]=1000;
        id=p.createInvoice(5e6,uint40(block.timestamp+3600),recipients,bps,0);
    }
}
