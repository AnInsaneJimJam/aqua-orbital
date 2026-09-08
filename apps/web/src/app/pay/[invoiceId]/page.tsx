import Entity from '../../../features/Entity';
export default async function Page({params}:{params:Promise<{invoiceId:string}>}){const {invoiceId}=await params;return <Entity kind="invoice" id={invoiceId}/>;}
