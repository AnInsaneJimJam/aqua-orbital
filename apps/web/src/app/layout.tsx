import type {Metadata} from 'next';
import localFont from 'next/font/local';
import WalletProvider from '../wallet/WalletProvider';
import Shell from '../components/Shell';
import './globals.css';
const sans=localFont({src:'../fonts/SpaceGrotesk.ttf',variable:'--font-sans',display:'swap',weight:'300 700'});
const display=localFont({src:'../fonts/InstrumentSerif-Regular.ttf',variable:'--font-display',display:'swap',weight:'400'});
export const metadata:Metadata={title:{default:'Orbital — a new shape for liquidity',template:'%s · Orbital'},description:'Wallet-held concentrated stablecoin liquidity through Aqua. Built on the Orbital mechanism.',icons:{icon:'/brand/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={`${sans.variable} ${display.variable}`}><body><WalletProvider><Shell>{children}</Shell></WalletProvider></body></html>;}
