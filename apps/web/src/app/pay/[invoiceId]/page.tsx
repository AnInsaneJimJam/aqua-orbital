import Invoice from '../../../features/Invoice';
export default async function Page({params}:{params:Promise<{invoiceId:string}>}){const {invoiceId}=await params;return <Invoice id={invoiceId}/>;}
