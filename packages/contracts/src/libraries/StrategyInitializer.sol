// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OrbitalConfigV1} from "../interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState, OrbitalStrategyStatus} from "../interfaces/IOrbitalLifecycle.sol";
import {OrbitalMath as M} from "./OrbitalMath.sol";
import {TickGeometry as G} from "./TickGeometry.sol";
import {WideMath as W} from "./WideMath.sol";

/// @notice Directed equal-point initialization only; not a swap solver.
library StrategyInitializer {
    uint256 internal constant Q = 1 << 128;
    uint256 internal constant U = 1 << 64;
    uint256 internal constant GRID = 1 << 32;
    error InvalidInitialAmounts();
    error InsufficientInitialFunding();
    error UncertifiableInitialization();
    struct InitialState {
        OrbitalStrategyState state;
        M.Tick[] ticks;
        uint256[] sigmaLower;
        uint256[] sigmaUpper;
    }
    /// @dev Caller first applies OrbitalOrderCodec.validateShape. All coordinates
    /// share one upper-rounded R*q0; coefficient/rounding error is bounded below.
    function initialize(OrbitalConfigV1 calldata config, bytes32 configHash) public pure returns (InitialState memory result) {
        uint256 n = config.tokens.length;
        uint256 count = config.tickKeys.length;
        result.ticks = new M.Tick[](count); result.sigmaLower = new uint256[](count); result.sigmaUpper = new uint256[](count);
        OrbitalStrategyState memory state;
        state.maker = config.maker; state.configHash = configHash; state.status = OrbitalStrategyStatus.Active; state.version = 1;
        state.X = new uint256[](n); state.principalInternal = new uint256[](n); state.cumulativeFeeRaw = new uint256[](n);
        for (uint256 i; i < count; ++i) {
            G.Coefficients memory coefficients = G.coefficients(uint8(n), config.tickKeys[i]);
            uint256 radius = config.radiiInternal[i];
            result.ticks[i] = M.Tick(config.tickKeys[i], config.radiiInternal[i], coefficients);
            state.interiorRadius += radius;
            state.virtualInternal += W.mulDiv(radius, coefficients.virtualLo, Q, false);
            result.sigmaLower[i] = W.mulDiv(radius, coefficients.sigmaLo, Q, false);
            result.sigmaUpper[i] = W.mulDiv(radius, coefficients.sigmaHi, Q, true);
        }
        G.Coefficients memory equal = result.ticks[count - 1].coefficients;
        uint256 coordinate = W.mulDiv(state.interiorRadius, equal.equalHi, Q, true);
        uint256 lower = W.mulDiv(state.interiorRadius, equal.equalLo, Q, false);
        // R-||R*1-X|| = sqrt(n)*(X-R*q0) at equal coordinates. The bracket
        // encloses R*q0, so this is a length bound, not a squared residual epsilon.
        state.slackBoundInternal = (n <= 4 ? 2 : 3) * (coordinate - lower);
        if (coordinate < state.virtualInternal || coordinate >= uint256(1) << 160 || state.slackBoundInternal > U) revert UncertifiableInitialization();
        state.sumInternal = n * coordinate;
        // Initialization must remain on the all-interior side of every cap.
        if (count > 1 && state.sumInternal * GRID >= state.interiorRadius * config.tickKeys[0]) revert UncertifiableInitialization();
        uint256 anchorRadius = config.radiiInternal[count - 1];
        uint256 anchorLower = W.mulDiv(anchorRadius, equal.equalLo, Q, false);
        uint256 anchorUpper = W.mulDiv(anchorRadius, equal.equalHi, Q, true);
        // Anchor principal cannot undershoot one whole token by more than one
        // normalized atom; final raw rounding must still fund a whole token.
        if (anchorLower + U < 1e18 * U) revert InsufficientInitialFunding();
        uint256 principal = coordinate - state.virtualInternal;
        for (uint256 i; i < n; ++i) {
            uint256 scale = scaleFor(config.decimals[i]);
            uint256 raw = principal / scale + (principal % scale == 0 ? 0 : 1);
            if (raw != config.initialAmountsRaw[i]) revert InvalidInitialAmounts();
            if (anchorUpper / scale + (anchorUpper % scale == 0 ? 0 : 1) < 10 ** config.decimals[i]) revert InsufficientInitialFunding();
            state.X[i] = coordinate; state.principalInternal[i] = principal;
            state.sumSquaresInternal = W.add(state.sumSquaresInternal, W.mul(coordinate, coordinate));
        }
        state.interiorTickMask = uint8((uint256(1) << count) - 1);
        if (!M.certify(state.X, result.ticks)) revert UncertifiableInitialization();
        result.state = state;
    }
    function scaleFor(uint8 decimals_) internal pure returns (uint256) { return 10 ** (18 - decimals_) * U; }
}
