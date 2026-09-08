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

/// @dev Local adversarial fixture only; never a deployed product token.
contract MixedInvoiceDollar is ERC20 {
    uint8 private immutable precision;
    address public rejectedRecipient;
    error RecipientRejected();
    constructor(uint8 d) ERC20("Mixed invoice fixture dollar","MIV"){precision=d;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
    function setRejectedRecipient(address who) external {rejectedRecipient=who;}
    function _update(address from,address to,uint256 amount) internal override {
        if(from!=address(0)&&to!=address(0)&&amount!=0&&to==rejectedRecipient)revert RecipientRejected();
        super._update(from,to,amount);
    }
}

/// @dev Real deployments fix sorted metadata to 6/18/6. Shared by the Foundry
/// and separately mined receipt tests; no forced account code or storage.
contract MixedInvoiceAssets {
    MixedInvoiceDollar[3] public assets;
    constructor(){
        MixedInvoiceDollar a=new MixedInvoiceDollar(6);MixedInvoiceDollar b=new MixedInvoiceDollar(6);
        (assets[0],assets[2])=address(a)<address(b)?(a,b):(b,a);
        bytes32 initHash=keccak256(abi.encodePacked(type(MixedInvoiceDollar).creationCode,abi.encode(uint8(18))));bool found;
        for(uint256 salt;salt<4096;salt++){
            address predicted=address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),bytes32(salt),initHash)))));
            if(predicted>address(assets[0])&&predicted<address(assets[2])){assets[1]=new MixedInvoiceDollar{salt:bytes32(salt)}(18);found=true;break;}
        }
        require(found,"bounded token deployment search");
    }
}

