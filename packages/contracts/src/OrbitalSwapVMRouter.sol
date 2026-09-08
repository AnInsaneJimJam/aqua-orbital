// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SwapVM} from "../vendor/swap-vm-orbital/src/SwapVM.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {Context, ContextLib} from "../vendor/swap-vm-orbital/src/libs/VM.sol";
import {FeeMeta} from "../vendor/swap-vm-orbital/src/libs/ProtocolFee.sol";
import {TakerTraits, TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OrbitalConfigV1} from "./interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyStatus, OrbitalStrategyState, OrbitalTokenAvailability} from "./interfaces/IOrbitalLifecycle.sol";
import {OrbitalStorage as S} from "./libraries/OrbitalStorage.sol";
import {OrbitalOrderCodec as Codec} from "./libraries/OrbitalOrderCodec.sol";
import {OrbitalSettlement as Settlement} from "./libraries/OrbitalSettlement.sol";

/// @notice Maker-owned Orbital lifecycle on the pinned official Aqua source.
/// @dev Powered by SwapVM — © Degensoft Ltd 2025. Certified interior execution
/// and bounded mixed composition share the same exact Aqua settlement checks.
contract OrbitalSwapVMRouter is SwapVM {
    using ContextLib for Context;
    using TakerTraitsLib for TakerTraits;
    uint256 public immutable CHAIN_ID;
    mapping(address => bool) public allowedToken;
    mapping(address => uint8) public tokenDecimals;
    error EngineUnavailable();
    error InvalidConfiguration();
    error InvalidInitialAmounts();
    error InvalidDomain();
    error NonCanonicalOrder();
    error InvalidTaker();
    error InvalidCurveResult();
    error NotMaker();
    error InvalidNonce();
    error NonceExhausted();
    error OwnerNotRenounced();
    error StrategyNotFound();
    error StrategyNotActive();
    error StrategyAlreadyExists();
    error AquaEntryNotLive();
    error InadequateBacking();
    error InsufficientInitialFunding();
    error Reentrancy();
    event StrategyActivated(address indexed maker, bytes32 indexed orderHash, bytes32 indexed configHash);
    event StrategyRetired(address indexed maker, bytes32 indexed orderHash, uint64 version);
    event OrbitalSwapExecuted(
        address indexed maker, bytes32 indexed orderHash, address indexed taker,
        address recipient, uint8 tokenInIndex, uint8 tokenOutIndex,
        uint256 grossInputRaw, uint256 netInputRaw, uint256 feeRaw,
        uint256 amountOutRaw, uint64 version, uint64[] crossedTickKeys,
        bool[] crossedInward
    );

    constructor(address aqua, address initialOwner, address[] memory tokens, uint8[] memory decimals_)
        SwapVM(aqua, address(0), initialOwner, "Orbital", "1")
    {
        if (aqua.code.length == 0 || initialOwner != msg.sender || tokens.length < 2 || tokens.length > 8 || tokens.length != decimals_.length) revert InvalidConfiguration();
        CHAIN_ID = block.chainid;
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i] == address(0) || tokens[i] == aqua || tokens[i] == address(this) ||
                (i != 0 && tokens[i] <= tokens[i - 1]) || decimals_[i] > 18 || IERC20Metadata(tokens[i]).decimals() != decimals_[i]) revert InvalidConfiguration();
            allowedToken[tokens[i]] = true; tokenDecimals[tokens[i]] = decimals_[i];
        }
    }
    modifier guarded() { _enter(); _; S.layout().entered = false; }
    function nextMakerNonce(address maker) external view returns (uint64) { _checkDomain(); return S.layout().nextNonce[maker]; }
    function activateStrategy(OrbitalConfigV1 calldata config, ISwapVM.Order calldata order) external guarded returns (bytes32 orderHash) {
        _checkDomain();
        if (owner() != address(0)) revert OwnerNotRenounced();
        return S.activate(config, order, allowedToken, tokenDecimals, AQUA, CHAIN_ID);
    }
    function retireStrategy(bytes32 orderHash) external guarded {
        S.Strategy storage strategy = _known(orderHash);
        if (msg.sender != strategy.state.maker) revert NotMaker();
        if (strategy.state.status != OrbitalStrategyStatus.Active) revert StrategyNotActive();
        strategy.state.status = OrbitalStrategyStatus.Retired;
        strategy.state.version++;
        emit StrategyRetired(msg.sender, orderHash, strategy.state.version);
    }
    function getStrategyConfig(bytes32 orderHash) external view returns (OrbitalConfigV1 memory) { return _known(orderHash).config; }
    function getStrategyState(bytes32 orderHash) external view returns (OrbitalStrategyState memory) { _readGuard(); return _known(orderHash).state; }
    function getStrategyAvailability(bytes32 orderHash) external view returns (OrbitalTokenAvailability[] memory) {
        _readGuard(); return _availability(_known(orderHash), orderHash);
    }
    function _availability(S.Strategy storage strategy, bytes32 orderHash) internal view returns (OrbitalTokenAvailability[] memory observations) {
        return S.availability(strategy, orderHash, AQUA);
    }
    function _assertBacking(S.Strategy storage strategy, bytes32 orderHash) internal view {
        S.assertBacking(strategy, orderHash, AQUA);
    }
    function _known(bytes32 orderHash) internal view returns (S.Strategy storage strategy) {
        _checkDomain(); strategy = S.layout().strategies[orderHash];
        if (strategy.state.status == OrbitalStrategyStatus.Unknown) revert StrategyNotFound();
        if (strategy.config.chainId != CHAIN_ID || strategy.config.router != address(this)) revert InvalidDomain();
    }
    function _checkDomain() internal view { if (block.chainid != CHAIN_ID) revert InvalidDomain(); }
    function _readGuard() internal view { if (S.layout().entered) revert Reentrancy(); }
    function _enter() internal { _readGuard(); S.layout().entered = true; }
    function _validateTrade(ISwapVM.Order calldata order, uint256 amount, bytes calldata data) internal view {
        S.validateTrade(order, amount, data, AQUA, CHAIN_ID);
    }
    function _beforeQuote(ISwapVM.Order calldata order, uint256 amount, bytes calldata data) internal view override {
        _readGuard(); _validateTrade(order, amount, data);
    }
    function _beforeSwap(ISwapVM.Order calldata order, uint256 amount, bytes calldata data) internal override {
        _enter(); if (msg.value != 0) revert InvalidTaker(); _validateTrade(order, amount, data);
        bytes32 orderHash = keccak256(abi.encode(order));
        S.Strategy storage strategy = _known(orderHash);
        (TakerTraits traits, bytes calldata takerData) = TakerTraitsLib.parse(data);
        (uint8 input, uint8 output,) = Codec.pair(traits.instructionsArgs(takerData), strategy.config.tokens.length);
        Settlement.begin(strategy, orderHash, AQUA, msg.sender, traits.to(takerData, msg.sender), input, output, amount);
    }
    function _resolveTokens(ISwapVM.Order calldata order, TakerTraits traits, bytes calldata data) internal view override returns (address input, address output) {
        S.Strategy storage strategy = _known(keccak256(abi.encode(order)));
        (uint8 i, uint8 j,) = Codec.pair(traits.instructionsArgs(data), strategy.config.tokens.length);
        return (strategy.config.tokens[i], strategy.config.tokens[j]);
    }
    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal virtual override {
        S.Strategy storage strategy = _known(ctx.query.orderHash);
        if (args.length != 32 || bytes32(args) != strategy.state.configHash) revert NonCanonicalOrder();
        if (opcode == 0x52 && ctx.vm.nextPC == 68) { _executeCurve(ctx, args); return; }
        if (opcode != 0x72 || ctx.vm.nextPC != 34) revert NonCanonicalOrder();
        if (!ctx.query.isExactIn || ctx.swap.amountOut != 0) revert InvalidTaker();
        (uint8 input,,) = Codec.pair(ctx.takerArgs(), strategy.config.tokens.length);
        uint256 gross = ctx.swap.amountIn;
        (uint256 fee, uint256 net) = S.feeIn(gross, strategy.config.feePpm);
        ctx.swap.amountIn = net;
        ctx.runLoop();
        if (ctx.swap.amountIn != net || ctx.swap.amountOut == 0 || ctx.vm.nextPC != 68 ||
            ctx.takerArgs().length != 0 || ctx.fee.feeTotal != 0 ||
            FeeMeta.unwrap(ctx.fee.meta) != 0 || ctx.fee.receivers.length != 0) revert InvalidCurveResult();
        ctx.swap.amountIn = gross;
        if (!ctx.vm.isStaticContext) S.accrueFee(strategy, input, fee);
    }
    function _executeCurve(Context memory ctx, bytes calldata) internal virtual {
        S.Strategy storage strategy = _known(ctx.query.orderHash);
        (uint8 input, uint8 output, uint8 maxCrossings) = Codec.pair(ctx.tryChopTakerArgs(4), strategy.config.tokens.length);
        ctx.swap.amountOut = S.executeSwap(ctx.query.orderHash, AQUA, input, output, ctx.swap.amountIn, maxCrossings, !ctx.vm.isStaticContext);
    }
    function _afterSwap(Context memory ctx, ISwapVM.Order calldata, TakerTraits traits, bytes calldata data) internal virtual override {
        S.Strategy storage strategy = _known(ctx.query.orderHash);
        Settlement.finish(strategy, ctx.query.orderHash, AQUA, ctx.swap.amountIn, ctx.swap.amountOut);
        (uint64[] memory keys, bool[] memory inward) = S.consumeCrossings(ctx.query.orderHash);
        (uint8 input, uint8 output,) = Codec.pair(traits.instructionsArgs(data), strategy.config.tokens.length);
        (uint256 fee, uint256 net) = S.feeIn(ctx.swap.amountIn, strategy.config.feePpm);
        emit OrbitalSwapExecuted(strategy.state.maker, ctx.query.orderHash, ctx.query.taker,
            traits.to(data, ctx.query.taker), input, output, ctx.swap.amountIn, net, fee,
            ctx.swap.amountOut, strategy.state.version, keys, inward);
        S.layout().entered = false;
    }
}
