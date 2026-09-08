// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
contract CertificateTest is Test {
    function testFractionalKeyPlaneHasBothOneSidedCertificates() public pure {
        uint256 r=1e40;uint256 grid=1<<32;uint64 key=7*(1<<29)+1;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,uint192(r+1),G.coefficients(2,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(r),G.coefficients(2,type(uint64).max));
        uint256[] memory x=new uint256[](2);
        x[0]=15*r/10*grid;x[1]=(2*r+1)*key-x[0];
        assertTrue(x[1]%grid!=0,"the seam must be fractional in internal units");
        assertTrue(M.certifyGridPoint(x,ticks,0));
        assertTrue(M.certifyGridPoint(x,ticks,1));
        x[1]--;
        assertTrue(M.certifyGridPoint(x,ticks,0));
        assertFalse(M.certifyGridPoint(x,ticks,1));
        x[1]+=2;
        assertFalse(M.certifyGridPoint(x,ticks,0));
        assertTrue(M.certifyGridPoint(x,ticks,1));
    }
    function testProofGridDoesNotExpandTheStoredDomain() public pure {
        M.Tick[] memory ticks=new M.Tick[](1);
        ticks[0]=M.Tick(type(uint64).max,uint192(1)<<159,G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);
        for(uint256 i;i<4;i++)x[i]=uint256(1)<<190;
        assertTrue(M.certifyGridPoint(x,ticks,0));
        assertFalse(M.certify(x,ticks));
        x[0]=uint256(1)<<192;
        assertFalse(M.certifyGridPoint(x,ticks,0));
        assertFalse(M.certifyGridPoint(x,ticks,1));
        assertFalse(M.certifyGridPoint(x,ticks,type(uint256).max));
    }
    function testExactSphereAndUnsafeBranch() public pure {
        M.Tick[] memory ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,2,G.coefficients(4,type(uint64).max));
        uint256[] memory x=new uint256[](4);for(uint256 i;i<4;++i)x[i]=1;
        assertTrue(M.certify(x,ticks));
        x[0]=3;assertFalse(M.certify(x,ticks));
    }
    function testBoundaryRoundingRegression() public pure {
        uint256 r=1e40;
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(uint64(7*(1<<30)),uint192(r),G.coefficients(3,uint64(7*(1<<30))));
        ticks[1]=M.Tick(type(uint64).max,uint192(r),G.coefficients(3,type(uint64).max));
        uint256 root=W.sqrt(W.mul(7*r,r));
        uint256[] memory x=new uint256[](3);x[0]=2*r;x[1]=(3*r-root)/4+r/1e6;x[2]=(3*r+root)/4;
        assertFalse(M.certify(x,ticks),"rounded boundary price must reject");
    }
    function testMixedStrategyEqualPoint() public pure {
        uint256 r=1e40;
        M.Tick[] memory ticks=new M.Tick[](2);
        uint64 key=uint64(uint256(13)*(1<<32)/10);
        ticks[0]=M.Tick(key,uint192(r),G.coefficients(3,key));
        ticks[1]=M.Tick(type(uint64).max,uint192(r),G.coefficients(3,type(uint64).max));
        uint256 equal=W.mulDiv(2*r,ticks[1].coefficients.equalHi,1<<128,true);
        uint256[] memory x=new uint256[](3);for(uint256 i;i<3;++i)x[i]=equal;
        assertTrue(M.certify(x,ticks));
    }
    function testWideQuotient() public pure {
        W.Uint512 memory q=W.divWide(W.Uint512(5,0),2,false);
        assertEq(q.hi,2);assertEq(q.lo,uint256(1)<<255);
    }
    function testAcceptedMixedBoundaryStateFromIndependentMinimizers() public pure {
        // mpmath 1.3.0, 160 digits: supporting_basket([1,4,8], r=1e40)
        // for full range and b=3/2; retain r/1e6 in coordinate 1; floor X.
        uint192 r=1e40;uint64 key=3*(1<<31);
        M.Tick[] memory ticks=new M.Tick[](2);
        ticks[0]=M.Tick(key,r,G.coefficients(3,key));ticks[1]=M.Tick(type(uint64).max,r,G.coefficients(3,type(uint64).max));
        uint256[] memory x=new uint256[](3);
        x[0]=17244669164959010447296955565943832839392;
        x[1]=10891143583162567711396362223261049950605;
        x[2]=2419752807433977396862237766350672765557;
        assertTrue(M.certify(x,ticks),"valid mixed state must execute certifier");
    }
}
