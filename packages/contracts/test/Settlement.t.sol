// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Aqua} from "../vendor/aqua/src/Aqua.sol";
import {IAqua} from "../vendor/aqua/src/interfaces/IAqua.sol";
import {OrbitalSettlement as Settlement} from "../src/libraries/OrbitalSettlement.sol";
import {OrbitalStorage as S} from "../src/libraries/OrbitalStorage.sol";
import {OrbitalStrategyStatus} from "../src/interfaces/IOrbitalLifecycle.sol";

contract SettlementToken is ERC20 {
    uint8 private precision = 6;
    uint8 public transferMode;
    bool public stickyAllowance;
    bool public refuseClear;
    address public clearMint;
    address public clearCallback;
    address public crossClearToken;
    address public crossClearOwner;
    address public crossClearSpender;
    bool public callbackBlocked;
    constructor() ERC20("Settlement fixture", "SET") {}
    function decimals() public view override returns (uint8) { return precision; }
    function setDecimals(uint8 value) external { precision = value; }
    function mint(address to, uint256 value) external { _mint(to, value); }
    function burn(address from, uint256 value) external { _burn(from, value); }
    function setMode(uint8 value) external { transferMode = value; }
    function setSticky(bool value) external { stickyAllowance = value; }
    function forceAllowance(address owner, address spender, uint256 value) external { _approve(owner, spender, value); }
    function setCrossClear(address token, address owner, address spender) external {
        crossClearToken = token; crossClearOwner = owner; crossClearSpender = spender;
    }
    function setClear(bool refuse, address mintTo, address callback) external {
        refuseClear = refuse; clearMint = mintTo; clearCallback = callback;
    }
    function approve(address spender, uint256 value) public override returns (bool) {
        if (value == 0) {
            if (refuseClear) return true;
            if (clearMint != address(0)) _mint(clearMint, 1);
            if (clearCallback != address(0)) {
                (bool ok,) = clearCallback.call(abi.encodeWithSignature("reenter()"));
                callbackBlocked = !ok;
            }
            if (crossClearToken != address(0)) SettlementToken(crossClearToken).forceAllowance(crossClearOwner, crossClearSpender, 1);
        }
        return super.approve(spender, value);
    }
    function _spendAllowance(address owner, address spender, uint256 value) internal override {
        if (!stickyAllowance) super._spendAllowance(owner, spender, value);
    }
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || value == 0) { super._update(from, to, value); return; }
        if (transferMode == 1) {
            super._update(from, to, value - 1); super._update(from, address(0), 1);
        } else {
            super._update(from, to, value);
            if (transferMode == 2) super._update(address(0), to, 1);
            if (transferMode == 3) super._update(from, address(0), 1);
        }
    }
}

/// @dev Official-Aqua transfer harness with explicitly synthetic principal.
/// It validates settlement only: no price, curve, instruction, or router claim.
contract SettlementHarness {
    using SafeERC20 for IERC20;
    uint256 private constant SCALE = 1e12 * (1 << 64);
    IAqua public immutable aqua;
    bytes32 public immutable orderHash;
    address public immutable maker;
    error Reentrancy();
    constructor(IAqua a, address m, address[] memory tokens, bytes32 hash) {
        aqua = a; maker = m; orderHash = hash;
        S.Strategy storage s = S.layout().strategies[hash];
        s.config.maker = m; s.config.router = address(this); s.config.chainId = block.chainid;
        s.config.tokens = tokens; s.state.maker = m; s.state.status = OrbitalStrategyStatus.Active;
        for (uint256 i; i < tokens.length; ++i) {
            s.config.decimals.push(6); s.state.principalInternal.push(500 * SCALE);
            s.state.cumulativeFeeRaw.push(0);
        }
    }
    function reenter() external view { if (S.layout().entered) revert Reentrancy(); }
    function guard() external view returns (bool) { return S.layout().entered; }
    function principal(uint8 i) external view returns (uint256) { return S.layout().strategies[orderHash].state.principalInternal[i]; }
    function fees(uint8 i) external view returns (uint256) { return S.layout().strategies[orderHash].state.cumulativeFeeRaw[i]; }
    function beginOnly(address taker, address recipient, uint8 input, uint8 output, uint256 gross, bool lock) external {
        S.layout().entered = lock;
        Settlement.begin(S.layout().strategies[orderHash], orderHash, aqua, taker, recipient, input, output, gross);
    }
    function finishOnly(bytes32 hash, uint256 gross, uint256 output) external {
        Settlement.finish(S.layout().strategies[orderHash], hash, aqua, gross, output);
    }
    function finishWithoutSnapshot() external {
        S.layout().entered = true;
        Settlement.finish(S.layout().strategies[orderHash], orderHash, aqua, 100, 50);
    }
    function run(address recipient, uint8 input, uint8 output, uint256 gross, uint256 paid, uint8 mutation) external {
        if (S.layout().entered) revert Reentrancy();
        S.layout().entered = true;
        S.Strategy storage s = S.layout().strategies[orderHash];
        Settlement.begin(s, orderHash, aqua, msg.sender, recipient, input, output, gross);
        // Independent accounting fixture: charge one raw input atom outside principal.
        s.state.principalInternal[input] += (gross - 1) * SCALE;
        s.state.principalInternal[output] -= paid * SCALE;
        s.state.cumulativeFeeRaw[input] += 1;
        IERC20 tokenIn = IERC20(s.config.tokens[input]);
        tokenIn.safeTransferFrom(msg.sender, address(this), gross);
        tokenIn.forceApprove(address(aqua), gross);
        aqua.push(maker, address(this), orderHash, address(tokenIn), gross);
        aqua.pull(maker, orderHash, s.config.tokens[output], paid, recipient);
        if (mutation == 1) aqua.pull(maker, orderHash, address(tokenIn), 1, maker);
        if (mutation == 2) aqua.pull(maker, orderHash, s.config.tokens[output], 1, maker);
        if (mutation == 3) aqua.pull(maker, orderHash, s.config.tokens[2], 501, maker);
        if (mutation == 4) SettlementToken(s.config.tokens[output]).mint(msg.sender, 1);
        if (mutation == 5) SettlementToken(s.config.tokens[input]).mint(recipient, 1);
        if (mutation == 6) SettlementToken(s.config.tokens[input]).mint(address(this), 1);
        if (mutation == 7) SettlementToken(s.config.tokens[2]).setDecimals(18);
        Settlement.finish(s, orderHash, aqua, gross, paid);
        // The library must not release the router's global guard before its event.
        assert(S.layout().entered);
        S.layout().entered = false;
    }
}

