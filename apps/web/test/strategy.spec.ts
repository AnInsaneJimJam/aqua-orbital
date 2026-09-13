import {selectValue} from './fixtures/select';
import {test,expect,type Page} from '@playwright/test';
import {strategyObservation,strategyListing,strategyRecord,strategyManifest,maker,hash,address} from '../../../packages/sdk/test/fixtures/strategy';
const id=strategyRecord().orderHash,path=`/liquidity/${id}`,headers={'access-control-allow-origin':'*','cache-control':'no-store'};
async function fixture(page:Page,response:()=>unknown=strategyObservation,status:()=>number=()=>200){
 await page.clock.install({time:new Date('2026-09-08T06:00:00.100Z')});
 await page.route('**/deployment',route=>route.fulfill({headers,json:strategyManifest}));
 await page.route('**/strategies/0x*',route=>route.fulfill({headers,json:response(),status:status()}));
}
async function wallet(page:Page){
 await page.addInitScript(({maker})=>{
  let connected=false;let current:string=maker;const listeners=new Map<string,Set<(value:unknown)=>void>>();
  const provider={isMetaMask:true,on:(event:string,fn:(v:unknown)=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn);return provider;},removeListener:(event:string,fn:(v:unknown)=>void)=>{listeners.get(event)?.delete(fn);return provider;},request:async({method}:{method:string})=>{
   if(method==='eth_requestAccounts'){connected=true;return [current];}if(method==='eth_accounts')return connected?[current]:[];if(method==='eth_chainId')return '0x4cef52';if(method==='wallet_getCapabilities')return {};throw Error(`Unexpected wallet method ${method}`);
  }};Object.defineProperty(window,'ethereum',{value:provider,configurable:true});Object.assign(window,{strategyWallet:{account:(next:string)=>{current=next;for(const fn of listeners.get('accountsChanged')??[])fn([next]);}}});
 },{maker});
}
test('public strategy detail separates exact principal, received fees and funded capacity on mobile',async({page},testInfo)=>{
 await fixture(page);await page.setViewportSize({width:320,height:680});await page.goto(path);
 await expect(page.getByRole('heading',{name:'USDC / oUSD6 / oUSD18',exact:true})).toBeVisible();
 await expect(page.getByText('Active / available at observed block',{exact:true})).toBeVisible();
 const usdc=page.getByRole('region',{name:'USDC inventory'});
 await usdc.getByText('Principal & backing',{exact:true}).click();
 await expect(usdc.getByText('300.000000000000000001 USDC',{exact:true})).toBeVisible();await expect(usdc.getByText('0.000007 USDC',{exact:true})).toBeVisible();
 await expect(usdc.getByText('300 USDC',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByText('Configuration and receipts',{exact:true}).click();
 await expect(page.getByRole('link',{name:'Latest fill receipt'})).toHaveAttribute('href',`https://testnet.arcscan.app/tx/${hash(214)}`);
 await expect(page.getByText('Tick 1 · Interior',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:testInfo.outputPath('strategy-detail-mobile.png'),fullPage:true});
});
test('failed or wrong-deployment refresh removes earlier financial observations',async({page})=>{
 let response:unknown=strategyObservation();await fixture(page,()=>response);await page.goto(path);
 await expect(page.getByRole('region',{name:'USDC inventory'})).toBeVisible();response={...strategyObservation(),deploymentId:hash(999)};
 await page.getByRole('button',{name:'Refresh strategy',exact:true}).click();await expect(page.getByRole('heading',{name:'Strategy unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'USDC inventory'})).toHaveCount(0);
});
test('stale and historical strategy observations remain labeled and cannot claim present capacity',async({page})=>{
 const value={...strategyObservation(),status:'stale',code:'STRATEGIES_STALE',historical:true,currentIndexedBlock:{height:'16',hash:hash(116)},freshness:{...strategyObservation().freshness,ageMs:11000,head:'18',stale:true}};
 await fixture(page,()=>value);await page.goto(path);await page.getByText('Observation details',{exact:true}).click();await expect(page.getByText('Historical observation at block 15.',{exact:true})).toBeVisible();
 await expect(page.getByText('This observation is stale. Refresh before relying on these amounts.',{exact:true})).toBeVisible();
 await expect(page.getByText('Last observed: Active / available',{exact:true})).toBeVisible();
});
test('absence needs a valid indexed 404 and an invalid strategy ID sends no detail request',async({page})=>{
 let requests=0;await fixture(page,()=>{requests++;return {...strategyObservation(),code:'STRATEGY_NOT_FOUND',data:{strategy:null},retryable:false,field:'hash'};},()=>404);
 await page.goto(path);await expect(page.getByRole('heading',{name:'Strategy not found',exact:true})).toBeVisible();
 const before=requests;await page.goto('/liquidity/bad-id');await expect(page.getByRole('heading',{name:'Invalid identifier',exact:true})).toBeVisible();expect(requests).toBe(before);
});
test('owner listing is wallet scoped, filters canonical history and keeps missing shipment coverage explicit',async({page})=>{
 await wallet(page);await fixture(page);const requested:string[]=[];
 await page.route('**/makers/*/strategies?*',route=>{const url=new URL(route.request().url());requested.push(url.pathname+url.search);const found=url.pathname.includes(maker)&&url.searchParams.get('status')==='all';return route.fulfill({headers,json:strategyListing(found?[strategyRecord()]:[])});});
 await page.goto('/liquidity');await expect(page.getByRole('heading',{name:'Your wallet is your starting point.',exact:true})).toBeVisible();expect(requested).toHaveLength(0);
 await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByRole('link',{name:'Manage strategy',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Incomplete Aqua allocations'})).toBeVisible();
 await expect(page.getByText('Resume activation with the matching strategy draft saved in this browser.',{exact:true})).toBeVisible();
 await selectValue(page,'Strategy status','retired');await expect(page.getByText('No registered strategies match this filter.',{exact:true})).toBeVisible();
 await selectValue(page,'Strategy status','all');await expect(page.getByRole('link',{name:'Manage strategy',exact:true})).toBeVisible();
 await page.evaluate(next=>(window as any).strategyWallet.account(next),address(21));
 await expect(page.getByText('No registered strategies in this wallet.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Manage strategy',exact:true})).toHaveCount(0);
 expect(requested.at(-1)).toContain(address(21));
});
test('listing pagination binds its pin and an orphaned cursor offers a fresh restart',async({page})=>{
 await wallet(page);await fixture(page);const initial=strategyListing(),r=initial.data.items[0]!,cursor=Buffer.from(JSON.stringify({version:1,chainId:strategyManifest.chainId,deploymentId:initial.deploymentId,filters:{maker,status:'all'},pin:initial.asOf,after:{blockNumber:r.updated.blockNumber,logIndex:r.updated.logIndex,orderHash:r.orderHash}})).toString('base64url');
 initial.data.nextCursor=cursor;let stale=false;
 await page.route('**/makers/*/strategies?*',route=>{const next=new URL(route.request().url()).searchParams.get('cursor');if(next){expect(next).toBe(cursor);stale=true;return route.fulfill({headers,status:409,json:{code:'STRATEGY_CURSOR_ORPHANED'}});}return route.fulfill({headers,json:initial});});
 await page.goto('/liquidity');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
 await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByRole('heading',{name:'Strategy list unavailable',exact:true})).toBeVisible();expect(stale).toBeTruthy();
 await page.getByRole('button',{name:'Restart listing',exact:true}).click();await expect(page.getByRole('link',{name:'Manage strategy',exact:true})).toBeVisible();
});
