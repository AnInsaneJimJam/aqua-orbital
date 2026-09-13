import {test,expect} from '@playwright/test';

for(const width of [1440,390,320]){
 test(`in-app docs explain the protocol and support navigation at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  const docs=page.getByRole('region',{name:/The best swap/}).getByRole('link',{name:'Docs',exact:true});
  await expect(docs).toHaveAttribute('href','/docs');
  await expect(docs).not.toHaveAttribute('target','_blank');
  await expect(page.getByRole('navigation',{name:'Resources'}).getByRole('link',{name:'Docs',exact:true})).toHaveAttribute('href','/docs');
  await docs.click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page).toHaveTitle('Docs — How Orbital works · Orbital Swap');
  await expect(page.getByRole('heading',{level:1})).toHaveText('How Orbital works.');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('main a[href*="github.com"]')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Protocol notes',exact:true})).toHaveCount(0);
  if(width<801)await page.getByText('In this guide',{exact:true}).click();
  const contents=page.getByRole('navigation',{name:'Documentation sections'}).filter({visible:true});
  await expect(contents.getByRole('link')).toHaveCount(12);
  for(const href of await contents.getByRole('link').evaluateAll(links=>links.map(link=>link.getAttribute('href')!)))await expect(page.locator(href)).toHaveCount(1);
  await contents.getByRole('link',{name:'One strategy, many pairs',exact:true}).click();
  await expect(page).toHaveURL(/#shared-liquidity$/);
  const pair=page.getByLabel('Explore a direction',{exact:true});
  await expect(pair.locator('option')).toHaveCount(6);
  await pair.selectOption('4');
  await expect(page.getByText('oUSD6 goes in. oUSD18 comes out.',{exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:/oUSD6 goes into the maker’s strategy and oUSD18 comes out/})).toBeVisible();
  const summary=page.getByText('The two custom SwapVM instructions',{exact:true});
  await summary.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'OrbitalFeeIn',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'OrbitalSwap',exact:true})).toBeVisible();
  await page.getByText('Why are approval and swap separate confirmations?',{exact:true}).click();
  await expect(page.getByText(/Reloading should restore an already-authorized wallet/)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('the public guide includes its explanations in the server response',async({request})=>{
 // The existing root loading.tsx streams pages behind a Suspense boundary.
 // HTML includes the guide; revealing streamed content still requires JavaScript.
 const response=await request.get('/docs');
 expect(response.ok()).toBe(true);
 const html=await response.text();
 for(const content of ['docs-title','How Orbital','id="payments"','id="glossary"','OrbitalFeeIn','OrbitalSwap','A merchant creates an invoice'])expect(html).toContain(content);
});
