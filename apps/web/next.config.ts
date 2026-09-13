import type {NextConfig} from 'next';
import path from 'node:path';
const config:NextConfig={transpilePackages:['@orbital/sdk','@orbital/shared'],poweredByHeader:false,devIndicators:false,
 outputFileTracingRoot:path.join(__dirname,'../..'),outputFileTracingIncludes:{'/api/chain':['../../deployments/5042002/hosted-manifest.json']},
 distDir:process.env.ORBITAL_E2E==='1'?'.next-e2e':process.env.ORBITAL_PROFILE==='arc'?'.next-arc':'.next'};
export default config;
