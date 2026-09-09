import {test,expect,type Page} from '@playwright/test';
import wire from '../../../packages/sdk/test/fixtures/payment-observations.json' with {type:'json'};

const evidence='../../test/evidence/frontend-polish';
const manifest={...structuredClone(wire[0]!.manifest),chainId:5042002};
const headers={'access-control-allow-origin':'*','cache-control':'no-store'};

// Presentation fixtures only. This suite never connects a wallet or submits a plan.
async function publicPresentation(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return route.abort('blockedbyclient');
  return route.fallback();
 });
 await page.route('**/deployment',route=>route.fulfill({headers,json:manifest}));
 await page.route('**/proof',route=>{
  if(route.request().resourceType()==='document'||route.request().headers().rsc)return route.fallback();
  return route.fulfill({headers,json:{generatedAt:null,items:[{id:'presentation-fixture',label:'Presentation check',status:'planned',detail:'Development fixture for layout review. No live protocol claim.'}]}});
 });
}

async function ready(page:Page){
 // A modal correctly hides the underlying page from the accessibility tree.
 await expect(page.locator('main h1')).toBeVisible();
 await page.evaluate(async()=>{await document.fonts.ready;});
}

async function noOverflow(page:Page){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
}

async function capture(page:Page,name:string){
 await ready(page);
 await noOverflow(page);
 // Full-page capture resizes the viewport, which intentionally closes Radix menus.
 const overlay=await page.getByRole('dialog').count()>0||await page.getByRole('listbox').count()>0;
 await page.screenshot({path:`${evidence}/${name}.png`,fullPage:!overlay,animations:'disabled',style:'nextjs-portal { visibility: hidden !important; }'});
}

test.beforeEach(async({page})=>publicPresentation(page));

test('public navigation, local back links and contextual demo disclosure',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 await ready(page);
 const navigation=page.getByRole('navigation',{name:'Main navigation'});
 await expect(navigation.getByRole('link')).toHaveCount(5);
 for(const name of ['Swap','Liquidity','Payments','Demo tokens','Protocol notes'])await expect(navigation.getByRole('link',{name,exact:true})).toBeVisible();
 await expect(page.getByRole('contentinfo')).not.toContainText(/no redemption value|test assets only|testnet application/i);
 await capture(page,'landing-desktop');
 // Link hover styling must not replace the primary button's dark foreground.
 const startSwap=page.getByRole('link',{name:'Start a swap',exact:true});
 const foreground=await startSwap.evaluate(element=>getComputedStyle(element).color);
 await startSwap.hover();
 await expect.poll(()=>startSwap.evaluate(element=>getComputedStyle(element).color)).toBe(foreground);
 expect(await startSwap.locator('svg').evaluate(element=>getComputedStyle(element).color)).toBe(foreground);
 await capture(page,'landing-hover-desktop');


 await navigation.getByRole('link',{name:'Demo tokens',exact:true}).click();
 await expect(page).toHaveURL(/\/fund$/);
 await expect(navigation.getByRole('link',{name:'Demo tokens',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('region',{name:'Demo token faucet'})).toContainText('Demo tokens have no redemption value.');
 await expect(page.getByRole('link',{name:'Open Circle faucet'})).toHaveAttribute('href','https://faucet.circle.com');
 await capture(page,'funding-desktop');

 await page.getByRole('navigation',{name:'After funding'}).getByRole('link',{name:'Go to swap'}).click();
 await expect(page).toHaveURL(/\/swap$/);
 await expect(navigation.getByRole('link',{name:'Swap',exact:true})).toHaveAttribute('aria-current','page');
 await navigation.getByRole('link',{name:'Payments',exact:true}).click();
 await expect(page).toHaveURL(/\/pay$/);
 await expect(navigation.getByRole('link',{name:'Payments',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('heading',{name:'Create an invoice',exact:true})).toBeVisible();
 await capture(page,'payments-desktop');

 // Invalid identifiers are handled locally and still expose a working return link.
 await page.goto('/pay/not-an-invoice');
 await expect(page.getByRole('heading',{name:'Invalid identifier',exact:true})).toBeVisible();
 await page.getByRole('main').getByRole('link',{name:'Payments',exact:true}).click();
 await expect(page).toHaveURL(/\/pay$/);
 await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible();
});

test('swap settings modal and nested deadline menu support keyboard navigation at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:800});
 await page.goto('/swap');
 await ready(page);
 const trigger=page.getByRole('button',{name:'Swap settings',exact:true});
 await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Swap settings',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Custom slippage (basis points)',{exact:true})).toBeEnabled();
 await expect(dialog.getByLabel('Custom slippage (basis points)',{exact:true})).toHaveValue('10');
 const deadline=dialog.getByRole('combobox',{name:'Transaction deadline',exact:true});
 await expect(deadline).toHaveText('3 minutes');
 await deadline.focus();
 await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('listbox')).toBeVisible();
 await expect(page.getByRole('option',{name:'3 minutes',exact:true})).toBeFocused();
 await capture(page,'settings-menu-mobile-320');
 await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('option',{name:'10 minutes',exact:true})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('listbox')).toHaveCount(0);
 await expect(deadline).toHaveText('10 minutes');
 await expect(deadline).toBeFocused();

 await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('listbox')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('listbox')).toHaveCount(0);
 await expect(dialog).toBeVisible();
 await expect(deadline).toBeFocused();
 await capture(page,'settings-dialog-mobile-320');
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
 await noOverflow(page);
 await expect(page.getByLabel('You pay',{exact:true})).toHaveValue('');
});

