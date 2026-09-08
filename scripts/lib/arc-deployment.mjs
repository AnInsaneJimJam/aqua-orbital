import {readFile, writeFile, mkdir, rename, open, unlink} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraph, linkObject, verifyRuntime, ROOTS} from './local-deployment.mjs';

const {encodeDeployData, encodeFunctionData, decodeFunctionResult, encodeFunctionResult,
  getContractAddress, keccak256, hashTypedData, toHex, zeroAddress} =
  createRequire(new URL('../../packages/sdk/package.json', import.meta.url))('viem');
const root = fileURLToPath(new URL('../../', import.meta.url));
export const ARC = Object.freeze({chainId: 5042002, rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://testnet.arcscan.app', usdc: '0x3600000000000000000000000000000000000000',
  aqua: '0x1111113ccf1426a8e30e2bff5e005d929bf6a90a'});
export const DEFAULT_PLAN = resolve(root, 'deployments/5042002/plans/deployment.json');
export const SELF_DEPLOYMENT_PLAN = resolve(root, 'deployments/5042002/plans/self-deployment.json');
const AQUA_ROUTER = 'vendor/aqua/src/AquaRouter.sol:AquaRouter';
const activeDirectory = resolve(root, 'deployments/5042002');
const revision = '81c26e4619ce21556ab02b3284ee2685de21fb18';
const address = x => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x) && BigInt(x) !== 0n;
const hash = x => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x);
const quantity = n => '0x' + BigInt(n).toString(16);
const json = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const digest = x => createHash('sha256').update(typeof x === 'string' ? x : json(x)).digest('hex');
const fail = message => { throw Error(message); };
const eq = (a, b, message) => {
  const same = typeof a === 'string' && typeof b === 'string' && a.startsWith('0x') && b.startsWith('0x')
    ? a.toLowerCase() === b.toLowerCase() : json(a) === json(b);
  if (!same) fail(message);
};
const usdcGas = n => `${n / 10n ** 18n}.${(n % 10n ** 18n).toString().padStart(18, '0')}`;
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
async function save(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, json(value), {flag: 'wx'});
  await rename(temporary, path);
}
function endpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    fail('Use a public HTTPS Arc RPC without credentials, query parameters or a fragment.');
  }
  return url.href.replace(/\/$/, '');
}
function rpcAt(url) {
  return async (method, params = []) => {
    let response;
    try {
      response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(20_000)});
    } catch { fail(`Arc RPC transport failed during ${method}; no transaction was sent by this tool.`); }
    if (!response.ok) fail(`Arc RPC HTTP ${response.status} during ${method}.`);
    const body = await response.json();
    if (body.error || body.result === undefined) fail(`Arc RPC rejected ${method} (${body.error?.code ?? 'invalid response'}).`);
    return body.result;
  };
}
async function network(rpc) {
  eq(await rpc('eth_chainId'), quantity(ARC.chainId), 'RPC is not Arc Testnet.');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!hash(block?.hash)) fail('Arc returned no canonical block identity.');
  return {block, pin: {blockHash: block.hash, requireCanonical: true}};
}

const artifactCache = new Map();
async function artifacts(selfDeployAqua = false) {
  const cachedArtifacts = artifactCache.get(selfDeployAqua);
  if (cachedArtifacts) {
    // Re-hash actual bytes, not just mtimes, before reusing expensive parsed
    // compiler metadata. A source or artifact edit invalidates this process.
    for (const [path, expected] of cachedArtifacts.fileHashes) {
      if (createHash('sha256').update(await readFile(path)).digest('hex') !== expected) fail('Source or artifact changed while deployment utility was running. Restart and prepare a reviewed plan.');
    }
    return cachedArtifacts.build;
  }
  const graph = await buildGraph({contracts: resolve(root, 'packages/contracts'),
    roots: [ROOTS.router, ROOTS.payments, ROOTS.demo, ...(selfDeployAqua ? [AQUA_ROUTER] : [])]});
  const upstreamBytes = await readFile(resolve(root, 'test/evidence/upstream.json'), 'utf8');
  const aqua = JSON.parse(upstreamBytes).aqua;
  if (aqua.url !== 'https://github.com/1inch/aqua.git' || aqua.revision !== revision) fail('Aqua source pin changed.');
  for (const [name, expected] of Object.entries(aqua.files)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) fail('Invalid upstream source path.');
    const bytes = await readFile(resolve(root, 'packages/contracts/vendor/aqua', name));
    if (createHash('sha256').update(bytes).digest('hex') !== expected) fail(`Pinned Aqua source changed: ${name}`);
  }
  for (const name of Object.keys(graph.sources)) {
    if (name.startsWith('vendor/aqua/') && !Object.hasOwn(aqua.files, name.slice('vendor/aqua/'.length))) fail('Unpinned Aqua source.');
  }
  for (const node of graph.nodes) {
    if (node.dependencies.some(dep => graph.roots.includes(dep))) fail('Deployment root linked as a library.');
    if (!graph.roots.includes(node.fqn)) {
      const keys = Object.keys(node.artifact.deployedBytecode.immutableReferences ?? {});
      if (keys.length) eq(keys, ['library_deploy_address'], 'Unexpected library immutable.');
      if (node.artifact.abi.some(entry => entry.type === 'constructor')) fail('Unexpected library constructor.');
    }
  }
  const identity = {sources: graph.sources, aquaRevision: revision, aquaManifestSha256: digest(upstreamBytes),
    artifacts: graph.nodes.map(n => ({fqn: n.fqn, integrity: n.integrity}))};
  const build = {graph, identity, fingerprint: digest(identity)};
  const fileHashes = new Map([[resolve(root, 'test/evidence/upstream.json'), digest(upstreamBytes)]]);
  for (const node of graph.nodes) {
    fileHashes.set(resolve(root, 'packages/contracts/out', basename(node.fqn.split(':')[0]), node.fqn.split(':')[1] + '.json'), node.integrity.artifactSha256);
    for (const source of node.integrity.sources) fileHashes.set(resolve(root, 'packages/contracts', source.source), source.sha256);
  }
  for (const [name, expected] of Object.entries(aqua.files)) fileHashes.set(resolve(root, 'packages/contracts/vendor/aqua', name), expected);
  artifactCache.set(selfDeployAqua, {build, fileHashes});
  return build;
}

