// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {OrbitalMath as M} from "../src/libraries/OrbitalMath.sol";
import {TickGeometry as G} from "../src/libraries/TickGeometry.sol";
import {SphereStep as S} from "../src/libraries/SphereStep.sol";
import {InteriorSwap as I} from "../src/libraries/InteriorSwap.sol";
import {WideMath as W} from "../src/libraries/WideMath.sol";

contract InteriorSwapTest is Test {
    uint256 constant U=1<<64;
    uint256 constant WHOLE=1e18*U;
    uint256 constant GRID=1<<32;
    function mainTicks() private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](3);
        ticks[0]=M.Tick(3*(1<<31),uint192(100*WHOLE),G.coefficients(3,3*(1<<31)));
        ticks[1]=M.Tick(7*(1<<30),uint192(200*WHOLE),G.coefficients(3,7*(1<<30)));
        ticks[2]=M.Tick(type(uint64).max,uint192(400*WHOLE),G.coefficients(3,type(uint64).max));
    }
    function mainReserves() private pure returns(uint256[] memory x){
        x=new uint256[](3);x[0]=500*WHOLE;x[1]=400*WHOLE;x[2]=100*WHOLE;
    }
    function mainDecimals() private pure returns(uint8[] memory decimals){
        decimals=new uint8[](3);decimals[0]=6;decimals[1]=6;decimals[2]=18;
    }
    function single(uint8 n,uint256 radius) private pure returns(M.Tick[] memory ticks){
        ticks=new M.Tick[](1);ticks[0]=M.Tick(type(uint64).max,uint192(radius),G.coefficients(n,type(uint64).max));
    }
    function decimalsFor(uint256 n,uint8 value) private pure returns(uint8[] memory decimals){
        decimals=new uint8[](n);for(uint256 i;i<n;i++)decimals[i]=value;
    }
    function check(uint256[] memory start,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawInput,I.Result memory r) private pure {
        uint256 inQuantum=10**(18-decimals[input])*U;
        uint256 outQuantum=10**(18-decimals[output])*U;
        assertGt(r.amountOutRaw,0);assertEq(r.netInputInternal,rawInput*inQuantum);assertEq(r.outputQuantum,outQuantum);
        assertEq(r.reserves[input],start[input]+r.netInputInternal);
        assertEq(r.reserves[output],start[output]-r.amountOutRaw*outQuantum);
        uint256 radius;for(uint256 i;i<ticks.length;i++)radius+=ticks[i].radius;
        W.Uint512 memory fixedSquares;
        for(uint256 i;i<start.length;i++){
            if(i!=input&&i!=output)assertEq(r.reserves[i],start[i]);
            if(i!=output){uint256 deficit=radius-r.reserves[i];fixedSquares=W.add(fixedSquares,W.mul(deficit,deficit));}
        }
        uint256 paidDeficit=radius-r.reserves[output];
        assertTrue(W.lte(W.add(fixedSquares,W.mul(paidDeficit,paidDeficit)),W.mul(radius,radius)));
        uint256 extraDeficit=paidDeficit+outQuantum;
        assertFalse(W.lte(W.add(fixedSquares,W.mul(extraDeficit,extraDeficit)),W.mul(radius,radius)));
        assertLe(r.shortfallUpper,outQuantum);
        uint256 ceiling=paidDeficit+r.shortfallUpper;
        assertTrue(W.lte(W.mul(radius,radius),W.add(fixedSquares,W.mul(ceiling,ceiling))));
        assertFalse(W.lte(W.mul(radius,radius),W.add(fixedSquares,W.mul(ceiling-1,ceiling-1))));
        assertTrue(M.certify(r.reserves,ticks));
    }
    function testAllSixPairsThreeTicksMatchIndependentSupportOracle() public pure {
        // Populated from the independent 110/160-digit supporting-basket oracle.
        uint256[6] memory outputs=[uint256(664264),332407920811817970,1491935,498959199764142272,2975367,1991721];
        uint256[6] memory slack=[uint256(10839235052818734068664615437378),2361232564619863873,5948776362704536591497064827317,5629227491188877627,17777153970121458485230756970302,13666179498744792559485311289849];
        uint256 index;M.Tick[] memory ticks=mainTicks();uint8[] memory decimals=mainDecimals();
        for(uint8 input;input<3;input++)for(uint8 output;output<3;output++)if(input!=output){
            uint256[] memory x=mainReserves();uint256 raw=10**decimals[input];
            I.Result memory r=I.exactInput(x,ticks,decimals,input,output,raw);
            assertEq(r.amountOutRaw,outputs[index]);assertEq(r.shortfallUpper,slack[index]);
            check(x,ticks,decimals,input,output,raw,r);++index;
            assertEq(x[0],500*WHOLE);assertEq(x[1],400*WHOLE);assertEq(x[2],100*WHOLE);
        }
        assertEq(index,6);
    }
    function testActualSlackReleaseRemainsPartOfExactInputOutput() public pure {
        uint256[] memory x=new uint256[](4);for(uint256 i;i<4;i++)x[i]=65*WHOLE;x[1]=69*WHOLE;
        M.Tick[] memory ticks=new M.Tick[](3);
        ticks[0]=M.Tick(5*(1<<31),uint192(30*WHOLE),G.coefficients(4,5*(1<<31)));
        ticks[1]=M.Tick(11*(1<<30),uint192(40*WHOLE),G.coefficients(4,11*(1<<30)));
        ticks[2]=M.Tick(type(uint64).max,uint192(60*WHOLE),G.coefficients(4,type(uint64).max));
        uint8[] memory decimals=decimalsFor(4,6);
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,52e6);
        assertEq(r.amountOutRaw,30e6);assertEq(r.reserves[0],117*WHOLE);assertEq(r.reserves[1],39*WHOLE);
        assertEq(r.shortfallUpper,0);check(x,ticks,decimals,0,1,52e6,r);
    }
    function testTokenDecimalsZeroAndEighteenBindInputAndOutputExactly() public pure {
        uint256[] memory x=new uint256[](4);for(uint256 i;i<4;i++)x[i]=65*WHOLE;
        uint8[] memory decimals=decimalsFor(4,18);decimals[0]=0;
        M.Tick[] memory ticks=single(4,130*WHOLE);
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,52);
        assertEq(r.netInputInternal,52*WHOLE);assertEq(r.outputQuantum,U);assertEq(r.amountOutRaw,26e18);
        check(x,ticks,decimals,0,1,52,r);
        decimals[0]=18;decimals[1]=0;r=I.exactInput(x,ticks,decimals,0,1,52e18);
        assertEq(r.outputQuantum,WHOLE);assertEq(r.amountOutRaw,26);check(x,ticks,decimals,0,1,52e18,r);
    }
    function testInputNormalCanTerminateAtZero() public pure {
        uint256[] memory x=new uint256[](2);x[0]=2*WHOLE;x[1]=WHOLE;
        M.Tick[] memory ticks=single(2,5*WHOLE);uint8[] memory decimals=decimalsFor(2,18);
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,3e18);
        assertEq(r.reserves[0],5*WHOLE);assertEq(r.reserves[1],0);assertEq(r.amountOutRaw,1e18);
        check(x,ticks,decimals,0,1,3e18,r);
    }
    function testZeroInitialOutputNormalHasContinuousPositiveInputDeparture() public pure {
        uint256[] memory x=new uint256[](2);x[0]=0;x[1]=5*WHOLE;
        M.Tick[] memory ticks=single(2,5*WHOLE);uint8[] memory decimals=decimalsFor(2,18);
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,1e18);
        assertEq(r.amountOutRaw,3e18);assertEq(r.reserves[1],2*WHOLE);assertEq(r.shortfallUpper,0);
        check(x,ticks,decimals,0,1,1e18,r);
    }
    function testCoarseOutputCanRemainInsideThroughoutRemainingInput() public pure {
        // Geometry fixture only; no asserted reachable previous raw-token history.
        uint256[] memory x=new uint256[](4);for(uint256 i;i<4;i++)x[i]=65*WHOLE;x[1]=139*WHOLE/2;
        uint8[] memory decimals=decimalsFor(4,18);decimals[1]=0;
        M.Tick[] memory ticks=single(4,130*WHOLE);
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,1);
        assertEq(r.amountOutRaw,4);assertEq(r.reserves[1],131*WHOLE/2);
        // Actual paid deficit remains below the initial frontier deficit 65.
        assertLt(130*WHOLE-r.reserves[1],65*WHOLE);check(x,ticks,decimals,0,1,1,r);
    }
    function testMaximumRadiusEightTokensAndMixedRawCapacity() public pure {
        uint256 radius=(uint256(1)<<160)-1;uint256[] memory x=new uint256[](8);
        for(uint256 i;i<8;i++)x[i]=radius-radius/8;
        uint8[] memory decimals=decimalsFor(8,18);decimals[0]=0;
        M.Tick[] memory ticks=single(8,radius);uint256 raw=(radius/16)/WHOLE;
        I.Result memory r=I.exactInput(x,ticks,decimals,0,7,raw);
        assertLt(r.netInputInternal,uint256(1)<<160);assertLt(r.amountOutRaw,uint256(1)<<96);
        check(x,ticks,decimals,0,7,raw,r);
    }
    function callSwap(uint256[] memory x,M.Tick[] memory ticks,uint8[] memory decimals,uint8 input,uint8 output,uint256 rawInput) external pure returns(I.Result memory){
        return I.exactInput(x,ticks,decimals,input,output,rawInput);
    }
    function testCrossingRequiresTraversalBeforeAnyEndpointInterpretation() public {
        vm.expectRevert(I.RequiresTraversal.selector);
        this.callSwap(mainReserves(),mainTicks(),mainDecimals(),0,2,100e6);
    }
    function testRoundingOntoFirstKeyRequiresTraversal() public {
        // Ideal endpoint is just below h=3/2; flooring output puts actual sum
        // exactly on that key. It cannot persist as strict all-interior.
        uint256[] memory x=mainReserves();M.Tick[] memory ticks=mainTicks();uint8[] memory decimals=mainDecimals();
        S.Result memory primitive=S.step(x,700*WHOLE,0,2,68669858*(WHOLE/1e6),WHOLE/1e6);
        assertEq(primitive.amountOutRaw,18669858);
        decimals[2]=6;
        vm.expectRevert(I.RequiresTraversal.selector);this.callSwap(x,ticks,decimals,0,2,68669858);
    }
    function testValidBoundaryStartRequiresTraversalIncludingEquality() public {
        uint256[] memory x=new uint256[](3);x[0]=400*WHOLE;x[1]=350*WHOLE;x[2]=300*WHOLE;
        M.Tick[] memory ticks=mainTicks();assertTrue(M.certify(x,ticks));
        vm.expectRevert(I.RequiresTraversal.selector);this.callSwap(x,ticks,mainDecimals(),0,1,1e6);
        x[2]+=WHOLE;assertTrue(M.certify(x,ticks));
        vm.expectRevert(I.RequiresTraversal.selector);this.callSwap(x,ticks,mainDecimals(),0,1,1e6);
    }
    function testUncertifiedStartIsNotMisreportedAsTraversalOrGlobalExclusion() public {
        uint256[] memory x=mainReserves();x[2]=0;
        vm.expectRevert(I.UncertifiedStart.selector);this.callSwap(x,mainTicks(),mainDecimals(),0,1,1e6);
        x=mainReserves();x[2]=uint256(1)<<160;
        vm.expectRevert(I.UncertifiedStart.selector);this.callSwap(x,mainTicks(),mainDecimals(),0,1,1e6);
    }
    function testRejectMetadataAndPairMismatches() public {
        uint256[] memory x=mainReserves();M.Tick[] memory ticks=mainTicks();uint8[] memory decimals=mainDecimals();
        decimals[2]=19;vm.expectRevert(I.InvalidMetadata.selector);this.callSwap(x,ticks,decimals,0,1,1);
        vm.expectRevert(I.InvalidMetadata.selector);this.callSwap(x,ticks,decimalsFor(2,6),0,1,1);
        vm.expectRevert(I.InvalidMetadata.selector);this.callSwap(new uint256[](1),ticks,decimalsFor(1,6),0,0,1);
        decimals=mainDecimals();vm.expectRevert(I.InvalidPair.selector);this.callSwap(x,ticks,decimals,1,1,1);
        vm.expectRevert(I.InvalidPair.selector);this.callSwap(x,ticks,decimals,0,3,1);
    }
    function testRejectZeroAndOversizedInputBeforeRawConversionOverflow() public {
        uint256[] memory x=mainReserves();M.Tick[] memory ticks=mainTicks();uint8[] memory decimals=mainDecimals();
        vm.expectRevert(I.InvalidInput.selector);this.callSwap(x,ticks,decimals,0,1,0);
        vm.expectRevert(I.InvalidInput.selector);this.callSwap(x,ticks,decimals,0,1,type(uint256).max);
        vm.expectRevert(I.InvalidInput.selector);this.callSwap(x,ticks,decimals,0,1,200e6+1);
    }
    function testRejectInputTooSmallToPayOneOutputQuantum() public {
        uint8[] memory decimals=mainDecimals();decimals[0]=18;decimals[2]=0;
        vm.expectRevert(S.NoOutput.selector);this.callSwap(mainReserves(),mainTicks(),decimals,0,2,1);
    }
    function testFuzzWholeTokenInputsBindScalesAndPreserveSquareCertificate(uint32 seed,uint8 inDecimals,uint8 outDecimals) public pure {
        uint256 amount=1+uint256(seed)%52;
        uint8[] memory decimals=decimalsFor(4,18);decimals[0]=inDecimals%19;decimals[1]=outDecimals%19;
        uint256[] memory x=new uint256[](4);for(uint256 i;i<4;i++)x[i]=65*WHOLE;
        M.Tick[] memory ticks=single(4,130*WHOLE);uint256 raw=amount*10**decimals[0];
        // At one whole input, output is below a whole token; use two whole
        // inputs or more when output decimals are zero to guarantee liveness.
        if(decimals[1]==0&&amount==1){amount=2;raw=amount*10**decimals[0];}
        I.Result memory r=I.exactInput(x,ticks,decimals,0,1,raw);check(x,ticks,decimals,0,1,raw,r);
    }
}
