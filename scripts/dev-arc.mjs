import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(root, 'deployments/5042002/manifest.json');
const canonicalRpc = 'https://rpc.testnet.arc.io';
const usdc = '0x3600000000000000000000000000000000000000';
const origins = 'http://localhost:3002,http://127.0.0.1:3002';
const children = new Set();
let closing = false;

function stop() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      // Only process trees created by this runner are eligible for cleanup.
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
      killer.on('error', () => child.kill());
    } else child.kill('SIGTERM');
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);

function start(label, args, cwd, env, guard = false) {
  const child = spawn(process.execPath, args, {cwd, env, windowsHide: true, stdio: 'inherit'});
  children.add(child);
  return new Promise((accept, reject) => {
    child.once('spawn', () => { if (!guard) accept(child); });
    child.once('error', () => {
      children.delete(child);
      process.exitCode = 1;
      stop();
      reject(Error(`${label} could not start. Run pnpm install --frozen-lockfile and retry.`));
    });
    child.once('exit', (code) => {
      children.delete(child);
      if (guard) {
        if (code === 0 && !closing) accept(child);
        else reject(Error(`${label} did not pass. Resolve the reported deployment prerequisites before starting the live profile.`));
      } else if (!closing) {
        console.error(`${label} exited (${code ?? 'signal'}); stopping only this Arc profile's processes.`);
        process.exitCode = code || 1;
        stop();
      }
    });
  });
}

async function availablePort(port) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', () => reject(Error(`Port ${port} is occupied. Close the process using that port or its previous Arc runner, then retry. Local ports 3000/3001 are independent.`)));
    server.listen({host: '127.0.0.1', port, exclusive: true}, () => server.close(accept));
  });
}

async function optionalFile(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw Error('Could not read the Arc profile configuration. Check file permissions.');
  }
}

function publicRpc(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error();
    return url.href.replace(/\/$/, '');
  } catch { throw Error('Arc requires a valid HTTPS RPC URL without embedded credentials or a fragment.'); }
}

async function verifyRpc(rpcUrl) {
  async function request(method, params = []) {
    let response;
    try {
      response = await fetch(rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(15_000)});
      if (!response.ok) throw Error();
      const result = await response.json();
      if (result.error || result.result === undefined) throw Error();
      return result.result;
    } catch { throw Error('Arc RPC preflight failed. Check internet access and the configured public Arc RPC, then retry. No processes were started.'); }
  }
  if (await request('eth_chainId') !== '0x4cef52') throw Error('RPC chain mismatch: this profile requires Arc Testnet, chain 5042002.');
  const block = await request('eth_getBlockByNumber', ['latest', false]);
  if (!block || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)) throw Error('Arc RPC returned an invalid block identity.');
  const pin = {blockHash: block.hash, requireCanonical: true};
  const [code, decimals] = await Promise.all([
    request('eth_getCode', [usdc, pin]),
    request('eth_call', [{to: usdc, data: '0x313ce567'}, pin]),
  ]);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) ||
      decimals !== `0x${'0'.repeat(63)}6`) throw Error('Arc USDC identity preflight failed: the system address must contain code and expose six ERC-20 decimals.');
  console.log(`Arc Testnet RPC and six-decimal system USDC observed at block ${BigInt(block.number)}. This does not verify an Orbital deployment.`);
}

async function verifyIndexerHistory(primaryUrl, indexerUrl, manifest) {
  const responses = await Promise.allSettled([primaryUrl, indexerUrl].map(async url => {
    const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber',
        params: ['0x' + BigInt(manifest.startBlock).toString(16), false]}), signal: AbortSignal.timeout(15_000)});
    if (!response.ok) throw Error('Indexer RPC history preflight failed.');
    const body = await response.json();
    if (body.error || !/^0x[0-9a-fA-F]{64}$/.test(body.result?.hash ?? '')) throw Error('Indexer RPC history preflight failed.');
    return body.result.hash.toLowerCase();
  }));
  if (responses.some(result => result.status !== 'fulfilled') || responses[0].value !== responses[1].value) {
    throw Error('The indexer RPC does not agree with the verified deployment RPC at the deployment start block.');
  }
  console.log(`Explicit indexer RPC agrees with the deployment start block: ${new URL(indexerUrl).hostname}.`);
}