// This is a retained, human-reviewed source record, not an automatic sponsor
// endorsement. A code hash by itself cannot establish official deployment status.
function evidenceRecord(value) {
  if (value === null) return null;
  if (!value || value.chainId !== ARC.chainId || !address(value.address) || !hash(value.runtimeKeccak256) ||
      value.aquaRevision !== revision || !['official-deployment', 'maintainer-accepted-deployment'].includes(value.kind) ||
      !Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 8 ||
      typeof value.reviewedBy !== 'string' || value.reviewedBy.length < 2 ||
      typeof value.reviewNotes !== 'string' || value.reviewNotes.length < 20 || !Number.isFinite(Date.parse(value.reviewedAt))) {
    fail('Aqua evidence must identify Arc, the pinned source, runtime hash, primary sources and a dated human review.');
  }
  for (const source of value.sources) {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || !/^[0-9a-f]{64}$/.test(source.contentSha256 ?? '') ||
        typeof source.excerpt !== 'string' || source.excerpt.length < 20) fail('Aqua source evidence is incomplete.');
  }
  return value;
}

function makeSteps(build, deployer, baseNonce, aqua, selfDeployAqua = false) {
  const nodes = new Map(build.graph.nodes.map(n => [n.fqn, n]));
  const links = new Map();
  const steps = [];
  const addresses = {aqua, usdc: ARC.usdc};
  function deploy(fqn, args, label) {
    const node = nodes.get(fqn), nonce = BigInt(baseNonce) + BigInt(steps.length);
    const predicted = getContractAddress({from: deployer, nonce});
    const bytecode = linkObject(node.artifact.bytecode.object, node.integrity.linkReferences.creation, links);
    const runtimeTemplate = linkObject(node.artifact.deployedBytecode.object, node.integrity.linkReferences.runtime, links);
    const data = encodeDeployData({abi: node.artifact.abi, bytecode, args});
    if ((data.length - 2) / 2 > 49152) fail('Deployment initcode exceeds the size limit.');
    steps.push({label, fqn, args, nonce: nonce.toString(), address: predicted, to: null, data,
      runtimeTemplate, immutableReferences: node.artifact.deployedBytecode.immutableReferences ?? {},
      library: !build.graph.roots.includes(fqn)});
    links.set(fqn, predicted);
    return predicted;
  }
  // The upstream wrapper has no linked libraries. Preserve its helper owner:
  // only Orbital's custom router is renounced at the end of this plan.
  if (selfDeployAqua) {
    if (nodes.get(AQUA_ROUTER).dependencies.length) fail('Review new AquaRouter library dependencies before preparing deployment.');
    addresses.aqua = deploy(AQUA_ROUTER, [deployer], 'AquaRouter (unchanged upstream)');
  }
  for (const node of build.graph.nodes) if (!build.graph.roots.includes(node.fqn)) deploy(node.fqn, [], node.fqn.split(':')[1]);
  addresses.demo6 = deploy(ROOTS.demo, [6], 'Orbital Demo Dollar 6');
  addresses.demo18 = deploy(ROOTS.demo, [18], 'Orbital Demo Dollar 18');
  const tokens = [{address: ARC.usdc, decimals: 6, symbol: 'USDC', mock: false},
    {address: addresses.demo6, decimals: 6, symbol: 'oUSD6', mock: true},
    {address: addresses.demo18, decimals: 18, symbol: 'oUSD18', mock: true}]
    .sort((a, b) => BigInt(a.address) < BigInt(b.address) ? -1 : 1);
  addresses.router = deploy(ROOTS.router, [addresses.aqua, deployer, tokens.map(t => t.address), tokens.map(t => t.decimals)], 'Orbital SwapVM router');
  addresses.payments = deploy(ROOTS.payments, [ARC.usdc, addresses.router, tokens.map(t => t.address)], 'Orbital payments');
  steps.push({label: 'Renounce router ownership', nonce: (BigInt(baseNonce) + BigInt(steps.length)).toString(),
    to: addresses.router, data: encodeFunctionData({abi: nodes.get(ROOTS.router).artifact.abi, functionName: 'renounceOwnership'})});
  return {steps, addresses, tokens};
}

