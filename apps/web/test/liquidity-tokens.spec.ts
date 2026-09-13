import {test,expect,type Page} from '@playwright/test';
import {encodeFunctionResult,erc20Abi,type Address} from 'viem';
import {prepareStrategyProfile,configToDTO,configFromDTO,hashConfig,lifecycleAbi} from '@orbital/sdk';
import wire from '../../../packages/sdk/test/fixtures/payment-observations.json' with {type:'json'};
import {setupSwap} from './fixtures/swap';
const manifest={...structuredClone(wire[0]!.manifest),chainId:5042002};
manifest.tokens.find(t=>t.address.toLowerCase()===manifest.usdc.toLowerCase())!.mock=false;
const headers={'access-control-allow-origin':'*','cache-control':'no-store'};
async function review(page:Page){
 await page.getByRole('button',{name:'Choose concentration',exact:true}).click();
 await page.getByRole('button',{name:'Review strategy',exact:true}).click();
}
for(const width of [1440,390,320])test(`liquidity selection, allocation, and pair preview work at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/deployment',route=>route.fulfill({headers,json:manifest}));
 await page.goto('/liquidity/new');
 const basket=page.getByRole('group',{name:'Strategy tokens'}),preview=page.getByRole('complementary',{name:'Strategy preview'});
 await expect(basket.getByRole('checkbox')).toHaveCount(3);
 await expect(basket.getByRole('checkbox',{checked:true})).toHaveCount(2);
 await basket.getByRole('checkbox',{name:'Include oUSD18',exact:true}).check();
 await expect(preview.getByText('Trading pairs (3)',{exact:true})).toBeVisible();
 await expect(page.getByText('30 total units',{exact:true})).toBeVisible();
 await basket.getByRole('checkbox',{name:'Include USDC',exact:true}).uncheck();
 await expect(preview.getByText('oUSD6 ↔ oUSD18',{exact:true})).toBeVisible();
 await expect(preview.getByText('USDC',{exact:true})).toHaveCount(0);
 await basket.getByRole('checkbox',{name:'Include oUSD6',exact:true}).focus();await page.keyboard.press('Space');
 await expect(page.getByText('Choose at least two tokens to continue.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Choose concentration',exact:true})).toBeDisabled();
 await basket.getByRole('checkbox',{name:'Include oUSD6',exact:true}).check();
 await page.getByLabel('Allocate per asset',{exact:true}).fill('25');
 await expect(page.getByText('50 total units',{exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`/tmp/orbital-liquidity-selected-${width}.png`,fullPage:true});
 await review(page);
 await expect(page.getByText('This strategy includes oUSD6, oUSD18: demo tokens with no redemption value.',{exact:true})).toBeVisible();
 await expect(page.getByText('25 units',{exact:true})).toBeVisible();
 await expect(page.getByRole('main').getByRole('button',{name:'Connect wallet',exact:true})).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('the selection reads the deployment allowlist and supports eight assets',async({page})=>{
 const expanded=structuredClone(manifest);
 for(let i=3;i<8;i++)expanded.tokens.push({address:`0x${(100+i).toString(16).padStart(40,'0')}`,symbol:`TEST${i}`,decimals:18,mock:true});
 await page.route('**/deployment',route=>route.fulfill({headers,json:expanded}));
 await page.goto('/liquidity/new');
 const basket=page.getByRole('group',{name:'Strategy tokens'});
 await expect(basket.getByRole('checkbox')).toHaveCount(8);
 for(const checkbox of await basket.getByRole('checkbox').all())await checkbox.check();
 await expect(basket.getByRole('checkbox',{checked:true})).toHaveCount(8);
 await expect(page.getByText('80 total units',{exact:true})).toBeVisible();
 await page.getByText('Trading pairs (28)',{exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Strategy preview'}).getByRole('listitem')).toHaveCount(28);
 await review(page);
 await expect(page.getByText('10 units',{exact:true})).toBeVisible();
});

test('publication preserves the selected pair after reload and restores legacy three-token drafts',async({page})=>{
 const fixture=await setupSwap(page,{blank:true}),m=fixture.f.manifest,account=fixture.f.request.wallet as Address;
 let nonce=0n;
 // Reuse the existing synthetic wallet/RPC fixture. Only reads are permitted.
 await page.route(url=>url.origin==='https://rpc.testnet.arc.io'||url.pathname==='/api/chain',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const q=route.request().postDataJSON();
  if(q.method!=='eth_call')return route.fallback();
  const tx=q.params[0];let result:string;
  if(tx.data.startsWith('0x70a08231')){
   const token=m.tokens.find(t=>t.address.toLowerCase()===tx.to.toLowerCase())!;
   result=encodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',result:1000n*10n**BigInt(token.decimals)});
  }else if(tx.to.toLowerCase()===m.router.toLowerCase())result=encodeFunctionResult({abi:lifecycleAbi,functionName:'nextMakerNonce',result:nonce});
  else return route.fallback();
  return route.fulfill({headers,json:{jsonrpc:'2.0',id:q.id,result}});
 });
 await page.goto('/liquidity/new');
 const basket=page.getByRole('group',{name:'Strategy tokens'});
 await expect(basket.getByRole('checkbox')).toHaveCount(3);
 await basket.getByRole('checkbox',{name:'Include oUSD18',exact:true}).check();
 await basket.getByRole('checkbox',{name:'Include oUSD6',exact:true}).uncheck();
 await review(page);
 for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
 await page.getByRole('button',{name:'Prepare publication',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Publish from your wallet.',exact:true})).toBeVisible();
 const key=`orbital:publication:1:${m.chainId}:${m.router.toLowerCase()}:${account.toLowerCase()}`;
 const saved=JSON.parse((await page.evaluate(key=>localStorage.getItem(key),key))!);
 expect(saved.profile.tokens).toHaveLength(2);expect(saved.config.tokens).toHaveLength(2);
 expect(saved.config.tokens).toEqual(m.tokens.filter(t=>t.symbol!=='oUSD6').map(t=>t.address).sort());
 expect(hashConfig(configFromDTO(saved.config))).toBe(prepareStrategyProfile(m,account,0n,saved.profile).configHash);
 await page.goto('/liquidity');
 const unfinished=page.getByRole('region',{name:'Saved publication'});
 await expect(unfinished).toBeVisible({timeout:10000});
 await expect(unfinished).toContainText('USDC / oUSD18');
 await expect(unfinished).toContainText('Approvals alone do not publish a strategy.');
 await unfinished.getByRole('link',{name:'Continue publication',exact:true}).click();
 await expect(page.getByText('Approve tokens → Publish allocation → Activate strategy',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByText('Saved publication restored.',{exact:false})).toBeVisible();
 await expect(page.locator('main dl dt')).toHaveText(['USDC','oUSD18']);
 const oldProfile={allocation:'10',preset:'Balanced',feePpm:500} as const;
 const old=prepareStrategyProfile(m,account,0n,oldProfile);
 await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:JSON.stringify({schemaVersion:1,profile:oldProfile,config:configToDTO(old.config)})});
 await page.reload();
 await expect(page.getByText('Saved publication restored.',{exact:false})).toBeVisible();
 await expect(page.locator('main dl dt')).toHaveText(old.config.tokens.map(a=>m.tokens.find(t=>t.address.toLowerCase()===a.toLowerCase())!.symbol));
 await page.goto('/liquidity');await expect(unfinished).toBeVisible();
 nonce=1n;await page.reload();await expect(unfinished).toHaveCount(0);
 nonce=0n;await page.reload();await expect(unfinished).toBeVisible();
 await page.evaluate(()=>{(window as any).swapExecutionWallet.account('0x0000000000000000000000000000000000000099');});
 await expect(unfinished).toHaveCount(0);
 expect(fixture.sent.size).toBe(0);
});
