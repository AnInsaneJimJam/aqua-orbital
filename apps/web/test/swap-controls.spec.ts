import {selectValue} from './fixtures/select';
import {test,expect} from '@playwright/test';
import {setupSwap} from './fixtures/swap';

test('swap starts with USDC to oUSD6, blank input and documented device defaults',async({page})=>{
 const f=await setupSwap(page,{blank:true,dynamic:true});await expect(page.getByRole('combobox',{name:'Input token',exact:true})).toHaveText('USDC');await expect(page.getByRole('combobox',{name:'Buy',exact:true})).toHaveText('oUSD6');await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Enter an amount',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Swap settings',exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('10');await expect(page.getByRole('combobox',{name:'Transaction deadline',exact:true})).toHaveText('3 minutes');await page.clock.runFor(350);expect(f.quotes()).toBe(0);
 await page.setViewportSize({width:320,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'../../.cache/frontend-v2/screenshots/swap-controls-mobile.png',fullPage:true});
});
test('saved slippage and deadline alter the actual review and reset explicitly',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,approved:true});await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByLabel('Custom slippage (basis points)').fill('150');await selectValue(page,'Transaction deadline','600');await expect(page.getByText(/High slippage:/)).toBeVisible();await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByText('19.7 oUSD18',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review swap',exact:true}).click();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toBeVisible();await expect(page.getByText('2023-11-14 22:23:23 UTC',{exact:true})).toBeVisible();expect(f.requests.at(-1)!.slippageBps).toBe(150);
 await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByRole('button',{name:'0.1%',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toHaveCount(0);expect(f.sent.size).toBe(0);
 await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByLabel('Custom slippage (basis points)').fill('150');await page.reload();await page.getByRole('button',{name:'Swap settings',exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('150');await expect(page.getByRole('combobox',{name:'Transaction deadline',exact:true})).toHaveText('10 minutes');await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByRole('button',{name:'Reset settings',exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('10');await expect(page.getByRole('combobox',{name:'Transaction deadline',exact:true})).toHaveText('3 minutes');await page.getByRole('button',{name:'Done',exact:true}).click();
});
test('invalid slippage clears old amounts and prevents quotes and signatures',async({page})=>{
 const f=await setupSwap(page,{dynamic:true});await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();
 for(const value of ['0','501','1.5','']){await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByLabel('Custom slippage (basis points)').fill(value);const count=f.quotes();await page.clock.runFor(350);expect(f.quotes()).toBe(count);await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByLabel('Quoted output',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Check settings',exact:true})).toBeDisabled();}
 await page.getByRole('button',{name:'Swap settings',exact:true}).click();await page.getByRole('button',{name:'0.5%',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByText('19.9 oUSD18',{exact:true})).toBeVisible();expect(f.requests.at(-1)!.slippageBps).toBe(50);expect(f.sent.size).toBe(0);
});
test('amount edits wait 300ms and only the final amount is requested',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,blank:true});await page.clock.pauseAt(new Date(1700000005000));
 await page.getByLabel('Sell',{exact:true}).fill('1');await page.clock.runFor(200);await page.getByLabel('Sell',{exact:true}).fill('2');await page.clock.runFor(200);await page.getByLabel('Sell',{exact:true}).fill('3');await page.clock.runFor(299);expect(f.quotes()).toBe(0);await page.clock.runFor(2);await page.clock.resume();await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();expect(f.requests.map(r=>r.amountInRaw)).toEqual(['3000000']);
});
test('USDC Max re-estimates a smaller candidate when the required gas reserve increases',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,approved:true,gasUnits:10000000n});await page.getByRole('button',{name:'Refresh balance',exact:true}).click();await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: 9007199254.740993 USDC');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('9007199254.688193');
 expect(f.requests.some(r=>r.amountInRaw==='9007199254690993')).toBeTruthy();expect(f.requests.some(r=>r.amountInRaw==='9007199254688193')).toBeTruthy();expect(f.sent.size).toBe(0);
});
test('unknown remaining swap gas offers an explicitly editable reserve instead of entire-balance Max',async({page})=>{
 const f=await setupSwap(page,{dynamic:true});await page.getByRole('button',{name:'Refresh balance',exact:true}).click();await expect(page.getByLabel('Input balance',{exact:true})).toContainText('9007199254.740993 USDC');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByText(/Gas for the remaining approval and swap is unavailable/)).toBeVisible();await page.getByRole('button',{name:'Use editable amount · 9007199254.690993 USDC',exact:true}).click();await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('9007199254.690993');expect(f.sent.size).toBe(0);
});
test('non-USDC Max uses the full token balance without deducting native gas',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,gasPoor:true});await selectValue(page,'Input token','oUSD18');await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: 0.009007199254740993 oUSD18');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('0.009007199254740993');expect(f.sent.size).toBe(0);
});
test('failed or inconsistent balance reads never display zero or enable Max',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,blank:true,balanceFail:true});await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: Unavailable');await expect(page.getByRole('button',{name:'Max',exact:true})).toBeDisabled();expect(f.sent.size).toBe(0);
});
test('wrong token precision cannot become a displayed balance',async({page})=>{
 await setupSwap(page,{dynamic:true,blank:true,wrongDecimals:true});await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: Unavailable');await expect(page.getByRole('button',{name:'Max',exact:true})).toBeDisabled();
});
test('network selection requests the configured chain without quoting or signing a blank input',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,blank:true});await page.evaluate(()=>(window as any).swapExecutionWallet.chain('0x1'));await page.getByRole('button',{name:'Switch to Arc Testnet',exact:true}).click();await expect(page.getByRole('button',{name:'Enter an amount',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).swapExecutionWallet.networks)).toEqual(['0x4cef52']);expect(f.quotes()).toBe(0);expect(f.sent.size).toBe(0);
});
test('rejected network selection retains the amount and never requests a signature',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,blank:true,switchRejected:true});await page.evaluate(()=>(window as any).swapExecutionWallet.chain('0x1'));await page.getByLabel('Sell',{exact:true}).fill('5');await page.getByRole('button',{name:'Switch to Arc Testnet',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('User rejected');await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('5');expect(f.quotes()).toBe(0);expect(f.sent.size).toBe(0);
});
test('interrupted Max estimation times out without changing the amount or signing',async({page})=>{
 const f=await setupSwap(page,{dynamic:true,approved:true});await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Refresh balance',exact:true}).click();await expect(page.getByRole('button',{name:'Max',exact:true})).toBeEnabled();
 let started=false,release:()=>void=()=>{};await page.route('**/quotes/swap',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();started=true;await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({headers:{'access-control-allow-origin':'*'},json:f.f.observed}).catch(()=>{});});
 await page.getByRole('button',{name:'Max',exact:true}).click();await expect.poll(()=>started).toBeTruthy();await page.clock.fastForward(31000);await expect(page.getByText('Max timed out. Refresh the balance and try again.',{exact:true})).toBeVisible();await expect(page.getByLabel('Sell',{exact:true})).toHaveValue('9007199254.740993');expect(f.sent.size).toBe(0);release();
});
