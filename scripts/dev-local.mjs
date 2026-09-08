import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),manifestPath=resolve(root,'deployments/31337/manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(manifest.chainId!==31337||manifest.rpcUrl!=='http://127.0.0.1:8545'||manifest.verified!==true)throw Error('Run pnpm deploy:local first');
const env={...process.env,DATABASE_URL:process.env.DATABASE_URL??'postgresql://orbital:orbital_local_only@localhost:5432/orbital',DEPLOYMENT_MANIFEST:manifestPath,
 PUBLIC_APP_URL:'http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3002',NEXT_PUBLIC_API_URL:'http://127.0.0.1:3001',
 NEXT_PUBLIC_CHAIN_ID:'31337',NEXT_PUBLIC_LOCAL_DEMO_WALLET:'true',NEXT_PUBLIC_PRIVY_APP_ID:'',HOST:'127.0.0.1',PORT:'3001',INDEXER_POLL_MS:'250',PROOF_MANIFEST:resolve(root,'test/evidence/builds/proof.json')};
const commands=[['API',['apps/api/node_modules/tsx/dist/cli.mjs','apps/api/src/index.ts'],root],
 ['Indexer',['apps/indexer/node_modules/tsx/dist/cli.mjs','apps/indexer/src/index.ts'],root],
 ['Web',['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],resolve(root,'apps/web')]];
const children=[];let closing=false;
function close(){if(closing)return;closing=true;for(const child of children){
 if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 else child.kill();
}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);
for(const [label,args,cwd] of commands){
 const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'inherit'});children.push(child);
 child.on('error',()=>{console.error(`${label} could not start`);process.exitCode=1;close();});
 child.on('exit',code=>{if(!closing){console.error(`${label} exited (${code}); stopping owned application processes.`);process.exitCode=code||1;close();}});
}
console.log('Local Orbital: http://127.0.0.1:3000 — explicit Anvil wallet fixtures, no Privy qualification claim.');
