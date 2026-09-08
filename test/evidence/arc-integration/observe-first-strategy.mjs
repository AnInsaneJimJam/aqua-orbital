// Read-only checkpoint. Run from the repository root:
// node --import ./apps/api/node_modules/tsx/dist/loader.mjs test/evidence/arc-integration/observe-first-strategy.mjs
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {lifecycleAbi, lifecycleEventsAbi} from '../../../packages/sdk/src/generated/abi.ts';

const require = createRequire(import.meta.url);
const {createPublicClient, http, decodeFunctionData, decodeEventLog} = require('../../../apps/web/node_modules/viem');
const manifest = JSON.parse(await readFile('.cache/arc-runtime/manifest.json', 'utf8'));
assert.equal(manifest.chainId, 5042002);
assert.equal(manifest.verified, true);
const maker = '0x5eBA55e1b43c8714E4432250Dada7A518780C871';
const orderHash = '0xc64a158e90a2b3f9bd211748fe96f1cd59b7f785c18c093b99d033f6ff589eee';
const txHash = '0x93fe7e8e901e8b12939bd5c3af3f0ec59b30368f1e926999f7f0c2b540f542cb';
const evidence = {scope: 'Actual user-signed Arc strategy activation and read-only quote. Synthetic quote caller; no authenticated trader, signing, broadcast or token transfer by this probe.', observedAt: new Date().toISOString(), rpcUrl: manifest.rpcUrl, observations: []};
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
async function observe(path, body) {
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:3003' + path, {
    signal: AbortSignal.timeout(25000),
    ...(body ? {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)} : {}),
  });
  const data = await response.json();
  evidence.observations.push({path, ...(body ? {request: body} : {}), httpStatus: response.status, elapsedMs: performance.now() - started, observedAt: new Date().toISOString(), data});
  return data;
}
try {
  const detail = await observe('/strategies/' + orderHash);
  assert.equal(detail.status, 'available');
  const strategy = detail.data.strategy;
  assert.equal(strategy.lifecycle, 'active');
  assert.equal(strategy.activated.txHash, txHash);
  assert.equal(strategy.config.maker.toLowerCase(), maker.toLowerCase());
  assert.deepEqual(strategy.config.initialAmountsRaw, ['10000000', '10000000', '10000000000000000000']);
  assert.equal(strategy.config.feePpm, 500);
  assert.equal(strategy.financial.availability.length, 3);
  assert.ok(strategy.financial.availability.every(a => a.live && a.backingValid && BigInt(a.fundingCeilingRaw) > 0n));

  const client = createPublicClient({transport: http(manifest.rpcUrl, {retryCount: 0, timeout: 8000})});
  const [chainId, tx, receipt] = await Promise.all([
    client.getChainId(), client.getTransaction({hash: txHash}), client.getTransactionReceipt({hash: txHash}),
  ]);
  assert.equal(chainId, manifest.chainId);
  assert.equal(receipt.status, 'success');
  assert.equal(tx.from.toLowerCase(), maker.toLowerCase());
  assert.equal(tx.to.toLowerCase(), manifest.router.toLowerCase());
  assert.equal(receipt.blockHash, strategy.activated.blockHash);
  const block = await client.getBlock({blockNumber: receipt.blockNumber});
  assert.equal(block.hash, receipt.blockHash);
  assert.ok(block.transactions.includes(txHash));
  const decoded = decodeFunctionData({abi: lifecycleAbi, data: tx.input});
  assert.equal(decoded.functionName, 'activateStrategy');
  const normalized = value => JSON.stringify(JSON.parse(json(value))).toLowerCase();
  assert.equal(normalized(decoded.args[0]), normalized(strategy.config));
  const log = receipt.logs.find(l => l.logIndex === strategy.activated.logIndex && l.address.toLowerCase() === manifest.router.toLowerCase());
  assert.ok(log);
  const event = decodeEventLog({abi: lifecycleEventsAbi, data: log.data, topics: log.topics, strict: true});
  assert.equal(event.eventName, 'StrategyActivated');
  assert.equal(event.args.orderHash, orderHash);
  assert.equal(event.args.configHash, strategy.configHash);
  assert.equal(event.args.maker.toLowerCase(), maker.toLowerCase());
  evidence.activation = {chainId, transaction: tx, receipt, canonicalBlock: {number: block.number, hash: block.hash, timestamp: block.timestamp}, decoded, event};

  // This address is a synthetic eth_call role only, never the user's selected wallet.
  const probe = '0x000000000000000000000000000000000000bEEF';
  const quote = await observe('/quotes/swap', {wallet: probe, recipient: probe, tokenIn: manifest.usdc, tokenOut: manifest.tokens.find(t => t.symbol === 'oUSD6').address, amountInRaw: '1000000', slippageBps: 10, maxCrossings: 16});
  assert.equal(quote.code, 'QUOTE_OBSERVED');
  assert.equal(quote.data.best.orderHash, orderHash);
  evidence.result = 'Activation identity, live allocation backing and one whole-size quote verified; trader execution remains open.';
  console.log(json({result: evidence.result, outputRaw: quote.data.best.amountOutRaw, minimumRaw: quote.data.best.minimumOutRaw, feeRaw: quote.data.best.feeRaw}));
} catch (error) {
  evidence.error = {name: error.name, message: error.message};
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await writeFile(new URL('./first-strategy.json', import.meta.url), json(evidence));
}
