// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IOrbitalRouter, OrbitalConfigV1} from "./IOrbitalRouter.sol";
import {ISwapVM} from "../../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {WideMath} from "../libraries/WideMath.sol";

/// @dev ABI enum values: Unknown=0, Active=1, Retired=2. Docking and physical
/// funding are observations, never lifecycle state mutations performed by views.
enum OrbitalStrategyStatus {Unknown, Active, Retired}

struct OrbitalStrategyState {
    address maker;
    bytes32 configHash;
    OrbitalStrategyStatus status;
    uint64 version;
    uint256[] X;
    uint256[] principalInternal;
    uint256 virtualInternal;
    uint256 sumInternal;
    WideMath.Uint512 sumSquaresInternal;
    uint256 interiorRadius;
    uint256 boundarySumNumerator;
    uint256 boundarySigmaLower;
    uint256 boundarySigmaUpper;
    uint8 interiorTickMask;
    uint256 slackBoundInternal;
    uint256[] cumulativeFeeRaw;
}

struct OrbitalTokenAvailability {
    address token;
    uint248 aquaAllocationRaw;
    uint8 liveTokenCount;
    uint256 walletBalanceRaw;
    uint256 aquaAllowanceRaw;
    bool live;
    bool backingValid;
    WideMath.Uint512 surplusInternal;
    WideMath.Uint512 deficitInternal;
    uint256 fundingCeilingRaw;
}

interface IOrbitalLifecycle is IOrbitalRouter {
    event StrategyActivated(address indexed maker, bytes32 indexed orderHash, bytes32 indexed configHash);
    event StrategyRetired(address indexed maker, bytes32 indexed orderHash, uint64 version);
    /// @dev Emitted only after successful settlement. `crossedInward[k]` is true
    /// for an inward crossing of `crossedTickKeys[k]`; both arrays are ordered.
    event OrbitalSwapExecuted(
        address indexed maker, bytes32 indexed orderHash, address indexed taker,
        address recipient, uint8 tokenInIndex, uint8 tokenOutIndex,
        uint256 grossInputRaw, uint256 netInputRaw, uint256 feeRaw,
        uint256 amountOutRaw, uint64 version, uint64[] crossedTickKeys,
        bool[] crossedInward
    );
    function nextMakerNonce(address maker) external view returns (uint64);
    function activateStrategy(OrbitalConfigV1 calldata config, ISwapVM.Order calldata order) external returns (bytes32 orderHash);
    function retireStrategy(bytes32 orderHash) external;
    function getStrategyState(bytes32 orderHash) external view returns (OrbitalStrategyState memory);
    function getStrategyAvailability(bytes32 orderHash) external view returns (OrbitalTokenAvailability[] memory);
}