async function preflight(rpc, deployer, evidence, {selfDeployAqua = false, aquaAddress, aquaRuntime = null, requireAqua = false} = {}) {
  const {block, pin} = await network(rpc), aqua = selfDeployAqua ? aquaAddress : evidence?.address ?? ARC.aqua;
  if (!address(aqua)) fail('Aqua deployment address is missing.');
  const [aquaCode, usdcCode, decimals, balance, nonce, pendingNonce] = await Promise.all([
    rpc('eth_getCode', [aqua, pin]), rpc('eth_getCode', [ARC.usdc, pin]),
    rpc('eth_call', [{to: ARC.usdc, data: '0x313ce567'}, pin]),
    rpc('eth_getBalance', [deployer, pin]), rpc('eth_getTransactionCount', [deployer, 'latest']),
    rpc('eth_getTransactionCount', [deployer, 'pending'])]);
  const blockers = [];
  if (usdcCode === '0x' || decimals !== '0x' + '0'.repeat(63) + '6') blockers.push('Arc system USDC code/decimal verification failed.');
  if (selfDeployAqua) {
    if (aquaCode === '0x' && requireAqua) blockers.push('The confirmed project-deployed Aqua runtime is missing.');
    if (aquaCode !== '0x' && !aquaRuntime) blockers.push('The planned Aqua address already contains code without a verified deployment receipt.');
    if (aquaCode !== '0x' && aquaRuntime && keccak256(aquaCode) !== aquaRuntime.runtimeKeccak256) blockers.push('Project-deployed Aqua runtime differs from its authenticated deployment receipt.');
  } else {
    if (aquaCode === '0x') blockers.push(`No Aqua contract is deployed at ${aqua} on Arc Testnet.`);
    if (!evidence) blockers.push('Official Arc Aqua deployment evidence or explicit maintainer acceptance is missing. Use the explicitly selected project deployment mode for a separate upstream Aqua deployment.');
    else if (aquaCode !== '0x' && keccak256(aquaCode) !== evidence.runtimeKeccak256.toLowerCase()) blockers.push('Aqua runtime differs from its reviewed primary-source identity.');
  }
  let aquaAbiProbe = false;
  if (aquaCode !== '0x' && (!selfDeployAqua || aquaRuntime)) {
    const abi = [{type: 'function', name: 'rawBalances', stateMutability: 'view',
      inputs: [{name: 'maker', type: 'address'}, {name: 'app', type: 'address'}, {name: 'strategyHash', type: 'bytes32'}, {name: 'token', type: 'address'}],
      outputs: [{name: 'balance', type: 'uint248'}, {name: 'tokensCount', type: 'uint8'}]}];
    const data = encodeFunctionData({abi, functionName: 'rawBalances', args: [zeroAddress, zeroAddress, '0x' + '00'.repeat(32), ARC.usdc]});
    const actual = await rpc('eth_call', [{to: aqua, data}, pin]);
    aquaAbiProbe = actual === '0x' + '0'.repeat(128);
    if (!aquaAbiProbe) blockers.push('Aqua rawBalances ABI probe does not match the pinned empty-maker representation.');
  }
  if (nonce !== pendingNonce) blockers.push('The deployer has a pending transaction; wait for its receipt before preparing deployment.');
  if (BigInt(balance) === 0n) blockers.push('The deployment wallet needs Arc testnet USDC for gas.');
  return {block: {number: block.number, hash: block.hash}, aqua, aquaCodeHash: aquaCode === '0x' ? null : keccak256(aquaCode),
    aquaAbiProbe, usdcCodeHash: usdcCode === '0x' ? null : keccak256(usdcCode), balanceNative: balance, balanceUsdc: usdcGas(BigInt(balance)),
    nonce, pendingNonce, blockers};
}

export async function inspectArc({deployer, rpcUrl = process.env.ARC_RPC_URL ?? ARC.rpcUrl, evidence = null, selfDeployAqua = false} = {}) {
  if (!address(deployer)) fail('Provide the authorized public deployment wallet address.');
  if (typeof selfDeployAqua !== 'boolean' || (selfDeployAqua && evidence !== null)) fail('Select either project deployment or existing Aqua evidence, not both.');
  const rpc = rpcAt(endpoint(rpcUrl));
  const options = selfDeployAqua ? {selfDeployAqua, aquaAddress: getContractAddress({from: deployer,
    nonce: BigInt(await rpc('eth_getTransactionCount', [deployer, 'latest']))})} : {};
  return {chainId: ARC.chainId, rpcUrl: endpoint(rpcUrl), deployer, observedAt: new Date().toISOString(),
    ...(selfDeployAqua ? {aquaDeployment: 'project-deployed-upstream'} : {}),
    ...await preflight(rpc, deployer, evidenceRecord(evidence), options)};
}

