// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {TickGeometry as T} from "../src/libraries/TickGeometry.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract TickGeometryTest {
    uint256 constant Q=1<<128;
    function testAnalyticSigmaEnclosure() public pure {
        T.Coefficients memory c=T.coefficients(4,uint64(9*(1<<30)));
        // sigma^2 = 15/64, exact rational test using 512-bit products.
        W.Uint512 memory exact=W.mul(15*(1<<122),Q);
        require(W.lte(W.mul(c.sigmaLo,c.sigmaLo),exact),"lower");
        require(W.lte(exact,W.mul(c.sigmaHi,c.sigmaHi)),"upper");
        require(c.sigmaHi-c.sigmaLo<=1,"one ulp");
        require(c.equalLo==Q/2 && c.equalHi==Q/2,"equal exact");
    }
    function testFullRange() public pure {
        T.Coefficients memory c=T.coefficients(3,type(uint64).max);
        require(c.virtualLo==0 && c.sigmaLo==0,"full range");
        require(c.equalHi-c.equalLo<=1,"equal interval");
    }
    function coefficientsExternal(uint8 n,uint64 j) external pure { T.coefficients(n,j); }
    function testRejectDegenerateAndSentinelAliases() public {
        (bool low,)=address(this).call(abi.encodeCall(this.coefficientsExternal,(4,uint64(2*(1<<32)))));
        (bool high,)=address(this).call(abi.encodeCall(this.coefficientsExternal,(4,uint64(3*(1<<32)))));
        require(!low && !high,"invalid keys accepted");
    }
}
