// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState} from "../src/interfaces/IOrbitalLifecycle.sol";
import {OrbitalSettlement as Settlement} from "../src/libraries/OrbitalSettlement.sol";
import {OrbitalStorage as S} from "../src/libraries/OrbitalStorage.sol";
import {OrbitalOrderCodec as Codec} from "../src/libraries/OrbitalOrderCodec.sol";
import {FrontierComposition as C} from "../src/libraries/FrontierComposition.sol";
import {FrontierEndpoint as E} from "../src/libraries/FrontierEndpoint.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract MixedDollar is ERC20 {
    uint8 private immutable precision;address public burnFrom;
    constructor(uint8 d) ERC20("Mixed execution test dollar","MIX"){precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
    function setBurnFrom(address who) external {burnFrom=who;}
    function _update(address from,address to,uint256 amount) internal override {
        if(from!=address(0)&&from==burnFrom&&to!=address(0)&&amount!=0){super._update(from,address(0),1);--amount;}
        super._update(from,to,amount);
    }
}

/// @dev Actual immutable 6/18/6 token deployments, activation, canonical VM and
/// official Aqua. No forced strategy state or injected numerical result.
contract MixedExecutionTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;
    uint256 constant INITIAL_X=5457557991956845750465862405150345463304;
    uint256 constant FIRST_GROSS=350000000;uint256 constant FIRST_OUT=164721797;
    uint256 constant SECOND_GROSS=500000000;uint256 constant SECOND_OUT=513016094;
    bytes32 constant EXECUTED=keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");
    Aqua aqua;Router router;MixedDollar[3] assets;address[] tokens;uint8[] precisions;
    address maker=address(0xA11CE);address taker=address(0xB0B);address recipient=address(0xCAFE);
    ISwapVM.Order order;bytes32 orderHash;
    struct ExecutionEvent {address recipient;uint8 input;uint8 output;uint256 gross;uint256 net;uint256 fee;uint256 amountOut;uint64 version;uint64[] keys;bool[] inward;}
    function setUp() public {
        aqua=new Aqua();MixedDollar a=new MixedDollar(6);MixedDollar b=new MixedDollar(6);
        (assets[0],assets[2])=address(a)<address(b)?(a,b):(b,a);
        bytes32 initHash=keccak256(abi.encodePacked(type(MixedDollar).creationCode,abi.encode(uint8(18))));bool found;
        // Bound deployment discovery; choose a real CREATE2 address between
        // the two immutable six-decimal tokens, so sorted decimals are fixed.
        for(uint256 salt;salt<4096;salt++){
            address predicted=address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),bytes32(salt),initHash)))));
            if(predicted>address(assets[0])&&predicted<address(assets[2])){assets[1]=new MixedDollar{salt:bytes32(salt)}(18);found=true;break;}
        }
        require(found,"bounded token deployment search");
        tokens=new address[](3);precisions=new uint8[](3);
        for(uint256 i;i<3;i++){tokens[i]=address(assets[i]);precisions[i]=assets[i].decimals();assets[i].mint(taker,10000*10**precisions[i]);}
        assertEq(precisions[0],6);assertEq(precisions[1],18);assertEq(precisions[2],6);
        router=new Router(address(aqua),address(this),tokens,precisions);router.renounceOwnership();
        (order,orderHash)=activate(maker);
        for(uint256 i;i<3;i++){vm.prank(taker);assets[i].approve(address(router),type(uint256).max);}
    }
    function scale(uint8 i) private view returns(uint256){return 10**(18-precisions[i])*U;}
    function activate(address who) private returns(ISwapVM.Order memory created,bytes32 h){
        OrbitalConfigV1 memory c;c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=who;
        c.tokens=tokens;c.decimals=precisions;c.feePpm=500;c.makerNonce=router.nextMakerNonce(who);
        c.tickKeys=new uint64[](3);c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;
        c.radiiInternal=new uint192[](3);uint256 virtualCredit;
        for(uint256 i;i<3;i++){c.radiiInternal[i]=uint192((100<<i)*1e18*U);virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);}
        uint256 initial=W.mulDiv(700e18*U,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);assertEq(initial,INITIAL_X);
        c.initialAmountsRaw=new uint256[](3);
        for(uint8 i;i<3;i++){
            c.initialAmountsRaw[i]=(initial-virtualCredit+scale(i)-1)/scale(i);
            assets[i].mint(who,10000*10**precisions[i]);vm.prank(who);assets[i].approve(address(aqua),type(uint256).max);
        }
        MakerTraitsLib.Args memory a;a.maker=who;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        bytes32 configHash=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",configHash,hex"5220",configHash);created=MakerTraitsLib.build(a);
        vm.prank(who);h=aqua.ship(address(router),abi.encode(created),tokens,c.initialAmountsRaw);
        vm.prank(who);router.activateStrategy(c,created);
    }
    function data(uint8 input,uint8 output,uint8 maxCrossings,uint256 minimum) private view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=taker;a.to=recipient;a.isExactIn=true;a.isAToB=true;a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;
        a.deadline=uint40(block.timestamp+60);a.threshold=abi.encode(minimum);a.instructionsArgs=abi.encodePacked(uint8(1),input,output,maxCrossings);return TakerTraitsLib.build(a);
    }
    function quote(ISwapVM.Order memory selected,uint8 input,uint8 output,uint256 gross,uint8 limit) private returns(uint256 out){
        vm.prank(taker);(bool ok,bytes memory result)=address(router).staticcall(abi.encodeCall(ISwapVM.quote,(selected,gross,data(input,output,limit,1))));
        if(!ok)assembly("memory-safe"){revert(add(result,32),mload(result))}
        (uint256 amount,uint256 paid,bytes32 h)=abi.decode(result,(uint256,uint256,bytes32));assertEq(amount,gross);assertEq(h,keccak256(abi.encode(selected)));return paid;
    }
    function eventFor(Vm.Log[] memory logs,bytes32 h,uint8 count,bool firstInward) private view returns(ExecutionEvent memory e){
        uint256 found;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(router)&&logs[i].topics[0]==EXECUTED){
            ++found;assertEq(logs[i].topics[2],h);assertEq(logs[i].topics[3],bytes32(uint256(uint160(taker))));
            e=abi.decode(bytes.concat(abi.encode(uint256(32)),logs[i].data),(ExecutionEvent));
            assertEq(e.keys.length,count);assertEq(e.inward.length,count);assertEq(e.recipient,recipient);
            for(uint256 j;j<count;j++){assertEq(e.keys[j],3*GRID/2);assertEq(e.inward[j],j==0&&firstInward);}
        }
        assertEq(found,1);
    }
    function fill(ISwapVM.Order memory selected,uint8 input,uint8 output,uint256 gross,uint8 limit,uint256 expected) private returns(ExecutionEvent memory e){
        uint256[7] memory beforeBalances=[assets[input].balanceOf(selected.maker),assets[output].balanceOf(selected.maker),assets[input].balanceOf(taker),assets[output].balanceOf(recipient),uint256(0),uint256(0),assets[output].balanceOf(taker)];
        (uint248 allocationIn,)=aqua.rawBalances(selected.maker,address(router),keccak256(abi.encode(selected)),tokens[input]);
        (uint248 allocationOut,)=aqua.rawBalances(selected.maker,address(router),keccak256(abi.encode(selected)),tokens[output]);
        beforeBalances[4]=allocationIn;beforeBalances[5]=allocationOut;
        vm.recordLogs();vm.prank(taker);(uint256 spent,uint256 paid,bytes32 h)=router.swap(selected,gross,data(input,output,limit,expected));
        assertEq(spent,gross);assertEq(paid,expected);assertEq(h,keccak256(abi.encode(selected)));
        e=eventFor(vm.getRecordedLogs(),h,limit,limit==2);assertEq(e.input,input);assertEq(e.output,output);assertEq(e.gross,gross);
        assertEq(e.net,gross-gross/2000);assertEq(e.fee,gross/2000);assertEq(e.amountOut,expected);
        assertEq(assets[input].balanceOf(selected.maker),beforeBalances[0]+gross);assertEq(assets[output].balanceOf(selected.maker),beforeBalances[1]-paid);
        assertEq(assets[input].balanceOf(taker),beforeBalances[2]-gross);assertEq(assets[output].balanceOf(recipient),beforeBalances[3]+paid);
        assertEq(assets[output].balanceOf(taker),beforeBalances[6]);
        (allocationIn,)=aqua.rawBalances(selected.maker,address(router),h,tokens[input]);(allocationOut,)=aqua.rawBalances(selected.maker,address(router),h,tokens[output]);
        assertEq(uint256(allocationIn),beforeBalances[4]+gross);assertEq(uint256(allocationOut),beforeBalances[5]-paid);
        assertNoPending();
    }
    function assertNoPending() private view {
        // Read-only layout assertion: appended pending struct begins after the
        // two mappings and guard. No test writes any Router storage slot.
        uint256 slot=uint256(keccak256("orbital.router.storage.v1"))-1;
        for(uint256 i=2;i<7;i++)assertEq(vm.load(address(router),bytes32(slot+i)),bytes32(0));
        assertEq(vm.load(address(router),keccak256(abi.encode(slot+5))),bytes32(0));
        assertEq(vm.load(address(router),keccak256(abi.encode(slot+6))),bytes32(0));
    }
    function assertMetadata(bytes32 h,uint64 version,uint256 fee0,uint256 fee2) private view {
        OrbitalStrategyState memory state=router.getStrategyState(h);assertEq(state.version,version);
        assertEq(state.interiorRadius,600e18*U);assertEq(state.boundarySumNumerator,150e18*U*GRID);
        assertEq(state.boundarySigmaLower,50e18*U);assertEq(state.boundarySigmaUpper,50e18*U);assertEq(state.interiorTickMask,6);
        assertEq(state.cumulativeFeeRaw[0],fee0);assertEq(state.cumulativeFeeRaw[1],0);assertEq(state.cumulativeFeeRaw[2],fee2);
        uint256 sum;W.Uint512 memory squares;
        for(uint8 i;i<3;i++){
            assertEq(state.principalInternal[i],state.X[i]-state.virtualInternal);sum+=state.X[i];squares=W.add(squares,W.mul(state.X[i],state.X[i]));
            assertTrue(router.getStrategyAvailability(h)[i].backingValid);assertEq(assets[i].balanceOf(address(router)),0);assertEq(assets[i].allowance(address(router),address(aqua)),0);
        }
        assertEq(state.sumInternal,sum);assertEq(state.sumSquaresInternal.hi,squares.hi);assertEq(state.sumSquaresInternal.lo,squares.lo);
        assertLe(state.slackBoundInternal,1e12*U);
    }
    function digest() private view returns(bytes32){
        bytes memory values=abi.encode(router.getStrategyState(orderHash));
        for(uint8 i;i<3;i++){
            (uint248 allocation,uint8 live)=aqua.rawBalances(maker,address(router),orderHash,tokens[i]);
            values=bytes.concat(values,abi.encode(allocation,live,assets[i].balanceOf(maker),assets[i].balanceOf(taker),assets[i].balanceOf(recipient),assets[i].balanceOf(address(router)),assets[i].allowance(address(router),address(aqua))));
        }
        return keccak256(values);
    }
    function testInitializedOutwardThenActualReverseSettleIndependentRawOutputs() public {
        fill(order,0,2,FIRST_GROSS,1,FIRST_OUT);assertMetadata(orderHash,2,175000,0);
        OrbitalStrategyState memory state=router.getStrategyState(orderHash);
        assertEq(state.X[0],INITIAL_X+349825000*scale(0));assertEq(state.X[2],INITIAL_X-FIRST_OUT*scale(2));assertEq(state.X[1],INITIAL_X);
        fill(order,2,0,SECOND_GROSS,2,SECOND_OUT);assertMetadata(orderHash,3,175000,250000);
        state=router.getStrategyState(orderHash);assertEq(state.X[0],INITIAL_X+349825000*scale(0)-SECOND_OUT*scale(0));
        assertEq(state.X[2],INITIAL_X-FIRST_OUT*scale(2)+499750000*scale(2));assertEq(state.X[1],INITIAL_X);
        assertEq(assets[0].balanceOf(recipient),SECOND_OUT);assertEq(assets[2].balanceOf(recipient),FIRST_OUT);
    }
    function testStaticMixedQuotesDoNotWriteStateOrEmitCrossings() public {
        bytes32 initial=digest();vm.recordLogs();assertEq(quote(order,0,2,FIRST_GROSS,1),FIRST_OUT);assertEq(vm.getRecordedLogs().length,0);assertEq(digest(),initial);
        fill(order,0,2,FIRST_GROSS,1,FIRST_OUT);bytes32 first=digest();vm.recordLogs();assertEq(quote(order,2,0,SECOND_GROSS,2),SECOND_OUT);
        assertEq(vm.getRecordedLogs().length,0);assertEq(digest(),first);
    }
    function testCrossingBudgetFailureRollsBackThenRecovers() public {
        bytes32 initial=digest();vm.expectRevert();vm.prank(taker);router.swap(order,FIRST_GROSS,data(0,2,0,1));assertEq(digest(),initial);
        fill(order,0,2,FIRST_GROSS,1,FIRST_OUT);bytes32 first=digest();
        vm.expectRevert();vm.prank(taker);router.swap(order,SECOND_GROSS,data(2,0,1,1));assertEq(digest(),first);
        fill(order,2,0,SECOND_GROSS,2,SECOND_OUT);assertMetadata(orderHash,3,175000,250000);
    }
    function testPostTransferSettlementFailureRollsBackFeesPrincipalAndEventsThenRecovers() public {
        bytes32 beforeState=digest();assets[2].setBurnFrom(maker);
        vm.recordLogs();
        vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector,tokens[2],recipient));
        vm.prank(taker);router.swap(order,FIRST_GROSS,data(0,2,1,FIRST_OUT));
        Vm.Log[] memory failedLogs=vm.getRecordedLogs();
        for(uint256 i;i<failedLogs.length;i++)if(failedLogs[i].emitter==address(router))assertTrue(failedLogs[i].topics[0]!=EXECUTED);
        assertEq(digest(),beforeState);assertNoPending();assets[2].setBurnFrom(address(0));
        (ISwapVM.Order memory other,)=activate(address(0xD1FF));
        fill(other,0,2,1e6,0,997034);
        fill(order,0,2,FIRST_GROSS,1,FIRST_OUT);assertMetadata(orderHash,2,175000,0);
    }
    function testCrossingRecordsCannotLeakBetweenMakersOrInteriorFills() public {
        (ISwapVM.Order memory other,bytes32 otherHash)=activate(address(0xDECADE));
        fill(order,0,2,FIRST_GROSS,1,FIRST_OUT);
        assertEq(quote(other,0,2,1e6,0),997034);ExecutionEvent memory e=fill(other,0,2,1e6,0,997034);assertEq(e.version,2);
        fill(order,2,0,SECOND_GROSS,2,SECOND_OUT);uint256 out=quote(other,0,2,1e6,0);e=fill(other,0,2,1e6,0,out);assertEq(e.version,3);
        assertMetadata(orderHash,3,175000,250000);assertEq(router.getStrategyState(otherHash).interiorTickMask,7);
    }
    function testCompleteMixedSwapGasAndLinkedRuntimeSizes() public {
        coolGraph();
        bytes memory first=data(0,2,1,FIRST_OUT);vm.prank(taker);uint256 before=gasleft();router.swap(order,FIRST_GROSS,first);uint256 gas1=before-gasleft();
        coolGraph();
        bytes memory second=data(2,0,2,SECOND_OUT);vm.prank(taker);before=gasleft();router.swap(order,SECOND_GROSS,second);uint256 gas2=before-gasleft();
        assertMetadata(orderHash,3,175000,250000);
        emit log_named_uint("first_complete_external_swap_gas",gas1);emit log_named_uint("second_complete_external_swap_gas",gas2);
        address[5] memory graph=[address(router),address(S),address(Settlement),address(C),address(E)];
        for(uint256 i;i<graph.length;i++){assertGt(graph[i].code.length,0);assertLe(graph[i].code.length,24576);emit log_named_uint("runtime_bytes",graph[i].code.length);}
    }
    function coolGraph() private {
        // Foundry cool resets both account and all its storage warmth. Values
        // remain the actual preceding fill's state. Include tokens and Aqua.
        vm.cool(address(router));vm.cool(address(S));vm.cool(address(Settlement));vm.cool(address(C));vm.cool(address(E));vm.cool(address(Codec));
        vm.cool(address(aqua));for(uint256 i;i<3;i++)vm.cool(address(assets[i]));
    }
}
