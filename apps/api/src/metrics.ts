import {manifestSchema, type DeploymentManifest} from '@orbital/shared';
import type {MetricsBlock, ReceiptMetricsSnapshot, ReceiptPairTotals} from '@orbital/db';
import {readinessDeploymentScope} from './deployment-scope.js';

export type MetricsDependencies = {
  readDatabase(manifest: DeploymentManifest): Promise<ReceiptMetricsSnapshot>;
  readRpc(manifest: DeploymentManifest, blocks: readonly MetricsBlock[]): Promise<{
    chainId: number; head: bigint; blocks: {height: string; hash: string; timestamp: bigint}[];
  }>;
};
export type MetricsToken = {address: string; symbol: string; decimals: number; kind: 'demo-token' | 'settlement-usdc' | 'onchain-token'; nativeUsdc: boolean};
export type MetricsResult = {
  schemaVersion: 1; status: 'available' | 'stale' | 'unavailable'; code: string; financialExecutionEnabled: false;
  chainId?: number; deploymentId?: string;
  coverage?: ReceiptMetricsSnapshot['coverage'] & {complete: boolean};
  cursor?: MetricsBlock;
  freshness?: {indexedAt: string; ageMs: number; head: string; stale: boolean};
  totals: null | {
    basis: 'canonical-OrbitalSwapExecuted'; swapCount: string; activeStrategyCount: string;
    activeStrategyCountBasis: 'lifecycle-active'; fundabilityVerified: false;
    inputTokens: {token: MetricsToken; grossInputRaw: string; netInputRaw: string; feeRaw: string}[];
    pairs: (ReceiptPairTotals & {inputToken: MetricsToken; outputToken: MetricsToken})[];
    observedDates: null | {first: MetricsBlock & {timestampSeconds: string; iso: string}; last: MetricsBlock & {timestampSeconds: string; iso: string}};
  };
};

