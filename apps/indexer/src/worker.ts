import type pg from 'pg';
import {atomicBlock, indexerSnapshot, reconcileCanonicalChain, type BlockHeader} from '@orbital/db';

export type RawLog = {
  blockNumber: bigint; blockHash: string; transactionHash: string; logIndex: number;
  address: string; topics: readonly string[]; data: string; removed?: boolean;
  transactionIndex?:number;
};
export type ReadRpc = {
  getBlockNumber(): Promise<bigint>;
  getBlock(number: bigint): Promise<BlockHeader>;
  getLogs(number: bigint, emitters: readonly string[]): Promise<readonly RawLog[]>;
};
export type IndexerConfig = {chainId: number; startBlock: bigint; emitters: readonly string[]};
export type SyncResult = {
  status: 'idle' | 'indexed' | 'backfilled' | 'rolled_back' | 'resync_required' | 'retry';
  block?: bigint; hash?: string; logs?: number; removedBlocks?: number;
};
export async function syncOnce(pool: pg.Pool, config: IndexerConfig, rpc: ReadRpc): Promise<SyncResult> {
  const snapshot = await indexerSnapshot(pool, config.chainId);
  if (snapshot.status === 'resync_required') return {status: 'resync_required'};
  const head = await rpc.getBlockNumber();
  if (snapshot.cursor) {
    // A lagging provider does not prove that the stored suffix is orphaned.
    if (head < snapshot.cursor.height) return {status: 'retry'};
    const canonical: BlockHeader[] = [];
    for (const stored of snapshot.blocks) {
      const observed = await checkedBlock(rpc, stored.number);
      canonical.push(observed);
      if (observed.hash === stored.hash) break;
    }
    if (!canonical.length) throw Error('INDEXER_CURSOR_WITHOUT_BLOCKS');
    // Do not combine ancestors fetched from different RPC branches. Recheck the
    // top after the scan; the DB also validates every parent link before writes.
    const top = canonical[0]!;
    if ((await checkedBlock(rpc, top.number)).hash !== top.hash) return {status: 'retry'};
    const result = await reconcileCanonicalChain(pool, config.chainId, snapshot.cursor, canonical);
    if (result.status === 'cursor_changed') return {status: 'retry'};
    if (result.status === 'resync_required') return {status: 'resync_required'};
    if (result.status === 'rolled_back') return {
      status: 'rolled_back', block: result.cursor!.height, hash: result.cursor!.hash, removedBlocks: result.removedBlocks,
    };
  }
  const next = snapshot.cursor ? snapshot.cursor.height + 1n : config.startBlock;
  // Two confirmations are a display delay, not cryptographic finality.
  if (head < next + 2n) return {status: 'idle'};
  const block = await checkedBlock(rpc, next);
  if (snapshot.cursor && block.parentHash !== snapshot.cursor.hash) return {status: 'retry'};
  const logs = await rpc.getLogs(next, config.emitters);
  const emitters = new Set(config.emitters.map(address => address.toLowerCase()));
  if (logs.some(log => log.blockNumber !== next || log.blockHash !== block.hash || log.removed ||
    !emitters.has(log.address.toLowerCase()) || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 || !log.transactionHash)) {
    throw Error('RPC_INVALID_BLOCK_LOG');
  }
  if ((await checkedBlock(rpc, next)).hash !== block.hash) return {status: 'retry'};
  try {
    await atomicBlock(pool, config.chainId, block, logs.map(log => ({
      txHash: log.transactionHash, logIndex: log.logIndex, emitter: log.address,
      topic: log.topics[0] ?? '0x', payload: {version: 1, topics: log.topics, data: log.data},
    })));
  } catch (error) {
    if (error instanceof Error && error.message === 'REORG_REQUIRES_REPLAY') return {status: 'retry'};
    throw error;
  }
  return {status: 'indexed', block: next, hash: block.hash, logs: logs.length};
}

async function checkedBlock(rpc: ReadRpc, number: bigint): Promise<BlockHeader> {
  const block = await rpc.getBlock(number);
  if (block.number !== number || !block.hash || !block.parentHash) throw Error('RPC_INVALID_BLOCK_HEADER');
  return block;
}
