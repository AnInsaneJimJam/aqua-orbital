import type {NextConfig} from 'next';
const config:NextConfig={transpilePackages:['@orbital/sdk','@orbital/shared'],poweredByHeader:false,devIndicators:false,distDir:process.env.ORBITAL_E2E==='1'?'.next-e2e':'.next'};
export default config;
