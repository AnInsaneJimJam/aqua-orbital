import {hashSchema, type DeploymentManifest} from '@orbital/shared';

export type MaterializationState = {
  deploymentId: string; identityMatches: boolean;
  cursor: {height: bigint; hash: string; updatedAt: Date; canonical: boolean; projectionVersion: number | null} | null;
};
export type IndexedState = {
  height: bigint; hash: string; status: 'indexing' | 'resync_required'; updatedAt: Date;
  canonical: boolean; materialization: MaterializationState | null;
};
export type ReadinessDependencies = {
  readDatabase(manifest: DeploymentManifest): Promise<IndexedState | null>;
  readRpc(manifest: DeploymentManifest, cursor: IndexedState): Promise<{chainId: number; head: bigint; indexedBlockHash: string}>;
};
export type ReadinessResult = {
  status: 'ready' | 'unavailable'; code: string; financialExecutionEnabled: false;
  chainId?: number; block?: string; hash?: string; indexedAt?: string; ageMs?: number;
};
export async function checkReadiness(
  manifest: DeploymentManifest | null, dependencies: ReadinessDependencies | undefined,
  now = Date.now(), timeoutMs = 8000,
): Promise<ReadinessResult> {
  const failed = (code: string): ReadinessResult => ({status: 'unavailable', code, financialExecutionEnabled: false});
  if (!manifest?.verified) return failed('DEPLOYMENT_UNAVAILABLE');
  if (!dependencies) return failed('DATABASE_UNCONFIGURED');
  const started = Date.now();
  let cursor: IndexedState | null;
  try { cursor = await bounded(dependencies.readDatabase(manifest), timeoutMs); }
  catch { return failed('DATABASE_UNAVAILABLE'); }
  if (!cursor) return failed('INDEXER_NOT_STARTED');
  if (cursor.status === 'resync_required') return failed('INDEXER_RESYNC_REQUIRED');
  const age = now - cursor.updatedAt.getTime();
  if (!freshAge(age) || !hashSchema.safeParse(cursor.hash).success) return failed('INDEXER_STALE');
  if (!cursor.canonical) return failed('INDEXER_ORPHANED');
  const projectionFailure = materializationFailure(cursor, now);
  if (projectionFailure) return failed(projectionFailure);
  let rpc: Awaited<ReturnType<ReadinessDependencies['readRpc']>>;
  try { rpc = await bounded(dependencies.readRpc(manifest, cursor), timeoutMs); }
  catch { return failed('RPC_UNAVAILABLE'); }
  if (rpc.chainId !== manifest.chainId) return failed('RPC_CHAIN_MISMATCH');
  if (rpc.indexedBlockHash.toLowerCase() !== cursor.hash.toLowerCase()) return failed('INDEXER_ORPHANED');
  if (rpc.head < cursor.height + 2n) return failed('INDEXER_UNCONFIRMED');
  if (rpc.head > cursor.height + 2n) return failed('INDEXER_CATCHING_UP');
  // Recheck after RPC so a concurrent rewind/resync cannot become a fresh badge.
  let latest: IndexedState | null;
  try { latest = await bounded(dependencies.readDatabase(manifest), timeoutMs); }
  catch { return failed('DATABASE_UNAVAILABLE'); }
  if (latest?.status === 'resync_required') return failed('INDEXER_RESYNC_REQUIRED');
  if (!latest || latest.height !== cursor.height || latest.hash !== cursor.hash) return failed('INDEXER_CHANGED');
  if (!latest.canonical) return failed('INDEXER_ORPHANED');
  const checkedAt = now + Date.now() - started;
  if (!freshAge(checkedAt - latest.updatedAt.getTime()) || !freshAge(checkedAt - cursor.updatedAt.getTime())) return failed('INDEXER_STALE');
  const latestFailure = materializationFailure(latest, checkedAt);
  if (latestFailure) return failed(latestFailure);
  if (latest.materialization!.deploymentId !== cursor.materialization!.deploymentId) return failed('MATERIALIZATION_CHANGED');
  // Keep the public response shape. Freshness is the older observation among
  // raw and deployment cursors in both reads, never another deployment's pulse.
  const indexedAt = new Date(Math.min(cursor.updatedAt.getTime(), latest.updatedAt.getTime(),
    cursor.materialization!.cursor!.updatedAt.getTime(), latest.materialization!.cursor!.updatedAt.getTime()));
  const ageMs = Math.max(0, checkedAt - indexedAt.getTime());
  if (ageMs > 10_000) return failed('MATERIALIZATION_STALE');
  return {
    status: 'ready', code: 'READ_DEPENDENCIES_READY', financialExecutionEnabled: false,
    chainId: manifest.chainId, block: cursor.height.toString(), hash: cursor.hash,
    indexedAt: indexedAt.toISOString(), ageMs,
  };
}

const freshAge = (age: number) => Number.isFinite(age) && age >= -1000 && age <= 10_000;
function materializationFailure(state: IndexedState, now: number): string | null {
  const projection = state.materialization;
  if (!projection) return 'MATERIALIZATION_NOT_STARTED';
  if (!projection.identityMatches) return 'MATERIALIZATION_DEPLOYMENT_MISMATCH';
  const cursor = projection.cursor;
  if (!cursor) return 'MATERIALIZATION_NOT_STARTED';
  if (!cursor.canonical || !hashSchema.safeParse(cursor.hash).success) return 'MATERIALIZATION_ORPHANED';
  if (cursor.projectionVersion !== 1) return 'MATERIALIZATION_VERSION_UNSUPPORTED';
  if (cursor.height < state.height) return 'MATERIALIZATION_BEHIND';
  if (cursor.height > state.height) return 'MATERIALIZATION_AHEAD';
  if (cursor.hash.toLowerCase() !== state.hash.toLowerCase()) return 'MATERIALIZATION_ORPHANED';
  if (!freshAge(now - cursor.updatedAt.getTime())) return 'MATERIALIZATION_STALE';
  return null;
}

async function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('READ_TIMEOUT')), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}
