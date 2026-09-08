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
import {OrbitalSettlement as Settlement} from "../src/libraries/OrbitalSettlement.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

/// @dev Adversarial behavior is enabled only after genuine activation. This
/// fixture does not replace the router, curve, token reads or official Aqua.
contract SecurityDollar is ERC20 {
    uint8 private immutable precision;
    address public router;
    address public aqua;
    address public callback;
    uint8 public callbackMask;
    bool public sticky;
    bool public taxed;
    bool public refuseClear;
    address public clearMint;
    address public clearRestore;
    address public rejectedRecipient;
    error RecipientRejected();
    constructor(uint8 d) ERC20("Security fixture dollar", "SEC") { precision = d; }
    function decimals() public view override returns (uint8) { return precision; }
    function mint(address to, uint256 value) external { _mint(to, value); }
    function configure(address r, address a) external { router = r; aqua = a; }
    function setCallback(address target, uint8 mask) external { callback = target; callbackMask = mask; }
    function setSticky(bool value) external { sticky = value; }
    function setTaxed(bool value) external { taxed = value; }
    function setRejectedRecipient(address value) external { rejectedRecipient = value; }
    function setCleanup(bool refuse, address mintTo, address restoreToken) external { refuseClear = refuse; clearMint = mintTo; clearRestore = restoreToken; }
    function forceAllowance(address owner, address spender, uint256 value) external { _approve(owner, spender, value); }
    function _hook(uint8 phase) private {
        if (callback != address(0) && callbackMask & uint8(1 << phase) != 0) SecurityReentryProbe(callback).onTokenCallback(phase);
    }
    function approve(address spender, uint256 value) public override returns (bool) {
        if (msg.sender == router && spender == aqua) {
            _hook(value == 0 ? 3 : 2);
            if (value == 0) {
                if (refuseClear) return true;
                if (clearMint != address(0)) _mint(clearMint, 1);
                if (clearRestore != address(0)) SecurityDollar(clearRestore).forceAllowance(router, aqua, 1);
            }
        }
        return super.approve(spender, value);
    }
    function _spendAllowance(address owner, address spender, uint256 amount) internal override {
        if (!(sticky && owner == router && spender == aqua)) super._spendAllowance(owner, spender, amount);
    }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0) && amount != 0) {
            if (to == rejectedRecipient) revert RecipientRejected();
            _hook(1);
            if (taxed) { super._update(from, to, amount - 1); super._update(from, address(0), 1); return; }
        }
        super._update(from, to, amount);
    }
}

contract SecurityReentryProbe {
    address private router;
    bytes[] private attempts;
    bytes private immutableRead;
    bytes32 private expectedMetadata;
    uint256 public callbacks;
    uint256 public blocked;
    uint8 public phases;
    function configure(address r, bytes[] memory calls, bytes memory read, bytes32 expected) external {
        router = r; attempts = calls; immutableRead = read; expectedMetadata = expected;
    }
    function onTokenCallback(uint8 phase) external {
        callbacks++; phases |= uint8(1 << phase);
        for (uint256 i; i < attempts.length; ++i) {
            (bool success, bytes memory result) = router.call(attempts[i]);
            require(!success && result.length >= 4 && bytes4(result) == Router.Reentrancy.selector, "WRONG_REENTRY_RESULT");
            blocked++;
        }
        (bool readable, bytes memory metadata) = router.staticcall(immutableRead);
        require(readable && keccak256(metadata) == expectedMetadata, "IMMUTABLE_METADATA_HIDDEN");
    }
}

/// @dev Shared fixture arithmetic for the separate local receipt campaign.
/// Production coefficient reuse is intentional; this is not a math oracle.
contract SecurityFunding {
    function requiredAmounts(uint8[] calldata precisions) external pure returns (uint256[] memory amounts) {
        uint256 u = 1 << 64; uint256 grid = 1 << 32; uint256 credit;
        uint64[3] memory keys = [uint64(3 * grid / 2), uint64(7 * grid / 4), type(uint64).max];
        for (uint256 i; i < 3; ++i) credit += W.mulDiv((100 << i) * 1e18 * u, G.coefficients(3, keys[i]).virtualLo, 1 << 128, false);
        uint256 x = W.mulDiv(700e18 * u, G.coefficients(3, type(uint64).max).equalHi, 1 << 128, true);
        amounts = new uint256[](3);
        for (uint256 i; i < 3; ++i) { uint256 scale = 10 ** (18 - precisions[i]) * u; amounts[i] = (x - credit + scale - 1) / scale; }
    }
}

