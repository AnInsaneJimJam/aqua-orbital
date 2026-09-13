import {test,expect} from '@playwright/test';
import {decodeFunctionData} from 'viem';
import {directPaymentAbi} from '@orbital/sdk';
import {setupInvoiceAdmin} from './fixtures/invoice-admin';

test('merchant reviews split amounts and shares only the confirmed creation ID',async({page},testInfo)=>{
 const f=await setupInvoiceAdmin(page);await page.getByLabel('Amount due in USDC').fill('5.000001');await page.getByText('Invoice options',{exact:true}).click();await page.getByText('Recipients & splits',{exact:true}).click();await page.getByRole('button',{name:'Add recipient'}).click();
 await page.getByLabel('Recipient 1 share (%)').fill('90');await page.getByLabel('Recipient 2',{exact:true}).fill(f.manifest.aqua);await page.getByLabel('Recipient 2 share (%)').fill('10');
 await page.getByText('Add a reference',{exact:true}).click();await page.getByLabel('Reference (optional)').fill('Public fixture reference');await page.getByRole('button',{name:'Review invoice',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review invoice creation'})).toBeVisible();expect(f.calls).toHaveLength(0);
 await expect(page.getByText('4.5 USDC',{exact:true})).toBeVisible();await expect(page.getByText('0.500001 USDC',{exact:true})).toBeVisible();
 await page.setViewportSize({width:320,height:720});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:testInfo.outputPath('invoice-admin-review-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Confirm invoice creation'}).click();await expect(page.getByRole('link',{name:'Open shareable invoice'})).toHaveAttribute('href',`/pay/${f.createdId}`);
 expect(f.calls).toHaveLength(1);expect(f.calls[0]!.to!.toLowerCase()).toBe(f.manifest.payments.toLowerCase());expect(f.calls[0]!.value).toBe('0x0');
 const decoded=decodeFunctionData({abi:directPaymentAbi,data:f.calls[0]!.data as `0x${string}`});expect(decoded.functionName).toBe('createInvoice');
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('Public fixture reference');
});
test('invalid invoice shares and inadequate gas never request a signature',async({page})=>{
 const f=await setupInvoiceAdmin(page,{gasPoor:true});await page.getByText('Invoice options',{exact:true}).click();await page.getByText('Recipients & splits',{exact:true}).click();await page.getByLabel('Recipient 1 share (%)').fill('99');await page.getByRole('button',{name:'Review invoice',exact:true}).click();
 await expect(page.getByText(/shares must total 10000/)).toBeVisible();await page.getByLabel('Recipient 1 share (%)').fill('100');await page.getByRole('button',{name:'Review invoice',exact:true}).click();
 await expect(page.getByText(/Insufficient balance for gas/)).toBeVisible();expect(f.calls).toHaveLength(0);
});
test('edited terms and expiry invalidate creation review',async({page})=>{
 const f=await setupInvoiceAdmin(page);await page.getByRole('button',{name:'Review invoice',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toBeVisible();
 await page.getByLabel('Amount due in USDC').fill('6');await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toHaveCount(0);
 await page.getByRole('button',{name:'Review invoice',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toBeVisible();await page.clock.fastForward(21000);
 await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toHaveCount(0);expect(f.calls).toHaveLength(0);
});
test('changed merchant nonce prevents signing a creation with stale state',async({page})=>{
 const f=await setupInvoiceAdmin(page);await page.getByRole('button',{name:'Review invoice',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toBeVisible();f.advanceNonce();
 await page.getByRole('button',{name:'Confirm invoice creation'}).click();await expect(page.getByText(/nonce changed/)).toBeVisible();expect(f.calls).toHaveLength(0);
});
test('rejected invoice signature returns to review without resubmission',async({page})=>{
 const f=await setupInvoiceAdmin(page,{rejected:true});await page.getByRole('button',{name:'Review invoice',exact:true}).click();await page.getByRole('button',{name:'Confirm invoice creation'}).click();
 await expect(page.getByText(/rejected/i)).toBeVisible();expect(f.calls).toHaveLength(0);await expect(page.getByRole('button',{name:'Review invoice',exact:true})).toBeEnabled();
});
test('submitted creation resumes after reload without a second signature',async({page})=>{
 const f=await setupInvoiceAdmin(page,{pending:true});await page.getByRole('button',{name:'Review invoice',exact:true}).click();await page.getByRole('button',{name:'Confirm invoice creation'}).click();
 await expect(page.getByText('Submitted invoice action',{exact:true})).toBeVisible();expect(f.calls).toHaveLength(1);await page.reload();f.ready();
 await page.getByRole('button',{name:'Resume invoice receipt'}).click();await expect(page.getByRole('link',{name:'Open shareable invoice'})).toHaveAttribute('href',`/pay/${f.createdId}`);expect(f.calls).toHaveLength(1);
});
for(const mode of ['noEvent','wrongTransaction','reverted'] as const)test(`invoice ${mode} does not produce a shareable success`,async({page})=>{
 const f=await setupInvoiceAdmin(page,{[mode]:true});await page.getByRole('button',{name:'Review invoice',exact:true}).click();await page.getByRole('button',{name:'Confirm invoice creation'}).click();
 await expect(page.getByText(mode==='reverted'?/Transaction reverted/:mode==='noEvent'?/does not establish/:/does not match/)).toBeVisible();await expect(page.getByRole('link',{name:'Open shareable invoice'})).toHaveCount(0);expect(f.calls).toHaveLength(1);
});
test('unpaid merchant cancellation requires its own review and receipt',async({page})=>{
 const f=await setupInvoiceAdmin(page,{cancel:true});await page.getByRole('button',{name:'Review cancellation',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review invoice cancellation'})).toBeVisible();expect(f.calls).toHaveLength(0);await page.getByRole('button',{name:'Confirm invoice cancellation'}).click();
 await expect(page.getByText(/Invoice cancellation confirmed/)).toBeVisible();expect(f.calls).toHaveLength(1);
 const decoded=decodeFunctionData({abi:directPaymentAbi,data:f.calls[0]!.data as `0x${string}`});expect(decoded.functionName).toBe('cancelInvoice');expect(decoded.args?.[0]).toBe(f.invoiceId);
});
test('a payment racing cancellation stops the cancellation signature',async({page})=>{
 const f=await setupInvoiceAdmin(page,{cancel:true});await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm invoice cancellation'})).toBeVisible();f.paid();
 await page.getByRole('button',{name:'Confirm invoice cancellation'}).click();await expect(page.getByText(/no longer unpaid/)).toBeVisible();expect(f.calls).toHaveLength(0);
});
test('account changes permanently discard a prepared invoice review',async({page})=>{
 const f=await setupInvoiceAdmin(page);await page.getByRole('button',{name:'Review invoice',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toBeVisible();
 await page.evaluate(a=>(window as any).invoiceWallet.account(a),f.manifest.aqua);await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toHaveCount(0);
 await page.evaluate(a=>(window as any).invoiceWallet.account(a),f.account);await expect(page.getByRole('button',{name:'Confirm invoice creation'})).toHaveCount(0);expect(f.calls).toHaveLength(0);
});
test('invoice creation requests the configured network and preserves amount',async({page})=>{
 const f=await setupInvoiceAdmin(page);await page.getByLabel('Amount due in USDC').fill('6');await page.evaluate(()=>(window as any).invoiceWallet.chain('0x1'));
 await page.getByRole('button',{name:'Switch to invoice network'}).click();await expect(page.getByRole('button',{name:'Review invoice',exact:true})).toBeEnabled();await expect(page.getByLabel('Amount due in USDC')).toHaveValue('6');expect(f.calls).toHaveLength(0);
});
test('unreadable saved invoice actions block another signature',async({page})=>{
 const f=await setupInvoiceAdmin(page);await page.evaluate(a=>localStorage.setItem(`orbital:invoice-admin:1:5042002:${a.toLowerCase()}:bad`,'{broken'),f.account);await page.reload();
 await expect(page.getByText(/recovery storage could not be read/)).toBeVisible();await expect(page.getByRole('button',{name:'Review invoice',exact:true})).toBeDisabled();expect(f.calls).toHaveLength(0);
});
