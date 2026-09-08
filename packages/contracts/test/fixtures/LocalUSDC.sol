// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {OrbitalDemoDollar} from "../../src/OrbitalDemoDollar.sol";

/// @notice Local test resource only; never identifies Circle or Arc native USDC.
contract LocalUSDC is OrbitalDemoDollar {
    constructor() OrbitalDemoDollar(6) {if(block.chainid!=31337)revert UnsupportedChain();}
    function name() public pure override returns(string memory){return "Local USDC Fixture";}
    function symbol() public pure override returns(string memory){return "USDC.fixture";}
}
