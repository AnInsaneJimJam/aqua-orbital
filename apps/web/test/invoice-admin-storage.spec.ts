import {test,expect} from '@playwright/test';
import {encodeFunctionData,type Address} from 'viem';
import {directPaymentAbi} from '@orbital/sdk';
import {decodePendingInvoiceAdmin,encodePendingInvoiceAdmin,type PendingInvoiceAdmin} from '../src/features/invoiceAdminStorage';
const account='0x0000000000000000000000000000000000000001' as Address,to='0x0000000000000000000000000000000000000002' as Address,hash=`0x${'ab'.repeat(32)}` as const;
const record=():PendingInvoiceAdmin=>({schemaVersion:1,kind:'create',transaction:{schemaVersion:1,hash,chainId:5042002,account,label:'Create invoice'},
 plan:{chainId:5042002,account,to,data:encodeFunctionData({abi:directPaymentAbi,functionName:'createInvoice',args:[5n,1700003600,[account],[10000],hash]}),value:0n,label:'Create invoice'}});
test('invoice recovery preserves canonical calldata and never permits a changed scope',()=>{
 const p=record(),raw=encodePendingInvoiceAdmin(p);expect(decodePendingInvoiceAdmin(raw,5042002,account)).toEqual(p);
 expect(()=>decodePendingInvoiceAdmin(raw,31337,account)).toThrow();expect(()=>decodePendingInvoiceAdmin(raw,5042002,to)).toThrow();
});
test('invoice recovery rejects a changed action kind, appended data and malformed hashes',()=>{
 for(const mutate of [(p:PendingInvoiceAdmin)=>{p.kind='cancel';},(p:PendingInvoiceAdmin)=>{p.plan.data=`${p.plan.data}00`;},(p:PendingInvoiceAdmin)=>{p.transaction.hash='0xdead';}]){
  const p=record();mutate(p);expect(()=>decodePendingInvoiceAdmin(encodePendingInvoiceAdmin(p),5042002,account)).toThrow();
 }
 const malformed=JSON.parse(encodePendingInvoiceAdmin(record()));malformed.plan.value='1';
 expect(()=>decodePendingInvoiceAdmin(JSON.stringify(malformed),5042002,account)).toThrow();
});
