import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalDeployment} from './lib/local-deployment-runner.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const env={...process.env,DATABASE_URL:process.env.DATABASE_URL??'postgresql://orbital:orbital_local_only@localhost:5432/orbital'};
function run(file,args){return new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${file} exited ${code}`)));});}
try{
 await run('docker',['compose','up','-d','postgres','anvil-state','--wait']);
 await run('forge',['build','--root','packages/contracts','--skip','test','--skip','script']);
 await run(process.execPath,['packages/db/node_modules/tsx/dist/cli.mjs','packages/db/src/migrate.ts']);
 await runLocalDeployment({persistent:true});
 await run(process.execPath,['packages/sdk/node_modules/tsx/dist/cli.mjs','packages/sdk/scripts/local-demo.ts']);
 console.log('Local setup complete. Run pnpm dev:local, then open http://127.0.0.1:3000');
}catch(e){console.error(e instanceof Error?e.message:'Local setup failed');process.exitCode=1;}
