import {test,expect} from '@playwright/test';
import {setupSwap} from './fixtures/swap';

test('review remains readable for forty seconds without background replacement, then expires',async({page})=>{
 const f=await setupSwap(page,{approved:true});
 await expect(page.getByLabel('Quoted output',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review swap',exact:true}).click();
 const submit=page.getByRole('button',{name:'Submit reviewed swap',exact:true});
 await expect(submit).toBeVisible();const quotes=f.quotes();
 await page.clock.fastForward(40000);
 await expect(submit).toBeEnabled();expect(f.quotes()).toBe(quotes);expect(f.sent.size).toBe(0);
 await expect(page.getByText('19.98 oUSD18',{exact:true})).toBeVisible();
 await page.clock.fastForward(21000);
 await expect(submit).toHaveCount(0);expect(f.sent.size).toBe(0);
});

test('background quote failure recovers automatically without disabling review of an unexpired estimate',async({page})=>{
 const f=await setupSwap(page,{approved:true});
 const output=page.getByLabel('Quoted output',{exact:true});await expect(output).toBeVisible();
 let failures=0,attempts=0,current=1700000003200;
 await page.route('**/quotes/swap',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();attempts++;
  if(!failures++){await route.abort('failed');return;}
  const value=structuredClone(f.f.observed),seconds=Math.floor(current/1000);
  value.freshness={...value.freshness,indexedAt:new Date(current-100).toISOString(),observedAt:new Date(current).toISOString(),ageMs:100,blockTimestamp:String(seconds)};
  for(const r of [value.data.best,...value.data.alternatives])r.expiresAt=String(seconds+20);
  await route.fulfill({headers:{'access-control-allow-origin':'*','cache-control':'no-store'},json:value});
 });
 current+=6000;await page.clock.fastForward(6000);await expect.poll(()=>failures).toBe(1);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Retrying automatically');
 await expect(output).toBeVisible();await expect(page.getByRole('button',{name:'Review swap',exact:true})).toBeEnabled();
 current+=16000;await page.clock.fastForward(16000);
  await expect.poll(()=>attempts).toBe(2);await expect(output).toBeVisible();await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
 expect(f.sent.size).toBe(0);
});
