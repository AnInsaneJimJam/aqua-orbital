import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInvoices, reconcileCanonicalChain} from '@orbital/db';
import type pg from 'pg';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {invoiceReadSchema} from '@orbital/shared';
import {createServer} from '../src/server.js';
import {createReadDependencies} from '../src/runtime.js';
import {deploymentScope} from '../../indexer/src/materializer.js';
import {getInvoices} from '../src/invoices.js';
import {invoiceFixture, manifest, merchant, otherMerchant, due, hash, header, address, topics} from './invoices-fixture.js';

test('invoice detail distinguishes absent canonical history from unavailable configuration and coverage', async () => {
  assert.equal((await getInvoices(null, {id: hash(9)})).httpStatus, 503);
  assert.equal((await getInvoices(manifest, {id: hash(9)})).code, 'DATABASE_UNAVAILABLE');
  const env = await invoiceFixture(); try {
    let result = await getInvoices(manifest, {id: hash(999)}, env.dependencies);
    assert.equal(result.httpStatus, 404); assert.equal(result.code, 'INVOICE_NOT_FOUND'); assert.equal(result.data?.invoice, null);
    await env.db.pool.query('DELETE FROM deployment_blocks WHERE height=1');
    result = await getInvoices(manifest, {id: hash(999)}, env.dependencies);
    assert.equal(result.httpStatus, 503); assert.equal(result.data, null);
  } finally { await env.close(); }
});

test('direct and swap payment details preserve exact splits and custom-event provenance', async () => {
  const env = await invoiceFixture(); try {
    const direct = await getInvoices(manifest, {id: env.ids[0]!}, env.dependencies), inv = direct.data!.invoice!;
    assert.equal(direct.status, 'available'); assert.equal(direct.financialExecutionEnabled, false);
    assert.equal(inv.amountDueRaw, due.toString()); assert.deepEqual(inv.recipients.map(r => r.amountRaw), ['63000000000000000', '7000000000000001']);
    assert.equal(inv.status, 'paid'); assert.equal(inv.created.event, 'InvoiceCreated'); assert.equal(inv.updated.event, 'InvoicePaid');
    assert.equal(inv.created.blockNumber, inv.updated.blockNumber); assert.ok(inv.created.logIndex < inv.updated.logIndex);
    assert.equal(inv.payment?.inputRaw, due.toString()); assert.equal(inv.payment?.routeHash, hash(0)); assert.equal(inv.paymentEligibilityVerified, false);
    const swapped = (await getInvoices(manifest, {id: env.ids[2]!}, env.dependencies)).data!.invoice!;
    assert.equal(swapped.payment?.inputRaw, '9007199254740993'); assert.equal(swapped.payment?.receivedRaw, (due + 7n).toString());
    assert.equal(swapped.payment?.refundRaw, '7'); assert.equal(swapped.payment?.routeHash, hash(88));
    assert.doesNotMatch(JSON.stringify(direct), /rpcUrl|calldata|email|customer|memoText/);
    const cancelled = (await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies)).data!.invoice!;
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.updated.event, 'InvoiceCancelled'); assert.equal(cancelled.payment, null);
  } finally { await env.close(); }
});

