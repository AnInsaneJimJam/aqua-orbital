// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {OrbitalConfigV1} from "../src/interfaces/IOrbitalRouter.sol";
import {StrategyInitializer as Initializer} from "../src/libraries/StrategyInitializer.sol";
import {InitializerOracleFixtures as Oracle} from "./fixtures/InitializerOracleFixtures.sol";

contract InitializerOracleHarness {
    function initialize(OrbitalConfigV1 calldata config) external pure returns (Initializer.InitialState memory) {
        return Initializer.initialize(config, keccak256(abi.encode(config)));
    }
}

contract InitializerOracleTest is Test {
    InitializerOracleHarness harness = new InitializerOracleHarness();

    function checkFixture(uint256 index) internal view {
        (OrbitalConfigV1 memory config, Oracle.Expected memory expected) = Oracle.get(index);
        Initializer.InitialState memory actual = harness.initialize(config);
        assertEq(actual.state.configHash, keccak256(abi.encode(config)));
        assertEq(actual.state.X.length, config.tokens.length);
        assertGe(actual.state.virtualInternal, expected.virtual_lower);
        assertLe(actual.state.virtualInternal, expected.virtual_floor);
        assertGe(actual.state.virtualInternal + expected.virtual_error_bound, expected.virtual_ceil);
        assertEq(actual.state.slackBoundInternal, expected.stored_slack_bound);
        assertGe(actual.state.slackBoundInternal, expected.radial_slack_ceil);
        assertLt(actual.state.slackBoundInternal, 1 << 64);
        for (uint256 i; i < config.tokens.length; ++i) {
            assertEq(actual.state.X[i], expected.coordinate);
            assertGe(actual.state.principalInternal[i], expected.principal_lower);
            assertLe(actual.state.principalInternal[i], expected.principal_upper);
            assertLe(actual.state.principalInternal[i] - expected.paper_principal_floor, expected.principal_error_bound);
            assertEq(actual.state.principalInternal[i] + actual.state.virtualInternal, actual.state.X[i]);
            uint256 scale = 10 ** (18-config.decimals[i]) * (1 << 64);
            uint256 funded = config.initialAmountsRaw[i]*scale;
            assertGe(funded, actual.state.principalInternal[i]);
            assertLt(funded-actual.state.principalInternal[i], scale);
            assertEq(actual.state.cumulativeFeeRaw[i], 0);
        }
        assertEq(actual.state.interiorTickMask, (uint256(1) << config.tickKeys.length)-1);
    }

    function testDemoAndMixedRadiusInitializationAgainstIndependentPaperEnclosures() public view {
        checkFixture(0); checkFixture(1);
    }
    function testSingleSphereAndExactRationalBenchmarkAgainstIndependentOracle() public view {
        checkFixture(2); checkFixture(3);
    }
    function testMinimumCapWidthAgainstIndependentOracle() public view { checkFixture(4); }
    function testEightTickDimensionsAgainstIndependentOracle() public view {
        checkFixture(5); checkFixture(6); checkFixture(7);
    }
    function testNearMaximumRadiusInAllRequiredDimensionsAgainstIndependentOracle() public view {
        for (uint256 i=8; i<Oracle.COUNT; ++i) checkFixture(i);
    }
    function testOracleRawFundingCannotBeChangedByOneAtom() public {
        (OrbitalConfigV1 memory config,) = Oracle.get(0);
        config.initialAmountsRaw[1]++;
        vm.expectRevert(Initializer.InvalidInitialAmounts.selector);
        harness.initialize(config);
    }
}
