// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OrbitalConfigV1} from "../interfaces/IOrbitalRouter.sol";
import {OrbitalStrategyState, OrbitalStrategyStatus, OrbitalTokenAvailability} from "../interfaces/IOrbitalLifecycle.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IAqua} from "../../vendor/aqua/src/interfaces/IAqua.sol";
import {OrbitalMath} from "./OrbitalMath.sol";
import {WideMath as W} from "./WideMath.sol";
import {StrategyInitializer as Initializer} from "./StrategyInitializer.sol";
import {OrbitalOrderCodec as Codec} from "./OrbitalOrderCodec.sol";
import {ISwapVM} from "../../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {InteriorSwap} from "./InteriorSwap.sol";
import {FrontierComposition as Composition} from "./FrontierComposition.sol";

library OrbitalStorage {
    error AquaEntryNotLive();
    error InadequateBacking();
    error InvalidFee();
    error EmptyNetInput();
    error NotMaker();
    error InvalidDomain();
    error StrategyAlreadyExists();
    error InvalidNonce();
    error NonceExhausted();
    error InvalidConfiguration();
    error InsufficientInitialFunding();
    error StrategyNotFound();
    error StrategyNotActive();
    error InvalidTaker();
    error InsufficientOutputFunding();
    error GuardRequired();
    error PendingExecution();
    error InvalidCurveCertificate(Composition.Status status);
    error InconsistentCurveEndpoint();
    event StrategyActivated(address indexed maker, bytes32 indexed orderHash, bytes32 indexed configHash);
    bytes32 internal constant SLOT = bytes32(uint256(keccak256("orbital.router.storage.v1")) - 1);
    struct Strategy {
        OrbitalConfigV1 config;
        OrbitalStrategyState state;
        OrbitalMath.Tick[] ticks;
        uint256[] sigmaLowerContributions;
        uint256[] sigmaUpperContributions;
        W.Uint512[] initialSurplusInternal;
    }
    struct PendingCrossings {bool active;bytes32 orderHash;uint64[] keys;bool[] inward;}
    struct Execution {uint256 amountOutRaw;uint256[] reserves;uint256 shortfallUpper;uint8 actualPrefix;Composition.Transition[] crossings;}
    struct Layout {
        mapping(bytes32 => Strategy) strategies;
        mapping(address => uint64) nextNonce;
        bool entered;
        PendingCrossings pending;
    }
    function layout() internal pure returns (Layout storage value) {
        bytes32 slot = SLOT;
        assembly ("memory-safe") { value.slot := slot }
    }
    /// @dev Router performs guard, runtime-domain and owner-renunciation checks
    /// before this linked call. Delegatecall preserves maker, router and storage.
    function activate(
        OrbitalConfigV1 calldata config, ISwapVM.Order calldata order,
        mapping(address => bool) storage allowedToken, mapping(address => uint8) storage tokenDecimals,
        IAqua aqua, uint256 chainId
    ) public returns (bytes32 orderHash) {
        if (msg.sender != config.maker || msg.sender != order.maker) revert NotMaker();
        if (config.chainId != chainId || config.router != address(this)) revert InvalidDomain();
        orderHash = keccak256(abi.encode(order));
        Layout storage root_ = layout();
        if (root_.strategies[orderHash].state.status != OrbitalStrategyStatus.Unknown) revert StrategyAlreadyExists();
        uint64 nonce = root_.nextNonce[msg.sender];
        if (config.makerNonce != nonce) revert InvalidNonce();
        if (nonce == type(uint64).max) revert NonceExhausted();
        Codec.validateShape(config);
        (bytes32 configHash,) = Codec.validateOrder(config, order);
        for (uint256 i; i < config.tokens.length; ++i) {
            address token = config.tokens[i];
            if (!allowedToken[token] || config.decimals[i] != tokenDecimals[token] || IERC20Metadata(token).decimals() != config.decimals[i]) revert InvalidConfiguration();
        }
        Initializer.InitialState memory initial = Initializer.initialize(config, configHash);
        Strategy storage strategy = root_.strategies[orderHash];
        storeInitial(strategy, config, initial);
        OrbitalTokenAvailability[] memory observation = availability(strategy, orderHash, aqua);
        for (uint256 i; i < observation.length; ++i) {
            if (!observation[i].live) revert AquaEntryNotLive();
            if (!observation[i].backingValid) revert InadequateBacking();
            if (observation[i].walletBalanceRaw < config.initialAmountsRaw[i] || observation[i].aquaAllowanceRaw < config.initialAmountsRaw[i]) revert InsufficientInitialFunding();
            strategy.initialSurplusInternal.push(observation[i].surplusInternal);
        }
        root_.nextNonce[msg.sender] = nonce + 1;
        emit StrategyActivated(msg.sender, orderHash, configHash);
    }
    /// @dev Caller keeps its existing quote/swap read/reentrancy guard. Domain,
    /// known/active order, taker envelope and all-token backing ordering is fixed.
    function validateTrade(ISwapVM.Order calldata order, uint256 amount, bytes calldata data, IAqua aqua, uint256 chainId) public view {
        bytes32 orderHash = keccak256(abi.encode(order));
        if (block.chainid != chainId) revert InvalidDomain();
        Strategy storage strategy = layout().strategies[orderHash];
        if (strategy.state.status == OrbitalStrategyStatus.Unknown) revert StrategyNotFound();
        if (strategy.config.chainId != chainId || strategy.config.router != address(this)) revert InvalidDomain();
        if (strategy.state.status != OrbitalStrategyStatus.Active) revert StrategyNotActive();
        if (order.maker != strategy.state.maker || amount == 0) revert InvalidTaker();
        Codec.validateTaker(data, strategy.config.tokens.length, msg.sender, order.maker, address(aqua), address(this));
        assertBacking(strategy, orderHash, aqua);
    }
    /// @notice Charge the maker-owned input fee exactly once, rounded upward.
    /// @dev The product may exceed 256 bits; no intermediate truncation is allowed.
    function feeIn(uint256 gross, uint24 feePpm) public pure returns (uint256 fee, uint256 net) {
        if (feePpm != 100 && feePpm != 500 && feePpm != 1000) revert InvalidFee();
        fee = W.mulDiv(gross, feePpm, 1_000_000, true);
        if (fee >= gross) revert EmptyNetInput();
        net = gross - fee;
    }
    /// @dev Only the nonstatic canonical instruction calls this linked helper.
    /// Fee inventory remains outside geometric reserves and principal.
    function accrueFee(Strategy storage strategy, uint8 input, uint256 fee) public {
        if (input >= strategy.state.cumulativeFeeRaw.length || fee == 0) revert InvalidFee();
        strategy.state.cumulativeFeeRaw[input] += fee;
    }
    /// @notice Certified execution from this order's authenticated actual state.
    /// @dev The narrow interior probe preserves its existing errors; only cap
    /// deferrals invoke closed-input composition. Quotes never persist witnesses.
    function executeSwap(bytes32 orderHash, IAqua aqua, uint8 input, uint8 output, uint256 net, uint8 maxCrossings, bool commit)
        public returns (uint256 amountOutRaw)
    {
        Layout storage root_ = layout();
        if (commit && !root_.entered) revert GuardRequired();
        if (root_.pending.active) revert PendingExecution();
        Strategy storage strategy = root_.strategies[orderHash];
        if (strategy.state.status != OrbitalStrategyStatus.Active) revert StrategyNotActive();
        for (uint256 i; i < strategy.config.tokens.length; ++i) {
            if (IERC20Metadata(strategy.config.tokens[i]).decimals() != strategy.config.decimals[i]) revert InvalidConfiguration();
        }
        Execution memory result = solve(strategy,input,output,net,maxCrossings);
        amountOutRaw = result.amountOutRaw;
        IERC20Metadata asset = IERC20Metadata(strategy.config.tokens[output]);
        if (asset.balanceOf(strategy.state.maker) < amountOutRaw ||
            asset.allowance(strategy.state.maker, address(aqua)) < amountOutRaw) revert InsufficientOutputFunding();
        if (!commit) return amountOutRaw;
        // Bind the complete ordered release/frontier/retention sequence to this
        // guarded order until finish verifies every actual settlement delta.
        PendingCrossings storage pending = root_.pending;
        pending.active = true;pending.orderHash = orderHash;
        for (uint256 i; i < result.crossings.length; ++i) {pending.keys.push(result.crossings[i].key);pending.inward.push(result.crossings[i].inward);}
        commitResult(strategy,result);
    }
    function solve(Strategy storage strategy,uint8 input,uint8 output,uint256 net,uint8 maxCrossings) private view returns(Execution memory result) {
        (bool traversal, InteriorSwap.Result memory interior) = InteriorSwap.tryExactInput(strategy.state.X,strategy.ticks,strategy.config.decimals,input,output,net);
        if (!traversal) return Execution(interior.amountOutRaw,interior.reserves,interior.shortfallUpper,0,new Composition.Transition[](0));
        Composition.Result memory path = Composition.certify(strategy.state.X,strategy.ticks,strategy.config.decimals,input,output,net,maxCrossings);
        if (path.status != Composition.Status.FrontierPathCertified) revert InvalidCurveCertificate(path.status);
        return Execution(path.endpoint.amountOutRaw,path.endpoint.reserves,path.endpoint.shortfallUpper,path.endpoint.actualBoundaryCount,path.transitions);
    }
    function commitResult(Strategy storage strategy,Execution memory result) private {
        // The path has certified actual endpoint reserves in the original units.
        // Fees are added only by the surrounding instruction after this returns.
        OrbitalStrategyState storage state = strategy.state;
        state.X = result.reserves;
        uint256 sum; W.Uint512 memory squares; uint256 radius;
        for (uint256 i; i < state.X.length; ++i) {
            uint256 coordinate = state.X[i];
            state.principalInternal[i] = coordinate - state.virtualInternal;
            sum += coordinate; squares = W.add(squares, W.mul(coordinate, coordinate));
        }
        for (uint256 i; i < strategy.ticks.length; ++i) radius += strategy.ticks[i].radius;
        state.sumInternal = sum; state.sumSquaresInternal = squares;
        uint8 prefix;uint256 axial;uint256 sigmaLo;uint256 sigmaHi;
        for (uint256 i; i + 1 < strategy.ticks.length; ++i) {
            OrbitalMath.Tick storage tick = strategy.ticks[i];
            if (sum * (1 << 32) < axial + radius * tick.key) break;
            radius -= tick.radius;axial += uint256(tick.radius) * tick.key;
            sigmaLo += strategy.sigmaLowerContributions[i];sigmaHi += strategy.sigmaUpperContributions[i];++prefix;
        }
        if (prefix != result.actualPrefix) revert InconsistentCurveEndpoint();
        state.interiorRadius = radius; state.boundarySumNumerator = axial;
        state.boundarySigmaLower = sigmaLo; state.boundarySigmaUpper = sigmaHi;
        state.interiorTickMask = uint8(((uint256(1) << strategy.ticks.length) - 1) ^ ((uint256(1) << prefix) - 1));
        state.slackBoundInternal = result.shortfallUpper;
        state.version++;
    }
    /// @dev Router calls only AFTER Settlement.finish and before unlock/event.
    /// No caller-supplied arrays or phase flags are accepted as settled evidence.
    function consumeCrossings(bytes32 orderHash) public returns(uint64[] memory keys,bool[] memory inward) {
        Layout storage root_ = layout();
        if (!root_.entered) revert GuardRequired();
        if (!root_.pending.active || root_.pending.orderHash != orderHash) revert PendingExecution();
        keys = root_.pending.keys;inward = root_.pending.inward;
        delete root_.pending;
    }
    /// @dev Called only after the router's guarded canonical registration checks.
    /// Linked library calls operate on the router's storage, never a second ledger.
    function storeInitial(Strategy storage strategy, OrbitalConfigV1 calldata config, Initializer.InitialState memory initial) public {
        strategy.config = config; strategy.state = initial.state;
        for (uint256 i; i < initial.ticks.length; ++i) strategy.ticks.push(initial.ticks[i]);
        strategy.sigmaLowerContributions = initial.sigmaLower;
        strategy.sigmaUpperContributions = initial.sigmaUpper;
    }
    function availability(Strategy storage strategy, bytes32 orderHash, IAqua aqua) public view returns (OrbitalTokenAvailability[] memory observations) {
        uint256 n = strategy.config.tokens.length;
        observations = new OrbitalTokenAvailability[](n);
        bool healthy = strategy.state.status == OrbitalStrategyStatus.Active;
        for (uint256 i; i < n; ++i) {
            OrbitalTokenAvailability memory value;
            value.token = strategy.config.tokens[i];
            (value.aquaAllocationRaw, value.liveTokenCount) = aqua.rawBalances(strategy.state.maker, address(this), orderHash, value.token);
            value.live = value.liveTokenCount == n;
            value.walletBalanceRaw = IERC20Metadata(value.token).balanceOf(strategy.state.maker);
            value.aquaAllowanceRaw = IERC20Metadata(value.token).allowance(strategy.state.maker, address(aqua));
            uint256 scale = Initializer.scaleFor(strategy.config.decimals[i]);
            W.Uint512 memory allocation = W.mul(value.aquaAllocationRaw, scale);
            W.Uint512 memory required = W.add(W.Uint512(0, strategy.state.principalInternal[i]), W.mul(strategy.state.cumulativeFeeRaw[i], scale));
            value.backingValid = W.lte(required, allocation);
            if (value.backingValid) value.surplusInternal = W.sub(allocation, required);
            else value.deficitInternal = W.sub(required, allocation);
            if (!value.live || !value.backingValid) healthy = false;
            uint256 ceiling = strategy.state.principalInternal[i] / scale;
            if (value.aquaAllocationRaw < ceiling) ceiling = value.aquaAllocationRaw;
            if (value.walletBalanceRaw < ceiling) ceiling = value.walletBalanceRaw;
            if (value.aquaAllowanceRaw < ceiling) ceiling = value.aquaAllowanceRaw;
            value.fundingCeilingRaw = ceiling;
            observations[i] = value;
        }
        if (!healthy) for (uint256 i; i < n; ++i) observations[i].fundingCeilingRaw = 0;
    }
    function assertBacking(Strategy storage strategy, bytes32 orderHash, IAqua aqua) public view {
        uint256 n = strategy.config.tokens.length;
        for (uint256 i; i < n; ++i) {
            (uint248 allocation, uint8 count) = aqua.rawBalances(strategy.state.maker, address(this), orderHash, strategy.config.tokens[i]);
            if (count != n) revert AquaEntryNotLive();
            uint256 scale = Initializer.scaleFor(strategy.config.decimals[i]);
            W.Uint512 memory required = W.add(W.Uint512(0, strategy.state.principalInternal[i]), W.mul(strategy.state.cumulativeFeeRaw[i], scale));
            if (!W.lte(required, W.mul(allocation, scale))) revert InadequateBacking();
        }
    }
}
