// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {IAqua} from "../vendor/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState,OrbitalTokenAvailability,OrbitalStrategyStatus} from "../src/interfaces/IOrbitalLifecycle.sol";
import {OrbitalStorage as Storage} from "../src/libraries/OrbitalStorage.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract SharedDollar is ERC20 {
    uint8 private immutable precision;
    constructor(uint8 value) ERC20("Shared inventory fixture","SHR"){precision=value;}
    function decimals() public view override returns(uint8){return precision;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
}

/// @dev Three actual strategies, two makers and one shared physical wallet.
/// Every proposed swap either succeeds and updates exact ghosts, or must return
/// its explicitly expected error with a complete financial snapshot unchanged.
contract SharedInventoryTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;uint256 constant WHOLE=1e18*U;
    uint256 constant RADIUS=700*WHOLE;uint256 constant QMAX=1e12*U;
    address constant MAKER_A=address(0xA11CE);address constant MAKER_B=address(0xBE11);
    address constant TAKER=address(0xB0B);address constant OUTSIDE=address(0xCAFE);
    bytes32 constant EXECUTED=keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");
    Aqua aqua;Router router;SharedDollar[] assets;address[] tokens;uint8[] precisions;
    ISwapVM.Order[3] orders;bytes32[3] hashes;uint256 virtualCredit;
    uint256[3][4] balances;uint256[3][2] allowances;uint256[3] supply;
    uint256 successfulSwaps;uint256 successfulQuotes;uint256 failedQuotes;uint256 failedSwaps;
    struct Ghost {uint256[3] x;uint256[3] fees;uint256[3] allocation;uint256[3] surplus;uint64 version;bytes32 configHash;uint24 feePpm;bool retired;bool docked;uint8 pairs;}
    Ghost[3] ghosts;
    struct ExecutionEvent {address recipient;uint8 input;uint8 output;uint256 gross;uint256 net;uint256 fee;uint256 amountOut;uint64 version;uint64[] keys;bool[] inward;}
    function maker(uint8 strategy) private pure returns(address){return strategy==2?MAKER_B:MAKER_A;}
    function makerRole(uint8 strategy) private pure returns(uint8){return strategy==2?1:0;}
    function role(uint8 index) private pure returns(address){return index==0?MAKER_A:index==1?MAKER_B:index==2?TAKER:OUTSIDE;}
    function scale(uint8 token) private view returns(uint256){return 10**(18-precisions[token])*U;}
    function amount(uint32 seed,uint8 token,uint256 salt) private view returns(uint256){return (1000+(uint256(seed)+salt*997)%9001)*10**(precisions[token]-6);}
    function data(uint8 input,uint8 output,uint256 minimum) private view returns(bytes memory){
        TakerTraitsLib.Args memory a;a.taker=TAKER;a.to=TAKER;a.isExactIn=true;a.isAToB=true;
        a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;a.deadline=uint40(block.timestamp+60);
        a.threshold=abi.encode(minimum);a.instructionsArgs=abi.encodePacked(uint8(1),input,output,uint8(0));return TakerTraitsLib.build(a);
    }
    function setUp() public {
        aqua=new Aqua();SharedDollar[] memory list=new SharedDollar[](3);
        list[0]=new SharedDollar(6);list[1]=new SharedDollar(18);list[2]=new SharedDollar(6);
        for(uint256 i;i<3;i++)for(uint256 j=i+1;j<3;j++)if(address(list[i])>address(list[j]))(list[i],list[j])=(list[j],list[i]);
        for(uint8 i;i<3;i++){
            assets.push(list[i]);tokens.push(address(list[i]));precisions.push(list[i].decimals());
            for(uint8 r;r<3;r++){uint256 funding=10000*10**precisions[i];list[i].mint(role(r),funding);balances[r][i]=funding;}
            supply[i]=list[i].totalSupply();
            for(uint8 r;r<2;r++){vm.prank(role(r));list[i].approve(address(aqua),type(uint256).max);allowances[r][i]=type(uint256).max;}
        }
        router=new Router(address(aqua),address(this),tokens,precisions);router.renounceOwnership();
        for(uint8 i;i<3;i++){vm.prank(TAKER);assets[i].approve(address(router),type(uint256).max);}
        for(uint8 i;i<3;i++)publish(i);
        assertNotEq(hashes[0],hashes[1]);assertNotEq(hashes[0],hashes[2]);assertNotEq(hashes[1],hashes[2]);assertAll();
    }
    function publish(uint8 selected) private {
        OrbitalConfigV1 memory c;c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=maker(selected);
        c.makerNonce=selected==1?1:0;c.tokens=tokens;c.decimals=precisions;c.feePpm=selected==0?100:selected==1?500:1000;
        c.tickKeys=new uint64[](3);c.tickKeys[0]=uint64(3*GRID/2);c.tickKeys[1]=uint64(7*GRID/4);c.tickKeys[2]=type(uint64).max;
        c.radiiInternal=new uint192[](3);uint256 credit;
        for(uint256 i;i<3;i++){c.radiiInternal[i]=uint192((100<<i)*WHOLE);credit+=W.mulDiv(c.radiiInternal[i],G.coefficients(3,c.tickKeys[i]).virtualLo,1<<128,false);}
        virtualCredit=credit;uint256 x=W.mulDiv(RADIUS,G.coefficients(3,type(uint64).max).equalHi,1<<128,true);
        c.initialAmountsRaw=new uint256[](3);for(uint8 i;i<3;i++){uint256 s=scale(i);c.initialAmountsRaw[i]=(x-credit+s-1)/s;}
        MakerTraitsLib.Args memory a;a.maker=c.maker;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        bytes32 h=keccak256(abi.encode(c));a.program=bytes.concat(hex"7220",h,hex"5220",h);orders[selected]=MakerTraitsLib.build(a);
        bytes32 wallets=physicalSnapshot();vm.prank(c.maker);hashes[selected]=aqua.ship(address(router),abi.encode(orders[selected]),tokens,c.initialAmountsRaw);
        vm.prank(c.maker);router.activateStrategy(c,orders[selected]);assertEq(physicalSnapshot(),wallets);
        Ghost storage g=ghosts[selected];g.version=1;g.configHash=h;g.feePpm=c.feePpm;
        for(uint8 i;i<3;i++){g.x[i]=x;g.allocation[i]=c.initialAmountsRaw[i];g.surplus[i]=g.allocation[i]*scale(i)-(x-credit);}
    }
    function physicalSnapshot() private view returns(bytes32){
        bytes memory payload;
        for(uint8 i;i<3;i++){
            for(uint8 r;r<4;r++)payload=bytes.concat(payload,abi.encode(assets[i].balanceOf(role(r))));
            payload=bytes.concat(payload,abi.encode(assets[i].balanceOf(address(router)),assets[i].balanceOf(address(aqua)),assets[i].totalSupply(),
                assets[i].allowance(MAKER_A,address(aqua)),assets[i].allowance(MAKER_B,address(aqua)),assets[i].allowance(TAKER,address(router)),assets[i].allowance(address(router),address(aqua))));
        }
        return keccak256(payload);
    }
    function stateHash(uint8 selected) private view returns(bytes32){return keccak256(abi.encode(router.getStrategyState(hashes[selected]),router.getStrategyConfig(hashes[selected])));}
    function snapshot() private view returns(bytes32){
        bytes memory payload=abi.encode(physicalSnapshot(),router.nextMakerNonce(MAKER_A),router.nextMakerNonce(MAKER_B));
        for(uint8 i;i<3;i++)payload=bytes.concat(payload,abi.encode(stateHash(i),router.getStrategyAvailability(hashes[i])));
        return keccak256(payload);
    }
    function quote(uint8 selected,uint8 input,uint8 output,uint256 gross) private returns(uint256 received){
        bytes32 before_=snapshot();vm.recordLogs();vm.prank(TAKER);
        (uint256 spent,uint256 out,bytes32 h)=ISwapVM(address(router)).quote(orders[selected],gross,data(input,output,1));
        assertEq(vm.getRecordedLogs().length,0);assertEq(snapshot(),before_);assertEq(spent,gross);assertEq(h,hashes[selected]);assertGt(out,0);successfulQuotes++;return out;
    }
    function swap(uint8 selected,uint8 pair,uint256 gross) private returns(uint256 received){
        uint8 input=pair/2;uint8 output=uint8((input+1+pair%2)%3);uint256 expected=quote(selected,input,output,gross);
        bytes32[3] memory before_;for(uint8 i;i<3;i++)before_[i]=stateHash(i);
        vm.recordLogs();vm.prank(TAKER);(uint256 spent,uint256 out,bytes32 h)=router.swap(orders[selected],gross,data(input,output,expected));
        Vm.Log[] memory logs=vm.getRecordedLogs();assertEq(spent,gross);assertEq(out,expected);assertEq(h,hashes[selected]);
        Ghost storage g=ghosts[selected];uint256 fee=(gross*uint256(g.feePpm)+999999)/1_000_000;
        assertLe(out*scale(output),2*(gross-fee)*scale(input)+2*QMAX);
        g.x[input]+=(gross-fee)*scale(input);g.x[output]-=out*scale(output);g.fees[input]+=fee;
        g.allocation[input]+=gross;g.allocation[output]-=out;g.version++;g.pairs|=uint8(1<<pair);
        uint8 r=makerRole(selected);balances[r][input]+=gross;balances[r][output]-=out;balances[2][input]-=gross;balances[2][output]+=out;
        if(allowances[r][output]!=type(uint256).max)allowances[r][output]-=out;
        uint256 events;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(router)&&logs[i].topics.length!=0&&logs[i].topics[0]==EXECUTED){
            events++;assertEq(logs[i].topics.length,4);assertEq(logs[i].topics[1],bytes32(uint256(uint160(maker(selected)))));assertEq(logs[i].topics[2],hashes[selected]);assertEq(logs[i].topics[3],bytes32(uint256(uint160(TAKER))));
            ExecutionEvent memory e=abi.decode(bytes.concat(abi.encode(uint256(32)),logs[i].data),(ExecutionEvent));
            assertEq(e.recipient,TAKER);assertEq(e.input,input);assertEq(e.output,output);assertEq(e.gross,gross);assertEq(e.net,gross-fee);assertEq(e.fee,fee);assertEq(e.amountOut,out);assertEq(e.version,g.version);assertEq(e.keys.length,0);assertEq(e.inward.length,0);
        }
        assertEq(events,1);for(uint8 i;i<3;i++)if(i!=selected)assertEq(stateHash(i),before_[i]);successfulSwaps++;assertAll();return out;
    }
    function failFunding(uint8 selected,uint8 input,uint8 output,uint256 gross) private {
        bytes32 before_=snapshot();bytes memory expected=abi.encodeWithSelector(Storage.InsufficientOutputFunding.selector);
        vm.recordLogs();vm.prank(TAKER);(bool quoted,bytes memory reason)=address(router).staticcall(abi.encodeCall(ISwapVM.quote,(orders[selected],gross,data(input,output,1))));
        assertFalse(quoted);assertEq(reason,expected);assertEq(vm.getRecordedLogs().length,0);assertEq(snapshot(),before_);failedQuotes++;
        vm.recordLogs();vm.prank(TAKER);(bool executed,bytes memory failure)=address(router).call(abi.encodeCall(ISwapVM.swap,(orders[selected],gross,data(input,output,1))));
        assertFalse(executed);assertEq(failure,expected);assertEq(snapshot(),before_);failedSwaps++;
        Vm.Log[] memory logs=vm.getRecordedLogs();for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(router)&&logs[i].topics.length!=0)assertNotEq(logs[i].topics[0],EXECUTED);
        assertAll();
    }
    function move(uint8 from,uint8 to,uint8 token,uint256 raw) private {
        bytes32[3] memory before_;for(uint8 i;i<3;i++)before_[i]=stateHash(i);
        vm.prank(role(from));assets[token].transfer(role(to),raw);balances[from][token]-=raw;balances[to][token]+=raw;
        for(uint8 i;i<3;i++)assertEq(stateHash(i),before_[i]);assertAll();
    }
    function changeAllowance(uint8 token,uint256 raw) private {
        bytes32[3] memory before_;for(uint8 i;i<3;i++)before_[i]=stateHash(i);
        vm.prank(MAKER_A);assets[token].approve(address(aqua),raw);allowances[0][token]=raw;
        for(uint8 i;i<3;i++)assertEq(stateHash(i),before_[i]);assertAll();
    }
    function sharedFill(uint8 pair,uint256 gross) private {
        uint8 input=pair/2;uint8 output=uint8((input+1+pair%2)%3);
        uint256 out0=quote(0,input,output,gross);uint256 out1=quote(1,input,output,gross);
        uint256 removed=balances[0][output]-(out0+out1-1);move(0,3,output,removed);
        assertEq(router.getStrategyAvailability(hashes[0])[output].fundingCeilingRaw,out0+out1-1);
        assertEq(router.getStrategyAvailability(hashes[1])[output].fundingCeilingRaw,out0+out1-1);
        assertEq(swap(0,pair,gross),out0);
        assertEq(router.getStrategyAvailability(hashes[1])[output].fundingCeilingRaw,out1-1);
        failFunding(1,input,output,gross);
        // A different maker remains usable while both A strategies share the
        // depleted physical balance. Its fill cannot repair or mutate A1.
        swap(2,pair,gross);assertEq(router.getStrategyAvailability(hashes[1])[output].fundingCeilingRaw,out1-1);
        move(3,0,output,removed);assertEq(swap(1,pair,gross),out1);
    }
    function walletSpend(uint8 pair,uint256 gross) private {
        uint8 input=pair/2;uint8 output=uint8((input+1+pair%2)%3);uint256 expected=quote(1,input,output,gross);
        uint256 bQuote=quote(2,input,output,gross);uint256 removed=balances[0][output];move(0,3,output,removed);
        failFunding(0,input,output,gross);failFunding(1,input,output,gross);assertEq(quote(2,input,output,gross),bQuote);
        move(3,0,output,removed);assertEq(swap(1,pair,gross),expected);
    }
    function allowanceSpend(uint8 pair,uint256 gross) private {
        uint8 input=pair/2;uint8 output=uint8((input+1+pair%2)%3);uint256 expected=quote(1,input,output,gross);
        uint256 bQuote=quote(2,input,output,gross);changeAllowance(output,expected-1);
        assertEq(router.getStrategyAvailability(hashes[0])[output].fundingCeilingRaw,expected-1);
        assertEq(router.getStrategyAvailability(hashes[1])[output].fundingCeilingRaw,expected-1);
        failFunding(1,input,output,gross);assertEq(quote(2,input,output,gross),bQuote);
        changeAllowance(output,type(uint256).max);assertEq(swap(1,pair,gross),expected);
    }
    function retireAndDock(uint8 selected) private {
        bytes32 wallets=physicalSnapshot();bytes32[3] memory before_;for(uint8 i;i<3;i++)before_[i]=stateHash(i);
        vm.prank(maker(selected));router.retireStrategy(hashes[selected]);ghosts[selected].retired=true;ghosts[selected].version++;assertAll();
        vm.prank(maker(selected));aqua.dock(address(router),hashes[selected],tokens);ghosts[selected].docked=true;
        for(uint8 i;i<3;i++)ghosts[selected].allocation[i]=0;
        assertEq(physicalSnapshot(),wallets);for(uint8 i;i<3;i++)if(i!=selected)assertEq(stateHash(i),before_[i]);assertAll();
    }
    function assertAll() private view {
        assertEq(router.nextMakerNonce(MAKER_A),2);assertEq(router.nextMakerNonce(MAKER_B),1);
        for(uint8 token;token<3;token++){
            uint256 total;for(uint8 r;r<4;r++){assertEq(assets[token].balanceOf(role(r)),balances[r][token]);total+=balances[r][token];}
            assertEq(total,supply[token]);assertEq(assets[token].totalSupply(),supply[token]);assertEq(assets[token].balanceOf(address(router)),0);assertEq(assets[token].balanceOf(address(aqua)),0);assertEq(assets[token].balanceOf(address(this)),0);
            assertEq(assets[token].allowance(MAKER_A,address(aqua)),allowances[0][token]);assertEq(assets[token].allowance(MAKER_B,address(aqua)),allowances[1][token]);
            assertEq(assets[token].allowance(TAKER,address(router)),type(uint256).max);assertEq(assets[token].allowance(address(router),address(aqua)),0);
        }
        for(uint8 selected;selected<3;selected++){
            Ghost storage g=ghosts[selected];OrbitalStrategyState memory state=router.getStrategyState(hashes[selected]);OrbitalTokenAvailability[] memory available=router.getStrategyAvailability(hashes[selected]);
            assertEq(state.maker,maker(selected));assertEq(state.version,g.version);assertEq(state.configHash,g.configHash);assertEq(state.virtualInternal,virtualCredit);
            assertEq(keccak256(abi.encode(router.getStrategyConfig(hashes[selected]))),g.configHash);
            assertEq(uint8(state.status),uint8(g.retired?OrbitalStrategyStatus.Retired:OrbitalStrategyStatus.Active));assertEq(state.interiorTickMask,7);assertEq(state.interiorRadius,RADIUS);assertEq(state.boundarySumNumerator,0);assertEq(state.boundarySigmaLower,0);assertEq(state.boundarySigmaUpper,0);
            uint256 sum;W.Uint512 memory squares;W.Uint512 memory sphere;
            for(uint8 token;token<3;token++){
                uint256 principal=g.x[token]-virtualCredit;uint256 required=principal+g.fees[token]*scale(token);uint8 r=makerRole(selected);
                assertEq(state.X[token],g.x[token]);assertEq(state.principalInternal[token],principal);assertEq(state.cumulativeFeeRaw[token],g.fees[token]);assertGt(g.x[token],294*WHOLE);assertLt(g.x[token],297*WHOLE);
                sum+=g.x[token];squares=W.add(squares,W.mul(g.x[token],g.x[token]));sphere=W.add(sphere,W.mul(RADIUS-g.x[token],RADIUS-g.x[token]));
                (uint248 allocation,uint8 live)=aqua.rawBalances(maker(selected),address(router),hashes[selected],tokens[token]);assertEq(allocation,g.allocation[token]);assertEq(live,g.docked?255:3);
                OrbitalTokenAvailability memory a=available[token];assertEq(a.token,tokens[token]);assertEq(a.aquaAllocationRaw,g.allocation[token]);assertEq(a.liveTokenCount,live);assertEq(a.live,!g.docked);
                assertEq(a.walletBalanceRaw,balances[r][token]);assertEq(a.aquaAllowanceRaw,allowances[r][token]);assertEq(a.backingValid,!g.docked);
                assertEq(a.surplusInternal.hi,0);assertEq(a.surplusInternal.lo,g.docked?0:g.surplus[token]);assertEq(a.deficitInternal.hi,0);assertEq(a.deficitInternal.lo,g.docked?required:0);
                uint256 ceiling=principal/scale(token);if(g.allocation[token]<ceiling)ceiling=g.allocation[token];if(balances[r][token]<ceiling)ceiling=balances[r][token];if(allowances[r][token]<ceiling)ceiling=allowances[r][token];if(g.retired)ceiling=0;assertEq(a.fundingCeilingRaw,ceiling);
                if(!g.docked)assertEq(g.allocation[token]*scale(token),required+g.surplus[token]);
            }
            assertEq(state.sumInternal,sum);assertEq(state.sumSquaresInternal.hi,squares.hi);assertEq(state.sumSquaresInternal.lo,squares.lo);assertLt(sum,1050*WHOLE);
            assertTrue(W.lte(sphere,W.mul(RADIUS,RADIUS)));assertTrue(W.lte(W.mul(RADIUS-QMAX,RADIUS-QMAX),sphere));assertLe(state.slackBoundInternal,QMAX);
        }
    }
    function sequence(uint32 seed,uint8 selectedPair) private {
        for(uint8 s;s<3;s++)for(uint8 initialPair;initialPair<6;initialPair++)swap(s,initialPair,amount(seed,initialPair/2,s*6+initialPair));
        uint8 pair=selectedPair%6;uint256 gross=amount(seed,pair/2,77);
        sharedFill(pair,gross);walletSpend(pair,gross);allowanceSpend(pair,gross);
        bytes32 before_=snapshot();vm.expectRevert(Router.NotMaker.selector);vm.prank(MAKER_B);router.retireStrategy(hashes[0]);assertEq(snapshot(),before_);
        vm.expectRevert(abi.encodeWithSelector(IAqua.DockingShouldCloseAllTokens.selector,address(router),hashes[0]));vm.prank(MAKER_B);aqua.dock(address(router),hashes[0],tokens);assertEq(snapshot(),before_);
        retireAndDock(0);before_=snapshot();
        vm.expectRevert(Router.StrategyNotActive.selector);vm.prank(TAKER);ISwapVM(address(router)).quote(orders[0],gross,data(pair/2,uint8((pair/2+1+pair%2)%3),1));assertEq(snapshot(),before_);
        for(uint8 s=1;s<3;s++)for(uint8 p;p<6;p++)swap(s,p,amount(seed,p/2,s*6+p+100));
        for(uint8 s;s<3;s++)assertEq(ghosts[s].pairs,63);
        retireAndDock(1);retireAndDock(2);assertEq(successfulSwaps,35);assertEq(failedQuotes,4);assertEq(failedSwaps,4);
        emit log_named_uint("successful_swaps",successfulSwaps);emit log_named_uint("successful_quotes",successfulQuotes);emit log_named_uint("expected_failed_quotes",failedQuotes);emit log_named_uint("expected_failed_swaps",failedSwaps);
        emit log_named_uint("strategies_retired_and_docked",3);emit log_named_uint("directed_pairs_per_strategy",6);
    }
    function testDeterministicSharedWalletFailuresRecoveryAndIndependentClosure() public {sequence(123456,4);}
    function testFuzzSharedWalletFailuresRecoveryAndIndependentClosure(uint32 seed,uint8 pair) public {sequence(seed,pair);}
}
