// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState,OrbitalTokenAvailability,OrbitalStrategyStatus} from "../src/interfaces/IOrbitalLifecycle.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

/// @dev Standard accounting with one explicitly controlled transfer failure.
/// No mint/burn occurs after the initial three-role funding.
contract StatefulDollar is ERC20 {
    uint8 private immutable precision;
    address public blockedRecipient;
    error RecipientBlocked(address recipient);
    constructor(uint8 d) ERC20("Stateful fixture dollar","SFD"){precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
    function setBlockedRecipient(address to) external {blockedRecipient=to;}
    function _update(address from,address to,uint256 amount) internal override {
        if(from!=address(0)&&to!=address(0)&&to==blockedRecipient&&amount!=0)revert RecipientBlocked(to);
        super._update(from,to,amount);
    }
}

/// @dev One successful real swap per invocation; no assume or ignored failure.
/// Pair and pre-action cycles give all-six-pair and all-mode coverage per run.
contract InteriorStatefulHandler is Test {
    uint256 constant U=1<<64;uint256 constant WHOLE=1e18*U;uint256 constant QMAX=1e12*U;
    uint256 constant RADIUS=700*WHOLE;
    bytes32 constant EXECUTED=keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");
    address constant MAKER=address(0xA11CE);address constant TAKER=address(0xB0B);
    address constant DONOR=address(0xD010);address constant RECIPIENT=address(0xCAFE);
    address immutable controller;
    Router public router;Aqua public aqua;StatefulDollar[] assets;address[] tokens;uint8[] precisions;
    ISwapVM.Order order;bytes32 public orderHash;bytes32 configHash;uint256 virtualCredit;
    uint256[3] public ghostX;uint256[3] public ghostFees;uint256[3] public ghostAllocation;uint256[3] public ghostSurplus;
    uint256[3] ghostMaker;uint256[3] ghostTaker;uint256[3] ghostDonor;uint256[3] ghostRecipient;uint256[3] ghostRouter;uint256[3] supply;
    uint256 public successfulSwaps;uint256 public successfulQuotes;uint256 public executionEvents;
    uint256 public failedTransfers;uint256 public routerDonations;uint256 public aquaDonations;uint256 public pairMask;
    uint256[6] public pairCalls;uint256[4] public modeCalls;bool public finished;
    struct ExecutionEvent {address recipient;uint8 input;uint8 output;uint256 gross;uint256 net;uint256 fee;uint256 amountOut;uint64 version;uint64[] keys;bool[] inward;}

    constructor(Router router_,Aqua aqua_,StatefulDollar[] memory assets_,ISwapVM.Order memory order_,bytes32 hash_){
        controller=msg.sender;router=router_;aqua=aqua_;order=order_;orderHash=hash_;
        OrbitalStrategyState memory state=router.getStrategyState(orderHash);virtualCredit=state.virtualInternal;configHash=state.configHash;
        for(uint8 i;i<3;i++){
            assets.push(assets_[i]);tokens.push(address(assets_[i]));precisions.push(assets_[i].decimals());
            ghostX[i]=state.X[i];ghostMaker[i]=assets_[i].balanceOf(MAKER);ghostTaker[i]=assets_[i].balanceOf(TAKER);ghostDonor[i]=assets_[i].balanceOf(DONOR);
            supply[i]=assets_[i].totalSupply();(uint248 allocation,)=aqua.rawBalances(MAKER,address(router),hash_,tokens[i]);
            ghostAllocation[i]=allocation;ghostSurplus[i]=uint256(allocation)*scale(i)-(state.X[i]-virtualCredit);
            assertGt(state.X[i],295*WHOLE);assertLt(state.X[i],296*WHOLE);
        }
        assertAccounting();
    }
    function scale(uint8 i) private view returns(uint256){return 10**(18-precisions[i])*U;}
    function data(uint8 i,uint8 j,address to,uint256 minimum) private view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=TAKER;a.to=to;a.isExactIn=true;a.isAToB=true;
        a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;
        a.deadline=uint40(block.timestamp+60);a.threshold=abi.encode(minimum);a.instructionsArgs=abi.encodePacked(uint8(1),i,j,uint8(0));return TakerTraitsLib.build(a);
    }
    function snapshot() private view returns(bytes32){
        bytes memory encoded=abi.encode(router.getStrategyState(orderHash),router.getStrategyAvailability(orderHash),router.nextMakerNonce(MAKER));
        for(uint8 i;i<3;i++){
            (uint248 allocation,uint8 live)=aqua.rawBalances(MAKER,address(router),orderHash,tokens[i]);
            encoded=bytes.concat(encoded,abi.encode(allocation,live,assets[i].totalSupply(),assets[i].balanceOf(MAKER),assets[i].balanceOf(TAKER),assets[i].balanceOf(DONOR),assets[i].balanceOf(RECIPIENT),assets[i].balanceOf(address(router)),assets[i].balanceOf(address(aqua)),
                assets[i].allowance(TAKER,address(router)),assets[i].allowance(MAKER,address(aqua)),assets[i].allowance(DONOR,address(aqua)),assets[i].allowance(address(router),address(aqua))));
        }
        return keccak256(encoded);
    }
    function quote(uint8 i,uint8 j,uint256 gross,address to) private returns(uint256 amountOut){
        bytes32 beforeState=snapshot();vm.recordLogs();vm.prank(TAKER);
        (uint256 spent,uint256 received,bytes32 h)=ISwapVM(address(router)).quote(order,gross,data(i,j,to,1));
        assertEq(vm.getRecordedLogs().length,0);assertEq(snapshot(),beforeState);assertEq(spent,gross);assertEq(h,orderHash);assertGt(received,0);
        ++successfulQuotes;return received;
    }
    function canonicalCount(Vm.Log[] memory logs) private view returns(uint256 count){
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(router)&&logs[i].topics.length!=0&&logs[i].topics[0]==EXECUTED)++count;
    }
    function assertExecution(Vm.Log[] memory logs,uint8 input,uint8 output,uint256 gross,uint256 fee,uint256 received,address to) private {
        assertEq(canonicalCount(logs),1);
        for(uint256 k;k<logs.length;k++)if(logs[k].emitter==address(router)&&logs[k].topics.length!=0&&logs[k].topics[0]==EXECUTED){
            Vm.Log memory entry=logs[k];assertEq(entry.topics.length,4);assertEq(entry.topics[1],bytes32(uint256(uint160(MAKER))));assertEq(entry.topics[2],orderHash);assertEq(entry.topics[3],bytes32(uint256(uint160(TAKER))));
            ExecutionEvent memory e=abi.decode(bytes.concat(abi.encode(uint256(32)),entry.data),(ExecutionEvent));
            assertEq(e.recipient,to);assertEq(e.input,input);assertEq(e.output,output);assertEq(e.gross,gross);assertEq(e.net,gross-fee);assertEq(e.fee,fee);assertEq(e.amountOut,received);assertEq(e.version,successfulSwaps+1);assertEq(e.keys.length,0);assertEq(e.inward.length,0);
        }
        ++executionEvents;
    }
    function step(uint32 rawSize,uint32 donationSize,uint8 choice) external {
        assertFalse(finished);assertLt(successfulSwaps,256);
        uint8 pair=uint8(successfulSwaps%6);uint8 input=pair/2;uint8 output=uint8((input+1+pair%2)%3);uint8 mode=uint8(successfulSwaps%4);
        uint256 gross=(1000+uint256(rawSize)%9001)*10**(precisions[input]-6);address to=choice&1==0?TAKER:RECIPIENT;
        uint256 expected=quote(input,output,gross,to);
        if(mode==1||mode==2){
            uint8 asset=uint8((choice/2)%3);uint256 amount=(1+uint256(donationSize)%1_000_000)*10**(precisions[asset]-6);
            if(mode==1){vm.prank(DONOR);assets[asset].transfer(address(router),amount);ghostRouter[asset]+=amount;++routerDonations;}
            else{vm.prank(DONOR);assets[asset].approve(address(aqua),amount);vm.prank(DONOR);aqua.push(MAKER,address(router),orderHash,tokens[asset],amount);
                ghostMaker[asset]+=amount;ghostAllocation[asset]+=amount;ghostSurplus[asset]+=amount*scale(asset);++aquaDonations;}
            ghostDonor[asset]-=amount;assertEq(quote(input,output,gross,to),expected);assertAccounting();
        }
        if(mode==3){
            bytes32 beforeState=snapshot();assets[output].setBlockedRecipient(to);vm.recordLogs();vm.prank(TAKER);
            (bool ok,bytes memory error)=address(router).call(abi.encodeCall(ISwapVM.swap,(order,gross,data(input,output,to,expected))));
            assertFalse(ok);assertEq(error,abi.encodeWithSelector(SafeERC20.SafeTransferFromFailed.selector));
            // The failure precedes the canonical event. recordLogs is not a
            // transaction-receipt proof and may include reverted token logs.
            assertEq(canonicalCount(vm.getRecordedLogs()),0);assertEq(snapshot(),beforeState);++failedTransfers;
            assets[output].setBlockedRecipient(address(0));assertEq(quote(input,output,gross,to),expected);assertAccounting();
        }
        uint256 fee=(gross+1999)/2000; // Exact ceil for this immutable500ppm fixture, independent of feeIn.
        vm.recordLogs();vm.prank(TAKER);(uint256 spent,uint256 received,bytes32 h)=router.swap(order,gross,data(input,output,to,expected));
        Vm.Log[] memory logs=vm.getRecordedLogs();assertEq(spent,gross);assertEq(received,expected);assertEq(h,orderHash);
        uint256 net=(gross-fee)*scale(input);assertLe(received*scale(output),2*net+2*QMAX);
        ghostX[input]+=net;ghostX[output]-=received*scale(output);ghostFees[input]+=fee;
        ghostAllocation[input]+=gross;ghostAllocation[output]-=received;
        ghostMaker[input]+=gross;ghostMaker[output]-=received;ghostTaker[input]-=gross;
        if(to==TAKER)ghostTaker[output]+=received;else ghostRecipient[output]+=received;
        ++successfulSwaps;++pairCalls[pair];++modeCalls[mode];pairMask|=uint256(1)<<pair;
        assertExecution(logs,input,output,gross,fee,received,to);assertAccounting();
    }
    function assertAccounting() public view {
        assertFalse(finished);OrbitalStrategyState memory state=router.getStrategyState(orderHash);
        OrbitalTokenAvailability[] memory availability=router.getStrategyAvailability(orderHash);
        assertEq(uint8(state.status),uint8(OrbitalStrategyStatus.Active));assertEq(state.version,successfulSwaps+1);assertEq(state.maker,MAKER);assertEq(state.configHash,configHash);assertEq(state.virtualInternal,virtualCredit);
        assertEq(router.nextMakerNonce(MAKER),1);assertEq(state.interiorTickMask,7);assertEq(state.interiorRadius,RADIUS);assertEq(state.boundarySumNumerator,0);assertEq(state.boundarySigmaLower,0);assertEq(state.boundarySigmaUpper,0);
        uint256 sum;W.Uint512 memory squares;W.Uint512 memory sphere;
        for(uint8 i;i<3;i++){
            uint256 s=scale(i);uint256 principal=ghostX[i]-virtualCredit;
            assertEq(state.X[i],ghostX[i]);assertEq(state.principalInternal[i],principal);assertEq(state.cumulativeFeeRaw[i],ghostFees[i]);
            assertGe(state.X[i],288*WHOLE);assertLe(state.X[i],300*WHOLE);sum+=ghostX[i];squares=W.add(squares,W.mul(ghostX[i],ghostX[i]));sphere=W.add(sphere,W.mul(RADIUS-ghostX[i],RADIUS-ghostX[i]));
            (uint248 allocation,uint8 count)=aqua.rawBalances(MAKER,address(router),orderHash,tokens[i]);assertEq(allocation,ghostAllocation[i]);assertEq(count,3);
            assertEq(uint256(allocation)*s,principal+ghostFees[i]*s+ghostSurplus[i]);
            assertEq(availability[i].token,tokens[i]);assertTrue(availability[i].live);assertTrue(availability[i].backingValid);assertEq(availability[i].surplusInternal.hi,0);assertEq(availability[i].surplusInternal.lo,ghostSurplus[i]);
            assertEq(availability[i].deficitInternal.hi,0);assertEq(availability[i].deficitInternal.lo,0);assertEq(availability[i].fundingCeilingRaw,principal/s);
            assertEq(assets[i].balanceOf(MAKER),ghostMaker[i]);assertEq(assets[i].balanceOf(TAKER),ghostTaker[i]);assertEq(assets[i].balanceOf(DONOR),ghostDonor[i]);assertEq(assets[i].balanceOf(RECIPIENT),ghostRecipient[i]);assertEq(assets[i].balanceOf(address(router)),ghostRouter[i]);assertEq(assets[i].balanceOf(address(aqua)),0);assertEq(assets[i].balanceOf(address(this)),0);
            assertEq(assets[i].totalSupply(),supply[i]);assertEq(ghostMaker[i]+ghostTaker[i]+ghostDonor[i]+ghostRecipient[i]+ghostRouter[i],supply[i]);
            assertEq(assets[i].allowance(address(router),address(aqua)),0);assertEq(assets[i].allowance(DONOR,address(aqua)),0);
            assertEq(assets[i].allowance(TAKER,address(router)),type(uint256).max);assertEq(assets[i].allowance(MAKER,address(aqua)),type(uint256).max);assertEq(assets[i].blockedRecipient(),address(0));
        }
        assertEq(sum,state.sumInternal);assertEq(squares.hi,state.sumSquaresInternal.hi);assertEq(squares.lo,state.sumSquaresInternal.lo);
        assertLt(sum,1050*WHOLE);assertTrue(W.lte(sphere,W.mul(RADIUS,RADIUS)));assertTrue(W.lte(W.mul(RADIUS-QMAX,RADIUS-QMAX),sphere));assertLe(state.slackBoundInternal,QMAX);assertEq(executionEvents,successfulSwaps);
    }
    function finish() external {
        assertEq(msg.sender,controller);assertAccounting();assertGe(successfulSwaps,12);assertEq(pairMask,63);
        for(uint256 i;i<6;i++)assertGe(pairCalls[i],successfulSwaps/6);
        assertEq(routerDonations,modeCalls[1]);assertEq(aquaDonations,modeCalls[2]);assertEq(failedTransfers,modeCalls[3]);
        assertGt(routerDonations,0);assertGt(aquaDonations,0);assertGt(failedTransfers,0);assertEq(successfulQuotes,successfulSwaps+routerDonations+aquaDonations+failedTransfers);
        bytes32 beforeConfig=keccak256(abi.encode(router.getStrategyConfig(orderHash)));OrbitalStrategyState memory beforeState=router.getStrategyState(orderHash);
        vm.prank(MAKER);router.retireStrategy(orderHash);vm.prank(MAKER);aqua.dock(address(router),orderHash,tokens);
        OrbitalStrategyState memory retired=router.getStrategyState(orderHash);assertEq(uint8(retired.status),uint8(OrbitalStrategyStatus.Retired));assertEq(retired.version,beforeState.version+1);
        retired.status=beforeState.status;retired.version=beforeState.version;assertEq(abi.encode(retired),abi.encode(beforeState));assertEq(keccak256(abi.encode(router.getStrategyConfig(orderHash))),beforeConfig);
        OrbitalTokenAvailability[] memory available=router.getStrategyAvailability(orderHash);
        for(uint8 i;i<3;i++){
            (uint248 allocation,uint8 count)=aqua.rawBalances(MAKER,address(router),orderHash,tokens[i]);assertEq(allocation,0);assertEq(count,255);assertFalse(available[i].live);assertEq(available[i].fundingCeilingRaw,0);
            assertEq(assets[i].balanceOf(MAKER),ghostMaker[i]);assertEq(assets[i].balanceOf(address(router)),ghostRouter[i]);assertEq(assets[i].balanceOf(address(aqua)),0);assertEq(assets[i].allowance(address(router),address(aqua)),0);
        }
        vm.expectRevert(Router.StrategyNotActive.selector);vm.prank(TAKER);ISwapVM(address(router)).quote(order,1000*10**(precisions[0]-6),data(0,1,TAKER,1));
        finished=true;
        emit log_named_uint("successful_swaps",successfulSwaps);emit log_named_uint("successful_quotes",successfulQuotes);emit log_named_uint("expected_failed_transfers",failedTransfers);
        emit log_named_uint("router_donations",routerDonations);emit log_named_uint("aqua_donations",aquaDonations);emit log_named_uint("unique_directed_pairs",6);
    }
}

contract InteriorStatefulInvariantTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;
    InteriorStatefulHandler handler;
    function setUp() public {
        Aqua aqua=new Aqua();StatefulDollar[] memory list=new StatefulDollar[](3);list[0]=new StatefulDollar(6);list[1]=new StatefulDollar(18);list[2]=new StatefulDollar(6);
        for(uint256 i;i<3;i++)for(uint256 j=i+1;j<3;j++)if(address(list[i])>address(list[j]))(list[i],list[j])=(list[j],list[i]);
        address[] memory tokens=new address[](3);uint8[] memory precision=new uint8[](3);
        for(uint256 i;i<3;i++){
            tokens[i]=address(list[i]);precision[i]=list[i].decimals();list[i].mint(address(0xA11CE),10000*10**precision[i]);list[i].mint(address(0xB0B),10000*10**precision[i]);list[i].mint(address(0xD010),10000*10**precision[i]);
            vm.prank(address(0xA11CE));list[i].approve(address(aqua),type(uint256).max);
        }
        Router router=new Router(address(aqua),address(this),tokens,precision);router.renounceOwnership();OrbitalConfigV1 memory c;
        c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=address(0xA11CE);c.tokens=tokens;c.decimals=precision;c.feePpm=500;
        c.tickKeys=new uint64[](3);c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;c.radiiInternal=new uint192[](3);
        uint256 virtualCredit;for(uint256 i;i<3;i++){c.radiiInternal[i]=uint192((100<<i)*1e18*U);virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);}
        uint256 x=W.mulDiv(700e18*U,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);c.initialAmountsRaw=new uint256[](3);
        for(uint256 i;i<3;i++){uint256 s=10**(18-precision[i])*U;c.initialAmountsRaw[i]=(x-virtualCredit+s-1)/s;}
        MakerTraitsLib.Args memory a;a.maker=c.maker;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;bytes32 h=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",h,hex"5220",h);ISwapVM.Order memory order=MakerTraitsLib.build(a);
        vm.prank(c.maker);bytes32 orderHash=aqua.ship(address(router),abi.encode(order),tokens,c.initialAmountsRaw);vm.prank(c.maker);router.activateStrategy(c,order);
        for(uint256 i;i<3;i++){vm.prank(address(0xB0B));list[i].approve(address(router),type(uint256).max);}
        handler=new InteriorStatefulHandler(router,aqua,list,order,orderHash);
        bytes4[] memory selectors=new bytes4[](1);selectors[0]=InteriorStatefulHandler.step.selector;
        targetSelector(FuzzSelector({addr:address(handler),selectors:selectors}));targetContract(address(handler));
    }
    /// forge-config: default.invariant.fail-on-revert = true
    /// forge-config: ci.invariant.fail-on-revert = true
    /// forge-config: release.invariant.fail-on-revert = true
    /// forge-config: default.invariant.call-override = false
    /// forge-config: ci.invariant.call-override = false
    /// forge-config: release.invariant.call-override = false
    function invariant_exactGhostAndPhysicalAccountingAfterEverySuccessfulStep() public view {handler.assertAccounting();}
    function afterInvariant() public {handler.finish();assertTrue(handler.finished());}
    function testDeterministicTwelveStepSequenceCoversAllPairsModesAndCloses() public {
        for(uint32 i;i<12;i++)handler.step(i*12345,i*54321,uint8(i));handler.finish();assertEq(handler.successfulSwaps(),12);assertEq(handler.successfulQuotes(),21);assertEq(handler.failedTransfers(),3);assertTrue(handler.finished());
    }
}
