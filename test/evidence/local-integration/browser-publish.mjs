import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {chromium,expect}=createRequire(new URL('../../../apps/web/package.json',import.meta.url))('@playwright/test');
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:950}});const confirmations=[];
page.setDefaultTimeout(35000);page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));page.on('dialog',async dialog=>{if(dialog.type()!=='confirm'||!dialog.message().startsWith('Local Anvil wallet fixture')){await dialog.dismiss();return;}confirmations.push(dialog.message());await dialog.accept();});
try{
 await page.goto('http://127.0.0.1:3000/liquidity/new');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Manage connected wallet'}).waitFor();
 await page.getByRole('button',{name:'Choose concentration'}).click();await page.getByRole('button',{name:'Review strategy',exact:true}).click();await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Prepare publication',exact:true}).click();
 await page.getByRole('heading',{name:'Publish from your wallet.'}).waitFor();console.log('Quantized draft prepared');
 for(let i=0;i<8;i++){
  if(await page.getByRole('link',{name:'View strategy',exact:true}).isVisible())break;
  await page.getByRole('button',{name:'Review next publication step',exact:true}).click();const confirm=page.getByRole('button',{name:/^Confirm: /});await confirm.waitFor();const label=await confirm.innerText();console.log(label);await confirm.click();
  await expect(page.getByText(/confirmed\.|Aqua allocation published\.|Strategy is active/i).first()).toBeVisible({timeout:40000});
  console.log('Receipt',i+1);if(label.includes('Publish Aqua')){await page.reload();await page.getByText('Saved publication restored.',{exact:false}).waitFor();console.log('Reload recovered shipped draft');}
 }
 await page.getByRole('link',{name:'View strategy',exact:true}).waitFor();await page.screenshot({path:'.cache/local-publication.png',fullPage:true});
 console.log('PUBLISHED',await page.getByRole('link',{name:'View strategy',exact:true}).getAttribute('href'));
 await writeFile('.cache/local-publication.json',JSON.stringify({status:'passed',confirmations,body:await page.locator('body').innerText()},null,2));
}catch(error){await page.screenshot({path:'.cache/local-publication-error.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-9000));throw error;}finally{await page.context().storageState({path:'.cache/publication-browser-state.json'});await browser.close();}
