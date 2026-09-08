import {readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {inspectArc, verifyActiveArcDeployment, DEFAULT_PLAN} from './lib/arc-deployment.mjs';

// Network inspection must never overwrite an activated verification report.
try {
  const {values} = parseArgs({options: {deployer: {type: 'string'}}, allowPositionals: false});
  let active = false;
  try { await access(fileURLToPath(new URL('../deployments/5042002/manifest.json', import.meta.url))); active = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let result;
  if (active) result = await verifyActiveArcDeployment();
  else {
    let plan;
    try { plan = JSON.parse(await readFile(DEFAULT_PLAN, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    result = await inspectArc({deployer: values.deployer ?? process.env.ARC_DEPLOYER_ADDRESS ?? plan?.deployer});
    result.financialExecutionEnabled = false;
    result.note = 'Read-only network observation; no active Orbital deployment is configured.';
    process.exitCode = 2;
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ARC_NETWORK_VERIFICATION_FAILED');
  process.exitCode = 1;
}
