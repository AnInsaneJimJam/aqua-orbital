// Local-only transaction receipt companion to RouterSettlementSecurity.t.sol.
// Uses disposable unlocked Anvil accounts; no private key or signing service.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {basename} from 'node:path';
import {buildOrder, encodeOrder, hashOrder, takerData, type Config} from '../../sdk/src/codec.js';

const {encodeDeployData, encodeFunctionData, decodeFunctionResult, keccak256, toHex} = createRequire(new URL('../../sdk/package.json', import.meta.url))('viem');
const endpoint = 'http://127.0.0.1:18545';
const out = new URL('../out/', import.meta.url), root = new URL('../../../', import.meta.url);
const zero = `0x${'00'.repeat(20)}`;
let requestId = 0;
async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, signal: AbortSignal.timeout(10_000), body: JSON.stringify({jsonrpc: '2.0', id: ++requestId, method, params})});
  assert.equal(response.ok, true);
  const payload = await response.json() as {error?: {message: string}; result: any};
  if (payload.error) throw Error(`LOCAL_RPC_${method}: ${payload.error.message}`);
  return payload.result;
}
assert.equal(await rpc('eth_chainId'), '0x7a69');
const clientVersion = await rpc('web3_clientVersion'); assert.match(clientVersion, /anvil/i);
const [deployer, maker, taker, recipient, secondRecipient] = await rpc('eth_accounts') as `0x${string}`[];
assert.ok(deployer && maker && taker && recipient && secondRecipient);

