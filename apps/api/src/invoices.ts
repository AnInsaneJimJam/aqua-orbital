import {manifestSchema, hashSchema, nonzeroAddressSchema, invoiceListQuerySchema, invoiceCursorSchema,
  type DeploymentManifest, type InvoiceReadDTO} from '@orbital/shared';
import type {InvoiceReadQuery, InvoiceReadSnapshot} from '@orbital/db';
import type {MetricsDependencies} from './metrics.js';
import {readinessDeploymentScope} from './deployment-scope.js';
import {invoiceView} from './invoice-view.js';
import {isFreshIndexedHead} from './index-freshness.js';
export type InvoiceReadDependencies = {
  readDatabase(manifest: DeploymentManifest, query: InvoiceReadQuery): Promise<InvoiceReadSnapshot>;
  readRpc: MetricsDependencies['readRpc'];
};
export type InvoiceView = InvoiceReadDTO;
export type InvoiceResponse = {
  schemaVersion: 1; status: 'available' | 'stale' | 'unavailable'; code: string; financialExecutionEnabled: false;
  httpStatus: number; chainId?: number; deploymentId?: string; asOf?: {height: string; hash: string}; currentIndexedBlock?: {height: string; hash: string};
  historical?: boolean; freshness?: {indexedAt: string; ageMs: number; head: string; stale: boolean};
  coverage?: InvoiceReadSnapshot['coverage'] & {complete: boolean};
  message?: string; retryable?: boolean; field?: string | null;
  data: null | {invoice?: InvoiceView | null; items?: InvoiceView[]; nextCursor?: string | null; limit?: number};
};
async function bounded<T>(value: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([value, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('READ_TIMEOUT')), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}
const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const pinnedIdentity = (s: InvoiceReadSnapshot) => JSON.stringify({chainId: s.chainId, deploymentId: s.deploymentId, asOf: s.asOf, coverage: s.coverage, items: s.items, hasMore: s.hasMore});

export async function getInvoices(input: DeploymentManifest | null, request: {id: string} | {merchant: string; query?: unknown}, dependencies?: InvoiceReadDependencies, now = Date.now(), timeoutMs = 8000): Promise<InvoiceResponse> {
  const started = performance.now();
  const fail = (code: string, httpStatus = 503, field: string | null = null): InvoiceResponse => ({schemaVersion: 1, status: 'unavailable', code,
    financialExecutionEnabled: false, httpStatus, data: null, retryable: httpStatus === 503 || httpStatus === 409, field,
    message: httpStatus === 400 ? 'Check the invoice identifier or pagination parameters.' : httpStatus === 409 ? 'The indexed page is no longer canonical. Restart the listing.' : 'Canonical invoice history is unavailable for this observation.'});
  let query: InvoiceReadQuery, suppliedCursor: string | undefined;
  if ('id' in request) {
    if (!hashSchema.safeParse(request.id).success) return fail('INVALID_HASH', 400, 'id');
    query = {kind: 'detail', id: request.id.toLowerCase()};
  } else {
    if (!nonzeroAddressSchema.safeParse(request.merchant).success) return fail('INVALID_ADDRESS', 400, 'address');
    const args = invoiceListQuerySchema.safeParse(request.query ?? {});
    if (!args.success) return fail('INVALID_INVOICE_QUERY', 400, 'query');
    query = {kind: 'list', merchant: request.merchant.toLowerCase(), limit: args.data.limit}; suppliedCursor = args.data.cursor;
  }
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success || !parsed.data.verified) return fail('DEPLOYMENT_UNAVAILABLE');
  const manifest = parsed.data, scope = readinessDeploymentScope(manifest);
  if (suppliedCursor && query.kind === 'list') {
    try {
      const cursor = invoiceCursorSchema.parse(JSON.parse(Buffer.from(suppliedCursor, 'base64url').toString('utf8')));
      if (encodeCursor(cursor) !== suppliedCursor || cursor.chainId !== manifest.chainId || cursor.deploymentId !== scope.id || cursor.merchant !== query.merchant) throw Error('CURSOR_SCOPE');
      query = {...query, pin: cursor.pin, after: cursor.after};
    } catch { return fail('INVALID_INVOICE_CURSOR', 400, 'cursor'); }
  }
  if (!dependencies) return fail('DATABASE_UNAVAILABLE');
  let before: InvoiceReadSnapshot;
  try { before = await bounded(dependencies.readDatabase(manifest, query), timeoutMs); }
  catch { return fail('DATABASE_UNAVAILABLE'); }
  if (before.chainId !== scope.chainId || before.deploymentId !== scope.id) return fail('MATERIALIZATION_DEPLOYMENT_MISMATCH');
  if (before.code !== 'INVOICES_COMPLETE') return fail(before.code, before.code === 'INVOICE_CURSOR_ORPHANED' && suppliedCursor ? 409 : before.code === 'INVALID_INVOICE_CURSOR' ? 400 : 503);
  if (!before.asOf || !before.currentCursor || !before.indexedAt || !before.items) return fail('INVOICE_DATA_INVALID');
  let items: InvoiceView[];
  try {
    items = before.items.map(inv => invoiceView(manifest,inv));
  } catch { return fail('INVOICE_DATA_INVALID'); }
  const observed = before.asOf;
  let rpc: Awaited<ReturnType<InvoiceReadDependencies['readRpc']>>;
  try { rpc = await bounded(dependencies.readRpc(manifest, [observed]), timeoutMs); }
  catch { return fail('RPC_UNAVAILABLE'); }
  if (rpc.chainId !== manifest.chainId) return fail('RPC_CHAIN_MISMATCH');
  if (rpc.blocks.length !== 1 || rpc.blocks[0]!.height !== observed.height || rpc.blocks[0]!.hash.toLowerCase() !== observed.hash.toLowerCase()) return fail('RPC_BLOCK_MISMATCH');
  if (rpc.head < BigInt(observed.height) + 2n) return fail('INDEXER_UNCONFIRMED');
  let after: InvoiceReadSnapshot;
  try { after = await bounded(dependencies.readDatabase(manifest, {...query, pin: observed}), timeoutMs); }
  catch { return fail('DATABASE_UNAVAILABLE'); }
  if (after.code !== 'INVOICES_COMPLETE') return fail(after.code === 'INVOICE_CURSOR_ORPHANED' ? 'INVOICE_SNAPSHOT_CHANGED' : after.code);
  if (pinnedIdentity(before) !== pinnedIdentity(after) || !after.currentCursor || !after.indexedAt) return fail('INVOICE_SNAPSHOT_CHANGED');
  const indexedTime = Math.min(Date.parse(before.indexedAt), Date.parse(after.indexedAt));
  const currentTime = now + performance.now() - started;
  if (!Number.isFinite(indexedTime) || !Number.isFinite(currentTime) || indexedTime > currentTime + 1000) return fail('INDEXER_TIME_INVALID');
  const ageMs = Math.max(0, Math.ceil(currentTime - indexedTime)), stale = ageMs > 10000 || !isFreshIndexedHead(manifest.chainId,rpc.head,BigInt(after.currentCursor.height));
  let data: NonNullable<InvoiceResponse['data']>;
  if (query.kind === 'detail') data = {invoice: items[0] ?? null};
  else {
    const last = items.at(-1);
    const nextCursor = before.hasMore && last ? encodeCursor({version: 1, chainId: scope.chainId, deploymentId: scope.id, merchant: query.merchant,
      pin: observed, after: {createdBlock: last.created.blockNumber, createdLog: last.created.logIndex, invoiceId: last.invoiceId}}) : null;
    data = {items, limit: query.limit, nextCursor};
  }
  const absent = query.kind === 'detail' && items.length === 0;
  return {schemaVersion: 1, status: stale ? 'stale' : 'available', code: absent ? 'INVOICE_NOT_FOUND' : stale ? 'INVOICES_STALE' : 'INVOICES_AVAILABLE',
    financialExecutionEnabled: false, httpStatus: absent ? 404 : 200, chainId: scope.chainId, deploymentId: scope.id,
    asOf: observed, currentIndexedBlock: after.currentCursor, historical: BigInt(observed.height) < BigInt(after.currentCursor.height),
    coverage: {...before.coverage, complete: true}, freshness: {indexedAt: new Date(indexedTime).toISOString(), ageMs, head: rpc.head.toString(), stale}, data,
    ...(absent ? {message: 'Invoice not found in the canonical indexed history at the indicated block.', retryable: false, field: 'id'} : {})};
}
