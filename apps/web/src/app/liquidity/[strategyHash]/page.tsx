import Strategy from '../../../features/Strategy';
export default async function Page({params}:{params:Promise<{strategyHash:string}>}){const {strategyHash}=await params;return <Strategy id={strategyHash}/>;}
