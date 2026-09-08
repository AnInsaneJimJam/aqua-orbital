import {encodeAbiParameters, encodeEventTopics, encodeFunctionResult, getAddress, type AbiEvent, type Hex} from 'viem';
import {buildOrder, hashOrder, hashConfig, lifecycleAbi, lifecycleEventsAbi, swapEventsAbi, type Config} from '@orbital/sdk';
import type {DeploymentManifest} from '@orbital/shared';
import {isolatedDatabase} from '../../../packages/db/test/helpers.js';
import {deploymentScope, syncDeploymentOnce, type MaterializationRpc} from '../../indexer/src/materializer.js';
import {readReceiptMetrics} from '../../../packages/db/src/metrics.js';
import type {MetricsDependencies} from '../src/metrics.js';

const address = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
export const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
export const manifest: DeploymentManifest = {chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', explorerUrl: 'https://example.invalid', verified: true,
  aqua: address(10), router: address(11), payments: address(12), usdc: address(1), startBlock: '1',
  tokens: [{address: address(1), symbol: 'USDC', decimals: 6, mock: false}, {address: address(2), symbol: 'oUSD18', decimals: 18, mock: true}, {address: address(3), symbol: 'oUSD6', decimals: 6, mock: true}]};
const maker = address(20), taker = address(21), GRID = 1n << 32n;
const config: Config = {schemaVersion: 1, chainId: 31337n, router: getAddress(manifest.router), maker, makerNonce: 0n,
  tokens: manifest.tokens.map(t => getAddress(t.address)), decimals: [6, 18, 6], tickKeys: [3n * GRID / 2n, 7n * GRID / 4n, (1n << 64n) - 1n],
  radiiInternal: [100n, 200n, 400n].map(r => r * 10n ** 18n * (1n << 64n)), feePpm: 500, initialAmountsRaw: [100_000_000n, 100n * 10n ** 18n, 100_000_000n]};
const orderHash = hashOrder(buildOrder(config));
export const gross = (1n << 256n) - 1n, fee = (gross * 500n + 999999n) / 1000000n;
export const header = (n: number) => ({number: BigInt(n), hash: hash(n), parentHash: hash(n - 1), transactions: [hash(n + 100)]});
const swapEvent = swapEventsAbi[0];
export const swapTopic = encodeEventTopics({abi: swapEventsAbi, eventName: 'OrbitalSwapExecuted'})[0]!;
function event(n: number, logIndex: number, name: string, args: Record<string, unknown>) {
  const block = header(n), entry = ([...lifecycleEventsAbi, swapEvent] as readonly AbiEvent[]).find(item => item.name === name)!;
  return {blockNumber: block.number, blockHash: block.hash, transactionHash: block.transactions[0]!, transactionIndex: 0, logIndex, address: manifest.router,
    topics: encodeEventTopics({abi: [entry], eventName: name, args} as never) as Hex[],
    data: encodeAbiParameters(entry.inputs.filter(input => !input.indexed), entry.inputs.filter(input => !input.indexed).map(input => args[input.name!]))};
}
export async function metricsFixture({swaps = true, retired = false}: {swaps?: boolean; retired?: boolean} = {}) {
  const db = await isolatedDatabase();
  const logs = new Map<bigint, ReturnType<typeof event>[]>([[1n, [event(1, 0, 'StrategyActivated', {maker, orderHash, configHash: hashConfig(config)})]]]);
  if (swaps) for (const n of [2, 3]) logs.set(BigInt(n), [event(n, 0, 'OrbitalSwapExecuted', {maker, orderHash, taker, recipient: taker,
    tokenInIndex: 1, tokenOutIndex: 0, grossInputRaw: gross, netInputRaw: gross - fee, feeRaw: fee, amountOutRaw: 9007199254740993n,
    version: BigInt(n), crossedTickKeys: [], crossedInward: []})]);
  if (retired) logs.set(3n, [...(logs.get(3n) ?? []), event(3, 1, 'StrategyRetired', {maker, orderHash, version: swaps ? 4n : 2n})]);
  const rpc: MaterializationRpc = {async getChainId() { return 31337; }, async getBlockNumber() { return 5n; },
    async getBlock(number) { return header(Number(number)); }, async getLogs(number) { return logs.get(number) ?? []; },
    async call() { return encodeFunctionResult({abi: lifecycleAbi, functionName: 'getStrategyConfig', result: config}); }};
  for (let i = 0; i < 3; i++) await syncDeploymentOnce(db.pool, manifest, rpc);
  const dependencies: MetricsDependencies = {
    readDatabase: configured => readReceiptMetrics(db.pool, deploymentScope(configured), swapTopic),
    async readRpc(_manifest, blocks) { return {chainId: 31337, head: 5n, blocks: blocks.map(block => ({...block, timestamp: 1700000000n + BigInt(block.height)}))}; },
  };
  return {db, dependencies, close: () => db.close()};
}
