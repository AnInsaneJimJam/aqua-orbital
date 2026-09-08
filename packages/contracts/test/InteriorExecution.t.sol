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
import {OrbitalPayments as Payments} from "../src/OrbitalPayments.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState} from "../src/interfaces/IOrbitalLifecycle.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract ExecutionDollar is ERC20 {
    uint8 private immutable precision;
    constructor(uint8 d) ERC20("Execution test dollar","TEST"){precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
}
/// @dev Actual production router, actual official Aqua, actual certified path.
/// These tests cover only all-interior execution, not the mixed traversal gate.
contract InteriorExecutionTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;
    Aqua aqua;Router router;ExecutionDollar[] assets;address[] tokens;uint8[] decimals_;
    address maker=address(0xA11CE);address taker=address(0xB0B);address recipient=address(0xCAFE);
    ISwapVM.Order order;bytes32 orderHash;
    bytes32 constant EXECUTED=keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");
    struct ExecutionEvent {
        address recipient;uint8 input;uint8 output;uint256 gross;uint256 net;
        uint256 fee;uint256 amountOut;uint64 version;uint64[] keys;bool[] inward;
    }
    function setUp() public {
        aqua=new Aqua();ExecutionDollar[] memory list=new ExecutionDollar[](3);
        list[0]=new ExecutionDollar(6);list[1]=new ExecutionDollar(18);list[2]=new ExecutionDollar(6);
        for(uint256 i;i<3;i++)for(uint256 j=i+1;j<3;j++)if(address(list[i])>address(list[j]))(list[i],list[j])=(list[j],list[i]);
        for(uint256 i;i<3;i++){
            assets.push(list[i]);tokens.push(address(list[i]));decimals_.push(list[i].decimals());
            list[i].mint(maker,10000*10**list[i].decimals());list[i].mint(taker,10000*10**list[i].decimals());
            vm.prank(maker);list[i].approve(address(aqua),type(uint256).max);
        }
        router=new Router(address(aqua),address(this),tokens,decimals_);router.renounceOwnership();
        OrbitalConfigV1 memory c;
        c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=maker;
        c.tokens=tokens;c.decimals=decimals_;c.feePpm=500;
        c.tickKeys=new uint64[](3);c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;
        c.radiiInternal=new uint192[](3);uint256 virtualCredit;
        for(uint256 i;i<3;i++){
            c.radiiInternal[i]=uint192((100<<i)*1e18*U);
            virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);
        }
        uint256 x=W.mulDiv(700e18*U,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);
        c.initialAmountsRaw=new uint256[](3);
        for(uint256 i;i<3;i++)c.initialAmountsRaw[i]=(x-virtualCredit+scale(uint8(i))-1)/scale(uint8(i));
        MakerTraitsLib.Args memory a;a.maker=maker;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        bytes32 h=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",h,hex"5220",h);order=MakerTraitsLib.build(a);
        vm.prank(maker);orderHash=aqua.ship(address(router),abi.encode(order),tokens,c.initialAmountsRaw);
        vm.prank(maker);router.activateStrategy(c,order);
        for(uint256 i;i<3;i++){vm.prank(taker);assets[i].approve(address(router),type(uint256).max);}
    }
    function scale(uint8 i) private view returns(uint256){return 10**(18-decimals_[i])*U;}
    function data(uint8 input,uint8 output,address to,uint256 minimum) private view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=taker;a.to=to;a.isExactIn=true;a.isAToB=true;a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;
        a.deadline=uint40(block.timestamp+60);a.threshold=abi.encode(minimum);a.instructionsArgs=abi.encodePacked(uint8(1),input,output,uint8(0));return TakerTraitsLib.build(a);
    }
    function quote(uint8 i,uint8 j,uint256 amount,address to) private returns(uint256 output){
        vm.prank(taker);(uint256 input,uint256 out,bytes32 h)=ISwapVM(address(router)).quote(order,amount,data(i,j,to,1));
        assertEq(input,amount);assertEq(h,orderHash);return out;
    }
    function testProductionStaticQuotesSixPairsMatchIndependentIntegerSphere() public {
        OrbitalStrategyState memory state=router.getStrategyState(orderHash);
        // Independent Python math.isqrt at the actual directed initial lattice
        // point, R=700 whole units, net=0.9995 whole units; exact square checks
        // in the sequential execution test separately verify maximal raw output.
        assertEq(state.X[0],5457557991956845750465862405150345463304);
        bytes32 beforeHash=keccak256(abi.encode(state));
        for(uint8 i;i<3;i++)for(uint8 j;j<3;j++)if(i!=j){
            uint256 result=quote(i,j,10**decimals_[i],taker);
            assertEq(result,decimals_[j]==6?997034:997034206127854582);
        }
        assertEq(keccak256(abi.encode(router.getStrategyState(orderHash))),beforeHash);
    }
    function testAllSixPairsMutateOneOrderAndSettleGrossNetFeeExactly() public {
        uint256 fills;
        for(uint8 i;i<3;i++)for(uint8 j;j<3;j++)if(i!=j){
            OrbitalStrategyState memory beforeState=router.getStrategyState(orderHash);
            uint256 gross=10**decimals_[i];uint256 fee=gross/2000;
            uint256 expected=quote(i,j,gross,taker);
            uint256 makerIn=assets[i].balanceOf(maker);uint256 makerOut=assets[j].balanceOf(maker);
            uint256 takerIn=assets[i].balanceOf(taker);uint256 takerOut=assets[j].balanceOf(taker);
            (uint248 allocationIn,)=aqua.rawBalances(maker,address(router),orderHash,tokens[i]);
            (uint248 allocationOut,)=aqua.rawBalances(maker,address(router),orderHash,tokens[j]);
            vm.prank(taker);(uint256 spent,uint256 received,bytes32 h)=router.swap(order,gross,data(i,j,taker,expected));
            assertEq(spent,gross);assertEq(received,expected);assertEq(h,orderHash);
            OrbitalStrategyState memory afterState=router.getStrategyState(orderHash);
            assertEq(afterState.version,++fills+1);assertEq(afterState.X[i],beforeState.X[i]+(gross-fee)*scale(i));
            assertEq(afterState.X[j],beforeState.X[j]-received*scale(j));
            assertEq(afterState.cumulativeFeeRaw[i],beforeState.cumulativeFeeRaw[i]+fee);
            assertEq(assets[i].balanceOf(maker),makerIn+gross);assertEq(assets[j].balanceOf(maker),makerOut-received);
            assertEq(assets[i].balanceOf(taker),takerIn-gross);assertEq(assets[j].balanceOf(taker),takerOut+received);
            (uint248 nowIn,)=aqua.rawBalances(maker,address(router),orderHash,tokens[i]);
            (uint248 nowOut,)=aqua.rawBalances(maker,address(router),orderHash,tokens[j]);
            assertEq(nowIn,uint256(allocationIn)+gross);assertEq(nowOut,uint256(allocationOut)-received);
            assertEq(assets[i].balanceOf(address(router)),0);assertEq(assets[j].balanceOf(address(router)),0);
            assertEq(assets[i].allowance(address(router),address(aqua)),0);
            assertEq(afterState.interiorTickMask,7);assertEq(afterState.boundarySumNumerator,0);
            uint256 sum;W.Uint512 memory squares;W.Uint512 memory deficits;
            for(uint8 k;k<3;k++){
                assertEq(afterState.principalInternal[k],afterState.X[k]-afterState.virtualInternal);
                if(k!=i&&k!=j)assertEq(afterState.X[k],beforeState.X[k]);
                sum+=afterState.X[k];squares=W.add(squares,W.mul(afterState.X[k],afterState.X[k]));
                uint256 d=afterState.interiorRadius-afterState.X[k];deficits=W.add(deficits,W.mul(d,d));
            }
            assertEq(afterState.sumInternal,sum);assertEq(afterState.sumSquaresInternal.hi,squares.hi);assertEq(afterState.sumSquaresInternal.lo,squares.lo);
            W.Uint512 memory r2=W.mul(afterState.interiorRadius,afterState.interiorRadius);
            assertTrue(W.lte(deficits,r2));
            uint256 outDeficit=afterState.interiorRadius-afterState.X[j];
            W.Uint512 memory extra=W.add(W.sub(deficits,W.mul(outDeficit,outDeficit)),W.mul(outDeficit+scale(j),outDeficit+scale(j)));
            assertFalse(W.lte(extra,r2));assertLe(afterState.slackBoundInternal,scale(j));
            for(uint8 k;k<3;k++)assertTrue(router.getStrategyAvailability(orderHash)[k].backingValid);
        }
        assertEq(fills,6);
    }
    function testRouterAndAquaDonationsDoNotChangeQuoteOrGetSpent() public {
        uint256 amount=10**decimals_[0];uint256 expected=quote(0,1,amount,recipient);
        assets[0].mint(address(router),77);assets[1].mint(address(router),99);
        vm.prank(taker);assets[2].approve(address(aqua),123);
        vm.prank(taker);aqua.push(maker,address(router),orderHash,tokens[2],123);
        assertEq(quote(0,1,amount,recipient),expected);
        vm.prank(taker);router.swap(order,amount,data(0,1,recipient,expected));
        assertEq(assets[0].balanceOf(address(router)),77);assertEq(assets[1].balanceOf(address(router)),99);
        assertEq(assets[1].balanceOf(recipient),expected);
    }
    function testCanonicalEventMatchesSettlementAndStaticQuoteHasNoLogs() public {
        uint256 gross=10**decimals_[0];
        vm.recordLogs();uint256 expected=quote(0,1,gross,recipient);
        assertEq(vm.getRecordedLogs().length,0);
        vm.recordLogs();vm.prank(taker);router.swap(order,gross,data(0,1,recipient,expected));
        Vm.Log[] memory logs=vm.getRecordedLogs();uint256 count;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(router)&&logs[i].topics[0]==EXECUTED){
            ++count;assertEq(logs[i].topics.length,4);
            assertEq(logs[i].topics[1],bytes32(uint256(uint160(maker))));assertEq(logs[i].topics[2],orderHash);
            assertEq(logs[i].topics[3],bytes32(uint256(uint160(taker))));
            // Event fields are a flat ABI tuple, so prepend the dynamic tuple
            // offset when decoding them as one Solidity struct.
            ExecutionEvent memory e=abi.decode(bytes.concat(abi.encode(uint256(32)),logs[i].data),(ExecutionEvent));
            assertEq(e.recipient,recipient);assertEq(e.input,0);assertEq(e.output,1);
            assertEq(e.gross,gross);assertEq(e.fee,gross/2000);assertEq(e.net,gross-e.fee);assertEq(e.amountOut,expected);
            assertEq(e.version,2);assertEq(e.keys.length,0);assertEq(e.inward.length,0);
        }
        assertEq(count,1);
    }
    function testFuzzTwoLegInteriorCycleCannotIncreaseStartingAsset(uint64 rawSize,uint8 pair) public {
        uint8 input=pair%3;uint8 output=(input+1+(pair/3)%2)%3;
        // Every generated trade stays well within this initial cap; rejection
        // is not discarded or counted as a successful economic-cycle check.
        uint256 microWhole=bound(uint256(rawSize),10_000,4_000_000);
        uint256 gross=microWhole*10**(decimals_[input]-6);
        uint256 beforeInput=assets[input].balanceOf(taker);uint256 beforeOutput=assets[output].balanceOf(taker);
        uint256 expected=quote(input,output,gross,taker);
        vm.prank(taker);router.swap(order,gross,data(input,output,taker,expected));
        uint256 reverse=quote(output,input,expected,taker);
        vm.prank(taker);router.swap(order,expected,data(output,input,taker,reverse));
        assertEq(assets[output].balanceOf(taker),beforeOutput);
        assertLe(assets[input].balanceOf(taker),beforeInput);
        assertEq(router.getStrategyState(orderHash).version,3);
    }
    function testThresholdAndOutputFundingFailuresRollbackThenRecover() public {
        uint256 amount=10**decimals_[0];uint256 expected=quote(0,1,amount,taker);
        bytes32 beforeState=keccak256(abi.encode(router.getStrategyState(orderHash)));
        uint256 takerInput=assets[0].balanceOf(taker);
        vm.expectRevert();vm.prank(taker);router.swap(order,amount,data(0,1,taker,expected+1));
        assertEq(keccak256(abi.encode(router.getStrategyState(orderHash))),beforeState);
        vm.prank(maker);assets[1].approve(address(aqua),expected-1);
        vm.expectRevert();vm.prank(taker);router.swap(order,amount,data(0,1,taker,expected));
        assertEq(keccak256(abi.encode(router.getStrategyState(orderHash))),beforeState);assertEq(assets[0].balanceOf(taker),takerInput);
        vm.prank(maker);assets[1].approve(address(aqua),expected);
        vm.prank(taker);router.swap(order,amount,data(0,1,taker,expected));
        assertEq(router.getStrategyState(orderHash).version,2);
    }
    function testRealCurveSwapFundsFiveDollarInvoiceWithNinetyTenSplit() public {
        uint8 output;while(decimals_[output]!=6)++output;uint8 input=output==0?1:0;
        Payments payments=new Payments(tokens[output],address(router),tokens);
        address[] memory recipients=new address[](2);recipients[0]=address(0xDAD);recipients[1]=address(0xF00D);
        uint16[] memory bps=new uint16[](2);bps[0]=9000;bps[1]=1000;
        bytes32 id=payments.createInvoice(5e6,uint40(block.timestamp+3600),recipients,bps,0);
        assets[output].mint(address(payments),77);assets[input].mint(address(payments),99);
        uint256 gross=6*10**decimals_[input];vm.prank(taker);assets[input].approve(address(payments),gross);
        uint256 usdcBefore=assets[output].balanceOf(taker);
        vm.prank(taker);payments.payWithSwap(id,order,input,gross,5e6,uint40(block.timestamp+60),0);
        Payments.Invoice memory inv=payments.getInvoice(id);
        assertEq(uint8(inv.status),uint8(Payments.Status.Paid));assertEq(inv.payer,taker);assertEq(inv.routeHash,orderHash);
        assertEq(inv.inputRaw,gross);assertGt(inv.refundRaw,0);assertEq(inv.receivedRaw,5e6+inv.refundRaw);
        assertEq(assets[output].balanceOf(recipients[0]),4_500_000);assertEq(assets[output].balanceOf(recipients[1]),500_000);
        assertEq(assets[output].balanceOf(taker),usdcBefore+inv.refundRaw);
        assertEq(assets[input].balanceOf(address(payments)),99);assertEq(assets[output].balanceOf(address(payments)),77);
        assertEq(assets[input].allowance(address(payments),address(router)),0);assertEq(router.getStrategyState(orderHash).version,2);
    }
}
