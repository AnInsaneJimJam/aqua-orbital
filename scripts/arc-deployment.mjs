import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {inspectArc, prepareArcDeployment, getArcStatus, recordArcTransaction,
  activateArcDeployment, verifyActiveArcDeployment, DEFAULT_PLAN} from './lib/arc-deployment.mjs';

async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    deployer: {type: 'string'}, plan: {type: 'string'}, 'aqua-evidence': {type: 'string'}, hash: {type: 'string'},
  }});
  const [command] = positionals;
  if (positionals.length !== 1 || !['inspect', 'prepare', 'status', 'record', 'activate', 'verify-active'].includes(command)) {
    throw Error('Usage: pnpm deploy:arc inspect|prepare --deployer ADDRESS [--aqua-evidence FILE] [--plan FILE]; status|record|activate --plan FILE [--hash HASH]; verify-active. Browser signing: pnpm deploy:arc:wallet --plan FILE.');
  }
  const planPath = values.plan ?? DEFAULT_PLAN;
  const evidence = values['aqua-evidence'] ? JSON.parse(await readFile(values['aqua-evidence'], 'utf8')) : null;
  let result;
  if (command === 'inspect' || command === 'prepare') {
    const args = {deployer: values.deployer ?? process.env.ARC_DEPLOYER_ADDRESS, evidence, planPath};
    result = await (command === 'inspect' ? inspectArc(args) : prepareArcDeployment(args));
  } else if (command === 'status') result = await getArcStatus(planPath);
  else if (command === 'record') result = await recordArcTransaction(planPath, values.hash);
  else if (command === 'activate') result = await activateArcDeployment(planPath);
  else result = await verifyActiveArcDeployment();
  console.log(JSON.stringify(result, null, 2));
  if (result.blockers?.length) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'ARC_DEPLOYMENT_FAILED'); process.exitCode = 1; });