const unsigned = /^(0|[1-9][0-9]{0,96})$/;
// PostgreSQL COUNT is int64; each receipt amount is uint256. Thus a sum is
// strictly below 2^319 (at most 97 decimal digits), not bounded by uint256.
const exact = (value: string) => { if (!unsigned.test(value)) throw Error('INVALID_METRICS_AMOUNT'); return BigInt(value); };
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
async function bounded<T>(value: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([value, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('READ_TIMEOUT')), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function getMetrics(input: DeploymentManifest | null, dependencies?: MetricsDependencies, now = Date.now(), timeoutMs = 8000): Promise<MetricsResult> {
  const started = performance.now();
  const unavailable = (code: string, snapshot?: ReceiptMetricsSnapshot): MetricsResult => ({schemaVersion: 1, status: 'unavailable', code,
    financialExecutionEnabled: false, totals: null, ...(snapshot ? {chainId: snapshot.chainId, deploymentId: snapshot.deploymentId,
      coverage: {...snapshot.coverage, complete: snapshot.code === 'METRICS_COMPLETE'}, ...(snapshot.cursor ? {cursor: snapshot.cursor} : {})} : {})});
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success || !parsed.data.verified) return unavailable('DEPLOYMENT_UNAVAILABLE');
  const manifest = parsed.data, scope = readinessDeploymentScope(manifest);
  if (!dependencies) return unavailable('DATABASE_UNAVAILABLE');
  let snapshot: ReceiptMetricsSnapshot;
  try { snapshot = await bounded(dependencies.readDatabase(manifest), timeoutMs); }
  catch { return unavailable('DATABASE_UNAVAILABLE'); }
  if (snapshot.chainId !== scope.chainId || snapshot.deploymentId !== scope.id) return unavailable('MATERIALIZATION_DEPLOYMENT_MISMATCH');
  if (snapshot.code !== 'METRICS_COMPLETE') return unavailable(snapshot.code, snapshot);
  if (!snapshot.cursor || !snapshot.indexedAt || !snapshot.totals) return unavailable('METRICS_INVALID', snapshot);
  const {cursor, totals} = snapshot;
  const indexedTime = Date.parse(snapshot.indexedAt);
  if (!Number.isFinite(indexedTime) || !Number.isFinite(now) || indexedTime > now + performance.now() - started + 1000) return unavailable('INDEXER_TIME_INVALID', snapshot);
  let pairs: NonNullable<MetricsResult['totals']>['pairs'], inputTokens: NonNullable<MetricsResult['totals']>['inputTokens'];
  const blocks = new Map<string, MetricsBlock>();
  try {
    if (snapshot.coverage.fromBlock !== scope.startBlock || snapshot.coverage.toBlock !== cursor.height
      || exact(snapshot.coverage.expectedBlocks) !== exact(cursor.height) - BigInt(scope.startBlock) + 1n
      || snapshot.coverage.expectedBlocks !== snapshot.coverage.canonicalBlocks || snapshot.coverage.expectedBlocks !== snapshot.coverage.coveredBlocks) throw Error('INVALID_COVERAGE');
    for (const block of [cursor, totals.firstSwap, totals.lastSwap]) if (block) {
      if (!hashPattern.test(block.hash) || exact(block.height) < BigInt(scope.startBlock) || exact(block.height) > exact(cursor.height)
        || (blocks.has(block.height) && blocks.get(block.height)!.hash !== block.hash)) throw Error('INVALID_BLOCK');
      blocks.set(block.height, block);
    }
    const swapCount = exact(totals.swapCount); exact(totals.activeStrategyCount);
    if (swapCount === 0n ? totals.firstSwap !== null || totals.lastSwap !== null || totals.pairs.length !== 0
      : !totals.firstSwap || !totals.lastSwap || exact(totals.firstSwap.height) > exact(totals.lastSwap.height)) throw Error('INVALID_DATES');
    const token = (address: string, decimals: number): MetricsToken => {
      const info = manifest.tokens.find(item => item.address.toLowerCase() === address.toLowerCase());
      if (!info || info.decimals !== decimals) throw Error('INVALID_TOKEN');
      const settlement = info.address.toLowerCase() === manifest.usdc.toLowerCase();
      return {address: info.address, symbol: info.symbol, decimals: info.decimals,
        kind: info.mock ? 'demo-token' : settlement ? 'settlement-usdc' : 'onchain-token',
        nativeUsdc: !info.mock && settlement && manifest.chainId === 5042002};
    };
    const aggregate = new Map<string, NonNullable<MetricsResult['totals']>['inputTokens'][number]>();
    let pairCount = 0n;
    pairs = totals.pairs.map(pair => {
      const inputToken = token(pair.tokenIn, pair.inputDecimals), outputToken = token(pair.tokenOut, pair.outputDecimals);
      const gross = exact(pair.grossInputRaw), net = exact(pair.netInputRaw), fee = exact(pair.feeRaw); exact(pair.amountOutRaw);
      if (gross !== net + fee || pair.tokenIn === pair.tokenOut) throw Error('INVALID_TOTALS');
      pairCount += exact(pair.swapCount);
      const key = inputToken.address.toLowerCase(), prior = aggregate.get(key);
      aggregate.set(key, {token: inputToken, grossInputRaw: (gross + BigInt(prior?.grossInputRaw ?? '0')).toString(),
        netInputRaw: (net + BigInt(prior?.netInputRaw ?? '0')).toString(), feeRaw: (fee + BigInt(prior?.feeRaw ?? '0')).toString()});
      return {...pair, inputToken, outputToken};
    });
    if (pairCount !== swapCount) throw Error('INVALID_COUNT');
    inputTokens = [...aggregate.values()];
  } catch { return unavailable('METRICS_INVALID', snapshot); }
  let rpc: Awaited<ReturnType<MetricsDependencies['readRpc']>>;
  try { rpc = await bounded(dependencies.readRpc(manifest, [...blocks.values()]), timeoutMs); }
  catch { return unavailable('RPC_UNAVAILABLE', snapshot); }
  if (rpc.chainId !== manifest.chainId) return unavailable('RPC_CHAIN_MISMATCH', snapshot);
  if (rpc.head < BigInt(cursor.height) + 2n) return unavailable('INDEXER_UNCONFIRMED', snapshot);
  if (rpc.blocks.length !== blocks.size || new Set(rpc.blocks.map(block => block.height)).size !== blocks.size
    || rpc.blocks.some(block => blocks.get(block.height)?.hash.toLowerCase() !== block.hash.toLowerCase())) return unavailable('RPC_BLOCK_MISMATCH', snapshot);
  let observedDates: NonNullable<MetricsResult['totals']>['observedDates'] = null;
  try {
    const date = (block: MetricsBlock) => {
      const timestamp = rpc.blocks.find(item => item.height === block.height)!.timestamp;
      if (timestamp < 0n || timestamp > 8640000000000n) throw Error('INVALID_CHAIN_DATE');
      return {...block, timestampSeconds: timestamp.toString(), iso: new Date(Number(timestamp * 1000n)).toISOString()};
    };
    if (totals.firstSwap && totals.lastSwap) {
      observedDates = {first: date(totals.firstSwap), last: date(totals.lastSwap)};
      if (BigInt(observedDates.first.timestampSeconds) > BigInt(observedDates.last.timestampSeconds)) throw Error('INVALID_CHAIN_DATES');
    }
  } catch { return unavailable('RPC_DATE_INVALID', snapshot); }
  // A canonical rewind, new block, changed coverage or changed totals during
  // RPC invalidates the response. No reads from two database snapshots are mixed.
  try {
    const after = await bounded(dependencies.readDatabase(manifest), timeoutMs);
    if (JSON.stringify(after) !== JSON.stringify(snapshot)) return unavailable('METRICS_SNAPSHOT_CHANGED', snapshot);
  } catch { return unavailable('DATABASE_UNAVAILABLE', snapshot); }
  const ageMs = Math.max(0, Math.ceil(now + performance.now() - started - indexedTime));
  const stale = ageMs > 10000 || rpc.head > BigInt(cursor.height) + 2n;
  return {schemaVersion: 1, status: stale ? 'stale' : 'available', code: stale ? (ageMs > 10000 ? 'INDEXER_STALE' : 'INDEXER_CATCHING_UP') : 'METRICS_AVAILABLE',
    financialExecutionEnabled: false, chainId: manifest.chainId, deploymentId: scope.id, cursor,
    coverage: {...snapshot.coverage, complete: true}, freshness: {indexedAt: snapshot.indexedAt, ageMs, head: rpc.head.toString(), stale},
    totals: {basis: 'canonical-OrbitalSwapExecuted', swapCount: totals.swapCount, activeStrategyCount: totals.activeStrategyCount,
      activeStrategyCountBasis: 'lifecycle-active', fundabilityVerified: false, inputTokens, pairs, observedDates}};
}