export async function prepareArcDeployment({deployer, rpcUrl = process.env.ARC_RPC_URL ?? ARC.rpcUrl,
  evidence = null, selfDeployAqua = false, planPath = selfDeployAqua ? SELF_DEPLOYMENT_PLAN : DEFAULT_PLAN} = {}) {
  if (!address(deployer)) fail('Provide --deployer with the authorized public wallet address.');
  planPath = resolve(planPath);
  const build = await artifacts(selfDeployAqua);
  const observation = await inspectArc({deployer, rpcUrl, evidence, selfDeployAqua});
  const steps = makeSteps(build, deployer, observation.nonce, observation.aqua, selfDeployAqua);
  eq(steps.addresses.aqua, observation.aqua, 'Deployer nonce changed during preparation; retry with a fresh plan.');
  const plan = {schemaVersion: selfDeployAqua ? 2 : 1,
    ...(selfDeployAqua ? {aquaDeployment: 'project-deployed-upstream'} : {}),
    chainId: ARC.chainId, rpcUrl: observation.rpcUrl, deployer,
    preparedAt: observation.observedAt, baseNonce: BigInt(observation.nonce).toString(),
    evidence: evidenceRecord(evidence), buildFingerprint: build.fingerprint, buildIdentity: build.identity,
    gasLimitCap: '8000000', ...steps, observation};
  plan.planId = digest(plan);
  await mkdir(dirname(planPath), {recursive: true});
  // Never overwrite a signed or partially completed deployment plan.
  await writeFile(planPath, json(plan), {flag: 'wx'});
  return {planPath, planId: plan.planId, aquaDeployment: selfDeployAqua ? 'project-deployed-upstream' : 'existing-authenticated',
    transactions: plan.steps.length, addresses: plan.addresses, blockers: observation.blockers};
}

async function loadPlan(planPath) {
  const plan = await readJson(resolve(planPath)), {planId, ...content} = plan;
  const selfDeployAqua = plan.schemaVersion === 2 && plan.aquaDeployment === 'project-deployed-upstream';
  if (digest(content) !== planId || (!selfDeployAqua && plan.schemaVersion !== 1) ||
      (selfDeployAqua && plan.evidence !== null) || (!selfDeployAqua && plan.aquaDeployment !== undefined) || plan.chainId !== ARC.chainId ||
      !address(plan.deployer) || !/^(0|[1-9][0-9]*)$/.test(plan.baseNonce) || plan.gasLimitCap !== '8000000') fail('Invalid or edited Arc deployment plan. Prepare a new plan.');
  endpoint(plan.rpcUrl); evidenceRecord(plan.evidence);
  const build = await artifacts(selfDeployAqua);
  eq(build.fingerprint, plan.buildFingerprint, 'Compiled source changed since preparation. Retain this plan and prepare another.');
  eq(build.identity, plan.buildIdentity, 'Plan build identity was modified.');
  const expected = makeSteps(build, plan.deployer, plan.baseNonce, plan.evidence?.address ?? ARC.aqua, selfDeployAqua);
  for (const key of ['steps', 'addresses', 'tokens']) eq(plan[key], expected[key], `Deployment ${key} differ from authenticated artifacts.`);
  return {plan, build, rpc: rpcAt(plan.rpcUrl)};
}

function aquaPreflightOptions(plan, state) {
  if (plan.aquaDeployment !== 'project-deployed-upstream') return {};
  return {selfDeployAqua: true, aquaAddress: plan.addresses.aqua,
    aquaRuntime: state.confirmed[0]?.runtime ?? null, requireAqua: state.confirmed.length > 0};
}

async function locked(planPath, action) {
  const path = resolve(planPath), lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail('This deployment is busy. If its process crashed, stop all deployment tools before removing its .lock file.'); throw error; }
  try { return await action(path); }
  finally { await lock.close(); await unlink(lockPath); }
}
async function stateFor(path, plan) {
  const state = await readJson(`${path}.state.json`, {planId: plan.planId, confirmed: [], pendingHash: null, review: null});
  if (state.planId !== plan.planId || !Array.isArray(state.confirmed) || state.confirmed.length > plan.steps.length) fail('Deployment state does not match this plan.');
  return state;
}

function validateTransaction(tx, step, plan, review) {
  if (!tx || !hash(tx.hash) || !review) fail('Transaction or its prior review is missing.');
  validateReview(review, step, plan);
  eq(tx.from, plan.deployer, 'Transaction sender differs from the authorized deployer.');
  eq(tx.to, step.to, 'Transaction recipient differs from the reviewed step.');
  eq(tx.input, step.data, 'Transaction calldata differs from the reviewed step.');
  if (BigInt(tx.chainId) !== BigInt(ARC.chainId) || BigInt(tx.nonce) !== BigInt(step.nonce) || BigInt(tx.value) !== 0n) fail('Transaction chain, nonce or value differs from this plan.');
  if (BigInt(tx.gas) > BigInt(review.transaction.gas) || BigInt(tx.gas) <= 0n ||
      BigInt(tx.maxFeePerGas ?? tx.gasPrice) > BigInt(review.transaction.maxFeePerGas) ||
      BigInt(tx.maxPriorityFeePerGas ?? 0) > BigInt(review.transaction.maxPriorityFeePerGas)) fail('Transaction exceeds the reviewed gas or fee limits.');
}

