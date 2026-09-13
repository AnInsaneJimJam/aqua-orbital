import {test, expect, type Page} from '@playwright/test';
import {encodeAbiParameters, keccak256, type Address} from 'viem';
import {invoiceObservation, invoiceManifest, hash, address} from '../../../packages/sdk/test/fixtures/invoice';

const id = hash(1001), path = `/pay/${id}`;
const headers = {'access-control-allow-origin': '*', 'cache-control': 'no-store'};
async function fixture(page: Page, response: () => unknown = invoiceObservation, status: () => number = () => 200) {
  await page.route('**/deployment', route => route.fulfill({json: invoiceManifest, headers}));
  await page.route(`**/invoices/${id}`, route => route.fulfill({json: response(), status: status(), headers}));
}
test('public invoice displays exact terms and recipients in the current template without wallet setup', async ({page}) => {
  await fixture(page); await page.setViewportSize({width: 320, height: 680}); await page.goto(path);
  await expect(page.getByRole('heading', {name: '70000000000.000001 USDC', exact: true})).toBeVisible();
  await expect(page.getByText('Unpaid at indexed block', {exact: true})).toBeVisible();
  await expect(page.getByText('63000000000 USDC', {exact: true})).toBeVisible();
  await expect(page.getByText('7000000000.000001 USDC', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Payment unavailable', exact: true})).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByText('Receipt details', {exact: true}).click();
  await expect(page.getByRole('link', {name: 'Creation receipt'})).toHaveAttribute('href', `https://testnet.arcscan.app/tx/${hash(212)}`);
  await page.screenshot({path: '../../.cache/frontend-v2/screenshots/invoice-mobile.png', fullPage: true});
});
test('paid invoice shows swap-funded receipt and removes old status when a refresh becomes unavailable', async ({page}) => {
  const value = invoiceObservation(), invoice = value.data.invoice;
  invoice.status = 'paid'; invoice.version = '2'; invoice.updated = {blockNumber: '14', blockHash: hash(114), txHash: hash(214), logIndex: 4, event: 'InvoicePaid'};
  invoice.payment = {payer: address(30), tokenIn: address(2), inputToken: invoiceManifest.tokens[1]!, inputRaw: '70000000000000001000000000', receivedRaw: '70000000000000011', refundRaw: '10', routeHash: hash(300), kind: 'swap'};
  let available = true;
  await fixture(page, () => available ? value : {code: 'RPC_UNAVAILABLE', message: 'Canonical invoice history unavailable.'}, () => available ? 200 : 503);
  await page.goto(path);
  await expect(page.getByText('Paid through an Orbital swap', {exact: true})).toBeVisible();
  await expect(page.getByText('70000000.000000001 oUSD18', {exact: true})).toBeVisible();
  await page.getByText('Receipt details', {exact: true}).click();
  await expect(page.getByRole('link', {name: 'Payment receipt'})).toHaveAttribute('href', `https://testnet.arcscan.app/tx/${hash(214)}`);
  await page.screenshot({path: '../../.cache/frontend-v2/screenshots/invoice-paid-desktop.png', fullPage: true});
  available = false; await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Invoice unavailable', exact: true})).toBeVisible();
  await expect(page.getByText('Paid through an Orbital swap', {exact: true})).toHaveCount(0);
});
test('stale historical invoice labels its observation and keeps transaction actions unavailable', async ({page}) => {
  const value = {...invoiceObservation(), status: 'stale', code: 'INVOICES_STALE', historical: true,
    currentIndexedBlock: {height: '16', hash: hash(116)}, freshness: {indexedAt: '2026-09-08T06:00:00.000Z', ageMs: 11000, head: '18', stale: true}};
  await fixture(page, () => value); await page.goto(path);
  await page.getByText('Index observation', {exact: true}).click();
  await expect(page.getByText('Historical observation at block 15.', {exact: true})).toBeVisible();
  await expect(page.getByText('The index is behind or its latest check is old. Refresh to check for updates.', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Payment unavailable', exact: true})).toBeDisabled();
});
test('malformed or wrong-deployment invoice cannot render financial terms', async ({page}) => {
  let value: unknown = {...invoiceObservation(), deploymentId: hash(999)};
  await fixture(page, () => value); await page.goto(path);
  await expect(page.getByRole('heading', {name: 'Invoice unavailable', exact: true})).toBeVisible();
  const bad = invoiceObservation(); bad.data.invoice.recipients[0]!.amountRaw = '63000000000000001'; value = bad;
  await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Invoice unavailable', exact: true})).toBeVisible();
  await expect(page.getByText('70000000000.000001 USDC', {exact: true})).toHaveCount(0);
});
test('canonical absence is distinct from outage, and an invalid identifier sends no invoice read', async ({page}) => {
  const absent = {...invoiceObservation(), code: 'INVOICE_NOT_FOUND', data: {invoice: null}, message: 'Invoice not found in the canonical indexed history at the indicated block.', retryable: false, field: 'id', requestId: 'req-1'};
  await fixture(page, () => absent, () => 404); await page.goto(path);
  await expect(page.getByRole('heading', {name: 'Invoice not found', exact: true})).toBeVisible();
  await expect(page.getByText('No invoice with this identifier was found in the indexed history through block 15.', {exact: true})).toBeVisible();
  let requests = 0; await page.route('**/invoices/*', route => { requests++; return route.abort(); });
  await page.goto('/pay/not-an-invoice');
  await expect(page.getByRole('heading', {name: 'Invalid identifier', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Refresh invoice', exact: true})).toBeDisabled();
  expect(requests).toBe(0);
});
test('refresh follows deployment rotation and recovers from an unavailable observation', async ({page}) => {
  const deployment = structuredClone(invoiceManifest), value = invoiceObservation();
  let unavailable = false;
  await page.route('**/deployment', route => route.fulfill({json: deployment, headers}));
  await page.route(`**/invoices/${id}`, route => route.fulfill({json: unavailable ? {code: 'RPC_UNAVAILABLE'} : value, status: unavailable ? 503 : 200, headers}));
  await page.goto(path); await expect(page.getByText('Unpaid at indexed block', {exact: true})).toBeVisible();
  deployment.payments = address(99); value.data.invoice.adapter = address(99);
  value.deploymentId = keccak256(encodeAbiParameters([{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
    [5042002n, deployment.aqua as Address, deployment.router as Address, deployment.payments as Address]));
  value.data.invoice.status = 'cancelled'; value.data.invoice.version = '2';
  value.data.invoice.updated = {blockNumber: '14', blockHash: hash(114), txHash: hash(214), logIndex: 4, event: 'InvoiceCancelled'};
  await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByText('Cancelled at indexed block', {exact: true})).toBeVisible();
  unavailable = true; await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Invoice unavailable', exact: true})).toBeVisible();
  unavailable = false; await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByText('Cancelled at indexed block', {exact: true})).toBeVisible();
});
test('a stalled invoice request times out and permits a fresh retry', async ({page}) => {
  let stalled = false, release: (() => void) | undefined, started = 0;
  await page.route('**/deployment', route => route.fulfill({json: invoiceManifest, headers}));
  await page.route(`**/invoices/${id}`, async route => {
    started++; if (stalled) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({json: invoiceObservation(), headers}).catch(() => {});
  });
  await page.goto(path); await expect(page.getByText('Unpaid at indexed block', {exact: true})).toBeVisible();
  await page.clock.install(); stalled = true;
  await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect.poll(() => started).toBe(2);
  await page.clock.runFor(31000);
  await expect(page.getByRole('heading', {name: 'Invoice unavailable', exact: true})).toBeVisible({timeout: 5000});
  await expect(page.getByRole('button', {name: 'Refresh invoice', exact: true})).toBeEnabled();
  stalled = false; release?.();
  await page.getByRole('button', {name: 'Refresh invoice', exact: true}).click();
  await expect(page.getByText('Unpaid at indexed block', {exact: true})).toBeVisible();
});
