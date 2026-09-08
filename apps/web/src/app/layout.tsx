import type {Metadata} from 'next';
import WalletProvider from '../wallet/WalletProvider';
import Shell from '../components/Shell';
import './globals.css';
export const metadata:Metadata={title:{default:'Orbital — liquidity, in your orbit',template:'%s · Orbital'},description:'Wallet-held concentrated stablecoin liquidity through Aqua. Built on the Orbital mechanism.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><WalletProvider><Shell>{children}</Shell></WalletProvider></body></html>;}