function validateReview(review, step, plan) {
  const tx = review?.transaction;
  if (!tx || Object.keys(tx).some(k => !['from', 'to', 'data', 'nonce', 'value', 'chainId', 'gas', 'maxFeePerGas', 'maxPriorityFeePerGas'].includes(k))) fail('Invalid saved transaction review.');
  eq(tx.from, plan.deployer, 'Saved review sender mismatch.'); eq(tx.to ?? null, step.to, 'Saved review recipient mismatch.');
  eq(tx.data, step.data, 'Saved review calldata mismatch.');
  for (const key of ['nonce', 'value', 'chainId', 'gas', 'maxFeePerGas', 'maxPriorityFeePerGas']) {
    if (typeof tx[key] !== 'string' || !/^0x[0-9a-f]+$/i.test(tx[key])) fail('Invalid review quantity.');
  }
  if (BigInt(tx.nonce) !== BigInt(step.nonce) || BigInt(tx.value) !== 0n || BigInt(tx.chainId) !== BigInt(ARC.chainId) ||
      BigInt(tx.gas) <= 0n || BigInt(tx.gas) > BigInt(plan.gasLimitCap) || BigInt(tx.maxFeePerGas) < BigInt(tx.maxPriorityFeePerGas)) fail('Saved review exceeds the deployment bounds.');
  if (step.address) verifyRuntime(step.runtimeTemplate, step.immutableReferences, review.simulatedRuntime, review.simulatedRuntime);
}

async function verifyEntry(rpc, plan, step, entry) {
  const [tx, receipt] = await Promise.all([rpc('eth_getTransactionByHash', [entry.hash]), rpc('eth_getTransactionReceipt', [entry.hash])]);
  if (!tx || !receipt) fail('Previously confirmed transaction is unavailable; retain the record and retry.');
  validateTransaction(tx, step, plan, entry.review);
  if (receipt.status !== '0x1' || BigInt(receipt.gasUsed) <= 0n || BigInt(receipt.gasUsed) > BigInt(tx.gas)) fail('Deployment transaction reverted or has an invalid gas receipt.');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block?.transactions?.some(item => item.toLowerCase() === entry.hash.toLowerCase())) fail('Deployment transaction is absent from its canonical block.');
  eq(tx.hash, entry.hash, 'Transaction hash mismatch.'); eq(receipt.transactionHash, entry.hash, 'Receipt hash mismatch.');
  eq(receipt.blockHash, block.hash, 'Deployment receipt was orphaned.'); eq(tx.blockHash, block.hash, 'Transaction block mismatch.');
  eq(tx.blockNumber, block.number, 'Transaction block number mismatch.'); eq(receipt.blockNumber, block.number, 'Receipt block number mismatch.');
  eq(receipt.from, plan.deployer, 'Receipt sender mismatch.'); eq(receipt.to, step.to, 'Receipt recipient mismatch.');
  eq(receipt.contractAddress, step.address ?? null, 'Contract creation address differs from the reviewed nonce.');
  if (entry.receipt) eq(receipt, entry.receipt, 'Previously recorded receipt changed.');
  let runtime;
  if (step.address) {
    const actual = await rpc('eth_getCode', [step.address, {blockHash: block.hash, requireCanonical: true}]);
    runtime = verifyRuntime(step.runtimeTemplate, step.immutableReferences, entry.review.simulatedRuntime, actual);
    if (step.library && Object.keys(runtime.immutableValues).length) eq(runtime.immutableValues.library_deploy_address,
      '0x' + step.address.slice(2).toLowerCase().padStart(64, '0'), 'Library self-address differs from its deployment.');
    eq(await rpc('eth_getCode', [step.address, 'latest']), actual, 'Deployed runtime changed.');
    if (entry.runtime) eq(runtime, entry.runtime, 'Previously recorded runtime evidence changed.');
    else if (entry.receipt) fail('Confirmed contract runtime evidence is missing.');
  }
  return {hash: entry.hash, review: entry.review, receipt, runtime};
}

async function refresh(path, plan, state, rpc) {
  for (let i = 0; i < state.confirmed.length; i++) await verifyEntry(rpc, plan, plan.steps[i], state.confirmed[i]);
  if (!state.pendingHash) return;
  const step = plan.steps[state.confirmed.length];
  if (!step) fail('Unexpected pending transaction after the final deployment step.');
  const tx = await rpc('eth_getTransactionByHash', [state.pendingHash]);
  if (!tx) return; // Hash is retained even if the RPC has not observed propagation.
  validateTransaction(tx, step, plan, state.review);
  const receipt = await rpc('eth_getTransactionReceipt', [state.pendingHash]);
  if (!receipt) return;
  const entry = await verifyEntry(rpc, plan, step, {hash: state.pendingHash, review: state.review});
  state.confirmed.push(entry); state.pendingHash = null; state.review = null;
  await save(`${path}.state.json`, state);
}

