// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ISwapVM} from "../../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";

struct OrbitalConfigV1 {
    uint8 schemaVersion;
    uint256 chainId;
    address router;
    address maker;
    uint64 makerNonce;
    address[] tokens;
    uint8[] decimals;
    uint64[] tickKeys;
    uint192[] radiiInternal;
    uint24 feePpm;
    uint256[] initialAmountsRaw;
}

interface IOrbitalRouter is ISwapVM {
    function getStrategyConfig(bytes32 orderHash) external view returns(OrbitalConfigV1 memory);
}