test('merchant keyset pages default20 cap50 and preserve exact creation order without other merchants', async () => {
  const env = await invoiceFixture(55); try {
    const first = await getInvoices(manifest, {merchant}, env.dependencies);
    assert.equal(first.data?.items?.length, 20); assert.equal(first.data?.limit, 20); assert.ok(first.data?.nextCursor);
    assert.deepEqual(first.data!.items!.map(row => row.invoiceId), env.ids.slice(34, 54).reverse());
    const second = await getInvoices(manifest, {merchant, query: {cursor: first.data!.nextCursor}}, env.dependencies);
    assert.deepEqual(second.data!.items!.map(row => row.invoiceId), env.ids.slice(14, 34).reverse());
    const final = await getInvoices(manifest, {merchant, query: {cursor: second.data!.nextCursor}}, env.dependencies);
    assert.equal(final.data!.items!.length, 14); assert.equal(final.data!.nextCursor, null);
    assert.equal((await getInvoices(manifest, {merchant, query: {limit: '50'}}, env.dependencies)).data?.items?.length, 50);
    assert.equal((await getInvoices(manifest, {merchant: otherMerchant}, env.dependencies)).data?.items?.length, 1);
    for (const query of [{limit: '51'}, {limit: '0'}, {limit: '1e1'}, {limit: '01'}, {limit: 20}, {offset: '1'}, {cursor: 'a'.repeat(1025)}, {cursor: 'invalid!'}, {rpcUrl: 'https://untrusted.invalid'}])
      assert.equal((await getInvoices(manifest, {merchant, query}, env.dependencies)).httpStatus, 400);
    assert.equal((await getInvoices(manifest, {merchant: address(0)}, env.dependencies)).httpStatus, 400);
  } finally { await env.close(); }
});

test('page pins survive normal tip advancement and retain invoice status as of the original block', async () => {
  const env = await invoiceFixture(6, 1); try {
    const first = await getInvoices(manifest, {merchant, query: {limit: '2'}}, env.dependencies);
    assert.equal(first.asOf?.height, '1'); assert.equal(first.historical, false);
    await env.advance(3);
    const next = await getInvoices(manifest, {merchant, query: {limit: '2', cursor: first.data!.nextCursor}}, env.dependencies);
    assert.equal(next.httpStatus, 200); assert.equal(next.asOf?.height, '1'); assert.equal(next.currentIndexedBlock?.height, '3'); assert.equal(next.historical, true);
    assert.deepEqual(next.data!.items!.map(row => [row.invoiceId, row.status]), [[env.ids[2], 'unpaid'], [env.ids[1], 'unpaid']]);
    assert.equal((await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies)).data?.invoice?.status, 'cancelled');
  } finally { await env.close(); }
});

test('cursor pins are deployment and merchant bound and orphaned pins are rejected', async () => {
  const env = await invoiceFixture(6); try {
    const first = await getInvoices(manifest, {merchant, query: {limit: '2'}}, env.dependencies), cursor = first.data!.nextCursor!;
    assert.equal((await getInvoices(manifest, {merchant: otherMerchant, query: {cursor}}, env.dependencies)).httpStatus, 400);
    assert.equal((await getInvoices({...manifest, router: address(77)}, {merchant, query: {cursor}}, env.dependencies)).httpStatus, 400);
    await reconcileCanonicalChain(env.db.pool, 31337, {height: 3n, hash: hash(3)}, [{number: 3n, hash: hash(53), parentHash: hash(2)}, header(2)]);
    const result = await getInvoices(manifest, {merchant, query: {cursor}}, env.dependencies);
    assert.equal(result.httpStatus, 409); assert.equal(result.code, 'INVOICE_CURSOR_ORPHANED'); assert.equal(result.data, null);
  } finally { await env.close(); }
});

test('invoice reads need lifecycle coverage but not swap coverage and reject detached invoice projections', async () => {
  const env = await invoiceFixture(); try {
    await env.db.pool.query('UPDATE deployment_blocks SET swap_projection_version=0');
    assert.equal((await getInvoices(manifest, {id: env.ids[0]!}, env.dependencies)).httpStatus, 200);
    await env.db.pool.query("DELETE FROM invoice_snapshots WHERE status='cancelled'");
    const result = await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies);
    assert.equal(result.code, 'INVOICE_SOURCE_COVERAGE_MISMATCH'); assert.equal(result.data, null);
  } finally { await env.close(); }
});

