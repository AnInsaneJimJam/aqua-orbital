import Entity from '../../../features/Entity';
export default async function Page({params}:{params:Promise<{strategyHash:string}>}){const {strategyHash}=await params;return <Entity kind="strategy" id={strategyHash}/>;}