contract RouterSettlementSecurityTest is Test {
    Aqua aqua; Router router; SecurityDollar[] assets; address[] tokens; uint8[] precisions;
    address maker = address(0xA11CE); address taker = address(0xB0B); address recipient = address(0xCAFE);
    ISwapVM.Order order; ISwapVM.Order otherOrder; OrbitalConfigV1 draft; ISwapVM.Order draftOrder;
    bytes32 orderHash; bytes32 otherHash;
    bytes32 constant EXECUTED = keccak256("OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])");

    function setUp() public {
        aqua = new Aqua(); SecurityDollar[] memory list = new SecurityDollar[](3);
        list[0] = new SecurityDollar(6); list[1] = new SecurityDollar(18); list[2] = new SecurityDollar(6);
        for (uint256 i; i < 3; ++i) for (uint256 j = i + 1; j < 3; ++j) if (address(list[i]) > address(list[j])) (list[i], list[j]) = (list[j], list[i]);
        for (uint256 i; i < 3; ++i) {
            assets.push(list[i]); tokens.push(address(list[i])); precisions.push(list[i].decimals());
            list[i].mint(maker, 10000 * 10 ** list[i].decimals()); list[i].mint(taker, 10000 * 10 ** list[i].decimals());
            vm.prank(maker); list[i].approve(address(aqua), type(uint256).max);
        }
        router = new Router(address(aqua), address(this), tokens, precisions); router.renounceOwnership();
        for (uint256 i; i < 3; ++i) { assets[i].configure(address(router), address(aqua)); vm.prank(taker); assets[i].approve(address(router), type(uint256).max); }
        OrbitalConfigV1 memory c = config(0); order = canonicalOrder(c); orderHash = publish(c, order);
        c.makerNonce = 1; otherOrder = canonicalOrder(c); otherHash = publish(c, otherOrder);
        c.makerNonce = 2; draft = c; draftOrder = canonicalOrder(c);
    }
    function config(uint64 nonce) private returns (OrbitalConfigV1 memory c) {
        c.schemaVersion = 1; c.chainId = block.chainid; c.router = address(router); c.maker = maker; c.makerNonce = nonce;
        c.tokens = tokens; c.decimals = precisions; c.feePpm = 500;
        c.tickKeys = new uint64[](3); c.tickKeys[0] = uint64(3 * (1 << 32) / 2); c.tickKeys[1] = uint64(7 * (1 << 32) / 4); c.tickKeys[2] = type(uint64).max;
        c.radiiInternal = new uint192[](3); for (uint256 i; i < 3; ++i) c.radiiInternal[i] = uint192((100 << i) * 1e18 * (1 << 64));
        c.initialAmountsRaw = new SecurityFunding().requiredAmounts(precisions);
    }
    function canonicalOrder(OrbitalConfigV1 memory c) private pure returns (ISwapVM.Order memory) {
        MakerTraitsLib.Args memory a; a.maker = c.maker; a.tokenA = c.tokens[0]; a.tokenB = c.tokens[1]; a.useAquaInsteadOfSignature = true;
        bytes32 h = keccak256(abi.encode(c)); a.program = bytes.concat(hex"7220", h, hex"5220", h); return MakerTraitsLib.build(a);
    }
    function publish(OrbitalConfigV1 memory c, ISwapVM.Order memory selected) private returns (bytes32 h) {
        vm.prank(maker); h = aqua.ship(address(router), abi.encode(selected), tokens, c.initialAmountsRaw);
        vm.prank(maker); router.activateStrategy(c, selected);
    }
    function data(uint8 input, uint8 output, address to, uint256 minimum) private view returns (bytes memory) {
        TakerTraitsLib.Args memory a; a.taker = taker; a.to = to; a.isExactIn = true; a.isAToB = true;
        a.isFirstTransferFromTaker = true; a.useTransferFromAndAquaPush = true; a.deadline = uint40(block.timestamp + 60);
        a.threshold = abi.encode(minimum); a.instructionsArgs = abi.encodePacked(uint8(1), input, output, uint8(0)); return TakerTraitsLib.build(a);
    }
    function quote(uint8 input, uint8 output, uint256 gross, address to) private returns (uint256 amountOut) {
        vm.prank(taker); (, amountOut,) = ISwapVM(address(router)).quote(order, gross, data(input, output, to, 1));
    }
    function snapshot(address payments) private view returns (bytes32 digest) {
        digest = keccak256(abi.encode(router.getStrategyState(orderHash), router.getStrategyState(otherHash), router.nextMakerNonce(maker)));
        address[5] memory roles = [maker, taker, recipient, address(router), payments];
        for (uint256 i; i < 3; ++i) {
            for (uint256 j; j < 5; ++j) digest = keccak256(abi.encode(digest, assets[i].balanceOf(roles[j])));
            (uint248 a, uint8 count) = aqua.rawBalances(maker, address(router), orderHash, tokens[i]);
            (uint248 b, uint8 otherCount) = aqua.rawBalances(maker, address(router), otherHash, tokens[i]);
            digest = keccak256(abi.encode(digest, a, count, b, otherCount, assets[i].totalSupply(),
                assets[i].allowance(maker, address(aqua)), assets[i].allowance(taker, address(router)),
                assets[i].allowance(address(router), address(aqua)), assets[i].allowance(payments, address(router)), assets[i].allowance(taker, payments)));
        }
    }
    function canonicalLogs(Vm.Log[] memory logs) private view returns (uint256 count) {
        for (uint256 i; i < logs.length; ++i) if (logs[i].emitter == address(router) && logs[i].topics.length > 0 && logs[i].topics[0] == EXECUTED) count++;
    }
    function failSwap(uint256 gross, uint256 minimum, bytes4 expected) private {
        bytes32 beforeState = snapshot(address(0)); vm.recordLogs();
        vm.prank(taker); (bool success, bytes memory reason) = address(router).call(abi.encodeCall(ISwapVM.swap, (order, gross, data(0, 1, recipient, minimum))));
        assertFalse(success); assertEq(bytes4(reason), expected); assertEq(snapshot(address(0)), beforeState);
        // These failures precede canonical emission. recordLogs is an execution
        // inspector, not proof that a reverted transaction receipt has no logs.
        assertEq(canonicalLogs(vm.getRecordedLogs()), 0);
    }
    function recover(uint256 gross, uint256 minimum) private {
        vm.prank(taker); router.swap(order, gross, data(0, 1, recipient, minimum));
        assertEq(router.getStrategyState(orderHash).version, 2); assertEq(router.getStrategyState(otherHash).version, 1);
        assertEq(assets[0].allowance(address(router), address(aqua)), 0); assertEq(assets[1].allowance(address(router), address(aqua)), 0);
    }

    function testRealTransferAndApprovalCallbacksRejectEveryMutableAndCoherentReadEntry() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        SecurityReentryProbe probe = new SecurityReentryProbe(); bytes[] memory calls = new bytes[](10);
        calls[0] = abi.encodeCall(ISwapVM.swap, (order, gross, data(0, 1, recipient, expected)));
        calls[1] = abi.encodeCall(ISwapVM.swap, (otherOrder, gross, data(0, 1, recipient, expected)));
        calls[2] = abi.encodeCall(Router.activateStrategy, (draft, draftOrder));
        calls[3] = abi.encodeCall(Router.retireStrategy, (orderHash)); calls[4] = abi.encodeCall(Router.retireStrategy, (otherHash));
        calls[5] = abi.encodeCall(Router.getStrategyState, (orderHash)); calls[6] = abi.encodeCall(Router.getStrategyState, (otherHash));
        calls[7] = abi.encodeCall(Router.getStrategyAvailability, (orderHash));
        calls[8] = abi.encodeCall(ISwapVM.quote, (order, gross, data(0, 1, recipient, expected)));
        calls[9] = abi.encodeCall(ISwapVM.quote, (otherOrder, gross, data(0, 1, recipient, expected)));
        probe.configure(address(router), calls, abi.encodeCall(Router.getStrategyConfig, (orderHash)), keccak256(abi.encode(router.getStrategyConfig(orderHash))));
        assets[0].setSticky(true); assets[0].setCallback(address(probe), 14); assets[1].setCallback(address(probe), 2);
        vm.recordLogs(); recover(gross, expected);
        assertEq(probe.phases(), 14); assertGe(probe.callbacks(), 5); assertEq(probe.blocked(), 10 * probe.callbacks());
        assertEq(canonicalLogs(vm.getRecordedLogs()), 1); assertEq(router.nextMakerNonce(maker), 2);
        // An ordinary subsequent quote proves successful guard/snapshot release.
        assertGt(quote(1, 0, 10 ** precisions[1], taker), 0);
    }
    function testTaxedInputCannotUseRouterDonationAndRevertsFullCertifiedState() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        assets[0].mint(address(router), 77); assets[0].setTaxed(true);
        failSwap(gross, expected, Settlement.UnexpectedTokenDelta.selector);
        assets[0].setTaxed(false); recover(gross, expected); assertEq(assets[0].balanceOf(address(router)), 77);
    }
    function testTaxedOutputRevertsPrincipalFeesVersionTokensAndAllocation() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        assets[1].setTaxed(true); failSwap(gross, expected, Settlement.UnexpectedTokenDelta.selector);
        assets[1].setTaxed(false); recover(gross, expected);
    }
    function testCleanupBalanceMutationRevertsActualCurveAndMint() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        assets[0].setSticky(true); assets[0].setCleanup(false, maker, address(0));
        failSwap(gross, expected, Settlement.UnexpectedTokenDelta.selector);
        assets[0].setCleanup(false, address(0), address(0)); recover(gross, expected);
    }
    function testLyingZeroApprovalRevertsAndDoesNotLeakSnapshotOrGlobalGuard() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        assets[0].setSticky(true); assets[0].setCleanup(true, address(0), address(0));
        failSwap(gross, expected, Settlement.ApprovalNotCleared.selector);
        assets[0].setCleanup(false, address(0), address(0)); recover(gross, expected);
    }
    function testSecondCleanupCannotRestoreFirstTokenApproval() public {
        uint256 gross = 10 ** precisions[0]; uint256 expected = quote(0, 1, gross, recipient);
        assets[0].setSticky(true); assets[1].forceAllowance(address(router), address(aqua), 1);
        assets[1].setCleanup(false, address(0), tokens[0]); failSwap(gross, expected, Settlement.ApprovalNotCleared.selector);
        assets[1].setCleanup(false, address(0), address(0)); recover(gross, expected);
    }
    function testInvoiceSecondRecipientFailureRevertsRealCurveAndEarlierSplitThenRecovers() public {
        uint8 output; while (precisions[output] != 6) ++output; uint8 input = output == 0 ? 1 : 0;
        Payments payments = new Payments(tokens[output], address(router), tokens);
        address[] memory recipients = new address[](2); recipients[0] = recipient; recipients[1] = address(0xF00D);
        uint16[] memory bps = new uint16[](2); bps[0] = 9000; bps[1] = 1000;
        bytes32 id = payments.createInvoice(5e6, uint40(block.timestamp + 3600), recipients, bps, 0);
        uint256 gross = 6 * 10 ** precisions[input]; vm.prank(taker); assets[input].approve(address(payments), gross);
        assets[input].mint(address(payments), 99); assets[output].mint(address(payments), 77);
        assets[output].setRejectedRecipient(recipients[1]);
        bytes32 beforeState = snapshot(address(payments)); bytes32 beforeInvoice = keccak256(abi.encode(payments.getInvoice(id)));
        vm.recordLogs(); vm.prank(taker);
        (bool success, bytes memory reason) = address(payments).call(abi.encodeCall(Payments.payWithSwap, (id, order, input, gross, 5e6, uint40(block.timestamp + 60), uint8(0))));
        assertFalse(success); assertEq(bytes4(reason), SecurityDollar.RecipientRejected.selector);
        assertEq(snapshot(address(payments)), beforeState); assertEq(keccak256(abi.encode(payments.getInvoice(id))), beforeInvoice);
        assertEq(assets[output].balanceOf(recipients[1]), 0);
        // Foundry captures this reverted nested log. It proves the real curve
        // and settlement finished before the later recipient forced rollback.
        assertEq(canonicalLogs(vm.getRecordedLogs()), 1);
        assets[output].setRejectedRecipient(address(0)); vm.prank(taker);
        payments.payWithSwap(id, order, input, gross, 5e6, uint40(block.timestamp + 60), 0);
        assertEq(uint8(payments.getInvoice(id).status), uint8(Payments.Status.Paid)); assertEq(router.getStrategyState(orderHash).version, 2);
        assertEq(assets[output].balanceOf(recipient), 4_500_000); assertEq(assets[output].balanceOf(recipients[1]), 500_000);
    }
}
