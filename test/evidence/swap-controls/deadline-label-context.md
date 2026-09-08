# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: swap-controls.spec.ts >> swap starts with USDC to oUSD6, blank input and documented device defaults
- Location: test\swap-controls.spec.ts:4:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel('Transaction deadline', { exact: true })
Expected: "180"
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" getByLabel('Transaction deadline', { exact: true }) with timeout 30000ms
  - waiting for getByLabel('Transaction deadline', { exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "Orbital home":
    - /url: /
    - text: Orbital
  - navigation "Main navigation":
    - link "Swap":
      - /url: /swap
    - link "Liquidity":
      - /url: /liquidity
    - link "Payments":
      - /url: /pay
  - button "Manage connected wallet": 0x0000…0016
- main:
  - heading "Swap" [level=1]
  - text: Arc Testnet
  - paragraph: Trade stablecoin liquidity through Orbital.
  - group:
    - text: Swap settings
    - group "Slippage tolerance":
      - text: Slippage tolerance
      - button "0.1%" [pressed]
      - button "0.5%"
      - button "1%"
      - text: Custom slippage (basis points)
      - textbox "Custom slippage (basis points)": "10"
      - paragraph: 1–500 whole basis points. 100 basis points equals 1%.
      - text: Transaction deadline
      - combobox "Transaction deadline":
        - option "1 minute"
        - option "3 minutes" [selected]
        - option "10 minutes"
      - button "Reset settings"
  - text: You pay
  - textbox "You pay":
    - /placeholder: "0.00"
  - combobox "Input token":
    - option "USDC" [selected]
    - option "oUSD6"
    - option "oUSD18"
  - paragraph: "Balance: Checking…"
  - button "Max" [disabled]
  - button "Refresh balance" [disabled]
  - button "Reverse pair": ↓
  - text: You receive
  - combobox "You receive":
    - option "oUSD6" [selected]
    - option "oUSD18"
  - text: Output appears after a certified onchain quote.
  - paragraph: oUSD6 and oUSD18 are demo tokens — no redemption value.
  - separator
  - text: Slippage tolerance 0.1% Network fee USDC · estimated at review
  - region "Swap execution"
  - button "Enter an amount" [disabled]
  - group: How execution works
- contentinfo:
  - link "Build evidence":
    - /url: /proof
  - link "Read the paper ↗":
    - /url: https://www.paradigm.xyz/writing/orbital
  - text: Arc Testnet
  - paragraph: Testnet application. Demo tokens have no redemption value. Concentrated liquidity can lose value.
  - text: Powered by SwapVM — © Degensoft Ltd 2025
- alert
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {setupSwap} from './fixtures/swap';
  3  | 
  4  | test('swap starts with USDC to oUSD6, blank input and documented device defaults',async({page})=>{
  5  |  const f=await setupSwap(page,{blank:true,dynamic:true});await expect(page.getByLabel('Input token')).toHaveValue('USDC');await expect(page.getByLabel('You receive',{exact:true})).toHaveValue('oUSD6');await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Enter an amount',exact:true})).toBeDisabled();
> 6  |  await page.getByText('Swap settings',{exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('10');await expect(page.getByLabel('Transaction deadline',{exact:true})).toHaveValue('180');await page.clock.runFor(350);expect(f.quotes()).toBe(0);
     |                                                                                                                                                                                                                  ^ Error: expect(locator).toHaveValue(expected) failed
  7  | });
  8  | test('saved slippage and deadline alter the actual review and reset explicitly',async({page})=>{
  9  |  const f=await setupSwap(page,{dynamic:true,approved:true});await page.getByText('Swap settings',{exact:true}).click();await page.getByLabel('Custom slippage (basis points)').fill('150');await page.getByLabel('Transaction deadline',{exact:true}).selectOption('600');await expect(page.getByText(/High slippage:/)).toBeVisible();await expect(page.getByText('19.7 oUSD18',{exact:true})).toBeVisible();
  10 |  await page.getByRole('button',{name:'Review swap',exact:true}).click();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toBeVisible();await expect(page.getByText('2023-11-14 22:23:23 UTC',{exact:true})).toBeVisible();expect(f.requests.at(-1)!.slippageBps).toBe(150);
  11 |  await page.getByRole('button',{name:'0.1%',exact:true}).click();await expect(page.getByRole('button',{name:'Submit reviewed swap'})).toHaveCount(0);expect(f.sent.size).toBe(0);
  12 |  await page.getByLabel('Custom slippage (basis points)').fill('150');await page.reload();await page.getByText('Swap settings',{exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('150');await expect(page.getByLabel('Transaction deadline',{exact:true})).toHaveValue('600');await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('');
  13 |  await page.getByRole('button',{name:'Reset settings',exact:true}).click();await expect(page.getByLabel('Custom slippage (basis points)')).toHaveValue('10');await expect(page.getByLabel('Transaction deadline',{exact:true})).toHaveValue('180');
  14 | });
  15 | test('invalid slippage clears old amounts and prevents quotes and signatures',async({page})=>{
  16 |  const f=await setupSwap(page,{dynamic:true});await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();await page.getByText('Swap settings',{exact:true}).click();
  17 |  for(const value of ['0','501','1.5','']){await page.getByLabel('Custom slippage (basis points)').fill(value);const count=f.quotes();await page.clock.runFor(350);expect(f.quotes()).toBe(count);await expect(page.getByLabel('Quoted output',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Check settings',exact:true})).toBeDisabled();}
  18 |  await page.getByRole('button',{name:'0.5%',exact:true}).click();await expect(page.getByText('19.9 oUSD18',{exact:true})).toBeVisible();expect(f.requests.at(-1)!.slippageBps).toBe(50);expect(f.sent.size).toBe(0);
  19 | });
  20 | test('amount edits wait 300ms and only the final amount is requested',async({page})=>{
  21 |  const f=await setupSwap(page,{dynamic:true,blank:true});await page.clock.pauseAt(new Date(1700000005000));
  22 |  await page.getByLabel('You pay',{exact:true}).fill('1');await page.clock.runFor(200);await page.getByLabel('You pay',{exact:true}).fill('2');await page.clock.runFor(200);await page.getByLabel('You pay',{exact:true}).fill('3');await page.clock.runFor(299);expect(f.quotes()).toBe(0);await page.clock.runFor(2);await page.clock.resume();await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();expect(f.requests.map(r=>r.amountInRaw)).toEqual(['3000000']);
  23 | });
  24 | test('USDC Max re-estimates a smaller candidate when the required gas reserve increases',async({page})=>{
  25 |  const f=await setupSwap(page,{dynamic:true,approved:true,gasUnits:10000000n});await page.getByRole('button',{name:'Refresh balance',exact:true}).click();await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: 9007199254.740993 USDC');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('9007199254.688193');
  26 |  expect(f.requests.some(r=>r.amountInRaw==='9007199254690993')).toBeTruthy();expect(f.requests.some(r=>r.amountInRaw==='9007199254688193')).toBeTruthy();expect(f.sent.size).toBe(0);
  27 | });
  28 | test('unknown remaining swap gas offers an explicitly editable reserve instead of entire-balance Max',async({page})=>{
  29 |  const f=await setupSwap(page,{dynamic:true});await page.getByRole('button',{name:'Refresh balance',exact:true}).click();await expect(page.getByLabel('Input balance',{exact:true})).toContainText('9007199254.740993 USDC');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByText(/Gas for the remaining approval and swap is unavailable/)).toBeVisible();await page.getByRole('button',{name:'Use editable amount · 9007199254.690993 USDC',exact:true}).click();await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('9007199254.690993');expect(f.sent.size).toBe(0);
  30 | });
  31 | test('non-USDC Max uses the full token balance without deducting native gas',async({page})=>{
  32 |  const f=await setupSwap(page,{dynamic:true,gasPoor:true});await page.getByLabel('Input token').selectOption('oUSD18');await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: 0.009007199254740993 oUSD18');await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('0.009007199254740993');expect(f.sent.size).toBe(0);
  33 | });
  34 | test('failed or inconsistent balance reads never display zero or enable Max',async({page})=>{
  35 |  const f=await setupSwap(page,{dynamic:true,blank:true,balanceFail:true});await expect(page.getByLabel('Input balance',{exact:true})).toHaveText('Balance: Unavailable');await expect(page.getByRole('button',{name:'Max',exact:true})).toBeDisabled();expect(f.sent.size).toBe(0);
  36 | });
  37 | 
```