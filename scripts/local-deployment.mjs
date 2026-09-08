import {parseAction} from './lib/local-deployment.mjs';
import {buildLocalPlan,runLocalDeployment} from './lib/local-deployment-runner.mjs';
try{
 const action=parseAction(process.argv.slice(2));
 if(action==='plan'){
  const {graph,upstream}=await buildLocalPlan();
  console.log(JSON.stringify({scope:'disposable-local-only',verified:false,compiler:'0.8.30',evm:'cancun',optimizerRuns:700,viaIR:true,upstream:{url:upstream.url,revision:upstream.revision},
   nodes:graph.nodes.map(n=>({identity:n.fqn,dependencies:n.dependencies,runtimeBytes:n.runtimeBytes,runtimeBudgetRemaining:24576-n.runtimeBytes,artifactSha256:n.integrity.artifactSha256}))},null,2));
 }else{
  const {report,directory}=await runLocalDeployment({persistent:action==='persistent'});console.log(JSON.stringify({status:report.status,verified:report.manifest.verified,scope:report.scope,chainStopped:report.chainStopped,contracts:report.contracts.length,receipts:report.receipts.length,evidence:directory},null,2));
 }
}catch(error){console.error(error instanceof Error?error.message:'LOCAL_DEPLOYMENT_FAILED');process.exitCode=1;}
