import {defineConfig} from '@playwright/test';
const baseURL=process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:3100';
// This suite checks development workflows, not production latency budgets.
export default defineConfig({testDir:'./test',workers:1,timeout:90000,expect:{timeout:30000},use:{baseURL,channel:process.env.PLAYWRIGHT_CHANNEL,screenshot:'only-on-failure'},webServer:{command:`pnpm dev --hostname 127.0.0.1 --port ${new URL(baseURL).port}`,url:baseURL,reuseExistingServer:!!process.env.PLAYWRIGHT_BASE_URL,timeout:Number(process.env.PLAYWRIGHT_SERVER_TIMEOUT_MS??120000),env:{NEXT_PUBLIC_PRIVY_APP_ID:'',ORBITAL_E2E:'1'}}});
