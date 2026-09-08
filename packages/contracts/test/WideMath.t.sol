// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract WideMathTest {
    function testMaxProduct() public pure {
        W.Uint512 memory p=W.mul(type(uint256).max,type(uint256).max);
        require(p.hi==type(uint256).max-1 && p.lo==1,"max product");
    }
    function testCarryAndBorrow() public pure {
        W.Uint512 memory a=W.add(W.Uint512(1,type(uint256).max),W.Uint512(0,1));
        require(a.hi==2 && a.lo==0,"carry");
        W.Uint512 memory b=W.sub(a,W.Uint512(0,1));
        require(b.hi==1 && b.lo==type(uint256).max,"borrow");
    }
    function testSqrtExtremes() public pure {
        require(W.sqrt(W.Uint512(0,0))==0,"zero");
        require(W.sqrt(W.Uint512(type(uint256).max,type(uint256).max))==type(uint256).max,"max sqrt");
        require(W.sqrt(W.Uint512(0,15))==3,"floor");
    }
    function testFuzzProduct(uint128 a,uint128 b) public pure {
        W.Uint512 memory p=W.mul(a,b);
        require(p.hi==0 && p.lo==uint256(a)*uint256(b),"small exact product");
    }
    function testFuzzSquareRoot(uint256 a) public pure {
        W.Uint512 memory square=W.mul(a,a);
        require(W.sqrt(square)==a,"perfect square");
        if(a>0) require(W.sqrt(W.sub(square,W.Uint512(0,1)))==a-1,"below square");
    }
    function testFuzzDivision(uint256 a,uint128 b) public pure {
        if(b==0) return;
        (uint256 q,uint256 r)=W.div(W.mul(a,b),b);
        require(q==a && r==0,"wide exact division");
    }
    function testFuzzDivisionRemainder(uint256 a,uint128 b) public pure {
        if(b==0) return;
        (uint256 q,uint256 r)=W.div(W.Uint512(0,a),b);
        require(q==a/b && r==a%b,"remainder");
    }
}
