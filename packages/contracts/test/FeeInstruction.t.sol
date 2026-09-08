// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraits,TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {Context,ContextLib,VM,SwapQuery,SwapRegisters,ProtocolFee} from "../vendor/swap-vm-orbital/src/libs/VM.sol";
import {FeeMetaLib,FeeReceiver,FeeReceiverLib} from "../vendor/swap-vm-orbital/src/libs/ProtocolFee.sol";
import {CalldataPtrLib} from "@1inch/solidity-utils/contracts/libraries/CalldataPtr.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStorage as S} from "../src/libraries/OrbitalStorage.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract FeeTestDollar is ERC20 {
    constructor() ERC20("Fee instruction test dollar","TEST"){}
    function decimals() public pure override returns(uint8){return 6;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
}
/// @dev Fee-dispatch probe only. Its net/2 output is deliberately NOT a curve.
/// Its failure-injection hook rejects swaps after upstream transfers.
contract FeeDispatchProbe is Router {
    using ContextLib for Context;
    using MakerTraitsLib for *;
    using TakerTraitsLib for TakerTraits;
    uint8 private immutable mode;
    constructor(address aqua,address[] memory tokens,uint8[] memory decimals_,uint8 mode_)
        Router(aqua,msg.sender,tokens,decimals_){mode=mode_;}
    function _executeCurve(Context memory ctx,bytes calldata) internal view override {
        if(mode!=2)ctx.tryChopTakerArgs(4);
        if(mode==1)--ctx.swap.amountIn;
        ctx.swap.amountOut=ctx.swap.amountIn/2;
        if(mode==3){
            ctx.fee.meta=FeeMetaLib.encode(true,1,0,0);
            ctx.fee.receivers=new FeeReceiver[](1);
            ctx.fee.receivers[0]=FeeReceiverLib.encode(address(0xDEAD),0,1_000_000);
        }
        if(mode==4)ctx.swap.amountOut=0;
    }
    function _afterSwap(Context memory,ISwapVM.Order calldata,TakerTraits,bytes calldata) internal pure override {
        revert EngineUnavailable();
    }
    /// @dev Unit harness bypasses transfers solely to observe instruction state.
    /// Never present on the production router or used by an application action.
    function instructionOnly(ISwapVM.Order calldata order,uint256 gross,bytes calldata data) external returns(uint256,uint256){
        _beforeQuote(order,gross,data);_enter();
        (TakerTraits traits,bytes calldata takerData)=TakerTraitsLib.parse(data);
        (address tokenIn,address tokenOut)=_resolveTokens(order,traits,takerData);
        Context memory ctx=Context({
            vm:VM({isStaticContext:false,nextPC:0,programPtr:CalldataPtrLib.from(order.traits.program(order.data)),takerArgsPtr:CalldataPtrLib.from(traits.instructionsArgs(takerData)),dispatch:_dispatch}),
            query:SwapQuery({orderHash:keccak256(abi.encode(order)),maker:order.maker,taker:msg.sender,tokenIn:tokenIn,tokenOut:tokenOut,isExactIn:true}),
            swap:SwapRegisters({balanceIn:0,balanceOut:0,amountIn:gross,amountOut:0}),
            fee:ProtocolFee({meta:FeeMetaLib.init(),receivers:FeeReceiverLib.init(),feeTotal:0})
        });
        (uint256 input,uint256 output)=ctx.runLoop();S.layout().entered=false;return(input,output);
    }
}

contract FeeInstructionTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;
    Aqua aqua;FeeDispatchProbe probe;FeeTestDollar[] assets;address[] tokens;uint8[] decimals_;
    address maker=address(0xA11CE);address taker=address(0xB0B);
    ISwapVM.Order order;bytes32 orderHash;
    function setUp() public {
        aqua=new Aqua();FeeTestDollar[] memory list=new FeeTestDollar[](3);
        for(uint256 i;i<3;i++)list[i]=new FeeTestDollar();
        for(uint256 i;i<3;i++)for(uint256 j=i+1;j<3;j++)if(address(list[i])>address(list[j]))(list[i],list[j])=(list[j],list[i]);
        for(uint256 i;i<3;i++){
            assets.push(list[i]);tokens.push(address(list[i]));decimals_.push(6);
            list[i].mint(maker,1e9);list[i].mint(taker,1e9);
            vm.prank(maker);list[i].approve(address(aqua),type(uint256).max);
        }
        publish(0);
    }
    function publish(uint8 mode) private {
        probe=new FeeDispatchProbe(address(aqua),tokens,decimals_,mode);probe.renounceOwnership();
        OrbitalConfigV1 memory c;
        c.schemaVersion=1;c.chainId=block.chainid;c.router=address(probe);c.maker=maker;
        c.tokens=tokens;c.decimals=decimals_;c.feePpm=500;
        c.tickKeys=new uint64[](3);c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;
        c.radiiInternal=new uint192[](3);uint256 virtualCredit;
        for(uint256 i;i<3;i++){
            c.radiiInternal[i]=uint192(3e18*U);
            virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);
        }
        uint256 x=W.mulDiv(9e18*U,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);
        c.initialAmountsRaw=new uint256[](3);
        for(uint256 i;i<3;i++)c.initialAmountsRaw[i]=(x-virtualCredit+1e12*U-1)/(1e12*U);
        MakerTraitsLib.Args memory a;a.maker=maker;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        bytes32 h=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",h,hex"5220",h);order=MakerTraitsLib.build(a);
        vm.prank(maker);orderHash=aqua.ship(address(probe),abi.encode(order),tokens,c.initialAmountsRaw);
        vm.prank(maker);probe.activateStrategy(c,order);
        for(uint256 i;i<3;i++){vm.prank(taker);assets[i].approve(address(probe),type(uint256).max);}
    }
    function data(uint8 input,uint8 output) private view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=taker;a.to=taker;a.isExactIn=true;a.isAToB=true;a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;
        a.deadline=uint40(block.timestamp+60);a.threshold=abi.encode(uint256(1));a.instructionsArgs=abi.encodePacked(uint8(1),input,output,uint8(16));return TakerTraitsLib.build(a);
    }
    function testFeeDenominatorCeilingAndZeroNet() public {
        (uint256 fee,uint256 net)=S.feeIn(10001,500);assertEq(fee,6);assertEq(net,9995);
        (fee,net)=S.feeIn(10000,100);assertEq(fee,1);assertEq(net,9999);
        (fee,net)=S.feeIn(1000001,1000);assertEq(fee,1001);assertEq(net,999000);
        vm.expectRevert(S.EmptyNetInput.selector);S.feeIn(0,500);
        vm.expectRevert(S.EmptyNetInput.selector);S.feeIn(1,500);
        vm.expectRevert(S.InvalidFee.selector);S.feeIn(1000,0);
        vm.expectRevert(S.InvalidFee.selector);S.feeIn(1000,1000000);
    }
    function testFuzzFeeCeilingHasExactWideInequalities(uint256 gross,uint8 profile) public pure {
        gross=bound(gross,2,type(uint256).max);uint24[3] memory rates=[uint24(100),uint24(500),uint24(1000)];uint24 rate=rates[profile%3];
        (uint256 fee,uint256 net)=S.feeIn(gross,rate);
        assertEq(net+fee,gross);assertGt(net,0);
        W.Uint512 memory cost=W.mul(gross,rate);assertTrue(W.lte(cost,W.mul(fee,1000000)));
        assertFalse(W.lte(cost,W.mul(fee-1,1000000)));
    }
    function testStaticQuoteRunsNetCurveAndRestoresGrossAcrossSixPairs() public {
        bytes32 beforeState=keccak256(abi.encode(probe.getStrategyState(orderHash)));
        for(uint8 i;i<3;i++)for(uint8 j;j<3;j++)if(i!=j){
            vm.prank(taker);(uint256 input,uint256 output,bytes32 h)=ISwapVM(address(probe)).quote(order,10001,data(i,j));
            assertEq(input,10001);assertEq(output,4997);assertEq(h,orderHash);
        }
        assertEq(keccak256(abi.encode(probe.getStrategyState(orderHash))),beforeState);
    }
    function testInstructionAccruesOnceOutsidePrincipal() public {
        uint256[] memory beforeX=probe.getStrategyState(orderHash).X;
        vm.prank(taker);(uint256 input,uint256 output)=probe.instructionOnly(order,10001,data(2,0));
        assertEq(input,10001);assertEq(output,4997);
        assertEq(probe.getStrategyState(orderHash).cumulativeFeeRaw[2],6);
        assertEq(probe.getStrategyState(orderHash).cumulativeFeeRaw[0],0);
        assertEq(probe.getStrategyState(orderHash).X,beforeX);
    }
    function testInjectedPostSettlementFailureRollsBackFeeAndTransfers() public {
        uint256 makerInput=assets[0].balanceOf(maker);uint256 takerInput=assets[0].balanceOf(taker);
        uint256 makerOutput=assets[1].balanceOf(maker);uint256 takerOutput=assets[1].balanceOf(taker);
        vm.expectRevert(Router.EngineUnavailable.selector);vm.prank(taker);probe.swap(order,10001,data(0,1));
        assertEq(probe.getStrategyState(orderHash).cumulativeFeeRaw[0],0);
        assertEq(assets[0].balanceOf(maker),makerInput);assertEq(assets[0].balanceOf(taker),takerInput);
        assertEq(assets[1].balanceOf(maker),makerOutput);assertEq(assets[1].balanceOf(taker),takerOutput);
        assertEq(assets[0].balanceOf(address(probe)),0);assertEq(assets[1].balanceOf(address(probe)),0);
    }
    function testPartialNetConsumptionAndUnconsumedArgumentsReject() public {
        publish(1);vm.expectRevert(Router.InvalidCurveResult.selector);vm.prank(taker);ISwapVM(address(probe)).quote(order,10001,data(0,1));
        publish(2);vm.expectRevert(Router.InvalidCurveResult.selector);vm.prank(taker);ISwapVM(address(probe)).quote(order,10001,data(0,1));
    }
    function testSurplusProtocolFeeWithZeroFeeTotalAndZeroOutputReject() public {
        publish(3);vm.expectRevert(Router.InvalidCurveResult.selector);vm.prank(taker);ISwapVM(address(probe)).quote(order,10001,data(0,1));
        publish(4);vm.expectRevert(Router.InvalidCurveResult.selector);vm.prank(taker);ISwapVM(address(probe)).quote(order,10001,data(0,1));
    }
}
