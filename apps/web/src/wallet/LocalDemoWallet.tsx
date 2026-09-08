'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {isAddress,toHex,type Address,type Hex} from 'viem';
import {SessionProvider,type Session} from './WalletProvider';
import {selectedChain} from './config';
// Explicit development fixtures. Never enabled by a production build or remote origin.
export default function LocalDemoWallet({children}:{children:ReactNode}){
 const [accounts,setAccounts]=useState<Address[]>([]),[address,setAddress]=useState<Address>(),[error,setError]=useState<string>();
 const active=useRef(address);active.current=address;
 const allowed=()=>process.env.NODE_ENV==='development'&&selectedChain.id===31337&&['localhost','127.0.0.1'].includes(window.location.hostname);
 async function rpc(method:string,params:unknown[]=[]){
  if(!allowed())throw Error('Local wallet fixtures require a loopback development app');
  const response=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  const body=await response.json();if(body.error||body.id!==1||body.jsonrpc!=='2.0')throw Error('Local wallet RPC unavailable');return body.result;
 }
 async function identity(){
  const [chain,meta]=await Promise.all([rpc('eth_chainId'),rpc('anvil_metadata')]);
  if(chain!=='0x7a69'||meta.chainId!==31337||meta.forkedNetwork!==null||meta.clientVersion!=='anvil/v1.5.1')throw Error('Unexpected local wallet network');
  return {chainId:31337,account:active.current};
 }
 async function connect(){
  try{await identity();const result=await rpc('eth_accounts');if(!Array.isArray(result)||result.length<5||result.some(a=>!isAddress(a)))throw Error('Local fixture accounts unavailable');
   setAccounts(result);const saved=sessionStorage.getItem('orbital:local-wallet');setAddress(result.find(a=>a.toLowerCase()===saved?.toLowerCase())??result[3]);setError(undefined);
  }catch(e){setError(e instanceof Error?e.message:'Local wallet unavailable');}
 }
 useEffect(()=>{if(sessionStorage.getItem('orbital:local-wallet'))void connect();},[]);
 useEffect(()=>{if(address)sessionStorage.setItem('orbital:local-wallet',address);},[address]);
 const send:Session['send']=async(plan,fees)=>{
  const before=await identity();if(!before.account||before.account.toLowerCase()!==plan.account.toLowerCase()||plan.chainId!==31337||plan.value!==0n)throw Error('Local wallet changed. Review again.');
  if(!window.confirm(`Local Anvil wallet fixture\n${plan.label}\nAccount: ${plan.account}\nContract: ${plan.to}\nNo real assets. Submit this transaction?`))throw Error('User rejected the local wallet request');
  if(active.current!==before.account)throw Error('Local wallet changed');
  const result=await rpc('eth_sendTransaction',[{from:plan.account,to:plan.to,data:plan.data,value:'0x0',
   ...(fees?{gas:toHex(fees.gas),maxFeePerGas:toHex(fees.maxFeePerGas),...(fees.maxPriorityFeePerGas!==undefined?{maxPriorityFeePerGas:toHex(fees.maxPriorityFeePerGas)}:{})}:{})}]);
  if(!/^0x[0-9a-f]{64}$/i.test(result))throw Error('Invalid local transaction hash');return result as Hex;
 };
 return <SessionProvider value={{ready:true,connected:!!address,address,chainId:31337,kind:address?'local':'none',wallets:accounts.map(address=>({address,kind:'local'})),
  connect:()=>{void connect();},disconnect:()=>{setAddress(undefined);sessionStorage.removeItem('orbital:local-wallet');},select:async next=>{if(!accounts.includes(next))throw Error('Unknown local account');setAddress(next);},identity,send,error}}>
  <div className="notice" style={{margin:0,borderRadius:0,textAlign:'center'}}>Local development · Anvil wallet fixtures · No real assets</div>{children}
 </SessionProvider>;
}
