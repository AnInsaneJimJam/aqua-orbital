// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IOrbitalRouter,OrbitalConfigV1} from "./interfaces/IOrbitalRouter.sol";
import {ISwapVM} from "../vendor/swap-vm-orbital/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TakerTraitsLib} from "../vendor/swap-vm-orbital/src/libs/TakerTraits.sol";

contract OrbitalPayments {
    using SafeERC20 for IERC20;
    enum Status { Unknown,Unpaid,InProgress,Paid,Cancelled }
    struct Invoice { address merchant; uint256 amountDueRaw; uint40 expiresAt; address[] recipients; uint16[] bps; bytes32 memoHash; Status status; address payer; uint256 inputRaw; uint256 receivedRaw; uint256 refundRaw; bytes32 routeHash; }
    IERC20 public immutable USDC;
    IOrbitalRouter public immutable ROUTER;
    mapping(address=>uint64) public nextMerchantNonce;
    mapping(bytes32=>Invoice) private _invoices;
    mapping(address=>bool) public allowedToken;
    bool private _entered;
    error InvalidInvoice(); error NotMerchant(); error NotPayable(); error Reentrancy(); error InvalidRoute(); error TransferMismatch();
    event InvoiceCreated(bytes32 indexed invoiceId,address indexed merchant,uint256 amountDueRaw,uint40 expiresAt,address[] recipients,uint16[] bps,bytes32 memoHash);
    event InvoiceCancelled(bytes32 indexed invoiceId,address indexed merchant);
    event InvoicePaid(bytes32 indexed invoiceId,address indexed merchant,address indexed payer,address tokenIn,uint256 amountInRaw,uint256 receivedRaw,uint256 refundRaw,bytes32 routeHash);
    modifier guarded(){if(_entered)revert Reentrancy();_entered=true;_;_entered=false;}
    constructor(address usdc,address router,address[] memory tokens){
        if(usdc==address(0)||router==address(0))revert InvalidRoute();
        USDC=IERC20(usdc);ROUTER=IOrbitalRouter(router);
        for(uint256 i;i<tokens.length;++i){if(tokens[i]==address(0)||allowedToken[tokens[i]])revert InvalidRoute();allowedToken[tokens[i]]=true;}
        if(!allowedToken[usdc])revert InvalidRoute();
    }
    function createInvoice(uint256 amount,uint40 expiry,address[] calldata recipients,uint16[] calldata shares,bytes32 memo) external guarded returns(bytes32 id) {
        if(amount==0||amount>=(uint256(1)<<160)/(1e12*(uint256(1)<<64))||expiry<block.timestamp+5 minutes||expiry>block.timestamp+30 days||recipients.length==0||recipients.length>3||recipients.length!=shares.length)revert InvalidInvoice();
        uint256 total;
        for(uint256 i;i<recipients.length;++i){
            if(recipients[i]==address(0)||recipients[i]==address(this)||shares[i]==0)revert InvalidInvoice();
            for(uint256 j;j<i;++j)if(recipients[j]==recipients[i])revert InvalidInvoice();
            total+=shares[i];
        }
        if(total!=10000)revert InvalidInvoice();
        uint64 nonce=nextMerchantNonce[msg.sender]++;
        id=keccak256(abi.encode(block.chainid,address(this),msg.sender,nonce));
        Invoice storage inv=_invoices[id]; inv.merchant=msg.sender;inv.amountDueRaw=amount;inv.expiresAt=expiry;inv.recipients=recipients;inv.bps=shares;inv.memoHash=memo;inv.status=Status.Unpaid;
        emit InvoiceCreated(id,msg.sender,amount,expiry,recipients,shares,memo);
    }
    function cancelInvoice(bytes32 id) external guarded {
        Invoice storage inv=_known(id);
        if(inv.merchant!=msg.sender)revert NotMerchant();
        if(inv.status!=Status.Unpaid)revert NotPayable();
        inv.status=Status.Cancelled;emit InvoiceCancelled(id,msg.sender);
    }
    function getInvoice(bytes32 id) external view returns(Invoice memory){if(_entered)revert Reentrancy();return _known(id);}
    function _known(bytes32 id) private view returns(Invoice storage inv){inv=_invoices[id];if(inv.status==Status.Unknown)revert InvalidInvoice();}
    function _begin(bytes32 id) private returns(Invoice storage inv){
        inv=_known(id);if(inv.status!=Status.Unpaid||block.timestamp>=inv.expiresAt)revert NotPayable();inv.status=Status.InProgress;
    }
    function payWithUSDC(bytes32 id) external guarded {
        Invoice storage inv=_begin(id);uint256 beforeBalance=USDC.balanceOf(address(this));
        uint256 payerBefore=USDC.balanceOf(msg.sender);
        USDC.safeTransferFrom(msg.sender,address(this),inv.amountDueRaw);
        if(USDC.balanceOf(address(this))!=beforeBalance+inv.amountDueRaw||USDC.balanceOf(msg.sender)!=payerBefore-inv.amountDueRaw)revert TransferMismatch();
        _finish(id,inv,address(USDC),inv.amountDueRaw,inv.amountDueRaw,bytes32(0));
        if(USDC.balanceOf(address(this))!=beforeBalance)revert TransferMismatch();
    }
    function payWithSwap(bytes32 id,ISwapVM.Order calldata order,uint8 input,uint256 amount,uint256 minimum,uint40 deadline,uint8 maxCrossings) external guarded {
        Invoice storage inv=_begin(id);
        bytes32 routeHash=keccak256(abi.encode(order));
        OrbitalConfigV1 memory config=ROUTER.getStrategyConfig(routeHash);
        if(order.maker==msg.sender||config.maker!=order.maker||config.router!=address(ROUTER)||config.chainId!=block.chainid||input>=config.tokens.length||amount==0||deadline<=block.timestamp||maxCrossings>16)revert InvalidRoute();
        IERC20 token=IERC20(config.tokens[input]);
        if(address(token)==address(USDC)||!allowedToken[address(token)])revert InvalidRoute();
        uint8 output;bool found;
        for(uint8 i;i<config.tokens.length;++i)if(config.tokens[i]==address(USDC)){if(found)revert InvalidRoute();output=i;found=true;}
        if(!found)revert InvalidRoute();
        uint256 beforeInput=token.balanceOf(address(this));uint256 beforeUSDC=USDC.balanceOf(address(this));uint256 payerBefore=token.balanceOf(msg.sender);
        token.safeTransferFrom(msg.sender,address(this),amount);
        if(token.balanceOf(address(this))!=beforeInput+amount||token.balanceOf(msg.sender)!=payerBefore-amount)revert TransferMismatch();
        token.forceApprove(address(ROUTER),amount);
        TakerTraitsLib.Args memory args;
        args.taker=address(this);args.isExactIn=true;args.isFirstTransferFromTaker=true;args.useTransferFromAndAquaPush=true;args.isAToB=true;
        args.to=address(this);args.deadline=deadline;args.threshold=abi.encode(minimum>inv.amountDueRaw?minimum:inv.amountDueRaw);
        args.instructionsArgs=abi.encodePacked(uint8(1),input,output,maxCrossings);
        (uint256 spent,uint256 reported,bytes32 actualHash)=ROUTER.swap(order,amount,TakerTraitsLib.build(args));
        token.forceApprove(address(ROUTER),0);
        uint256 received=USDC.balanceOf(address(this))-beforeUSDC;
        if(spent!=amount||actualHash!=routeHash||reported!=received||received<inv.amountDueRaw||received<minimum||token.balanceOf(address(this))!=beforeInput)revert TransferMismatch();
        _finish(id,inv,address(token),amount,received,routeHash);
        if(USDC.balanceOf(address(this))!=beforeUSDC||token.allowance(address(this),address(ROUTER))!=0)revert TransferMismatch();
    }
    function _finish(bytes32 id,Invoice storage inv,address token,uint256 input,uint256 received,bytes32 route) private {
        uint256 remaining=inv.amountDueRaw;
        for(uint256 i;i<inv.recipients.length;++i){
            uint256 amount=i+1==inv.recipients.length?remaining:inv.amountDueRaw*inv.bps[i]/10000;
            remaining-=amount;_send(inv.recipients[i],amount);
        }
        uint256 refund=received-inv.amountDueRaw;if(refund!=0)_send(msg.sender,refund);
        inv.status=Status.Paid;inv.payer=msg.sender;inv.inputRaw=input;inv.receivedRaw=received;inv.refundRaw=refund;inv.routeHash=route;
        emit InvoicePaid(id,inv.merchant,msg.sender,token,input,received,refund,route);
    }
    function _send(address recipient,uint256 amount) private {
        uint256 beforeRecipient=USDC.balanceOf(recipient);uint256 beforeSelf=USDC.balanceOf(address(this));
        USDC.safeTransfer(recipient,amount);
        if(USDC.balanceOf(recipient)!=beforeRecipient+amount||USDC.balanceOf(address(this))!=beforeSelf-amount)revert TransferMismatch();
    }
}