contract SettlementTest is Test {
    Aqua aqua;
    SettlementHarness harness;
    SettlementToken[3] token;
    address maker = address(0xA11CE);
    address taker = address(0xB0B);
    address recipient = address(0xCAFE);
    bytes constant STRATEGY = "independent settlement fixture";
    bytes32 orderHash;
    function setUp() public {
        aqua = new Aqua(); orderHash = keccak256(STRATEGY);
        address[] memory tokens = new address[](3);
        uint256[] memory allocations = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            token[i] = new SettlementToken(); tokens[i] = address(token[i]); allocations[i] = 1000;
            token[i].mint(maker, 10000); token[i].mint(taker, 10000);
            vm.prank(maker); token[i].approve(address(aqua), type(uint256).max);
        }
        harness = new SettlementHarness(aqua, maker, tokens, orderHash);
        vm.prank(maker); aqua.ship(address(harness), STRATEGY, tokens, allocations);
        for (uint256 i; i < 3; ++i) { vm.prank(taker); token[i].approve(address(harness), 10000); }
    }
    function execute(address to, uint8 input, uint8 output, uint8 mutation) private {
        vm.prank(taker); harness.run(to, input, output, 100, 50, mutation);
    }
    function assertRollback() private view {
        assertEq(token[0].balanceOf(maker), 10000); assertEq(token[0].balanceOf(taker), 10000);
        assertEq(token[1].balanceOf(maker), 10000); assertEq(token[1].balanceOf(recipient), 0);
        assertEq(token[0].balanceOf(address(harness)), 0);
        assertEq(harness.fees(0), 0); assertEq(harness.principal(0), 500e12 * (1 << 64));
        assertFalse(harness.guard());
        (uint248 q0,) = aqua.rawBalances(maker, address(harness), orderHash, address(token[0]));
        (uint248 q1,) = aqua.rawBalances(maker, address(harness), orderHash, address(token[1]));
        assertEq(q0, 1000); assertEq(q1, 1000);
    }
    function testOfficialAquaExactDeltasAllSixPairsAndDistinctRecipient() public {
        for (uint8 i; i < 3; ++i) for (uint8 j; j < 3; ++j) if (i != j) execute(recipient, i, j, 0);
        for (uint256 i; i < 3; ++i) {
            assertEq(token[i].balanceOf(maker), 10100); assertEq(token[i].balanceOf(taker), 9800);
            assertEq(token[i].balanceOf(recipient), 100); assertEq(token[i].balanceOf(address(harness)), 0);
            assertEq(token[i].allowance(address(harness), address(aqua)), 0);
            assertEq(harness.fees(uint8(i)), 2);
            (uint248 allocation, uint8 count) = aqua.rawBalances(maker, address(harness), orderHash, address(token[i]));
            assertEq(allocation, 1100); assertEq(count, 3);
        }
    }
    function testAliasedTakerRecipientAndPreexistingDonationsRemainExact() public {
        token[0].mint(address(harness), 77); token[1].mint(address(harness), 99);
        execute(taker, 0, 1, 0);
        assertEq(token[0].balanceOf(taker), 9900); assertEq(token[1].balanceOf(taker), 10050);
        assertEq(token[0].balanceOf(address(harness)), 77); assertEq(token[1].balanceOf(address(harness)), 99);
    }
    function testUnconsumedAllowanceClearedUnderGuardBeforeFinalReads() public {
        token[0].setSticky(true); token[0].setClear(false, address(0), address(harness));
        execute(taker, 0, 1, 0);
        assertTrue(token[0].callbackBlocked()); assertEq(token[0].allowance(address(harness), address(aqua)), 0);
        assertFalse(harness.guard());
    }
    function testCleanupMutationAndLyingApprovalRejectAtomically() public {
        token[0].setSticky(true); token[0].setClear(false, address(harness), address(0));
        vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, address(token[0]), address(harness)));
        execute(recipient, 0, 1, 0); assertRollback();
        token[0].setClear(true, address(0), address(0));
        vm.expectRevert(abi.encodeWithSelector(Settlement.ApprovalNotCleared.selector, address(token[0])));
        execute(recipient, 0, 1, 0); assertRollback();
    }
    function testSecondCleanupCannotReintroduceFirstTokenApproval() public {
        token[0].setSticky(true);
        token[1].forceAllowance(address(harness), address(aqua), 1);
        token[1].setCrossClear(address(token[0]), address(harness), address(aqua));
        vm.expectRevert(abi.encodeWithSelector(Settlement.ApprovalNotCleared.selector, address(token[0])));
        execute(recipient, 0, 1, 0); assertRollback();
        assertEq(token[1].allowance(address(harness), address(aqua)), 1);
    }
    function testFeeOnTransferAndOvercreditAndExtraSenderDebitReject() public {
        token[1].setMode(1); vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, address(token[1]), recipient)); execute(recipient, 0, 1, 0); assertRollback();
        token[1].setMode(2); vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, address(token[1]), recipient)); execute(recipient, 0, 1, 0); assertRollback();
        token[1].setMode(3); vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, address(token[1]), maker)); execute(recipient, 0, 1, 0); assertRollback();
    }
    function testRouterDonationCannotSubsidizeTaxedInput() public {
        token[0].mint(address(harness), 77); token[0].setMode(1);
        vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, address(token[0]), address(harness))); execute(recipient, 0, 1, 0);
        assertEq(token[0].balanceOf(address(harness)), 77); assertEq(harness.fees(0), 0);
    }
    function testCrossTokenRoleMutationsAndRouterDonationReject() public {
        for (uint8 fault = 4; fault <= 6; ++fault) {
            address asset = fault == 4 ? address(token[1]) : address(token[0]);
            address account = fault == 4 ? taker : (fault == 5 ? recipient : address(harness));
            vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedTokenDelta.selector, asset, account)); execute(recipient, 0, 1, fault); assertRollback();
        }
    }
    function testLogicalAquaDeltasAndUntouchedTokenBackingAreChecked() public {
        for (uint8 fault = 1; fault <= 2; ++fault) {
            vm.expectRevert(abi.encodeWithSelector(Settlement.UnexpectedAquaDelta.selector, address(token[fault - 1]))); execute(recipient, 0, 1, fault); assertRollback();
        }
        vm.expectRevert(S.InadequateBacking.selector); execute(recipient, 0, 1, 3); assertRollback();
    }
    function testDecimalsMutationOnUntouchedTokenRejects() public {
        vm.expectRevert(abi.encodeWithSelector(Settlement.TokenDecimalsChanged.selector, address(token[2])));
        execute(recipient, 0, 1, 7); assertRollback(); assertEq(token[2].decimals(), 6);
    }
    function testSnapshotRequiresGuardAndValidNondegenerateRoles() public {
        vm.expectRevert(Settlement.GuardRequired.selector); harness.beginOnly(taker, recipient, 0, 1, 100, false);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(maker, recipient, 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, maker, 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, address(harness), 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, address(aqua), 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, address(0), 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, recipient, 0, 0, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, recipient, 0, 3, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.beginOnly(taker, recipient, 0, 1, 0, true);
    }
    function testSnapshotIdentityAmountsAndNestedBeginReject() public {
        vm.expectRevert(Settlement.SnapshotMissing.selector); harness.finishWithoutSnapshot();
        harness.beginOnly(taker, recipient, 0, 1, 100, true);
        vm.expectRevert(Settlement.SnapshotActive.selector); harness.beginOnly(taker, recipient, 0, 1, 100, true);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.finishOnly(bytes32(uint256(1)), 100, 50);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.finishOnly(orderHash, 99, 50);
        vm.expectRevert(Settlement.InvalidSettlement.selector); harness.finishOnly(orderHash, 100, 0);
    }
}
