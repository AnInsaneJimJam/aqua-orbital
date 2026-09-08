// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {MakerTraitsLib,MakerTraits} from "../vendor/swap-vm-orbital/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";

contract CodecTest is Test {
    function testCanonicalTakerGolden() public pure {
        TakerTraitsLib.Args memory a;
        a.taker=address(1);a.to=address(1);a.isExactIn=true;a.isFirstTransferFromTaker=true;a.useTransferFromAndAquaPush=true;a.isAToB=true;
        a.threshold=abi.encode(uint256(5));a.deadline=1000;a.instructionsArgs=hex"01000110";
        bytes memory data=TakerTraitsLib.build(a);
        bytes memory expected=bytes.concat(hex"002900250025002500250025002500250020002000e1",abi.encode(uint256(5)),hex"00000003e8",hex"01000110");
        assertEq(data,expected);
    }
    function testCanonicalMakerGolden() public pure {
        MakerTraitsLib.Args memory a;a.maker=address(3);a.tokenA=address(1);a.tokenB=address(2);a.useAquaInsteadOfSignature=true;
        bytes32 hash=bytes32(uint256(123));a.program=bytes.concat(hex"7220",hash,hex"5220",hash);
        ISwapVM.Order memory order=MakerTraitsLib.build(a);
        assertEq(MakerTraits.unwrap(order.traits),(uint256(1)<<254)|(uint256(0x0028002800280028)<<160));
        assertEq(order.data,bytes.concat(bytes20(address(1)),bytes20(address(2)),a.program));
        assertEq(order.data.length,108);
    }
}
