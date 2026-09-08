import {defineChain} from 'viem';
export const local=process.env.NEXT_PUBLIC_CHAIN_ID==='31337';
export const selectedChain=defineChain({id:Number(local?31337:5042002),name:local?'Local Anvil':'Arc Testnet',nativeCurrency:{name:local?'Ether':'USDC',symbol:local?'ETH':'USDC',decimals:18},rpcUrls:{default:{http:[local?'http://127.0.0.1:8545':'https://rpc.testnet.arc.io']}},testnet:true});