test('stale indexed terms remain labeled stale without inventing expiry or current payability', async () => {
  const env = await invoiceFixture(4, 1); try {
    await env.db.pool.query("UPDATE indexer_state SET updated_at=now()-interval '15 seconds'");
    const result = await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies);
    assert.equal(result.status, 'stale'); assert.equal(result.data?.invoice?.status, 'unpaid'); assert.equal(result.data?.invoice?.paymentEligibilityVerified, false);
    const rpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (...args) => ({...await rpc(...args), chainId: 1});
    assert.equal((await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies)).code, 'RPC_CHAIN_MISMATCH');
    env.dependencies.readRpc = async () => { throw Error('private RPC credentials'); };
    assert.doesNotMatch(JSON.stringify(await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies)), /credentials/);
    await env.db.pool.query("UPDATE indexer_state SET status='resync_required'");
    assert.equal((await getInvoices(manifest, {id: env.ids[1]!}, env.dependencies)).code, 'RESYNC_REQUIRED');
  } finally { await env.close(); }
});

test('a reorg during RPC invalidates the observed invoice without leaking the removed payment', async () => {
  const env = await invoiceFixture(); try {
    const rpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (...args) => {
      await reconcileCanonicalChain(env.db.pool, 31337, {height: 3n, hash: hash(3)}, [{number: 3n, hash: hash(53), parentHash: hash(2)}, header(2)]);
      return rpc(...args);
    };
    const result = await getInvoices(manifest, {id: env.ids[2]!}, env.dependencies);
    assert.equal(result.httpStatus, 503); assert.equal(result.code, 'INVOICE_SNAPSHOT_CHANGED'); assert.equal(result.data, null);
  } finally { await env.close(); }
});

test('shared invoice DTO rejects altered split atoms, receipt status, direct-route money and added identity fields', async () => {
  const env = await invoiceFixture(); try {
    const inv = (await getInvoices(manifest, {id: env.ids[0]!}, env.dependencies)).data!.invoice!;
    assert.equal(invoiceReadSchema.safeParse(inv).success, true);
    for (const changed of [
      {...inv, recipients: inv.recipients.map((r, n) => ({...r, amountRaw: (BigInt(r.amountRaw) + (n ? -1n : 1n)).toString()}))},
      {...inv, status: 'unpaid'}, {...inv, updated: {...inv.updated, event: 'InvoiceCancelled'}},
      {...inv, payment: {...inv.payment, refundRaw: '1'}}, {...inv, payment: {...inv.payment, inputRaw: (due + 1n).toString()}},
      {...inv, customerEmail: 'private@example.invalid'}, {...inv, amountDueRaw: Number(due)}, {...inv, expiresAt: (1n << 40n).toString()},
      {...inv, amountDueRaw: '1e18'}, {...inv, created: {...inv.created, blockNumber: 'unknown'}},
      {...inv, recipients: inv.recipients.map(r => ({...r, amountRaw: '1e6'}))},
    ]) assert.equal(invoiceReadSchema.safeParse(changed).success, false);
  } finally { await env.close(); }
});

test('invoice and merchant HTTP paths return typed reads, canonical404 and bounded errors with no quote enablement', async () => {
  const env = await invoiceFixture(), directory = await mkdtemp(join(tmpdir(), 'orbital-invoices-'));
  const manifestPath = join(directory, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  const app = await createServer({manifestPath, invoiceDependencies: env.dependencies, logger: false});
  try {
    for (const prefix of ['', '/api/v1']) {
      const detail = await app.inject(`${prefix}/invoices/${env.ids[0]}`); assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().data.invoice.status, 'paid'); assert.equal(detail.headers['cache-control'], 'no-store');
      const list = await app.inject(`${prefix}/makers/${merchant}/invoices?limit=2`); assert.equal(list.statusCode, 200); assert.equal(list.json().data.items.length, 2);
      const missing = await app.inject(`${prefix}/invoices/${hash(999)}`); assert.equal(missing.statusCode, 404); assert.equal(missing.json().code, 'INVOICE_NOT_FOUND');
      assert.ok(missing.json().requestId); assert.equal(missing.json().retryable, false);
      for (const path of [`${prefix}/invoices/bad`, `${prefix}/invoices/${hash(999)}?rpcUrl=untrusted`, `${prefix}/makers/${merchant}/invoices?limit=51`]) {
        const invalid = await app.inject(path); assert.equal(invalid.statusCode, 400); assert.ok(invalid.json().requestId); assert.ok(invalid.json().message);
      }
    }
    assert.equal((await app.inject('/ready')).statusCode, 503);
    assert.equal((await app.inject({method: 'POST', url: '/quotes/payment', payload: {}})).statusCode, 400);
  } finally { await app.close(); await env.close(); await rm(directory, {recursive: true, force: true}); }
});

