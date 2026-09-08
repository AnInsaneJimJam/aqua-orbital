// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OrbitalConfigV1} from "../interfaces/IOrbitalRouter.sol";
import {ISwapVM} from "../../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "../../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraits, TakerTraitsLib} from "../../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";

library OrbitalOrderCodec {
    using TakerTraitsLib for TakerTraits;
    uint256 internal constant U = 1 << 64;
    error InvalidConfiguration();
    error NonCanonicalOrder();
    error InvalidTaker();

    function validateShape(OrbitalConfigV1 calldata config) public pure {
        uint256 n = config.tokens.length;
        uint256 count = config.tickKeys.length;
        if (config.schemaVersion != 1 || n < 2 || n > 8 || count == 0 || count > 8 ||
            config.decimals.length != n || config.initialAmountsRaw.length != n || config.radiiInternal.length != count ||
            config.tickKeys[count - 1] != type(uint64).max ||
            (config.feePpm != 100 && config.feePpm != 500 && config.feePpm != 1000)) revert InvalidConfiguration();
        for (uint256 i; i < n; ++i) {
            if (config.tokens[i] == address(0) || (i != 0 && config.tokens[i] <= config.tokens[i - 1]) ||
                config.decimals[i] > 18 || config.initialAmountsRaw[i] == 0) revert InvalidConfiguration();
        }
        uint256 totalRadius;
        for (uint256 i; i < count; ++i) {
            if (config.radiiInternal[i] < 1e12 * U || config.radiiInternal[i] >= uint256(1) << 160 ||
                (i != 0 && config.tickKeys[i] <= config.tickKeys[i - 1])) revert InvalidConfiguration();
            totalRadius += config.radiiInternal[i];
        }
        if (totalRadius >= uint256(1) << 160) revert InvalidConfiguration();
    }
    function program(bytes32 configHash) internal pure returns (bytes memory) {
        return bytes.concat(hex"7220", configHash, hex"5220", configHash);
    }
    function canonicalOrder(OrbitalConfigV1 calldata config, bytes32 configHash) internal pure returns (ISwapVM.Order memory) {
        MakerTraitsLib.Args memory args;
        args.maker = config.maker; args.tokenA = config.tokens[0]; args.tokenB = config.tokens[1];
        args.useAquaInsteadOfSignature = true; args.program = program(configHash);
        return MakerTraitsLib.build(args);
    }
    function validateOrder(OrbitalConfigV1 calldata config, ISwapVM.Order calldata order) public pure returns (bytes32 configHash, bytes32 orderHash) {
        configHash = keccak256(abi.encode(config));
        orderHash = keccak256(abi.encode(order));
        if (orderHash != keccak256(abi.encode(canonicalOrder(config, configHash)))) revert NonCanonicalOrder();
    }
    function pair(bytes calldata args, uint256 tokenCount) internal pure returns (uint8 input, uint8 output, uint8 maxCrossings) {
        if (args.length != 4 || uint8(args[0]) != 1) revert InvalidTaker();
        input = uint8(args[1]); output = uint8(args[2]); maxCrossings = uint8(args[3]);
        if (input >= tokenCount || output >= tokenCount || input == output || maxCrossings > 16) revert InvalidTaker();
    }
    function validateTaker(bytes calldata packed, uint256 tokenCount, address taker, address maker, address aqua, address router)
        public view returns (uint8 input, uint8 output, uint8 maxCrossings, address recipient)
    {
        (TakerTraits traits, bytes calldata data) = TakerTraitsLib.parse(packed);
        bytes calldata instructionArgs = traits.instructionsArgs(data);
        (input, output, maxCrossings) = pair(instructionArgs, tokenCount);
        recipient = traits.to(data, taker);
        (bool hasThreshold, uint256 minimum) = traits.threshold(data);
        uint40 deadline = traits.deadline(data);
        if (!hasThreshold || deadline == 0 || deadline < block.timestamp || taker == maker ||
            recipient == address(0) || recipient == maker || recipient == aqua || recipient == router) revert InvalidTaker();
        TakerTraitsLib.Args memory canonical;
        canonical.taker = taker; canonical.to = recipient; canonical.isExactIn = true; canonical.isFirstTransferFromTaker = true;
        canonical.useTransferFromAndAquaPush = true; canonical.isAToB = true; canonical.deadline = deadline;
        canonical.threshold = abi.encode(minimum); canonical.instructionsArgs = instructionArgs;
        if (keccak256(packed) != keccak256(TakerTraitsLib.build(canonical))) revert InvalidTaker();
    }
}