async function main() {
  const localEnv = parseEnv(await optionalFile(resolve(root, 'apps/web/.env.local')) ?? '');
  const profileEnv = parseEnv(await optionalFile(resolve(root, '.env.arc.local')) ?? '');
  // Read just the public wallet identifier; never import the file into process.env.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || localEnv.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  if (!appId || !/^[a-zA-Z0-9_-]{8,100}$/.test(appId)) {
    throw Error('Set NEXT_PUBLIC_PRIVY_APP_ID to your public Privy app ID in the process environment or apps/web/.env.local. A Privy app secret is not needed.');
  }
  const manifestText = await optionalFile(manifestPath);
  let manifest;
  if (manifestText !== undefined) {
    try { manifest = JSON.parse(manifestText); }
    catch { throw Error('The Arc manifest is not valid JSON. Regenerate it through the verified deployment workflow.'); }
    const systemToken = Array.isArray(manifest?.tokens) ? manifest.tokens.find(token => typeof token?.address === 'string' && token.address.toLowerCase() === usdc) : undefined;
    if (!manifest || manifest.chainId !== 5042002 || manifest.verified !== true || typeof manifest.usdc !== 'string' || manifest.usdc.toLowerCase() !== usdc ||
        !systemToken || systemToken.decimals !== 6 || systemToken.mock !== false) {
      throw Error('The active Arc manifest must be verified, use chain 5042002 and genuine six-decimal system USDC. Complete the Arc deployment workflow; do not edit verified flags manually.');
    }
  }
  const rpcUrl = publicRpc(process.env.ARC_RPC_URL ?? profileEnv.ARC_RPC_URL ?? manifest?.rpcUrl ?? process.env.NEXT_PUBLIC_ARC_RPC_URL ?? canonicalRpc);
  // Import only named public RPC settings from the optional profile file.
  // Preserve the authenticated deployment artifacts and saved signing plan.
  const indexerRpcUrl = publicRpc(process.env.INDEXER_RPC_URL ?? profileEnv.INDEXER_RPC_URL ?? rpcUrl);
  if (new URL(indexerRpcUrl).search) throw Error('INDEXER_RPC_URL must be public and contain no query parameters.');
  const browserRpc = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? profileEnv.NEXT_PUBLIC_ARC_RPC_URL;
  for (const value of [process.env.ARC_RPC_URL, browserRpc]) {
    if (value && publicRpc(value) !== rpcUrl) throw Error('Arc RPC configuration conflicts with the selected application RPC. Set ARC_RPC_URL and NEXT_PUBLIC_ARC_RPC_URL to the same public endpoint.');
  }
  if (rpcUrl !== canonicalRpc && (!browserRpc || publicRpc(browserRpc) !== rpcUrl)) {
    throw Error('A custom RPC becomes browser-visible. Set NEXT_PUBLIC_ARC_RPC_URL explicitly to the same public endpoint; do not use an endpoint containing a secret.');
  }
  await Promise.all([availablePort(3002), availablePort(3003)]);
  await verifyRpc(rpcUrl);
  if (manifest && indexerRpcUrl !== rpcUrl) {
    await verifyRpc(indexerRpcUrl);
    await verifyIndexerHistory(rpcUrl, indexerRpcUrl, manifest);
  }
  if (closing) return;
  const env = {...process.env};
  for (const name of Object.keys(env)) if (/PRIVATE_KEY|MNEMONIC|SEED_PHRASE|PRIVY_APP_SECRET|AUTHORIZATION_KEY/i.test(name)) delete env[name];
  Object.assign(env, {
    ORBITAL_PROFILE: 'arc', ORBITAL_E2E: '0', CHAIN_ID: '5042002', NEXT_PUBLIC_CHAIN_ID: '5042002',
    ARC_RPC_URL: rpcUrl, NEXT_PUBLIC_ARC_RPC_URL: rpcUrl, NEXT_PUBLIC_LOCAL_DEMO_WALLET: 'false', NEXT_PUBLIC_PRIVY_APP_ID: appId,
    PUBLIC_APP_URL: origins, PUBLIC_API_URL: 'http://127.0.0.1:3003', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3003',
    HOST: '127.0.0.1', PORT: '3003', INDEXER_POLL_MS: process.env.INDEXER_POLL_MS ?? '1000',
    INDEXER_RPC_URL: indexerRpcUrl,
    DEPLOYMENT_MANIFEST: manifest ? manifestPath : '',
    DATABASE_URL: manifest ? process.env.DATABASE_URL ?? 'postgresql://orbital:orbital_local_only@localhost:5432/orbital' : '',
    PROOF_MANIFEST: process.env.PROOF_MANIFEST || resolve(root, 'test/evidence/builds/proof.json'),
  });
  if (manifest) {
    await start('Arc deployment verification', ['scripts/arc-deployment.mjs', 'verify-active', '--rpc-url', rpcUrl], root, env, true);
    // Preserve the historical deployment manifest/report. The application gets
    // an explicitly selected provider only after it reproduces that identity.
    const runtimeDirectory = resolve(root, '.cache/arc-runtime');
    const runtimePath = resolve(runtimeDirectory, 'manifest.json');
    await mkdir(runtimeDirectory, {recursive: true});
    await writeFile(`${runtimePath}.tmp`, JSON.stringify({...manifest, rpcUrl}, null, 2) + '\n');
    await rename(`${runtimePath}.tmp`, runtimePath);
    env.DEPLOYMENT_MANIFEST = runtimePath;
  }
  if (closing) return;
  await start('Arc API', ['apps/api/node_modules/tsx/dist/cli.mjs', 'apps/api/src/index.ts'], root, env);
  if (closing) return;
  if (manifest) await start('Arc indexer', ['apps/indexer/node_modules/tsx/dist/cli.mjs', 'apps/indexer/src/index.ts'], root, env);
  if (closing) return;
  await start('Arc web', ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3002'], resolve(root, 'apps/web'), env);
  console.log('Arc wallet profile: http://127.0.0.1:3002 — API http://127.0.0.1:3003. Ctrl+C stops only these application processes.');
  if (!manifest) console.log('Login-only mode: no verified Arc deployment. Public browsing and Privy login are available; financial API routes report DEPLOYMENT_UNAVAILABLE. No indexer or database connection is started.');
  else console.log(`Verified deployment loaded using ${new URL(rpcUrl).hostname}. Wait for indexer readiness before reviewing transactions. This runner never signs or submits transactions.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'ARC_PROFILE_START_FAILED');
  process.exitCode = 1;
  stop();
});
