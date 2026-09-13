import {test,expect} from '@playwright/test';

test('landing leads directly to Orbital swaps',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('The best swap');
 await page.getByRole('link',{name:'Swap Stablecoin',exact:true}).click();
 await expect(page.getByLabel('Sell',{exact:true})).toBeVisible();
 await expect(page.getByText('Output is confirmed by a fresh quote.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Quoted output',{exact:true})).toHaveCount(0);
});

test('strategy intent requires both risk acknowledgements before wallet publication',async({page})=>{
 await page.goto('/liquidity/new');
 await page.getByRole('button',{name:'Choose concentration',exact:true}).click();
 await page.getByRole('button',{name:'Focused More liquidity close to equal prices.',exact:true}).click();
 await page.getByRole('button',{name:'Review strategy',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review your intent.',exact:true})).toBeVisible();
 await expect(page.getByText('10 units',{exact:true})).toBeVisible();
 await expect(page.getByText('Aqua approval targets are capped at four times your initial allocation.',{exact:false})).toBeVisible();
 const publication=page.getByRole('main').getByRole('button',{name:'Connect wallet',exact:true});
 await expect(publication).toBeDisabled();
 await page.getByRole('checkbox',{name:'I understand that other wallet activity can make this allocation unavailable.',exact:true}).check();
 await expect(publication).toBeDisabled();
 await page.getByRole('checkbox',{name:'I understand that a depeg can change the tokens and value I hold.',exact:true}).check();
 await expect(publication).toBeEnabled();
 await expect(page.getByRole('heading',{name:'Publish from your wallet.',exact:true})).toHaveCount(0);
});

test('small screen has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 for(const url of ['/','/swap','/liquidity/new','/pay']){
  await page.goto(url);await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
