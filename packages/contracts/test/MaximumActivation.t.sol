// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState,OrbitalTokenAvailability,OrbitalStrategyStatus} from "../src/interfaces/IOrbitalLifecycle.sol";
import {OrbitalStorage as Storage} from "../src/libraries/OrbitalStorage.sol";
import {StrategyInitializer as Initializer} from "../src/libraries/StrategyInitializer.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract MaximumActivationDollar is ERC20 {
    constructor() ERC20("Maximum activation fixture","MAX"){}
    function mint(address to,uint256 raw) external {_mint(to,raw);}
}

/// @dev Maximum supported dimension/tick count, ordinary deployed tokens and
/// official Aqua. Directed production coefficients construct the fixture;
/// this integration/gas test is not an independent initializer oracle.
contract MaximumActivationTest is Test {
    uint256 constant U=1<<64;uint256 constant GRID=1<<32;uint256 constant WHOLE=1e18*U;
    address constant MAKER=address(0xA11CE);
    Aqua aqua;Router router;MaximumActivationDollar[] assets;OrbitalConfigV1 config;
    ISwapVM.Order order;bytes32 orderHash;bytes32 configHash;uint256 requiredX;uint256 virtualCredit;
    uint256 measuredShipGas;
    function setUp() public {
        aqua=new Aqua();MaximumActivationDollar[] memory list=new MaximumActivationDollar[](8);
        for(uint256 i;i<8;i++)list[i]=new MaximumActivationDollar();
        for(uint256 i;i<8;i++)for(uint256 j=i+1;j<8;j++)if(address(list[i])>address(list[j]))(list[i],list[j])=(list[j],list[i]);
        address[] memory tokens=new address[](8);uint8[] memory precision=new uint8[](8);
        for(uint256 i;i<8;i++){tokens[i]=address(list[i]);precision[i]=18;assets.push(list[i]);}
        router=new Router(address(aqua),address(this),tokens,precision);router.renounceOwnership();
        OrbitalConfigV1 memory c;c.schemaVersion=1;c.chainId=block.chainid;c.router=address(router);c.maker=MAKER;
        c.tokens=tokens;c.decimals=precision;c.feePpm=500;c.tickKeys=new uint64[](8);c.radiiInternal=new uint192[](8);
        for(uint256 i;i<8;i++){
            c.tickKeys[i]=i==7?type(uint64).max:uint64(11*GRID/2+i*GRID/8);c.radiiInternal[i]=uint192(100*WHOLE);
            virtualCredit+=W.mulDiv(c.radiiInternal[i],G.coefficients(8,c.tickKeys[i]).virtualLo,1<<128,false);
        }
        requiredX=W.mulDiv(800*WHOLE,G.coefficients(8,type(uint64).max).equalHi,1<<128,true);
        c.initialAmountsRaw=new uint256[](8);
        for(uint256 i;i<8;i++){
            c.initialAmountsRaw[i]=(requiredX-virtualCredit+U-1)/U;assets[i].mint(MAKER,c.initialAmountsRaw[i]);
            vm.prank(MAKER);assets[i].approve(address(aqua),c.initialAmountsRaw[i]);
        }
        configHash=keccak256(abi.encode(c));MakerTraitsLib.Args memory a;
        a.maker=MAKER;a.tokenA=tokens[0];a.tokenB=tokens[1];a.useAquaInsteadOfSignature=true;
        a.program=bytes.concat(hex"7220",configHash,hex"5220",configHash);ISwapVM.Order memory canonical=MakerTraitsLib.build(a);
        bytes memory encoded=abi.encode(canonical);vm.prank(MAKER);uint256 before=gasleft();
        orderHash=aqua.ship(address(router),encoded,tokens,c.initialAmountsRaw);measuredShipGas=before-gasleft();
        assertEq(orderHash,keccak256(encoded));
        for(uint256 i;i<8;i++){assertEq(assets[i].balanceOf(MAKER),c.initialAmountsRaw[i]);assertEq(assets[i].allowance(MAKER,address(aqua)),c.initialAmountsRaw[i]);}
        config=c;order=canonical;
    }
    function testMaximumEightTokenEightTickActivationInitializesAndMeasuresExternalCall() public {
        OrbitalConfigV1 memory c=config;ISwapVM.Order memory canonical=order;
        vm.cool(address(router));vm.cool(address(Storage));vm.cool(address(Initializer));vm.cool(address(aqua));
        for(uint256 i;i<8;i++)vm.cool(address(assets[i]));
        vm.recordLogs();vm.prank(MAKER);uint256 before=gasleft();
        bytes32 activated=router.activateStrategy(c,canonical);uint256 used=before-gasleft();
        assertEq(activated,orderHash);assertEq(router.nextMakerNonce(MAKER),1);assertEq(router.owner(),address(0));
        Vm.Log[] memory logs=vm.getRecordedLogs();bytes32 transfer=keccak256("Transfer(address,address,uint256)");
        for(uint256 i;i<logs.length;i++)for(uint256 t;t<8;t++)if(logs[i].emitter==address(assets[t])&&logs[i].topics.length!=0)assertNotEq(logs[i].topics[0],transfer);
        OrbitalStrategyState memory state=router.getStrategyState(orderHash);OrbitalTokenAvailability[] memory available=router.getStrategyAvailability(orderHash);
        assertEq(state.maker,MAKER);assertEq(uint8(state.status),uint8(OrbitalStrategyStatus.Active));assertEq(state.version,1);assertEq(state.configHash,configHash);
        assertEq(keccak256(abi.encode(router.getStrategyConfig(orderHash))),configHash);assertEq(state.X.length,8);assertEq(available.length,8);
        assertEq(state.interiorTickMask,255);assertEq(state.interiorRadius,800*WHOLE);assertEq(state.virtualInternal,virtualCredit);
        assertEq(state.boundarySumNumerator,0);assertEq(state.boundarySigmaLower,0);assertEq(state.boundarySigmaUpper,0);
        assertEq(state.sumInternal,8*requiredX);W.Uint512 memory squares=W.scale(W.mul(requiredX,requiredX),8);
        assertEq(state.sumSquaresInternal.hi,squares.hi);assertEq(state.sumSquaresInternal.lo,squares.lo);
        assertTrue(W.lte(W.scale(W.mul(800*WHOLE-requiredX,800*WHOLE-requiredX),8),W.mul(800*WHOLE,800*WHOLE)));
        assertLt(state.sumInternal*GRID,uint256(c.tickKeys[0])*800*WHOLE);
        for(uint256 i;i<8;i++){
            uint256 principal=requiredX-virtualCredit;uint256 surplus=c.initialAmountsRaw[i]*U-principal;
            assertEq(state.X[i],requiredX);assertEq(state.principalInternal[i],principal);assertEq(state.cumulativeFeeRaw[i],0);
            (uint248 allocation,uint8 live)=aqua.rawBalances(MAKER,address(router),orderHash,c.tokens[i]);assertEq(allocation,c.initialAmountsRaw[i]);assertEq(live,8);
            assertEq(assets[i].decimals(),18);assertEq(assets[i].balanceOf(MAKER),c.initialAmountsRaw[i]);assertEq(assets[i].totalSupply(),c.initialAmountsRaw[i]);
            assertEq(assets[i].allowance(MAKER,address(aqua)),c.initialAmountsRaw[i]);assertEq(assets[i].balanceOf(address(router)),0);assertEq(assets[i].balanceOf(address(aqua)),0);
            assertEq(available[i].token,c.tokens[i]);assertTrue(available[i].live);assertTrue(available[i].backingValid);assertEq(available[i].fundingCeilingRaw,principal/U);
            assertEq(available[i].surplusInternal.hi,0);assertEq(available[i].surplusInternal.lo,surplus);assertEq(available[i].deficitInternal.hi,0);assertEq(available[i].deficitInternal.lo,0);
        }
        // Actual external call marshalling is inside each measurement. Token
        // deployment/funding/approval and all assertions are outside activation.
        // Account cooling is explicit; no Arc transaction/intrinsic-gas claim.
        emit log_named_uint("maximum_8x8_external_activation_gas",used);
        emit log_named_uint("maximum_8x8_external_ship_gas",measuredShipGas);
    }
}
