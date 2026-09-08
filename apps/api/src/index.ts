import {createServer} from './server.js';
import {fileURLToPath} from 'node:url';
const app=await createServer({manifestPath:process.env.DEPLOYMENT_MANIFEST,databaseUrl:process.env.DATABASE_URL,proofPath:process.env.PROOF_MANIFEST??fileURLToPath(new URL('../../../test/evidence/builds/proof.json',import.meta.url))});
await app.listen({port:Number(process.env.PORT??3001),host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close();});