type Artifact = {abi: any[]; bytecode: {object: string; linkReferences: Record<string, Record<string, {start: number; length: number}[]>>}};
async function artifact(source: string, name: string): Promise<Artifact> { return JSON.parse(await readFile(new URL(`${basename(source)}/${name}.json`, out), 'utf8')); }
async function transact(from: string, to: string | undefined, data: string, expectedStatus = '0x1') {
  const hash = await rpc('eth_sendTransaction', [{from, ...(to ? {to} : {}), data, gas: '0x1c9c380', value: '0x0'}]);
  for (let i = 0; i < 100; ++i) {
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt) { assert.equal(receipt.status, expectedStatus); return receipt; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('LOCAL_RECEIPT_TIMEOUT');
}
const libraries = new Map<string, string>();
const deployments: {source: string; name: string; address: string; transactionHash: string; runtimeBytes: number; runtimeHash: string}[] = [];
async function deploy(source: string, name: string, args: unknown[] = []): Promise<string> {
  const compiled = await artifact(source, name); let bytecode = compiled.bytecode.object;
  for (const [dependency, names] of Object.entries(compiled.bytecode.linkReferences)) for (const [library, locations] of Object.entries(names)) {
    const id = `${dependency}:${library}`;
    if (!libraries.has(id)) libraries.set(id, await deploy(dependency, library));
    const linked = libraries.get(id)!.slice(2);
    for (const location of locations) {
      assert.equal(location.length, 20); const start = 2 + 2 * location.start;
      bytecode = bytecode.slice(0, start) + linked + bytecode.slice(start + 40);
    }
  }
  const receipt = await transact(deployer!, undefined, encodeDeployData({abi: compiled.abi, bytecode, args}));
  const address = receipt.contractAddress; assert.ok(address);
  const code = await rpc('eth_getCode', [address, 'latest']); const runtimeBytes = (code.length - 2) / 2;
  assert.ok(runtimeBytes > 0 && runtimeBytes <= 24_576);
  deployments.push({source, name, address, transactionHash: receipt.transactionHash, runtimeBytes, runtimeHash: keccak256(code)});
  return address;
}
const tokenArtifact = await artifact('RouterSettlementSecurity.t.sol', 'SecurityDollar');
const aquaArtifact = await artifact('Aqua.sol', 'Aqua');
const routerArtifact = await artifact('OrbitalSwapVMRouter.sol', 'OrbitalSwapVMRouter');
const paymentArtifact = await artifact('OrbitalPayments.sol', 'OrbitalPayments');
const fundingArtifact = await artifact('RouterSettlementSecurity.t.sol', 'SecurityFunding');
async function send(target: string, compiled: Artifact, name: string, args: unknown[] = [], from = deployer!) {
  return transact(from, target, encodeFunctionData({abi: compiled.abi, functionName: name, args}));
}
async function rawCall(target: string, compiled: Artifact, name: string, args: unknown[] = [], from = taker!) {
  return rpc('eth_call', [{from, to: target, data: encodeFunctionData({abi: compiled.abi, functionName: name, args})}, 'latest']);
}
async function call(target: string, compiled: Artifact, name: string, args: unknown[] = [], from = taker!) {
  return decodeFunctionResult({abi: compiled.abi, functionName: name, data: await rawCall(target, compiled, name, args, from)});
}
const aqua = await deploy('Aqua.sol', 'Aqua');
const assets: {address: `0x${string}`; decimals: number}[] = [];
for (const decimals of [6, 18, 6]) assets.push({address: await deploy('RouterSettlementSecurity.t.sol', 'SecurityDollar', [decimals]) as `0x${string}`, decimals});
assets.sort((a, b) => BigInt(a.address) < BigInt(b.address) ? -1 : 1);
const tokens = assets.map(token => token.address), precisions = assets.map(token => token.decimals);
const router = await deploy('OrbitalSwapVMRouter.sol', 'OrbitalSwapVMRouter', [aqua, deployer, tokens, precisions]);
await send(router, routerArtifact, 'renounceOwnership');
for (const asset of assets) {
  await send(asset.address, tokenArtifact, 'configure', [router, aqua]);
  for (const actor of [maker, taker]) await send(asset.address, tokenArtifact, 'mint', [actor, 10000n * 10n ** BigInt(asset.decimals)]);
  await send(asset.address, tokenArtifact, 'approve', [aqua, (1n << 256n) - 1n], maker!);
  await send(asset.address, tokenArtifact, 'approve', [router, (1n << 256n) - 1n], taker!);
}
const funding = await deploy('RouterSettlementSecurity.t.sol', 'SecurityFunding');
const config: Config = {schemaVersion: 1, chainId: 31337n, router: router as `0x${string}`, maker: maker!, makerNonce: 0n,
  tokens, decimals: precisions, tickKeys: [3n * (1n << 32n) / 2n, 7n * (1n << 32n) / 4n, (1n << 64n) - 1n],
  radiiInternal: [100n, 200n, 400n].map(radius => radius * 10n ** 18n * (1n << 64n)), feePpm: 500,
  initialAmountsRaw: await call(funding, fundingArtifact, 'requiredAmounts', [precisions])};
const order = buildOrder(config), orderHash = hashOrder(order);
await send(aqua, aquaArtifact, 'ship', [router, encodeOrder(order), tokens, config.initialAmountsRaw], maker!);
await send(router, routerArtifact, 'activateStrategy', [config, order], maker!);
const gross = 10n ** BigInt(precisions[0]!);
async function deadline() { return BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 60n; }
const inputData = await takerData({taker: taker!, recipient: recipient!, input: 0, output: 1, minimum: 1n, maxCrossings: 0, deadline: await deadline()});
const [, expected] = await call(router, routerArtifact, 'quote', [order, gross, inputData]);
async function swapData() { return encodeFunctionData({abi: routerArtifact.abi, functionName: 'swap', args: [order, gross,
  takerData({taker: taker!, recipient: recipient!, input: 0, output: 1, minimum: expected, maxCrossings: 0, deadline: await deadline()})]}); }
async function snapshot(payments = zero, invoice?: string) {
  const state: unknown[] = [await rawCall(router, routerArtifact, 'getStrategyState', [orderHash]), await call(router, routerArtifact, 'nextMakerNonce', [maker])];
  for (const token of tokens) {
    for (const role of [router, maker, taker, recipient, secondRecipient, payments]) state.push(await call(token, tokenArtifact, 'balanceOf', [role]));
    for (const [owner, spender] of [[maker, aqua], [taker, router], [router, aqua], [payments, router], [taker, payments]]) state.push(await call(token, tokenArtifact, 'allowance', [owner, spender]));
    state.push(await call(token, tokenArtifact, 'totalSupply'), await rawCall(aqua, aquaArtifact, 'rawBalances', [maker, router, orderHash, token]));
  }
  if (invoice) state.push(await rawCall(payments, paymentArtifact, 'getInvoice', [invoice]));
  return createHash('sha256').update(JSON.stringify(state, (_, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
}
const cases: unknown[] = [];
async function failure(label: string, target: string, data: string, payments = zero, invoice?: string) {
  const before = await snapshot(payments, invoice);
  const receipt = await transact(taker!, target, data, '0x0');
  assert.deepEqual(receipt.logs, []); assert.equal(await snapshot(payments, invoice), before);
  cases.push({label, stateDigest: before, receipt});
  console.log(`${label}: reverted receipt has 0 logs; full snapshot unchanged`);
}
await send(tokens[0]!, tokenArtifact, 'mint', [router, 77n]);
await send(tokens[0]!, tokenArtifact, 'setTaxed', [true]);
await failure('taxed input with router donation', router, await swapData());
await send(tokens[0]!, tokenArtifact, 'setTaxed', [false]);
await send(tokens[1]!, tokenArtifact, 'setTaxed', [true]);
await failure('taxed output', router, await swapData());
await send(tokens[1]!, tokenArtifact, 'setTaxed', [false]);
await send(tokens[0]!, tokenArtifact, 'setSticky', [true]);
await send(tokens[0]!, tokenArtifact, 'setCleanup', [false, maker, zero]);
await failure('balance mutation during approval cleanup', router, await swapData());
await send(tokens[0]!, tokenArtifact, 'setCleanup', [true, zero, zero]);
await failure('lying successful zero approval', router, await swapData());
await send(tokens[0]!, tokenArtifact, 'setCleanup', [false, zero, zero]);
await send(tokens[1]!, tokenArtifact, 'forceAllowance', [router, aqua, 1n]);
await send(tokens[1]!, tokenArtifact, 'setCleanup', [false, zero, tokens[0]]);
await failure('second cleanup restores input approval', router, await swapData());
await send(tokens[1]!, tokenArtifact, 'setCleanup', [false, zero, zero]);
await send(tokens[1]!, tokenArtifact, 'forceAllowance', [router, aqua, 0n]);

const output = precisions.findIndex(precision => precision === 6), input = output === 0 ? 1 : 0;
const payments = await deploy('OrbitalPayments.sol', 'OrbitalPayments', [tokens[output], router, tokens]);
const created = await send(payments, paymentArtifact, 'createInvoice', [5_000_000n, Number(await deadline()) + 3540, [recipient, secondRecipient], [9000, 1000], `0x${'00'.repeat(32)}`]);
const invoice = created.logs.find((log: any) => log.address.toLowerCase() === payments.toLowerCase()).topics[1];
const invoiceGross = 6n * 10n ** BigInt(precisions[input]!);
await send(tokens[input]!, tokenArtifact, 'approve', [payments, invoiceGross], taker!);
await send(tokens[input]!, tokenArtifact, 'mint', [payments, 99n]); await send(tokens[output]!, tokenArtifact, 'mint', [payments, 77n]);
await send(tokens[output]!, tokenArtifact, 'setRejectedRecipient', [secondRecipient]);
const invoiceData = () => encodeFunctionData({abi: paymentArtifact.abi, functionName: 'payWithSwap', args: [invoice, order, input, invoiceGross, 5_000_000n, Number(lastDeadline), 0]});
let lastDeadline = await deadline();
await failure('second invoice recipient after completed real curve', payments, invoiceData(), payments, invoice);
await send(tokens[output]!, tokenArtifact, 'setRejectedRecipient', [zero]); lastDeadline = await deadline();
const recovered = await transact(taker!, payments, invoiceData());
const executedTopic = keccak256(toHex('OrbitalSwapExecuted(address,bytes32,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint64,uint64[],bool[])'));
const paidTopic = keccak256(toHex('InvoicePaid(bytes32,address,address,address,uint256,uint256,uint256,bytes32)'));
assert.equal(recovered.logs.filter((log: any) => log.address.toLowerCase() === router.toLowerCase() && log.topics[0] === executedTopic).length, 1);
assert.equal(recovered.logs.filter((log: any) => log.address.toLowerCase() === payments.toLowerCase() && log.topics[0] === paidTopic).length, 1);
assert.equal((await call(router, routerArtifact, 'getStrategyState', [orderHash])).version, 2n);
assert.equal(await call(tokens[output]!, tokenArtifact, 'balanceOf', [recipient]), 4_500_000n);
assert.equal(await call(tokens[output]!, tokenArtifact, 'balanceOf', [secondRecipient]), 500_000n);
cases.push({label: 'recovered invoice', receipt: recovered});
const sourceFiles = ['packages/contracts/src/OrbitalSwapVMRouter.sol', 'packages/contracts/src/libraries/OrbitalStorage.sol', 'packages/contracts/src/libraries/OrbitalSettlement.sol', 'packages/contracts/src/OrbitalPayments.sol', 'packages/contracts/test/RouterSettlementSecurity.t.sol', 'packages/contracts/test/router-settlement-receipts.mts', 'packages/sdk/src/codec.ts'];
const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(new URL(path, root))).digest('hex')])));
await writeFile(new URL('test/evidence/router-settlement-security-receipts.json', root), JSON.stringify({observedAt: new Date().toISOString(), chainId: 31337, endpoint, clientVersion, disposableTestChain: true, mathematicalOracle: false, sources, deployments, orderHash, cases}, null, 2) + '\n');
console.log('Verified 6 reverted receipts with no logs and unchanged full snapshots; recovered real invoice has exactly one router execution and one payment event.');