test('normal advancement during RPC preserves pinned data and marks observed head disagreement stale', async () => {
  const env = await invoiceFixture(6, 1); try {
    const rpc = env.dependencies.readRpc;
    env.dependencies.readRpc = async (...args) => { const before = await rpc(...args); await env.advance(3); return before; };
    const result = await getInvoices(manifest, {merchant, query: {limit: '2'}}, env.dependencies);
    assert.equal(result.httpStatus, 200); assert.equal(result.status, 'stale'); assert.equal(result.historical, true);
    assert.equal(result.asOf?.height, '1'); assert.equal(result.currentIndexedBlock?.height, '3');
  } finally { await env.close(); }
});

test('historical pins still require a valid current deployment marker', async () => {
  const env = await invoiceFixture(6, 1); try {
    const first = await getInvoices(manifest, {merchant, query: {limit: '2'}}, env.dependencies);
    await env.advance(3); await env.db.pool.query('DELETE FROM deployment_blocks WHERE height=3');
    const result = await getInvoices(manifest, {merchant, query: {cursor: first.data!.nextCursor}}, env.dependencies);
    assert.equal(result.httpStatus, 503); assert.equal(result.code, 'MATERIALIZATION_ORPHANED'); assert.equal(result.data, null);
  } finally { await env.close(); }
});

test('invoice coverage, status and source reads share one MVCC snapshot', async () => {
  const env = await invoiceFixture(); try {
    let changed = false;
    const reader = {async connect() {
      const client = await env.db.pool.connect(), query = client.query.bind(client), wrapped = Object.create(client) as pg.PoolClient;
      wrapped.release = () => client.release();
      wrapped.query = (async (sql: string, values?: unknown[]) => {
        const result = await query(sql, values);
        if (!changed && sql.includes('AS covered_blocks')) {
          changed = true;
          await env.db.pool.query("BEGIN; DELETE FROM invoice_snapshots WHERE status='cancelled'; UPDATE deployment_blocks SET projection_version=1; DELETE FROM deployment_blocks WHERE height=2; COMMIT");
        }
        return result;
      }) as typeof client.query;
      return wrapped;
    }} as pg.Pool;
    const before = await readInvoices(reader, deploymentScope(manifest), topics, {kind: 'detail', id: env.ids[1]!});
    assert.equal(before.code, 'INVOICES_COMPLETE'); assert.equal(before.items?.[0]?.status, 'cancelled');
    assert.equal((await env.dependencies.readDatabase(manifest, {kind: 'detail', id: env.ids[1]!})).code, 'INVOICE_COVERAGE_INCOMPLETE');
  } finally { await env.close(); }
});

test('production invoice database dependencies and unconfigured HTTP routes remain truthful', async () => {
  const env = await invoiceFixture(), runtime = createReadDependencies(env.db.pool.options.connectionString!), app = await createServer({logger: false});
  try {
    const actual = await getInvoices(manifest, {id: env.ids[0]!}, {...runtime.invoiceDependencies, readRpc: env.dependencies.readRpc});
    assert.equal(actual.data?.invoice?.status, 'paid');
    for (const prefix of ['', '/api/v1']) for (const path of [`${prefix}/invoices/${hash(999)}`, `${prefix}/makers/${merchant}/invoices`])
      assert.equal((await app.inject(path)).statusCode, 503);
  } finally { await app.close(); await runtime.close(); await env.close(); }
});
