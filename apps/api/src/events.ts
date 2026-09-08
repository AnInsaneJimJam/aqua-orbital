export type Invalidation = {
  type: 'block' | 'reorg' | 'resync_required' | 'entity'; chainId: number; block: string; hash: string;
  entityKind?: 'strategy' | 'invoice'; entityId?: string; version?: string;
};
export type NotificationSource = {
  subscribe(onEvent: (event: Invalidation) => void, onUnavailable: () => void): Promise<() => void>;
  close(): Promise<void>;
};
export function parseNotification(payload: string): Invalidation | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    const type = data.type ?? 'block';
    if (!['block', 'reorg', 'resync_required', 'entity'].includes(String(type)) ||
      typeof data.chainId !== 'number' || !Number.isSafeInteger(data.chainId) || data.chainId < 1 ||
      !uint(data.block) || !hash(data.hash)) return null;
    const result: Invalidation = {type: type as Invalidation['type'], chainId: data.chainId, block: data.block, hash: data.hash};
    if (type === 'entity') {
      if (!['strategy', 'invoice'].includes(String(data.entityKind)) || !hash(data.entityId) || !uint(data.version)) return null;
      result.entityKind = data.entityKind as 'strategy' | 'invoice'; result.entityId = data.entityId; result.version = data.version;
    }
    return result;
  } catch { return null; }
}
const uint = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n);
const hash = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