export async function getArcStatus(planPath = DEFAULT_PLAN) {
  return locked(planPath, async path => {
    const {plan, rpc} = await loadPlan(path), state = await stateFor(path, plan);
    const status = {planId: plan.planId, deployer: plan.deployer, chainId: ARC.chainId, phase: 'blocked',
      aquaDeployment: plan.aquaDeployment ?? 'existing-authenticated',
      blockers: [], confirmed: state.confirmed.length, total: plan.steps.length, addresses: plan.addresses};
    try {
      await network(rpc);
      await refresh(path, plan, state, rpc);
      status.confirmed = state.confirmed.length;
      if (state.pendingHash) return {...status, phase: 'pending', pendingHash: state.pendingHash};
      const observation = await preflight(rpc, plan.deployer, plan.evidence, aquaPreflightOptions(plan, state));
      eq(observation.usdcCodeHash, plan.observation.usdcCodeHash, 'Arc system USDC runtime changed since deployment preparation.');
      // Funding is needed only while a transaction remains; verification is free.
      status.blockers = observation.blockers.filter(b => !(state.confirmed.length === plan.steps.length && b.includes('needs Arc testnet USDC')));
      if (status.blockers.length) return status;
      if (state.confirmed.length === plan.steps.length) return {...status, phase: 'complete'};
      const step = plan.steps[state.confirmed.length];
      if (BigInt(observation.nonce) !== BigInt(step.nonce)) fail('Deployer nonce changed outside this plan. Stop signing; predicted contract addresses must be rebuilt for remaining work.');
      const block = await rpc('eth_getBlockByNumber', ['latest', false]);
      if (state.review) {
        if (state.review.step !== state.confirmed.length) fail('Saved review belongs to a different deployment step.');
        validateReview(state.review, step, plan);
        const tx = state.review.transaction, budget = BigInt(tx.gas) * BigInt(tx.maxFeePerGas);
        if (BigInt(block.baseFeePerGas) > BigInt(tx.maxFeePerGas)) fail('Network base fee exceeds this saved review. Wait for fees to fall; this tool preserves the transaction already shown in your wallet.');
        if (BigInt(observation.balanceNative) < budget) fail(`Insufficient USDC for the saved gas budget (${usdcGas(budget)} USDC).`);
        // Never replace a quote while another tab or wallet may be signing it.
        return {...status, phase: 'ready', next: {label: step.label, address: step.address, transaction: tx, gasBudgetUsdc: usdcGas(budget)}};
      }
      const priority = BigInt(await rpc('eth_maxPriorityFeePerGas'));
      const maxFee = BigInt(block.baseFeePerGas) * 2n + priority;
      const tx = {from: plan.deployer, ...(step.to ? {to: step.to} : {}), data: step.data,
        nonce: quantity(step.nonce), value: '0x0', chainId: quantity(ARC.chainId), gas: quantity(plan.gasLimitCap),
        maxFeePerGas: quantity(maxFee), maxPriorityFeePerGas: quantity(priority)};
      const estimated = BigInt(await rpc('eth_estimateGas', [tx]));
      const gas = estimated + estimated / 5n + 10000n;
      if (gas > BigInt(plan.gasLimitCap) || gas > BigInt(block.gasLimit)) fail('Estimated deployment gas exceeds its 8,000,000-gas review ceiling.');
      tx.gas = quantity(gas);
      if (gas * maxFee > BigInt(observation.balanceNative)) fail(`Insufficient USDC for this step's maximum gas budget (${usdcGas(gas * maxFee)} USDC).`);
      const simulatedRuntime = await rpc('eth_call', [tx, 'latest']);
      if (step.address) verifyRuntime(step.runtimeTemplate, step.immutableReferences, simulatedRuntime, simulatedRuntime);
      state.review = {step: state.confirmed.length, transaction: tx, simulatedRuntime, estimatedGas: estimated.toString(), reviewedAt: new Date().toISOString()};
      await save(`${path}.state.json`, state);
      return {...status, phase: 'ready', next: {label: step.label, address: step.address, transaction: tx, gasBudgetUsdc: usdcGas(gas * maxFee)}};
    } catch (error) {
      return {...status, phase: 'blocked', ...(state.pendingHash ? {pendingHash: state.pendingHash} : {}),
        blockers: [error instanceof Error ? error.message : 'Arc deployment verification failed.']};
    }
  });
}