test('public routes share UI typography and fit desktop plus 320px and 390px screens',async({page})=>{
 test.setTimeout(180000);
 const routes=[['/','landing'],['/swap','swap'],['/liquidity','liquidity'],['/liquidity/new','liquidity-new'],['/pay','payments'],['/fund','funding'],['/proof','proof']] as const;
 for(const width of [1440,320,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const [path,name] of routes){
   await page.goto(path);
   await ready(page);
   if(path==='/proof')await expect(page.getByRole('heading',{name:'Presentation check',exact:true})).toBeVisible();
   await noOverflow(page);
   const typography=await page.evaluate(()=>{
    const primary=(family:string)=>family.split(',')[0]!.trim();
    const expected=primary(getComputedStyle(document.body).fontFamily);
    const controls=Array.from(document.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main button, main label')).filter(element=>element.id!=='hero-title'&&element.getClientRects().length>0);
    return {expected,count:controls.length,mismatches:controls.filter(element=>primary(getComputedStyle(element).fontFamily)!==expected).map(element=>({text:element.textContent?.trim(),family:getComputedStyle(element).fontFamily}))};
   });
   expect(typography.count,`${path} exposes visible UI typography`).toBeGreaterThan(0);
   expect(typography.mismatches,`${path} at ${width}px should share ${typography.expected}`).toEqual([]);
   if(width!==1440)await capture(page,`${name}-mobile-${width}`);
  }
 }
});


test('protocol notes navigation, evidence links and recoloured brand fit desktop and mobile',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');await ready(page);
 const navigation=page.getByRole('navigation',{name:'Main navigation'});
 await expect(navigation.getByRole('link')).toHaveCount(5);
 const logo=page.getByRole('link',{name:'Orbital home'}).locator('img');
 expect(await logo.evaluate(element=>getComputedStyle(element).filter)).toBe('none');
 const svg=await (await page.request.get('/brand/orbital.svg')).text();
 expect(svg).toContain('fill="#f2f0e7"');expect(svg).toContain('fill="#c5f36b"');
 const startSwap=page.getByRole('link',{name:'Start a swap',exact:true});
 const foreground=await startSwap.evaluate(element=>getComputedStyle(element).color);
 await startSwap.hover();
 await expect.poll(()=>startSwap.evaluate(element=>getComputedStyle(element).color)).toBe(foreground);
 await capture(page,'brand-hover-desktop');
 await navigation.getByRole('link',{name:'Protocol notes',exact:true}).click();
 await expect(page).toHaveURL(/\/proof$/);
 await expect(navigation.getByRole('link',{name:'Protocol notes',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('heading',{name:'Presentation check',exact:true})).toBeVisible();
 for(const hash of ['0xc27397b2bb8557175cc1a824e501046eb4c1373fe396f437c7a0b6737c488e56','0xb785144b6eb1ed84de359553602c8a3b6e429a6303f3312294f5961576b01877']){
  await expect(page.locator(`a[href="https://testnet.arcscan.app/tx/${hash}"]`)).toBeVisible();
 }
 await expect(page.getByRole('main').locator('a[href^="https://github.com/AnInsaneJimJam/aqua-orbital/"]')).not.toHaveCount(0);
 for(const name of ['Deployment verification report','Privy sign-in smoke','Swap flow smoke','Payment flow smoke'])await expect(page.getByRole('link',{name,exact:true})).toBeVisible();
 for(const width of [1440,320,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const link of await navigation.getByRole('link').all()){
   await expect(link).toBeVisible();
   const bounds=await link.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);
   expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
  }
  await capture(page,`protocol-evidence-${width}`);
 }
});
