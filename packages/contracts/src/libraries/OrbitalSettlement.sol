// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAqua} from "../../vendor/aqua/src/interfaces/IAqua.sol";
import {OrbitalStorage as S} from "./OrbitalStorage.sol";
import {OrbitalStrategyStatus} from "../interfaces/IOrbitalLifecycle.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Exact token and official Aqua accounting around the pinned VM transfers.
/// @dev Called by the router under its global guard, before execution and after
/// both transfers. This library neither computes a curve nor changes principal.
/// The immutable strategy metadata and selected canonical pair are router inputs.
library OrbitalSettlement {
    using SafeERC20 for IERC20;
    error GuardRequired();
    error SnapshotActive();
    error SnapshotMissing();
    error InvalidSettlement();
    error UnexpectedTokenDelta(address token, address account);
    error UnexpectedAquaDelta(address token);
    error ApprovalNotCleared(address token);
    error TokenDecimalsChanged(address token);

    bytes32 private constant SLOT = bytes32(uint256(keccak256("orbital.router.settlement.snapshot.v1")) - 1);
    struct Snapshot {
        bool active;
        IAqua aqua;
        bytes32 orderHash;
        address maker;
        address taker;
        address recipient;
        address tokenIn;
        address tokenOut;
        uint8 inputIndex;
        uint8 outputIndex;
        uint256 gross;
        uint248 allocationIn;
        uint248 allocationOut;
        // Role order: router, maker, taker, recipient. The last two may alias.
        uint256[4] inputBalances;
        uint256[4] outputBalances;
    }
    function _snapshot() private pure returns (Snapshot storage value) {
        bytes32 slot = SLOT;
        assembly ("memory-safe") { value.slot := slot }
    }

    function begin(
        S.Strategy storage strategy, bytes32 orderHash, IAqua aqua,
        address taker, address recipient, uint8 inputIndex, uint8 outputIndex, uint256 gross
    ) public {
        if (!S.layout().entered) revert GuardRequired();
        Snapshot storage snapshot = _snapshot();
        if (snapshot.active) revert SnapshotActive();
        uint256 n = strategy.config.tokens.length;
        address maker = strategy.state.maker;
        if (n < 2 || n > 8 || strategy.config.decimals.length != n || inputIndex >= n || outputIndex >= n ||
            inputIndex == outputIndex || gross == 0 || strategy.state.status != OrbitalStrategyStatus.Active ||
            strategy.config.maker != maker || strategy.config.router != address(this) ||
            maker == address(0) || maker == address(this) || maker == address(aqua) ||
            taker == address(0) || taker == maker || taker == address(this) || taker == address(aqua) ||
            recipient == address(0) || recipient == maker || recipient == address(this) || recipient == address(aqua)) revert InvalidSettlement();
        _checkDecimals(strategy);
        address tokenIn = strategy.config.tokens[inputIndex];
        address tokenOut = strategy.config.tokens[outputIndex];
        if (tokenIn == tokenOut) revert InvalidSettlement();
        (uint248 allocationIn, uint8 inputCount) = aqua.rawBalances(maker, address(this), orderHash, tokenIn);
        (uint248 allocationOut, uint8 outputCount) = aqua.rawBalances(maker, address(this), orderHash, tokenOut);
        if (inputCount != n || outputCount != n) revert S.AquaEntryNotLive();
        snapshot.active = true; snapshot.aqua = aqua; snapshot.orderHash = orderHash;
        snapshot.maker = maker; snapshot.taker = taker; snapshot.recipient = recipient;
        snapshot.tokenIn = tokenIn; snapshot.tokenOut = tokenOut;
        snapshot.inputIndex = inputIndex; snapshot.outputIndex = outputIndex;
        snapshot.gross = gross; snapshot.allocationIn = allocationIn; snapshot.allocationOut = allocationOut;
        address[4] memory roles = [address(this), maker, taker, recipient];
        for (uint256 i; i < 4; ++i) {
            snapshot.inputBalances[i] = IERC20(tokenIn).balanceOf(roles[i]);
            snapshot.outputBalances[i] = IERC20(tokenOut).balanceOf(roles[i]);
        }
    }

    function finish(
        S.Strategy storage strategy, bytes32 orderHash, IAqua aqua, uint256 gross, uint256 output
    ) public {
        if (!S.layout().entered) revert GuardRequired();
        Snapshot storage stored = _snapshot();
        if (!stored.active) revert SnapshotMissing();
        Snapshot memory snapshot = stored;
        if (snapshot.orderHash != orderHash || snapshot.aqua != aqua || snapshot.gross != gross || output == 0 ||
            snapshot.maker != strategy.state.maker || strategy.state.status != OrbitalStrategyStatus.Active ||
            snapshot.tokenIn != strategy.config.tokens[snapshot.inputIndex] ||
            snapshot.tokenOut != strategy.config.tokens[snapshot.outputIndex]) revert InvalidSettlement();

        // Some otherwise standard tokens leave exact allowances unconsumed.
        // Cleanup can call token code: keep the global guard and snapshot active,
        // and perform every final balance/accounting read after BOTH cleanups.
        _clearApproval(snapshot.tokenIn, aqua);
        _clearApproval(snapshot.tokenOut, aqua);
        if (IERC20(snapshot.tokenIn).allowance(address(this), address(aqua)) != 0) revert ApprovalNotCleared(snapshot.tokenIn);
        if (IERC20(snapshot.tokenOut).allowance(address(this), address(aqua)) != 0) revert ApprovalNotCleared(snapshot.tokenOut);
        _checkDecimals(strategy);
        address[4] memory roles = [address(this), snapshot.maker, snapshot.taker, snapshot.recipient];
        bool aliasRecipient = snapshot.taker == snapshot.recipient;
        for (uint256 i; i < 4; ++i) {
            uint256 inputAmount = (i == 1 || i == 2 || (i == 3 && aliasRecipient)) ? gross : 0;
            uint256 outputAmount = (i == 1 || i == 3 || (i == 2 && aliasRecipient)) ? output : 0;
            _checkDelta(snapshot.tokenIn, roles[i], snapshot.inputBalances[i], inputAmount, i == 1);
            _checkDelta(snapshot.tokenOut, roles[i], snapshot.outputBalances[i], outputAmount, i != 1);
        }
        (uint248 inputAllocation, uint8 inputCount) = aqua.rawBalances(snapshot.maker, address(this), orderHash, snapshot.tokenIn);
        (uint248 outputAllocation, uint8 outputCount) = aqua.rawBalances(snapshot.maker, address(this), orderHash, snapshot.tokenOut);
        if (inputCount != strategy.config.tokens.length || outputCount != strategy.config.tokens.length) revert S.AquaEntryNotLive();
        if (inputAllocation < snapshot.allocationIn || uint256(inputAllocation) - snapshot.allocationIn != gross) revert UnexpectedAquaDelta(snapshot.tokenIn);
        if (outputAllocation > snapshot.allocationOut || uint256(snapshot.allocationOut) - outputAllocation != output) revert UnexpectedAquaDelta(snapshot.tokenOut);
        S.assertBacking(strategy, orderHash, aqua);
        // The router emits its canonical event and releases the global guard.
        // Any later revert still rolls back these deletions and all transfers.
        delete stored.active; delete stored.aqua; delete stored.orderHash;
        delete stored.maker; delete stored.taker; delete stored.recipient;
        delete stored.tokenIn; delete stored.tokenOut;
        delete stored.inputIndex; delete stored.outputIndex; delete stored.gross;
        delete stored.allocationIn; delete stored.allocationOut;
        delete stored.inputBalances; delete stored.outputBalances;
    }

    function _clearApproval(address token, IAqua aqua) private {
        IERC20 asset = IERC20(token);
        if (asset.allowance(address(this), address(aqua)) != 0) asset.forceApprove(address(aqua), 0);
    }
    function _checkDelta(address token, address account, uint256 beforeBalance, uint256 amount, bool increase) private view {
        uint256 afterBalance = IERC20(token).balanceOf(account);
        // Compare differences after ordering, never a possibly overflowing sum.
        bool matches = increase ? (afterBalance >= beforeBalance && afterBalance - beforeBalance == amount)
            : (beforeBalance >= afterBalance && beforeBalance - afterBalance == amount);
        if (!matches) revert UnexpectedTokenDelta(token, account);
    }
    function _checkDecimals(S.Strategy storage strategy) private view {
        for (uint256 i; i < strategy.config.tokens.length; ++i) {
            address token = strategy.config.tokens[i];
            if (IERC20Metadata(token).decimals() != strategy.config.decimals[i]) revert TokenDecimalsChanged(token);
        }
    }
}
