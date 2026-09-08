// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {SwapVM} from "../vendor/swap-vm-orbital/src/SwapVM.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraits,TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {Context} from "../vendor/swap-vm-orbital/src/libs/VM.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {PaymentDollar} from "./Payments.t.sol";

/// @dev Resolver/settlement seam probe ONLY. This is not an Orbital curve router.
contract ResolutionProbe is SwapVM {
    using TakerTraitsLib for TakerTraits;
    address[3] public tokens;
    uint256 public fills;
    bool public guard;
    constructor(address aqua,address[3] memory assets) SwapVM(aqua,address(0),msg.sender,"Probe","1"){tokens=assets;}
    function _resolveTokens(ISwapVM.Order calldata,TakerTraits traits,bytes calldata data) internal view override returns(address,address){
        bytes calldata args=traits.instructionsArgs(data);
        require(args.length==4&&uint8(args[0])==1&&uint8(args[1])<3&&uint8(args[2])<3&&args[1]!=args[2]);
        return(tokens[uint8(args[1])],tokens[uint8(args[2])]);
    }
    function _beforeQuote(ISwapVM.Order calldata,uint256,bytes calldata) internal view override {require(!guard);}
    function _beforeSwap(ISwapVM.Order calldata,uint256,bytes calldata) internal override {require(!guard);guard=true;}
    function _afterSwap(Context memory,ISwapVM.Order calldata,TakerTraits,bytes calldata) internal override {fills++;guard=false;}
    function _dispatch(Context memory ctx,uint256 opcode,bytes calldata args) internal pure override {
        require(opcode==0x52&&args.length==0);
        // Fixed output deliberately confined to a test probe; no curve claim.
        ctx.swap.amountOut=ctx.swap.amountIn;
    }
}
contract ForkResolutionTest is Test {
    Aqua aqua;ResolutionProbe probe;PaymentDollar[3] assets;address[3] tokens;
    address maker=address(0xA11CE);address taker=address(0xB0B);ISwapVM.Order order;
    function setUp() public {
        aqua=new Aqua();
        for(uint256 i;i<3;i++){assets[i]=new PaymentDollar();tokens[i]=address(assets[i]);assets[i].mint(maker,1000);assets[i].mint(taker,1000);vm.prank(maker);assets[i].approve(address(aqua),1000);}
        probe=new ResolutionProbe(address(aqua),tokens);
        for(uint256 i;i<3;i++){vm.prank(taker);assets[i].approve(address(probe),1000);}
        MakerTraitsLib.Args memory args;args.maker=maker;args.tokenA=tokens[0];args.tokenB=tokens[1];args.useAquaInsteadOfSignature=true;args.program=hex"5200";
        order=MakerTraitsLib.build(args);
        address[] memory list=new address[](3);uint256[] memory amounts=new uint256[](3);
        for(uint256 i;i<3;i++){list[i]=tokens[i];amounts[i]=1000;}
        vm.prank(maker);aqua.ship(address(probe),abi.encode(order),list,amounts);
    }
    function data(uint8 i,uint8 j) internal view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=taker;a.to=taker;a.isExactIn=true;a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;a.isAToB=true;a.deadline=uint40(block.timestamp+60);a.threshold=abi.encode(uint256(10));a.instructionsArgs=abi.encodePacked(uint8(1),i,j,uint8(16));return TakerTraitsLib.build(a);
    }
    function testSixPairsResolveBeforeAquaBalancesAndSettleOneOrder() public {
        bytes32 expected=keccak256(abi.encode(order));
        for(uint8 i;i<3;i++)for(uint8 j;j<3;j++)if(i!=j){
            uint256 beforeIn=assets[i].balanceOf(maker);uint256 beforeOut=assets[j].balanceOf(maker);
            vm.prank(taker);(uint256 amountIn,uint256 amountOut,bytes32 hash)=probe.swap(order,10,data(i,j));
            assertEq(hash,expected);assertEq(amountIn,10);assertEq(amountOut,10);
            assertEq(assets[i].balanceOf(maker),beforeIn+10);assertEq(assets[j].balanceOf(maker),beforeOut-10);
            assertEq(assets[i].balanceOf(address(probe)),0);assertEq(assets[j].balanceOf(address(probe)),0);
        }
        assertEq(probe.fills(),6);assertFalse(probe.guard());
    }
    function testQuoteIsStaticAndDoesNotRunMutationHooks() public {
        vm.prank(taker);(bool ok,bytes memory result)=address(probe).staticcall(abi.encodeCall(ISwapVM.quote,(order,10,data(2,0))));
        assertTrue(ok);(uint256 input,uint256 output,)=abi.decode(result,(uint256,uint256,bytes32));
        assertEq(input,10);assertEq(output,10);assertEq(probe.fills(),0);assertFalse(probe.guard());
    }
    function testSettlementFailureRollsBackExecutionGuard() public {
        vm.prank(maker);assets[2].approve(address(aqua),0);
        vm.expectRevert();vm.prank(taker);probe.swap(order,10,data(0,2));
        assertEq(probe.fills(),0);assertFalse(probe.guard());assertEq(assets[0].balanceOf(maker),1000);
    }
}