/// @dev Numerical constants bind to reachable-traversal.json's actual initial
/// state and first swap. The evidence runner checks that binding before Forge.
contract MixedInvoiceTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;
    uint256 constant INITIAL_X=5457557991956845750465862405150345463304;
    uint256 constant INITIAL_6=283051807;uint256 constant INITIAL_18=283051806999069402132;
    uint256 constant GROSS=350000000;uint256 constant FEE=175000;uint256 constant OUTPUT=164721797;
    uint256 constant DUE=150000000;uint256 constant REFUND=14721797;
    bytes32 constant EXECUTED=keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");
    bytes32 constant PAID=keccak256("InvoicePaid(bytes32,address,address,address,uint256,uint256,uint256,bytes32)");
    address constant MAKER=address(0xA11CE);address constant PAYER=address(0xB0B);
    address constant MERCHANT=address(0xC0FFEE);address constant FIRST=address(0xCAFE);address constant SECOND=address(0xFEE);
    Aqua aqua;Router router;Payments payments;MixedInvoiceDollar[3] assets;address[] tokens;uint8[] precisions;
    ISwapVM.Order order;bytes32 orderHash;bytes32 invoiceId;uint256[] initialAmounts;
    struct ExecutionEvent {address recipient;uint8 input;uint8 output;uint256 gross;uint256 net;uint256 fee;uint256 amountOut;uint64 version;uint64[] keys;bool[] inward;}
    function setUp() public {
        aqua=new Aqua();MixedInvoiceAssets factory=new MixedInvoiceAssets();tokens=new address[](3);precisions=new uint8[](3);
        for(uint8 i;i<3;i++){
            assets[i]=factory.assets(i);tokens[i]=address(assets[i]);precisions[i]=assets[i].decimals();
            assets[i].mint(MAKER,10000*10**precisions[i]);assets[i].mint(PAYER,10000*10**precisions[i]);
            vm.prank(MAKER);assets[i].approve(address(aqua),type(uint256).max);
        }
        assertEq(precisions[0],6);assertEq(precisions[1],18);assertEq(precisions[2],6);
        router=new Router(address(aqua),address(this),tokens,precisions);router.renounceOwnership();
        activate();payments=new Payments(tokens[2],address(router),tokens);
        address[] memory recipients=new address[](2);recipients[0]=FIRST;recipients[1]=SECOND;
        uint16[] memory bps=new uint16[](2);bps[0]=9000;bps[1]=1000;
        vm.prank(MERCHANT);invoiceId=payments.createInvoice(DUE,uint40(block.timestamp+1 hours),recipients,bps,bytes32(0));
        assets[0].mint(address(payments),99);assets[2].mint(address(payments),77);
        vm.prank(PAYER);assets[0].approve(address(payments),GROSS);
    }
    function scale(uint8 i) private view returns(uint256){return 10**(18-precisions[i])*U;}
    function activate() private {
        OrbitalConfigV1 memory c;c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=MAKER;
        c.tokens=tokens;c.decimals=precisions;c.feePpm=500;c.tickKeys=new uint64[](3);
        c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;
        c.radiiInternal=new uint192[](3);uint256 virtualCredit;
        for(uint256 i;i<3;i++){c.radiiInternal[i]=uint192((100<<i)*1e18*U);virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);}
        uint256 initial=W.mulDiv(700e18*U,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);assertEq(initial,INITIAL_X);
        c.initialAmountsRaw=new uint256[](3);
        for(uint8 i;i<3;i++)c.initialAmountsRaw[i]=(initial-virtualCredit+scale(i)-1)/scale(i);
        assertEq(c.initialAmountsRaw[0],INITIAL_6);assertEq(c.initialAmountsRaw[1],INITIAL_18);assertEq(c.initialAmountsRaw[2],INITIAL_6);initialAmounts=c.initialAmountsRaw;
        MakerTraitsLib.Args memory a;a.maker=MAKER;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        bytes32 hash=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",hash,hex"5220",hash);order=MakerTraitsLib.build(a);
        vm.prank(MAKER);orderHash=aqua.ship(address(router),abi.encode(order),tokens,c.initialAmountsRaw);
        vm.prank(MAKER);router.activateStrategy(c,order);
        assertEq(orderHash,keccak256(abi.encode(order)));assertEq(router.getStrategyState(orderHash).version,1);
    }
    function quote() private returns(uint256 out){
        TakerTraitsLib.Args memory a;a.taker=address(payments);a.to=address(payments);a.isExactIn=true;a.isAToB=true;
        a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;a.deadline=uint40(block.timestamp+60);
        a.threshold=abi.encode(DUE);a.instructionsArgs=abi.encodePacked(uint8(1),uint8(0),uint8(2),uint8(1));
        vm.prank(address(payments));(bool ok,bytes memory result)=address(router).staticcall(abi.encodeCall(ISwapVM.quote,(order,GROSS,TakerTraitsLib.build(a))));
        if(!ok)assembly("memory-safe"){revert(add(result,32),mload(result))}
        (uint256 gross,uint256 paid,bytes32 h)=abi.decode(result,(uint256,uint256,bytes32));assertEq(gross,GROSS);assertEq(h,orderHash);return paid;
    }
    function pay() private {vm.prank(PAYER);payments.payWithSwap(invoiceId,order,0,GROSS,DUE,uint40(block.timestamp+60),1);}
    function digest() private view returns(bytes32){
        bytes memory values=abi.encode(router.getStrategyState(orderHash),router.getStrategyAvailability(orderHash),router.nextMakerNonce(MAKER),payments.getInvoice(invoiceId),payments.nextMerchantNonce(MERCHANT));
        address[8] memory roles=[MAKER,PAYER,MERCHANT,FIRST,SECOND,address(payments),address(router),address(aqua)];
        for(uint8 i;i<3;i++){
            (uint248 allocation,uint8 live)=aqua.rawBalances(MAKER,address(router),orderHash,tokens[i]);
            values=bytes.concat(values,abi.encode(allocation,live,assets[i].totalSupply(),assets[i].allowance(MAKER,address(aqua)),assets[i].allowance(PAYER,address(payments)),assets[i].allowance(address(payments),address(router)),assets[i].allowance(address(router),address(aqua))));
            for(uint256 j;j<roles.length;j++)values=bytes.concat(values,abi.encode(assets[i].balanceOf(roles[j])));
        }
        return keccak256(values);
    }
    function checkEvents(Vm.Log[] memory logs) private view {
        uint256 swaps;uint256 invoices;uint256 swapIndex;uint256 paidIndex;
        for(uint256 i;i<logs.length;i++){
            if(logs[i].emitter==address(router)&&logs[i].topics[0]==EXECUTED){
                swaps++;swapIndex=i;assertEq(logs[i].topics.length,4);assertEq(logs[i].topics[1],bytes32(uint256(uint160(MAKER))));
                assertEq(logs[i].topics[2],orderHash);assertEq(logs[i].topics[3],bytes32(uint256(uint160(address(payments)))));
                ExecutionEvent memory e=abi.decode(bytes.concat(abi.encode(uint256(32)),logs[i].data),(ExecutionEvent));
                assertEq(e.recipient,address(payments));assertEq(e.input,0);assertEq(e.output,2);assertEq(e.gross,GROSS);assertEq(e.net,GROSS-FEE);
                assertEq(e.fee,FEE);assertEq(e.amountOut,OUTPUT);assertEq(e.version,2);assertEq(e.keys.length,1);assertEq(e.inward.length,1);assertEq(e.keys[0],3*GRID/2);assertFalse(e.inward[0]);
            }
            if(logs[i].emitter==address(payments)&&logs[i].topics[0]==PAID){
                invoices++;paidIndex=i;assertEq(logs[i].topics.length,4);assertEq(logs[i].topics[1],invoiceId);
                assertEq(logs[i].topics[2],bytes32(uint256(uint160(MERCHANT))));assertEq(logs[i].topics[3],bytes32(uint256(uint160(PAYER))));
                (address token,uint256 input,uint256 received,uint256 refund,bytes32 h)=abi.decode(logs[i].data,(address,uint256,uint256,uint256,bytes32));
                assertEq(token,tokens[0]);assertEq(input,GROSS);assertEq(received,OUTPUT);assertEq(refund,REFUND);assertEq(h,orderHash);
            }
        }
        assertEq(swaps,1);assertEq(invoices,1);assertLt(swapIndex,paidIndex);
    }
    function checkSuccess() private view {
        OrbitalStrategyState memory state=router.getStrategyState(orderHash);assertEq(state.version,2);
        assertEq(state.X[0],INITIAL_X+(GROSS-FEE)*scale(0));assertEq(state.X[1],INITIAL_X);assertEq(state.X[2],INITIAL_X-OUTPUT*scale(2));
        assertEq(state.interiorRadius,600e18*U);assertEq(state.boundarySumNumerator,150e18*U*GRID);
        assertEq(state.boundarySigmaLower,50e18*U);assertEq(state.boundarySigmaUpper,50e18*U);assertEq(state.interiorTickMask,6);assertLe(state.slackBoundInternal,1e12*U);
        uint256 sum;W.Uint512 memory squares;
        for(uint8 i;i<3;i++){
            uint256 fund=10000*10**precisions[i];uint256 makerBalance=fund+(i==0?GROSS:0)-(i==2?OUTPUT:0);
            assertEq(assets[i].balanceOf(MAKER),makerBalance);assertEq(assets[i].balanceOf(PAYER),fund-(i==0?GROSS:0)+(i==2?REFUND:0));
            assertEq(assets[i].balanceOf(FIRST),i==2?135000000:0);assertEq(assets[i].balanceOf(SECOND),i==2?15000000:0);assertEq(assets[i].balanceOf(MERCHANT),0);
            uint256 donation=i==0?99:i==2?77:0;assertEq(assets[i].balanceOf(address(payments)),donation);assertEq(assets[i].totalSupply(),2*fund+donation);
            assertEq(assets[i].balanceOf(address(router)),0);assertEq(assets[i].balanceOf(address(aqua)),0);
            assertEq(assets[i].allowance(PAYER,address(payments)),0);assertEq(assets[i].allowance(address(payments),address(router)),0);
            assertEq(assets[i].allowance(address(router),address(aqua)),0);assertEq(assets[i].allowance(MAKER,address(aqua)),type(uint256).max);
            (uint248 allocation,uint8 live)=aqua.rawBalances(MAKER,address(router),orderHash,tokens[i]);assertEq(live,3);
            assertEq(uint256(allocation),initialAmounts[i]+(i==0?GROSS:0)-(i==2?OUTPUT:0));assertTrue(router.getStrategyAvailability(orderHash)[i].backingValid);
            assertEq(state.cumulativeFeeRaw[i],i==0?FEE:0);assertEq(state.principalInternal[i],state.X[i]-state.virtualInternal);
            sum+=state.X[i];squares=W.add(squares,W.mul(state.X[i],state.X[i]));
        }
        assertEq(state.sumInternal,sum);assertEq(state.sumSquaresInternal.hi,squares.hi);assertEq(state.sumSquaresInternal.lo,squares.lo);
        Payments.Invoice memory invoice=payments.getInvoice(invoiceId);assertEq(uint8(invoice.status),uint8(Payments.Status.Paid));
        assertEq(invoice.merchant,MERCHANT);assertEq(invoice.payer,PAYER);assertEq(invoice.inputRaw,GROSS);assertEq(invoice.receivedRaw,OUTPUT);assertEq(invoice.refundRaw,REFUND);assertEq(invoice.routeHash,orderHash);
        assertEq(payments.nextMerchantNonce(MERCHANT),1);assertEq(router.nextMakerNonce(MAKER),1);checkPendingClear();
    }
    function checkPendingClear() private view {
        uint256 slot=uint256(keccak256("orbital.router.storage.v1"))-1;
        for(uint256 i=2;i<7;i++)assertEq(vm.load(address(router),bytes32(slot+i)),bytes32(0));
        assertEq(vm.load(address(router),keccak256(abi.encode(slot+5))),bytes32(0));assertEq(vm.load(address(router),keccak256(abi.encode(slot+6))),bytes32(0));
    }
    function testMixedSwapPaysInvoiceAndPreservesDonationsAndApprovals() public {
        bytes32 beforeState=digest();assertEq(quote(),OUTPUT);assertEq(digest(),beforeState);
        vm.recordLogs();pay();checkEvents(vm.getRecordedLogs());checkSuccess();
        bytes32 paidState=digest();vm.expectRevert(Payments.NotPayable.selector);pay();assertEq(digest(),paidState);
    }
    function testSecondRecipientFailureRollsBackRealMixedCurveThenRecovers() public {
        assets[2].setRejectedRecipient(SECOND);bytes32 beforeState=digest();
        vm.expectRevert(MixedInvoiceDollar.RecipientRejected.selector);pay();assertEq(digest(),beforeState);checkPendingClear();
        assertEq(uint8(payments.getInvoice(invoiceId).status),uint8(Payments.Status.Unpaid));assertEq(router.getStrategyState(orderHash).version,1);
        // recordLogs observes reverted subcalls; the separate Anvil companion
        // asserts genuine mined status=0 and logs=[] for this exact failure.
        assets[2].setRejectedRecipient(address(0));assertEq(quote(),OUTPUT);vm.recordLogs();pay();checkEvents(vm.getRecordedLogs());checkSuccess();
    }
}
