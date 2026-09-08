import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
const {chromium,expect}=createRequire(new URL('../../../apps/web/package.json',import.meta.url))('@playwright/test');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1200,height:1000}}),transactions=[];page.setDefaultTimeout(45000);
page.on('dialog',async d=>{if(d.type()==='confirm'&&d.message().startsWith('Local Anvil wallet fixture'))await d.accept();else await d.dismiss();});
page.on('response',async r=>{try{if(new URL(r.url()).port==='8545'&&r.request().postDataJSON()?.method==='eth_sendTransaction'){const v=await r.json();if(v.result){transactions.push(v.result);console.log('Submitted',v.result);}}}catch{}});
try{
 await page.goto('http://127.0.0.1:3000/fund');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Manage connected wallet'}).click();await page.getByRole('button',{name:/976ea74026e726554db657fa54763abd0c3a0aa9/i}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
 for(const symbol of ['oUSD6','USDC']){await page.getByRole('button',{name:`Review ${symbol} faucet`,exact:true}).click();await page.getByRole('button',{name:'Claim reviewed demo tokens',exact:true}).click();await page.getByText(`1000 ${symbol} received.`,{exact:false}).waitFor();console.log('Funding confirmed',symbol);}
 await page.screenshot({path:'.cache/integrated-funding.png',fullPage:true});await writeFile('.cache/integrated-funding.json',JSON.stringify({status:'passed',transactions,body:await page.locator('body').innerText()},null,2));
}catch(e){console.log((await page.locator('body').innerText()).slice(-6000));throw e;}finally{await browser.close();}
