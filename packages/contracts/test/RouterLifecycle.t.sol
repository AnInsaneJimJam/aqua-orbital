// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {IAqua} from "../vendor/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraits, MakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {OrbitalSwapVMRouter as Router} from "../src/OrbitalSwapVMRouter.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {IOrbitalLifecycle, OrbitalStrategyStatus, OrbitalStrategyState, OrbitalTokenAvailability} from "../src/interfaces/IOrbitalLifecycle.sol";
import {OrbitalStorage as S} from "../src/libraries/OrbitalStorage.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract LifecycleDollar is ERC20 {
    uint8 private _decimals;
    constructor(uint8 precision) ERC20("Lifecycle test dollar", "TEST") { _decimals = precision; }
    function decimals() public view override returns (uint8) { return _decimals; }
    function setDecimals(uint8 precision) external { _decimals = precision; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract GuardedLifecycleProbe is Router {
    constructor(address aqua, address[] memory tokens, uint8[] memory decimals_) Router(aqua, msg.sender, tokens, decimals_) {}
    function checkReadGuard(bytes32 orderHash) external returns (bool stateBlocked, bool availabilityBlocked, bool metadataReadable) {
        S.layout().entered = true;
        (bool stateOK,) = address(this).staticcall(abi.encodeCall(IOrbitalLifecycle.getStrategyState, (orderHash)));
        (bool availabilityOK,) = address(this).staticcall(abi.encodeCall(IOrbitalLifecycle.getStrategyAvailability, (orderHash)));
        (bool configOK,) = address(this).staticcall(abi.encodeWithSignature("getStrategyConfig(bytes32)", orderHash));
        S.layout().entered = false;
        return (!stateOK, !availabilityOK, configOK);
    }
    function seedNonceForTest(address maker, uint64 nonce) external { S.layout().nextNonce[maker] = nonce; }
    function checkMutationGuard(OrbitalConfigV1 calldata config_, ISwapVM.Order calldata order, bytes32 orderHash) external returns (bytes4 activationError, bytes4 retirementError) {
        S.layout().entered = true;
        (, bytes memory activation) = address(this).call(abi.encodeCall(IOrbitalLifecycle.activateStrategy, (config_, order)));
        (, bytes memory retirement) = address(this).call(abi.encodeCall(IOrbitalLifecycle.retireStrategy, (orderHash)));
        S.layout().entered = false;
        return (bytes4(activation), bytes4(retirement));
    }
}
contract RouterLifecycleTest is Test {
    uint256 constant U = 1 << 64;
    uint256 constant Q = 1 << 128;
    uint256 constant GRID = 1 << 32;
    Aqua aqua;
    GuardedLifecycleProbe router;
    LifecycleDollar[] assets;
    address[] tokens;
    uint8[] precisions;
    address maker = address(0xA11CE);
    address taker = address(0xB0B);

    function setUp() public {
        aqua = new Aqua();
        LifecycleDollar[] memory unsorted = new LifecycleDollar[](3);
        unsorted[0] = new LifecycleDollar(6); unsorted[1] = new LifecycleDollar(18); unsorted[2] = new LifecycleDollar(6);
        for (uint256 i; i < 3; ++i) for (uint256 j = i + 1; j < 3; ++j) if (address(unsorted[i]) > address(unsorted[j])) (unsorted[i], unsorted[j]) = (unsorted[j], unsorted[i]);
        for (uint256 i; i < 3; ++i) {
            assets.push(unsorted[i]); tokens.push(address(unsorted[i])); precisions.push(unsorted[i].decimals());
            unsorted[i].mint(maker, 1000 * 10 ** unsorted[i].decimals());
            vm.prank(maker); unsorted[i].approve(address(aqua), type(uint256).max);
        }
        router = new GuardedLifecycleProbe(address(aqua), tokens, precisions);
        router.renounceOwnership();
    }
    function config(uint64 nonce) internal view returns (OrbitalConfigV1 memory c) {
        c.schemaVersion = 1; c.chainId = block.chainid; c.router = address(router); c.maker = maker; c.makerNonce = nonce;
        c.tokens = tokens; c.decimals = precisions; c.tickKeys = new uint64[](3); c.radiiInternal = new uint192[](3);
        c.tickKeys[0] = uint64(3 * GRID / 2); c.tickKeys[1] = uint64(7 * GRID / 4); c.tickKeys[2] = type(uint64).max;
        for (uint256 i; i < 3; ++i) c.radiiInternal[i] = uint192(3e18 * U);
        c.feePpm = 500; c.initialAmountsRaw = funding(c);
    }
    function funding(OrbitalConfigV1 memory c) internal pure returns (uint256[] memory raw) {
        uint256 radius; uint256 virtualAmount;
        for (uint256 i; i < c.tickKeys.length; ++i) {
            radius += c.radiiInternal[i];
            G.Coefficients memory coeff = G.coefficients(uint8(c.tokens.length), c.tickKeys[i]);
            virtualAmount += W.mulDiv(c.radiiInternal[i], coeff.virtualLo, Q, false);
        }
        uint256 x = W.mulDiv(radius, G.coefficients(uint8(c.tokens.length), type(uint64).max).equalHi, Q, true);
        raw = new uint256[](c.tokens.length);
        for (uint256 i; i < raw.length; ++i) raw[i] = (x - virtualAmount + scale(c.decimals[i]) - 1) / scale(c.decimals[i]);
    }
    function scale(uint8 decimals_) internal pure returns (uint256) { return 10 ** (18 - decimals_) * U; }
    function orderFor(OrbitalConfigV1 memory c) internal pure returns (ISwapVM.Order memory) {
        MakerTraitsLib.Args memory a;
        a.maker = c.maker; a.tokenA = c.tokens[0]; a.tokenB = c.tokens[1]; a.useAquaInsteadOfSignature = true;
        bytes32 h = keccak256(abi.encode(c)); a.program = bytes.concat(hex"7220", h, hex"5220", h);
        return MakerTraitsLib.build(a);
    }
    function ship(OrbitalConfigV1 memory c, ISwapVM.Order memory order) internal returns (bytes32 h) {
        vm.prank(maker); h = aqua.ship(address(router), abi.encode(order), c.tokens, c.initialAmountsRaw);
    }
    function activate() internal returns (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) {
        c = config(0); order = orderFor(c); h = ship(c, order);
        vm.prank(maker); assertEq(router.activateStrategy(c, order), h);
    }
    function takerData(uint8 input, uint8 output) internal view returns (bytes memory) {
        TakerTraitsLib.Args memory a; a.taker = taker; a.to = taker; a.isExactIn = true; a.isFirstTransferFromTaker = true;
        a.useTransferFromAndAquaPush = true; a.isAToB = true; a.deadline = uint40(block.timestamp + 60);
        a.threshold = abi.encode(uint256(1)); a.instructionsArgs = abi.encodePacked(uint8(1), input, output, uint8(16));
        return TakerTraitsLib.build(a);
    }
    function testShipActivatePreservesCustodyAndStoresCertifiedEqualState() public {
        uint256[] memory beforeBalances = new uint256[](3);
        for (uint256 i; i < 3; ++i) beforeBalances[i] = assets[i].balanceOf(maker);
        (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) = activate();
        assertEq(h, keccak256(abi.encode(order))); assertEq(router.hash(order), h); assertEq(router.nextMakerNonce(maker), 1);
        assertEq(keccak256(abi.encode(router.getStrategyConfig(h))), keccak256(abi.encode(c)));
        OrbitalStrategyState memory state = router.getStrategyState(h);
        assertEq(uint8(state.status), uint8(OrbitalStrategyStatus.Active)); assertEq(state.version, 1); assertEq(state.interiorTickMask, 7);
        assertLt(state.slackBoundInternal, U); assertEq(state.boundarySumNumerator, 0); assertEq(state.boundarySigmaUpper, 0);
        W.Uint512 memory squares;
        for (uint256 i; i < 3; ++i) {
            assertEq(state.X[i], state.X[0]); assertEq(state.principalInternal[i], state.X[i] - state.virtualInternal);
            assertEq(state.cumulativeFeeRaw[i], 0); squares = W.add(squares, W.mul(state.X[i], state.X[i]));
            assertEq(assets[i].balanceOf(maker), beforeBalances[i]); assertEq(assets[i].balanceOf(address(aqua)), 0); assertEq(assets[i].balanceOf(address(router)), 0);
        }
        assertEq(state.sumInternal, 3 * state.X[0]); assertEq(state.sumSquaresInternal.hi, squares.hi); assertEq(state.sumSquaresInternal.lo, squares.lo);
    }
    function testUnrenouncedOwnerBlocksActivationWithoutConsumingNonce() public {
        router = new GuardedLifecycleProbe(address(aqua), tokens, precisions);
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c); ship(c, order);
        vm.expectRevert(Router.OwnerNotRenounced.selector); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), 0); assertEq(address(router.WETH()), address(0));
    }
    function testWrongMakerNonceDomainAndCanonicalOrderRejected() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c); ship(c, order);
        vm.expectRevert(Router.NotMaker.selector); router.activateStrategy(c, order);
        c.makerNonce = 1; vm.expectRevert(Router.InvalidNonce.selector); vm.prank(maker); router.activateStrategy(c, orderFor(c));
        c.makerNonce = 0; c.chainId++; vm.expectRevert(Router.InvalidDomain.selector); vm.prank(maker); router.activateStrategy(c, orderFor(c));
        c.chainId--; order.data = bytes.concat(order.data, hex"00"); vm.expectRevert(Router.NonCanonicalOrder.selector); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), 0);
    }
    function testRegistrationRechecksOnchainDecimals() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c); ship(c, order);
        assets[2].setDecimals(8);
        vm.expectRevert(Router.InvalidConfiguration.selector); vm.prank(maker); router.activateStrategy(c, order);
    }
    function testForgedInitialAmountsAreNotAcceptedAsCurvePrincipal() public {
        OrbitalConfigV1 memory c = config(0); c.initialAmountsRaw[0]++; ISwapVM.Order memory order = orderFor(c); ship(c, order);
        vm.expectRevert(Router.InvalidInitialAmounts.selector); vm.prank(maker); router.activateStrategy(c, order);
    }
    function testMissingThirdAquaEntryRejectsActivation() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c);
        address[] memory wrong = new address[](3); wrong[0] = tokens[0]; wrong[1] = tokens[1]; wrong[2] = address(0xBAD);
        vm.prank(maker); aqua.ship(address(router), abi.encode(order), wrong, c.initialAmountsRaw);
        vm.expectRevert(Router.AquaEntryNotLive.selector); vm.prank(maker); router.activateStrategy(c, order);
    }
    function testInsufficientAquaAllocationAndWalletFundingRejectActivation() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c);
        uint256[] memory low = new uint256[](3); for (uint256 i; i < 3; ++i) low[i] = c.initialAmountsRaw[i]; low[2]--;
        vm.prank(maker); aqua.ship(address(router), abi.encode(order), tokens, low);
        vm.expectRevert(Router.InadequateBacking.selector); vm.prank(maker); router.activateStrategy(c, order);
        vm.prank(maker); assets[2].approve(address(aqua), 0);
        vm.expectRevert(); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), 0);
    }
    function testDonationUpToUint248AllocationUsesWideSurplusWithoutChangingGeometry() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c); bytes32 h = ship(c, order);
        uint256 donation = type(uint248).max - c.initialAmountsRaw[0]; assets[0].mint(taker, donation);
        vm.prank(taker); assets[0].approve(address(aqua), donation);
        vm.prank(taker); aqua.push(maker, address(router), h, tokens[0], donation);
        vm.prank(maker); router.activateStrategy(c, order);
        OrbitalStrategyState memory state = router.getStrategyState(h);
        OrbitalTokenAvailability[] memory observation = router.getStrategyAvailability(h);
        assertTrue(observation[0].live); assertTrue(observation[0].backingValid); assertEq(observation[0].aquaAllocationRaw, type(uint248).max);
        W.Uint512 memory expected = W.sub(W.mul(type(uint248).max, scale(precisions[0])), W.Uint512(0, state.principalInternal[0]));
        assertGt(expected.hi, 0); assertEq(observation[0].surplusInternal.hi, expected.hi); assertEq(observation[0].surplusInternal.lo, expected.lo);
        assertEq(state.X[0], state.X[1]); assertEq(state.cumulativeFeeRaw[0], 0);
    }
    function testDockedAndDeficientStrategyRemainInspectable() public {
        (, , bytes32 h) = activate();
        vm.prank(maker); aqua.dock(address(router), h, tokens);
        OrbitalTokenAvailability[] memory observation = router.getStrategyAvailability(h);
        for (uint256 i; i < 3; ++i) { assertFalse(observation[i].live); assertFalse(observation[i].backingValid); assertEq(observation[i].liveTokenCount, 255); assertEq(observation[i].fundingCeilingRaw, 0); assertGt(observation[i].deficitInternal.lo, 0); }
        assertEq(uint8(router.getStrategyState(h).status), uint8(OrbitalStrategyStatus.Active));
        vm.prank(maker); router.retireStrategy(h);
        assertEq(uint8(router.getStrategyState(h).status), uint8(OrbitalStrategyStatus.Retired));
    }
    function testRetirementIsMakerOnlyAndTerminalEvenBeforeDock() public {
        (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) = activate();
        vm.expectRevert(Router.NotMaker.selector); router.retireStrategy(h);
        vm.prank(maker); router.retireStrategy(h);
        assertEq(router.getStrategyState(h).version, 2);
        vm.expectRevert(Router.StrategyAlreadyExists.selector); vm.prank(maker); router.activateStrategy(c, order);
        vm.expectRevert(Router.StrategyNotActive.selector); vm.prank(maker); router.retireStrategy(h);
        assertEq(router.nextMakerNonce(maker), 1);
    }
    function testWalletSpendLimitsAvailabilityWithoutResettingPrincipal() public {
        (, , bytes32 h) = activate(); bytes32 beforeState = keccak256(abi.encode(router.getStrategyState(h)));
        uint256 balance = assets[1].balanceOf(maker);
        vm.prank(maker); assets[1].transfer(taker, balance);
        OrbitalTokenAvailability[] memory observation = router.getStrategyAvailability(h);
        assertTrue(observation[1].backingValid); assertEq(observation[1].fundingCeilingRaw, 0);
        assertEq(keccak256(abi.encode(router.getStrategyState(h))), beforeState);
    }
    function testCoherentReadGuardDoesNotHideImmutableConfiguration() public {
        (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) = activate();
        (bool stateBlocked, bool availabilityBlocked, bool configReadable) = router.checkReadGuard(h);
        assertTrue(stateBlocked); assertTrue(availabilityBlocked); assertTrue(configReadable);
        (bytes4 activationError, bytes4 retirementError) = router.checkMutationGuard(c, order, h);
        assertEq(activationError, Router.Reentrancy.selector); assertEq(retirementError, Router.Reentrancy.selector);
    }
    function testUnknownStateRevertsAndNonceOverflowDoesNotWrap() public {
        vm.expectRevert(Router.StrategyNotFound.selector); router.getStrategyState(bytes32(uint256(1)));
        router.seedNonceForTest(maker, type(uint64).max);
        OrbitalConfigV1 memory c = config(type(uint64).max); ISwapVM.Order memory order = orderFor(c); ship(c, order);
        vm.expectRevert(Router.NonceExhausted.selector); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), type(uint64).max);
    }
    function testUncertainTraversalFailsWithoutStateMutationOrLockLeak() public {
        (, ISwapVM.Order memory order, bytes32 h) = activate(); bytes32 beforeState = keccak256(abi.encode(router.getStrategyState(h)));
        uint256 amount=5*10**precisions[2];
        bytes memory expected=abi.encodeWithSelector(S.InvalidCurveCertificate.selector,uint8(0));
        vm.expectRevert(expected); vm.prank(taker); router.swap(order, amount, takerData(2, 0));
        vm.prank(taker); (bool success, bytes memory reason) = address(router).staticcall(abi.encodeCall(ISwapVM.quote, (order, amount, takerData(2, 0))));
        assertFalse(success); assertEq(reason,expected);
        assertEq(keccak256(abi.encode(router.getStrategyState(h))), beforeState);
    }
    function testOneWholeTokenAnchorSurvivesDirectedInitializationRounding() public {
        OrbitalConfigV1 memory c = config(0);
        G.Coefficients memory equal = G.coefficients(3, type(uint64).max);
        c.radiiInternal[2] = uint192(W.mulDiv(1e18 * U, Q, equal.equalHi, false));
        c.initialAmountsRaw = funding(c);
        ISwapVM.Order memory order = orderFor(c); bytes32 h = ship(c, order);
        vm.prank(maker); router.activateStrategy(c, order);
        assertLt(router.getStrategyState(h).slackBoundInternal, U);
        c = config(1); c.radiiInternal[2] = uint192(1e12 * U); c.initialAmountsRaw = funding(c); order = orderFor(c); ship(c, order);
        vm.expectRevert(Router.InsufficientInitialFunding.selector); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), 1);
    }
    function testInsufficientWalletAllowanceAndBalanceEachRejectOtherwiseBackedActivation() public {
        OrbitalConfigV1 memory c = config(0); ISwapVM.Order memory order = orderFor(c); ship(c, order);
        vm.prank(maker); assets[2].approve(address(aqua), c.initialAmountsRaw[2] - 1);
        vm.expectRevert(Router.InsufficientInitialFunding.selector); vm.prank(maker); router.activateStrategy(c, order);
        vm.prank(maker); assets[2].approve(address(aqua), type(uint256).max);
        uint256 balance = assets[2].balanceOf(maker);
        vm.prank(maker); assets[2].transfer(taker, balance - c.initialAmountsRaw[2] + 1);
        vm.expectRevert(Router.InsufficientInitialFunding.selector); vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.nextMakerNonce(maker), 0);
    }
    function testBackingDeficitStopsAllFundingCeilingsWithoutRevertingInspection() public {
        (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) = activate();
        // Exercise official Aqua's accounting to construct an unhealthy app
        // state. Pranking the router is confined to this adversarial test.
        vm.prank(address(router)); aqua.pull(maker, h, tokens[2], c.initialAmountsRaw[2], taker);
        OrbitalTokenAvailability[] memory observation = router.getStrategyAvailability(h);
        assertTrue(observation[2].live); assertFalse(observation[2].backingValid);
        assertEq(observation[2].surplusInternal.hi, 0); assertEq(observation[2].surplusInternal.lo, 0);
        assertGt(observation[2].deficitInternal.lo, 0);
        for (uint256 i; i < 3; ++i) assertEq(observation[i].fundingCeilingRaw, 0);
        assertEq(uint8(router.getStrategyState(h).status), uint8(OrbitalStrategyStatus.Active));
        vm.expectRevert(Router.InadequateBacking.selector); vm.prank(taker); router.swap(order, 100, takerData(0, 1));
    }
    function testFreshNonceAfterRetirementIsIndependentAndDockedHashCannotBeReshipped() public {
        (OrbitalConfigV1 memory c, ISwapVM.Order memory order, bytes32 h) = activate();
        vm.prank(maker); router.retireStrategy(h);
        vm.prank(maker); aqua.dock(address(router), h, tokens);
        vm.expectRevert(abi.encodeWithSelector(IAqua.StrategiesMustBeImmutable.selector, address(router), h));
        vm.prank(maker); aqua.ship(address(router), abi.encode(order), tokens, c.initialAmountsRaw);
        c = config(1); order = orderFor(c); bytes32 next = ship(c, order);
        vm.prank(maker); router.activateStrategy(c, order);
        assertNotEq(next, h); assertEq(router.nextMakerNonce(maker), 2);
        assertEq(uint8(router.getStrategyState(h).status), uint8(OrbitalStrategyStatus.Retired));
        assertEq(uint8(router.getStrategyState(next).status), uint8(OrbitalStrategyStatus.Active));
    }
    function testCanonicalTakerModesAndAllTokenLiveChecksPrecedeCurveExecution() public {
        (, ISwapVM.Order memory order, bytes32 h) = activate();
        bytes memory data = takerData(0, 2); data[21] = bytes1(uint8(data[21]) ^ uint8(0x80));
        vm.expectRevert(Router.InvalidTaker.selector); vm.prank(taker); router.swap(order, 100, data);
        data = takerData(0, 0);
        vm.expectRevert(Router.InvalidTaker.selector); vm.prank(taker); router.swap(order, 100, data);
        vm.prank(maker); aqua.dock(address(router), h, tokens);
        vm.expectRevert(Router.AquaEntryNotLive.selector); vm.prank(taker); router.swap(order, 100, takerData(0, 1));
        assertEq(uint8(router.getStrategyState(h).status), uint8(OrbitalStrategyStatus.Active));
    }
    function testInitializationAtSupportedDimensionAndTickExtremes() public {
        uint8[4] memory dimensions = [uint8(2), 3, 5, 8];
        for (uint256 sample; sample < dimensions.length; ++sample) {
            uint8 n = dimensions[sample];
            address[] memory list = new address[](n); uint8[] memory decimals_ = new uint8[](n);
            for (uint256 i; i < n; ++i) list[i] = address(new LifecycleDollar(i % 2 == 0 ? 6 : 18));
            for (uint256 i; i < n; ++i) for (uint256 j = i + 1; j < n; ++j) if (list[i] > list[j]) (list[i], list[j]) = (list[j], list[i]);
            for (uint256 i; i < n; ++i) {
                decimals_[i] = LifecycleDollar(list[i]).decimals();
                LifecycleDollar(list[i]).mint(maker, 1000 * 10 ** decimals_[i]);
                vm.prank(maker); LifecycleDollar(list[i]).approve(address(aqua), type(uint256).max);
            }
            GuardedLifecycleProbe target = new GuardedLifecycleProbe(address(aqua), list, decimals_); target.renounceOwnership();
            OrbitalConfigV1 memory c;
            c.schemaVersion = 1; c.chainId = block.chainid; c.router = address(target); c.maker = maker;
            c.tokens = list; c.decimals = decimals_; c.feePpm = 500;
            uint256 count = sample == 0 ? 1 : 8;
            c.tickKeys = new uint64[](count); c.radiiInternal = new uint192[](count);
            for (uint256 i; i < count; ++i) {
                c.tickKeys[i] = i + 1 == count ? type(uint64).max : uint64((n - 1) * GRID - (count - 1 - i) * GRID / 32);
                c.radiiInternal[i] = uint192(4e18 * U);
            }
            c.initialAmountsRaw = funding(c); ISwapVM.Order memory order = orderFor(c);
            vm.prank(maker); bytes32 h = aqua.ship(address(target), abi.encode(order), list, c.initialAmountsRaw);
            vm.prank(maker); target.activateStrategy(c, order);
            OrbitalStrategyState memory state = target.getStrategyState(h);
            assertEq(state.X.length, n); assertEq(state.interiorTickMask, (uint256(1) << count) - 1); assertLt(state.slackBoundInternal, U);
        }
    }
    function testInitializationAtMinimumCapWidthAndNearMaximumLength() public {
        OrbitalConfigV1 memory c = config(0);
        uint256 largestDistance = W.sqrt(W.Uint512(0, 3 * GRID * GRID - 3 * GRID));
        c.tickKeys[0] = uint64(3 * GRID - largestDistance);
        c.initialAmountsRaw = funding(c);
        ISwapVM.Order memory order = orderFor(c); bytes32 h = ship(c, order);
        vm.prank(maker); router.activateStrategy(c, order);
        assertEq(router.getStrategyState(h).interiorTickMask, 7);
        c = config(1);
        uint192 radius = uint192(((uint256(1) << 160) - 1) / 3);
        for (uint256 i; i < 3; ++i) c.radiiInternal[i] = radius;
        c.initialAmountsRaw = funding(c);
        for (uint256 i; i < 3; ++i) assets[i].mint(maker, c.initialAmountsRaw[i]);
        order = orderFor(c); h = ship(c, order);
        vm.prank(maker); router.activateStrategy(c, order);
        OrbitalStrategyState memory state = router.getStrategyState(h);
        assertEq(state.interiorRadius, (uint256(1) << 160) - 1);
        assertLt(state.slackBoundInternal, U); assertGt(state.sumSquaresInternal.hi, 0);
    }
    function testRouterFitsEIP170RuntimeLimit() public {
        // Measure the deployable production contract. The guard harness adds
        // storage mutation/testing methods that are not part of deployment.
        Router production = new Router(address(aqua), address(this), tokens, precisions);
        assertLe(address(production).code.length, 24_576);
    }
}