export async function recordArcTransaction(planPath, transactionHash) {
  if (!hash(transactionHash)) fail('Enter the public transaction hash returned by your wallet.');
  return locked(planPath, async path => {
    const {plan, rpc} = await loadPlan(path), state = await stateFor(path, plan);
    if (state.confirmed.some(entry => entry.hash.toLowerCase() === transactionHash.toLowerCase())) return {recorded: true};
    if (state.pendingHash && state.pendingHash.toLowerCase() !== transactionHash.toLowerCase()) fail('A different transaction is already pending. Resolve it before recording another.');
    if (!state.review || state.review.step !== state.confirmed.length) fail('No reviewed deployment step exists for this hash.');
    await network(rpc);
    const tx = await rpc('eth_getTransactionByHash', [transactionHash]);
    if (tx) validateTransaction(tx, plan.steps[state.confirmed.length], plan, state.review);
    state.pendingHash = transactionHash;
    await save(`${path}.state.json`, state);
    await refresh(path, plan, state, rpc);
    return {recorded: true, confirmed: state.confirmed.length, pendingHash: state.pendingHash};
  });
}

async function bindings(plan, build, rpc) {
  const {block, pin} = await network(rpc), nodes = new Map(build.graph.nodes.map(n => [n.fqn, n]));
  async function read(fqn, to, functionName, args = []) {
    const abi = nodes.get(fqn).artifact.abi;
    const data = await rpc('eth_call', [{to, data: encodeFunctionData({abi, functionName, args})}, pin]);
    const value = decodeFunctionResult({abi, functionName, data});
    eq(encodeFunctionResult({abi, functionName, result: value}), data, 'Noncanonical contract getter.');
    return value;
  }
  const router = (fn, args) => read(ROOTS.router, plan.addresses.router, fn, args);
  const payments = (fn, args) => read(ROOTS.payments, plan.addresses.payments, fn, args);
  if (plan.aquaDeployment === 'project-deployed-upstream') {
    eq(await read(AQUA_ROUTER, plan.addresses.aqua, 'owner'), plan.deployer, 'Upstream AquaRouter helper owner differs from the deployment wallet.');
    eq(await read(AQUA_ROUTER, plan.addresses.aqua, 'multicall', [[]]), [], 'Upstream AquaRouter empty multicall failed.');
  }
  eq(await router('AQUA'), plan.addresses.aqua, 'Router Aqua binding mismatch.');
  eq(await router('WETH'), zeroAddress, 'Router must not wrap native USDC.');
  eq(await router('CHAIN_ID'), BigInt(ARC.chainId), 'Router chain binding mismatch.');
  eq(await router('owner'), zeroAddress, 'Router ownership has not been renounced.');
  const domain = await router('eip712Domain');
  const expected = ['0x0f', 'Orbital', '1', BigInt(ARC.chainId), plan.addresses.router, '0x' + '00'.repeat(32), []];
  eq(domain.length, expected.length, 'Router EIP-712 domain mismatch.');
  for (let i = 0; i < expected.length; i++) eq(domain[i], expected[i], 'Router EIP-712 domain mismatch.');
  eq(await router('ORDER_TYPEHASH'), keccak256(toHex('Order(address maker,uint256 traits,bytes data)')), 'Order type hash mismatch.');
  const order = {maker: plan.deployer, traits: 0n, data: '0x0102'};
  const typed = {domain: {name: 'Orbital', version: '1', chainId: ARC.chainId, verifyingContract: plan.addresses.router},
    primaryType: 'Order', types: {Order: [{name: 'maker', type: 'address'}, {name: 'traits', type: 'uint256'}, {name: 'data', type: 'bytes'}]}, message: order};
  eq(await router('hash', [order]), hashTypedData(typed), 'Router cached signature domain mismatch.');
  eq(await payments('USDC'), ARC.usdc, 'Payments USDC binding mismatch.');
  eq(await payments('ROUTER'), plan.addresses.router, 'Payments router binding mismatch.');
  for (const token of plan.tokens) {
    eq(await router('allowedToken', [token.address]), true, 'Router token missing.');
    eq(await router('tokenDecimals', [token.address]), token.decimals, 'Router token decimals mismatch.');
    eq(await payments('allowedToken', [token.address]), true, 'Payments token missing.');
    if (token.mock) {
      const demo = (fn) => read(ROOTS.demo, token.address, fn);
      eq(await demo('decimals'), token.decimals, 'Demo decimals mismatch.');
      eq(await demo('CHAIN_ID'), BigInt(ARC.chainId), 'Demo chain mismatch.');
      eq(await demo('name'), `Orbital Demo Dollar ${token.decimals}`, 'Demo name mismatch.');
      eq(await demo('symbol'), token.symbol, 'Demo symbol mismatch.');
      eq(await demo('FAUCET_AMOUNT'), 1000n * 10n ** BigInt(token.decimals), 'Demo faucet amount mismatch.');
      eq(await demo('COOLDOWN'), 86400n, 'Demo faucet cooldown mismatch.');
    }
  }
  eq(await router('allowedToken', [zeroAddress]), false, 'Router allows native token.');
  eq(await payments('allowedToken', [zeroAddress]), false, 'Payments allows native token.');
  eq((await rpc('eth_getBlockByNumber', [block.number, false])).hash, block.hash, 'Verification block was orphaned.');
  return {blockNumber: block.number, blockHash: block.hash, owner: zeroAddress, eip712DomainVerified: true,
    ...(plan.aquaDeployment === 'project-deployed-upstream' ? {aquaHelperOwner: plan.deployer, aquaMulticallVerified: true} : {})};
}

