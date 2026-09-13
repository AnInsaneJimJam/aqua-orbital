import type {Metadata} from 'next';
import localFont from 'next/font/local';
import WalletProvider from '../wallet/WalletProvider';
import Shell from '../components/Shell';
import './globals.css';
const sans=localFont({src:'../fonts/SpaceGrotesk.ttf',variable:'--font-sans',display:'swap',weight:'300 700'});
const display=localFont({src:[{path:'../fonts/InstrumentSerif-Regular.ttf',weight:'400',style:'normal'},{path:'../fonts/InstrumentSerif-Italic.ttf',weight:'400',style:'italic'}],variable:'--font-display',display:'swap'});
export const metadata:Metadata={title:{default:'Orbital Swap — stablecoin swaps',template:'%s · Orbital Swap'},description:'Stablecoin swaps. Powered by Orbital. Wallet-held liquidity through Aqua on Arc Testnet.',icons:{icon:'/brand/favicon.svg'}};
// Browser extensions add body attributes before hydration. This shallow escape
// hatch covers only that unowned boundary; descendant mismatches still report.
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={`${sans.variable} ${display.variable}`}><body suppressHydrationWarning><WalletProvider><Shell>{children}</Shell></WalletProvider></body></html>;}
