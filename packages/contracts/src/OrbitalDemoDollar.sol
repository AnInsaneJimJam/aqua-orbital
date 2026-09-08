// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Demo token with no redemption value; local/Arc testnet faucet only.
contract OrbitalDemoDollar is ERC20 {
    uint256 public immutable CHAIN_ID;
    uint256 public immutable FAUCET_AMOUNT;
    uint256 public constant COOLDOWN=1 days;
    uint8 private immutable precision;
    mapping(address=>uint256) public nextMintAt;
    error InvalidDecimals();error UnsupportedChain();error WrongChain();
    error FaucetCooldown(uint256 availableAt);
    constructor(uint8 decimals_) ERC20(
        decimals_==6?"Orbital Demo Dollar 6":"Orbital Demo Dollar 18",
        decimals_==6?"oUSD6":"oUSD18"
    ) {
        if(decimals_!=6&&decimals_!=18)revert InvalidDecimals();
        if(block.chainid!=31337&&block.chainid!=5042002)revert UnsupportedChain();
        precision=decimals_;CHAIN_ID=block.chainid;FAUCET_AMOUNT=1000*10**decimals_;
    }
    function decimals() public view override returns(uint8){return precision;}
    /// @dev A test-resource rate limit, not Sybil resistance or financial value.
    /// The fixed amount goes only to the caller. No owner or arbitrary mint exists.
    function faucet() external {
        if(block.chainid!=CHAIN_ID)revert WrongChain();
        uint256 available=nextMintAt[msg.sender];
        if(block.timestamp<available)revert FaucetCooldown(available);
        nextMintAt[msg.sender]=block.timestamp+COOLDOWN;
        _mint(msg.sender,FAUCET_AMOUNT);
    }
}
