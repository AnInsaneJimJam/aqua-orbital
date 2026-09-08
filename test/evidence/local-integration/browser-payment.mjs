import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';
const {chromium,expect}=createRequire(new URL('../../../apps/web/package.json',import.meta.url))('@playwright/test');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:1000}}),transactions=[];
page.setDefaultTimeout(45000);page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));
page.on('dialog',async d=>{if(d.type()==='confirm'&&d.message().startsWith('Local Anvil wallet fixture'))await d.accept();else await d.dismiss();});
page.on('response',async response=>{try{if(response.url()==='http://127.0.0.1:8545/'&&response.request().postDataJSON()?.method==='eth_sendTransaction'){const data=await response.json();if(data.result){transactions.push(data.result);console.log('Submitted',data.result);}}}catch{}});
const seed=JSON.parse(await readFile('.cache/local-demo/seed.json','utf8'));
try{
 await page.goto(`http://127.0.0.1:3000/pay/${seed.invoices[0].id}`);await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Manage connected wallet'}).waitFor();await page.getByLabel('Payment token').selectOption('oUSD6');await page.getByLabel('Maximum input',{exact:true}).fill('10');await page.getByRole('button',{name:'Get payment quote',exact:true}).click();
 await page.getByRole('button',{name:/^Approve /}).waitFor();console.log('Payment review ready');await page.getByRole('button',{name:/^Approve /}).click();await page.getByText('Approval confirmed.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Get payment quote',exact:true}).click();await page.getByRole('button',{name:/^Pay [0-9]/}).waitFor();await page.getByRole('button',{name:/^Pay [0-9]/}).click();
 await page.getByText(/Payment confirmed|payment settled|Invoice paid/i).first().waitFor();await page.screenshot({path:'.cache/integrated-payment.png',fullPage:true});console.log('Payment complete');
 await writeFile('.cache/integrated-payment-browser.json',JSON.stringify({status:'passed',transactions,invoice:seed.invoices[0].id,body:await page.locator('body').innerText()},null,2));
}catch(e){await page.screenshot({path:'.cache/integrated-payment-browser-error.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-9000));throw e;}
finally{await page.context().storageState({path:'.cache/integrated-payment-browser-state.json'});await writeFile('.cache/integrated-payment-browser-transactions.json',JSON.stringify(transactions,null,2));await browser.close();}