async function verifiedCompletion(path, {readOnly = false} = {}) {
  const {plan, build, rpc} = await loadPlan(path), state = await stateFor(path, plan);
  await network(rpc);
  if (readOnly) {
    if (state.pendingHash || state.confirmed.length !== plan.steps.length) fail('Active deployment state must already be complete; read-only verification cannot advance it.');
    for (let i = 0; i < state.confirmed.length; i++) await verifyEntry(rpc, plan, plan.steps[i], state.confirmed[i]);
  } else await refresh(path, plan, state, rpc);
  if (state.pendingHash || state.confirmed.length !== plan.steps.length) fail('All deployment and ownership-renunciation receipts are required before activation.');
  const observation = await preflight(rpc, plan.deployer, plan.evidence, aquaPreflightOptions(plan, state));
  eq(observation.usdcCodeHash, plan.observation.usdcCodeHash, 'Arc system USDC runtime changed since deployment preparation.');
  const blockers = observation.blockers.filter(b => !b.includes('needs Arc testnet USDC'));
  if (blockers.length) fail(blockers.join(' '));
  const verifiedBindings = await bindings(plan, build, rpc);
  const manifest = {verified: true, chainId: ARC.chainId, rpcUrl: plan.rpcUrl, explorerUrl: ARC.explorerUrl,
    aqua: plan.addresses.aqua, router: plan.addresses.router, payments: plan.addresses.payments, usdc: ARC.usdc,
    startBlock: BigInt(state.confirmed[0].receipt.blockNumber).toString(), tokens: plan.tokens};
  return {plan, state, manifest, observation, bindings: verifiedBindings};
}

export async function activateArcDeployment(planPath = DEFAULT_PLAN) {
  return locked(planPath, async path => {
    const result = await verifiedCompletion(path);
    const existing = await readJson(resolve(activeDirectory, 'manifest.json'), null);
    if (existing) eq(existing, result.manifest, 'A different Arc deployment is already active. Archive and review it explicitly before replacement.');
    const report = {schemaVersion: 1, verified: true, scope: 'arc-testnet-runtime-identity',
      aquaDeployment: result.plan.aquaDeployment ?? 'existing-authenticated',
      releaseAccepted: false, privyVerified: false, sponsorQualificationVerified: false,
      planPath: path, planId: result.plan.planId, verifiedAt: new Date().toISOString(), manifest: result.manifest,
      observation: result.observation, bindings: result.bindings,
      receipts: result.state.confirmed.map(entry => ({hash: entry.hash, receipt: entry.receipt, runtime: entry.runtime})),
      limitations: ['Numerical and release campaigns remain open.', 'Real Privy swap and invoice receipts must be demonstrated separately.',
        result.plan.aquaDeployment === 'project-deployed-upstream'
          ? 'AquaRouter is project-deployed unchanged upstream source at a project address; it is not the canonical 1inch deployment. Sponsor acceptance remains unverified.'
          : 'Aqua provenance is a retained human-reviewed source record, not an automatic sponsor endorsement.']};
    // Publish verification first; the manifest is the final enabling write.
    await save(resolve(activeDirectory, 'verification.json'), report);
    await save(resolve(activeDirectory, 'manifest.json'), result.manifest);
    return {activated: true, manifestPath: resolve(activeDirectory, 'manifest.json'), verificationPath: resolve(activeDirectory, 'verification.json')};
  });
}

export async function verifyActiveArcDeployment() {
  const report = await readJson(resolve(activeDirectory, 'verification.json'));
  if (report.schemaVersion !== 1 || report.verified !== true || report.scope !== 'arc-testnet-runtime-identity' || typeof report.planPath !== 'string') fail('Arc has no completed deployment verification report.');
  // Read-only: an active deployment has no pending entries to promote or save.
  const result = await verifiedCompletion(report.planPath, {readOnly: true});
  eq(report.planId, result.plan.planId, 'Active report plan mismatch.');
  eq(report.aquaDeployment ?? 'existing-authenticated', result.plan.aquaDeployment ?? 'existing-authenticated', 'Active Aqua provenance mismatch.');
  eq(report.observation?.usdcCodeHash, result.observation.usdcCodeHash, 'Arc system USDC runtime differs from activation evidence.');
  eq(report.observation?.aquaCodeHash, result.observation.aquaCodeHash, 'Aqua runtime differs from activation evidence.');
  eq(report.manifest, result.manifest, 'Active report manifest mismatch.');
  eq(await readJson(resolve(activeDirectory, 'manifest.json')), result.manifest, 'Active manifest differs from verified deployment.');
  eq(report.receipts, result.state.confirmed.map(entry => ({hash: entry.hash, receipt: entry.receipt, runtime: entry.runtime})), 'Active receipt evidence changed.');
  return {verified: true, chainId: ARC.chainId, contracts: result.plan.addresses, asOf: result.bindings,
    aquaDeployment: result.plan.aquaDeployment ?? 'existing-authenticated',
    releaseAccepted: false, privyVerified: false, sponsorQualificationVerified: false};
}
